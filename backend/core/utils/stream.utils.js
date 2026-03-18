import { getDb } from '../database/db.js';

/**
 * Convert LangChain BaseMessage objects → OpenAI {role, content} format.
 */
export function toLMStudioMessages(messages) {
  return messages.map((m) => {
    const type = typeof m._getType === 'function' ? m._getType() : 'human';
    const role = type === 'human' ? 'user' : type === 'ai' ? 'assistant' : 'system';
    const content =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
        ? m.content.map((c) => c.text || '').join('')
        : String(m.content ?? '');
    return { role, content };
  });
}

/** Estimate token count from text (4 chars ≈ 1 token). */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/** Persist token usage to the token_usage table. */
function recordTokenUsage(agentId, promptTokens, completionTokens) {
  try {
    getDb().table('token_usage').insert({
      agent_id:          agentId,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      total_tokens:      promptTokens + completionTokens,
      ts:                Date.now(),
    });
  } catch { /* never crash the agent over analytics */ }
}

/**
 * Direct SSE stream from LM Studio — bypasses LangChain's internal buffering.
 * Yields each text token as soon as LM Studio sends it.
 */
export async function* rawLMStream(settings, messages, signal) {
  const url = `${settings.base_url || 'http://localhost:1234/v1'}/chat/completions`;

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  let response;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.api_key || 'lm-studio'}`,
        },
        body: JSON.stringify({
          model:       settings.model_name,
          messages,
          stream:      true,
          temperature: settings.temperature ?? 0.2,
          max_tokens:  settings.max_tokens  ?? 32768,
        }),
        signal,
      });
      lastErr = null;
      break;
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.warn(`LM Studio connection failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms: ${err.message}`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
  if (lastErr) throw new Error(`LM Studio connection failed: ${lastErr.message}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LM Studio API ${response.status}: ${body}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const RECOVERABLE = new Set(['ECONNABORTED', 'ECONNRESET', 'ERR_STREAM_DESTROYED', 'EPIPE']);

  try {
    while (true) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (RECOVERABLE.has(err.code)) break;
        throw err;
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const token = json.choices?.[0]?.delta?.content;
            if (token) yield token;
          } catch { /* malformed SSE line — skip */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Strip <think>…</think> reasoning blocks emitted by some models (DeepSeek, QwQ, Qwen3, etc.).
 * Also strips unclosed <think> blocks (truncated responses when max_tokens is hit mid-think).
 * Applied to the final output so downstream JSON parsing is not disrupted.
 */
function stripThinkBlocks(text) {
  // Strip complete <think>...</think> blocks first
  let result = (text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Strip any remaining unclosed <think> block (model ran out of tokens mid-think)
  result = result.replace(/<think>[\s\S]*/gi, '').trim();
  return result;
}

/**
 * Repair common JSON encoding faults produced by LLMs (especially thinking
 * models like Qwen3 that embed raw file content inside JSON string values):
 *
 *  • Literal newline / carriage-return / tab inside a string value
 *    → escaped as \\n / \\r / \\t
 *  • Other bare control characters (U+0000–U+001F) inside a string value
 *    → removed (they are illegal in JSON strings)
 *
 * Uses a single O(n) pass with a proper string-aware state machine so it is
 * not fooled by escaped quotes (\") or escape sequences already present (\\n).
 */
function repairJSON(text) {
  let inStr  = false;   // currently inside a JSON string
  let escape = false;   // previous char was an unprocessed backslash
  let out    = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      // Character after a backslash — always pass through verbatim
      escape = false;
      out += ch;
      continue;
    }

    if (ch === '\\' && inStr) {
      // Start of an escape sequence inside a string
      escape = true;
      out += ch;
      continue;
    }

    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }

    if (inStr) {
      // Inside a string value: escape illegal control characters
      const code = ch.charCodeAt(0);
      if      (ch === '\n') { out += '\\n';  continue; }
      else if (ch === '\r') { out += '\\r';  continue; }
      else if (ch === '\t') { out += '\\t';  continue; }
      else if (code < 0x20) { /* drop other control chars */ continue; }
    }

    out += ch;
  }

  return out;
}

/**
 * Robustly extract and parse the first valid JSON object from model output.
 *
 * Strategy (ordered by confidence):
 *  1. Direct parse — model output is already clean JSON (fastest path)
 *  2. Direct parse after repairJSON — handles Qwen3 literal newlines in strings
 *  3. Markdown code fences — ```json ... ``` or ``` ... ```
 *  4. Anchor on `{"files":` — worker-specific: find the blueprint key and try
 *     JSON.parse from that position (avoids brace-scanner confusion from code
 *     content with unbalanced braces inside string values)
 *  5. Brace-depth scanning last → first — generic fallback; each block is
 *     tried raw then after repairJSON
 *
 * Returns the parsed object, or null if nothing is parseable.
 */
export function extractJSON(text) {
  if (!text) return null;

  const trimmed = text.trim();

  // ── Pass 1: direct parse (model output is already valid JSON) ──────────────
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  try { return JSON.parse(repairJSON(trimmed)); } catch { /* continue */ }

  // ── Pass 2: markdown code fences ───────────────────────────────────────────
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let m;
  while ((m = fenceRe.exec(trimmed)) !== null) {
    const inner = m[1].trim();
    if (!inner.startsWith('{') && !inner.startsWith('[')) continue;
    try { return JSON.parse(inner); }         catch { /* try repaired */ }
    try { return JSON.parse(repairJSON(inner)); } catch { /* next */ }
  }

  // ── Pass 3: anchor on `{"files":` (worker blueprint key) ───────────────────
  // Qwen3 often emits preamble text before the JSON. Anchoring on the known
  // key avoids the brace-scanner's blind spot (unbalanced braces in code).
  const filesAnchor = trimmed.indexOf('{"files"');
  if (filesAnchor !== -1) {
    const sub = trimmed.slice(filesAnchor);
    try { return JSON.parse(sub); }           catch { /* try repaired */ }
    try { return JSON.parse(repairJSON(sub)); } catch { /* fall through */ }
  }

  // ── Pass 4: brace-depth scanning (collected last → first) ──────────────────
  // Last resort. Iterating from the end prioritises the model's actual answer
  // over any JSON-like fragments in the reasoning preamble.
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (trimmed[i] === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) { blocks.push(trimmed.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    const raw = blocks[i];
    try { return JSON.parse(raw); }           catch { /* try repaired */ }
    try { return JSON.parse(repairJSON(raw)); } catch { /* next */ }
  }

  return null;
}

/**
 * Run rawLMStream, emit each token via socketManager, and record token usage.
 * <think>…</think> blocks are silently suppressed from socket emission and
 * stripped from the returned string so agents only see the actual response.
 * Returns the cleaned accumulated output string.
 */
export async function streamAndEmit(settings, messages, signal, socketManager, sessionId, agentId) {
  const inputText = messages.map(m => m.content).join(' ');
  let rawOutput = '';  // full unmodified output (for strip regex at end)
  let buf      = '';   // lookahead buffer for tag boundary detection
  let inThink  = false;

  for await (const token of rawLMStream(settings, messages, signal)) {
    rawOutput += token;
    buf       += token;

    // ── Inside a <think> block ─────────────────────────────────────────────
    if (inThink) {
      const closeIdx = buf.indexOf('</think>');
      if (closeIdx !== -1) {
        // Found closing tag — exit think mode, keep whatever follows
        inThink = false;
        buf = buf.slice(closeIdx + 8).replace(/^\s*\n?/, '');
      } else {
        // Still thinking — retain only the last 9 chars as partial-tag lookahead
        buf = buf.length > 9 ? buf.slice(-9) : buf;
      }
    }

    // ── Outside a <think> block ────────────────────────────────────────────
    if (!inThink) {
      const openIdx = buf.indexOf('<think>');
      if (openIdx !== -1) {
        // Emit everything before the opening tag, then enter think mode
        if (openIdx > 0) socketManager?.emitChatChunk(sessionId, buf.slice(0, openIdx), agentId);
        inThink = true;
        buf = buf.slice(openIdx + 7);

        // Handle edge case: </think> already present in the same buffer chunk
        const closeIdx = buf.indexOf('</think>');
        if (closeIdx !== -1) {
          inThink = false;
          buf = buf.slice(closeIdx + 8).replace(/^\s*\n?/, '');
        } else {
          buf = buf.length > 9 ? buf.slice(-9) : buf;
        }
      } else {
        // No think tag detected — emit safely, holding back 7 chars as lookahead
        // (length of '<think>' so a partial tag never leaks through)
        const safeLen = buf.length > 7 ? buf.length - 7 : 0;
        if (safeLen > 0) {
          socketManager?.emitChatChunk(sessionId, buf.slice(0, safeLen), agentId);
          buf = buf.slice(safeLen);
        }
      }
    }
  }

  // Flush any remaining buffered content
  if (buf && !inThink) {
    socketManager?.emitChatChunk(sessionId, buf, agentId);
  }

  // Strip all think blocks from the raw output for clean downstream processing
  const output = stripThinkBlocks(rawOutput);
  recordTokenUsage(agentId, estimateTokens(inputText), estimateTokens(output));
  return output;
}

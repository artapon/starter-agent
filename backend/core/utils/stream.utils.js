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
 * Robustly extract and parse the first valid JSON object from model output.
 *
 * Strategy (ordered by confidence):
 *  1. Markdown code fences  — ```json ... ``` or ``` ... ```
 *  2. Brace-depth scanning  — last block first (most recent = actual answer,
 *     not a reasoning artifact or code example embedded earlier in the text)
 *  3. Newline normalisation — each candidate is retried with \r?\n → space
 *     (some models emit literal newlines inside JSON string values)
 *
 * Returns the parsed object, or null if nothing is parseable.
 */
export function extractJSON(text) {
  if (!text) return null;

  const candidates = [];

  // ── Pass 1: markdown code fence extraction ─────────────────────────────────
  // Handles ```json\n{...}\n``` and ```\n{...}\n```
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) candidates.push(inner);
  }

  // ── Pass 2: brace-depth scanning (collected last → first) ─────────────────
  // Iterating from the end means the model's actual answer (always last)
  // is tried before any JSON-like fragments in the reasoning preamble.
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (text[i] === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) { blocks.push(text.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) candidates.push(blocks[i]);

  // ── Pass 3: try each candidate ─────────────────────────────────────────────
  for (const raw of candidates) {
    try { return JSON.parse(raw); } catch { /* try normalised */ }
    try { return JSON.parse(raw.replace(/\r?\n/g, ' ')); } catch { /* next */ }
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

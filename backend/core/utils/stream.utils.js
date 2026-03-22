import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const streamLogger = createLogger('stream');

/** Returns true when debug_mode is enabled in global_settings. */
export function isDebugMode() {
  try {
    const row = getDb().table('global_settings').first({ key: 'debug_mode' });
    return row?.value === 'true';
  } catch {
    return false;
  }
}

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
          ...(settings.unlimited_tokens ? {} : { max_tokens: settings.max_tokens ?? 32768 }),
          // response_format: json_schema is intentionally NOT used here.
          // Many LM Studio builds buffer the full response internally for schema
          // validation before emitting, which kills per-token SSE streaming and
          // leaves the token stream panel empty for the entire generation.
          // Our multi-pass extractors (extractJSON, extractBlueprintByStrings,
          // repairJSON) are robust enough to parse the JSON from free-form output.
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
        streamLogger.warn(`LM Studio connection failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`, { error: err.message });
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

  // ── Infinite-loop guards ────────────────────────────────────────────────────
  // 1. Hard character cap: stops runaway unlimited-token generations.
  //    4 chars ≈ 1 token; allow 6× headroom so large but legitimate files still fit.
  //    Unlimited mode gets a 4 MB ceiling instead of none.
  const MAX_OUTPUT_CHARS = settings.unlimited_tokens
    ? 4 * 1024 * 1024
    : (settings.max_tokens ?? 32768) * 6;

  // 2. Repetition detector: tracks a rolling 80-char window.
  //    Five identical consecutive windows → model is looping → break.
  const REP_WINDOW  = 80;
  const REP_LIMIT   = 5;
  let repBuf        = '';
  let repLast       = '';
  let repCount      = 0;

  // 3. Silence timeout: if no token arrives for 60 s the stream is stalled.
  const SILENCE_MS     = 60_000;
  let   silenceTimer   = null;
  let   silenceAborted = false;
  const silenceController = new AbortController();
  function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      silenceAborted = true;
      silenceController.abort();
      streamLogger.warn('Stream stalled — no token received for 60 s, aborting', { agentId: settings.agent_id });
    }, SILENCE_MS);
  }
  resetSilenceTimer();

  let totalChars = 0;

  const RECOVERABLE = new Set(['ECONNABORTED', 'ECONNRESET', 'ERR_STREAM_DESTROYED', 'EPIPE']);

  try {
    while (true) {
      let done, value;
      try {
        ({ done, value } = await reader.read());
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        if (RECOVERABLE.has(err.code)) {
          streamLogger.warn(`Stream cut by ${err.code} — output may be incomplete`, { agentId: settings.agent_id });
          break;
        }
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
            const finishReason = json.choices?.[0]?.finish_reason;
            if (finishReason === 'length') {
              streamLogger.warn(`Model stopped at token limit (finish_reason=length) — output truncated. Enable Unlimited tokens or increase Max Tokens in Settings.`, { agentId: settings.agent_id });
            }
            // Primary: per-token streaming (delta.content)
            // Fallback: some LM Studio builds with response_format buffer the full
            // response and emit it in the final SSE event via message.content instead.
            const token = json.choices?.[0]?.delta?.content
                       ?? json.choices?.[0]?.message?.content
                       ?? null;
            if (!token) continue;

            // ── Guard 3: reset silence timer on each received token ───────────
            resetSilenceTimer();

            // ── Guard 1: hard character cap ───────────────────────────────────
            totalChars += token.length;
            if (totalChars > MAX_OUTPUT_CHARS) {
              streamLogger.warn(
                `Stream hard-capped at ${totalChars} chars (limit ${MAX_OUTPUT_CHARS}) — possible infinite generation. ` +
                `Increase Max Tokens or check for model repetition loops.`,
                { agentId: settings.agent_id }
              );
              return; // stop the generator
            }

            // ── Guard 2: repetition detector ─────────────────────────────────
            repBuf += token;
            if (repBuf.length >= REP_WINDOW) {
              const window = repBuf.slice(-REP_WINDOW);
              if (window === repLast) {
                repCount++;
                if (repCount >= REP_LIMIT) {
                  streamLogger.warn(
                    `Repetition loop detected — same ${REP_WINDOW}-char window repeated ${REP_LIMIT}× consecutively. Stopping stream.`,
                    { agentId: settings.agent_id }
                  );
                  return; // stop the generator
                }
              } else {
                repLast  = window;
                repCount = 0;
              }
              repBuf = repBuf.slice(-REP_WINDOW); // keep only the tail
            }

            yield token;
          } catch { /* malformed SSE line — skip */ }
        }
      }

      // ── Guard 3: silence abort check ─────────────────────────────────────
      if (silenceAborted) break;
    }
  } finally {
    clearTimeout(silenceTimer);
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

// Valid single-character JSON escape sequences (after the backslash).
// \uXXXX is handled separately via the 'u' entry.
const JSON_ESCAPE_CHARS = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

/**
 * Replace backtick-delimited JSON values with properly escaped double-quoted
 * strings. Some models emit template-literal syntax inside what should be JSON:
 *   "content":`<!DOCTYPE html>...`  →  "content":"<!DOCTYPE html>..."
 * Only converts a backtick when it has a matching closing backtick; unmatched
 * backticks are left as-is so we don't corrupt non-backtick output.
 */
function fixBacktickValues(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '`') {
      let j = i + 1;
      let value = '';
      while (j < text.length && text[j] !== '`') {
        const ch = text[j];
        if      (ch === '"')  { value += '\\"';  j++;      }
        else if (ch === '\\') { value += '\\\\'; j += 2;   }
        else if (ch === '\n') { value += '\\n';  j++;      }
        else if (ch === '\r') { value += '\\r';  j++;      }
        else if (ch === '\t') { value += '\\t';  j++;      }
        else                  { value += ch;     j++;      }
      }
      if (j < text.length) {  // found closing backtick
        out += '"' + value + '"';
        i = j + 1;
      } else {
        out += text[i++];     // no closing backtick — leave untouched
      }
    } else {
      out += text[i++];
    }
  }
  return out;
}

/**
 * Repair common JSON encoding faults produced by LLMs (especially thinking
 * models like Qwen3 that embed raw file content inside JSON string values):
 *
 *  • Literal newline / carriage-return / tab inside a string value
 *    → escaped as \n / \r / \t
 *  • Other bare control characters (U+0000–U+001F) inside a string value
 *    → removed (they are illegal in JSON strings)
 *  • Invalid escape sequences inside a string value (e.g. \d \w \s \p from
 *    JS regex / CSS, or \' from single-quoted JS strings)
 *    → backslash is doubled so \d becomes \\d (a literal backslash + d),
 *      which is valid JSON and preserves the intended content
 *
 * Uses a single O(n) pass with a string-aware state machine so it is not
 * fooled by escaped quotes (\") or sequences already present (\\n).
 */
function repairJSON(text) {
  let inStr  = false;   // currently inside a JSON string
  let out    = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '\\' && inStr) {
      const next = i + 1 < text.length ? text[i + 1] : '';
      if (JSON_ESCAPE_CHARS.has(next)) {
        // Valid escape sequence — pass both characters through and skip next
        out += ch + next;
        i++;
      } else {
        // Invalid escape sequence (e.g. \d \w \s \1 \') — double the backslash
        out += '\\\\';
        // next char will be processed normally on the next iteration
      }
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
 * String-aware brace scanner: walks `text` starting at `from` and returns
 * the index just past the `}` that closes the first top-level JSON object.
 * Correctly skips `{` / `}` that appear inside JSON string values so that
 * CSS rules, template literals, and embedded code don't confuse the counter.
 * Returns -1 if no complete object is found.
 */
function findJSONObjectEnd(text, from = 0) {
  let depth  = 0;
  let inStr  = false;
  let escape = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (escape)              { escape = false; continue; }
    if (ch === '\\' && inStr){ escape = true;  continue; }
    if (ch === '"')          { inStr = !inStr; continue; }
    if (!inStr) {
      if      (ch === '{') { depth++; }
      else if (ch === '}') { if (--depth === 0) return i + 1; }
    }
  }
  return -1;
}

/**
 * Robustly extract and parse the first valid JSON object from model output.
 *
 * Strategy (ordered by confidence):
 *  1. Direct parse — model output is already clean JSON (fastest path)
 *  2. Direct parse after repairJSON — handles literal newlines inside strings
 *  3. Markdown code fences — ```json ... ``` or ``` ... ```
 *  4. Anchor on `{"files":` — worker blueprint key; uses string-aware scanner
 *     to find the exact end of the object so trailing prose is not included
 *  5. String-aware brace scan (last → first) — collects every top-level JSON
 *     object using findJSONObjectEnd so CSS/JS braces inside strings are ignored
 *
 * Returns the parsed object, or null if nothing is parseable.
 */
export function extractJSON(text) {
  if (!text) return null;

  const trimmed = text.trim();

  // ── Pass 1: direct parse (model output is already valid JSON) ──────────────
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  try { return JSON.parse(repairJSON(trimmed)); } catch { /* continue */ }

  // ── Pass 1b: backtick value fix — "key":`value` → "key":"value" ───────────
  const btFixed = fixBacktickValues(trimmed);
  if (btFixed !== trimmed) {
    try { return JSON.parse(btFixed); }             catch { /* continue */ }
    try { return JSON.parse(repairJSON(btFixed)); } catch { /* continue */ }
  }

  // ── Pass 2: markdown code fences ───────────────────────────────────────────
  const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let m;
  while ((m = fenceRe.exec(trimmed)) !== null) {
    const inner = m[1].trim();
    if (!inner.startsWith('{') && !inner.startsWith('[')) continue;
    try { return JSON.parse(inner); }              catch { /* try repaired */ }
    try { return JSON.parse(repairJSON(inner)); }  catch { /* next */ }
  }

  // ── Pass 3: anchor on `{"files":` (worker blueprint key) ───────────────────
  // Uses string-aware scanner so CSS/JS braces in file content don't cause
  // the object to be sliced at the wrong closing brace.
  const filesAnchor = trimmed.indexOf('{"files"');
  if (filesAnchor !== -1) {
    const end = findJSONObjectEnd(trimmed, filesAnchor);
    const sub = end !== -1 ? trimmed.slice(filesAnchor, end) : trimmed.slice(filesAnchor);
    try { return JSON.parse(sub); }              catch { /* try repaired */ }
    try { return JSON.parse(repairJSON(sub)); }  catch { /* fall through */ }
  }

  // ── Pass 4: string-aware brace scan (collected last → first) ───────────────
  // Iterating from the end prioritises the model's actual answer over any
  // JSON-like fragments in a reasoning preamble.
  // First pass: prefer blocks that contain a "files" array (the full blueprint)
  // so a trailing single-file excerpt doesn't shadow the real response.
  const blocks = [];
  let pos = 0;
  while (pos < trimmed.length) {
    const start = trimmed.indexOf('{', pos);
    if (start === -1) break;
    const end = findJSONObjectEnd(trimmed, start);
    if (end === -1) break;
    blocks.push(trimmed.slice(start, end));
    pos = end;
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    const raw = blocks[i];
    try { const p = JSON.parse(raw);             if (p.files) return p; } catch { /* try repaired */ }
    try { const p = JSON.parse(repairJSON(raw)); if (p.files) return p; } catch { /* next */ }
  }
  // Second pass: accept any valid JSON (no files key required)
  for (let i = blocks.length - 1; i >= 0; i--) {
    const raw = blocks[i];
    try { return JSON.parse(raw); }              catch { /* try repaired */ }
    try { return JSON.parse(repairJSON(raw)); }  catch { /* next */ }
  }

  return null;
}

/**
 * Run rawLMStream, emit each token via socketManager, and record token usage.
 * <think>…</think> blocks are silently suppressed from socket emission and
 * stripped from the returned string so agents only see the actual response.
 * Returns the cleaned accumulated output string, or { output, rawOutput } when
 * returnRaw is true (useful for JSON agents that need a think-block fallback).
 */
export async function streamAndEmit(settings, messages, signal, socketManager, sessionId, agentId, returnRaw = false) {
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

  // Debug mode: log full LLM response when enabled in global_settings
  try {
    if (isDebugMode()) {
      streamLogger.debug(`LLM response (${output.length} chars):\n${output}`, { agentId });
    }
  } catch { /* never crash the agent over debug logging */ }

  // Detect likely truncation:
  //  1. Raw output: JSON started but never closed (e.g. model hit token limit)
  //  2. Stripped output: after removing <think> blocks, the remaining JSON is unclosed
  //     This catches the case where the model opened a <think> mid-JSON-string —
  //     stripThinkBlocks cuts after the tag, leaving an unterminated JSON string.
  //  3. <think> appeared inside the content (not at the top) — model resumed thinking
  //     mid-generation, which always means the JSON string was cut off at that point.
  const rawTrimmed      = rawOutput.trimEnd();
  const strippedTrimmed = output.trimEnd();
  const rawUnclosed      = rawTrimmed.includes('{') && !rawTrimmed.endsWith('}') && !rawTrimmed.endsWith(']');
  const strippedUnclosed = strippedTrimmed.includes('{') && !strippedTrimmed.endsWith('}') && !strippedTrimmed.endsWith(']');
  // <think> appearing after JSON content began = model resumed reasoning mid-string
  const thinkMidContent  = /<think>/i.test(rawTrimmed.replace(/^<think>[\s\S]*?<\/think>/i, ''));
  const truncated = rawUnclosed || strippedUnclosed || thinkMidContent;
  if (truncated && agentId === 'worker') {
    streamLogger.warn(`Worker response appears truncated — JSON not closed (${rawOutput.length} chars total). Model likely hit context limit.`, { agentId });
  }

  if (returnRaw) return { output, rawOutput, truncated };
  return output;
}

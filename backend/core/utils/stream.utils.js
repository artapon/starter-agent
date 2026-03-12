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

  let response;
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
        max_tokens:  settings.max_tokens  ?? 8192,
      }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(`LM Studio connection failed: ${err.message}`);
  }

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
 * Run rawLMStream, emit each token via socketManager, and record token usage.
 * Returns the full accumulated output string.
 */
export async function streamAndEmit(settings, messages, signal, socketManager, sessionId, agentId) {
  const inputText = messages.map(m => m.content).join(' ');
  let output = '';

  for await (const token of rawLMStream(settings, messages, signal)) {
    output += token;
    socketManager?.emitChatChunk(sessionId, token, agentId);
  }

  recordTokenUsage(agentId, estimateTokens(inputText), estimateTokens(output));

  return output;
}

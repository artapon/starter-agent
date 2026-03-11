/**
 * Prompt compression middleware.
 * Compresses req.body.prompt or req.body.messages before passing to LLM.
 * Applies:
 *  1. Whitespace normalization
 *  2. Duplicate sentence removal
 *  3. Truncation to contextWindow limit (character-based estimate)
 */
export function compressPrompt(contextWindow = 8192) {
  return (req, res, next) => {
    if (req.body?.prompt) {
      req.body.prompt = _compress(req.body.prompt, contextWindow);
    }
    if (Array.isArray(req.body?.messages)) {
      req.body.messages = req.body.messages.map((msg) => ({
        ...msg,
        content: typeof msg.content === 'string'
          ? _compress(msg.content, contextWindow)
          : msg.content,
      }));
    }
    next();
  };
}

export function compressString(text, maxChars = 32768) {
  return _compress(text, maxChars);
}

function _compress(text, maxChars) {
  if (!text || typeof text !== 'string') return text;

  // 1. Normalize whitespace
  let result = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // 2. Remove consecutive duplicate lines
  const lines = result.split('\n');
  const deduped = lines.filter((line, i) => i === 0 || line.trim() !== lines[i - 1].trim());
  result = deduped.join('\n');

  // 3. Truncate to character estimate (4 chars ≈ 1 token)
  const maxCharsEstimate = maxChars * 4;
  if (result.length > maxCharsEstimate) {
    result = result.slice(0, maxCharsEstimate) + '\n...[truncated]';
  }

  return result;
}

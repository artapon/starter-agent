/**
 * Text embedder for Long-Term Memory.
 *
 * Primary:  LM Studio /v1/embeddings (OpenAI-compatible)
 * Fallback: deterministic 256-dim character-bigram hash (works offline,
 *           no semantic quality but prevents crashes)
 *
 * Dimension is auto-detected from the first successful LM Studio call.
 * Once detected, the same dimension is used for all subsequent calls so
 * the HNSW index stays consistent.
 */

import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('embedder');

export const FALLBACK_DIM = 256;

let _detectedDim    = null;
let _useLMStudio    = true;   // set false after first failure
let _retryAfter     = 0;      // timestamp (ms) when to retry LM Studio again
const RETRY_DELAY   = 60_000; // retry every 60 s after a failure

// ── Hash fallback ─────────────────────────────────────────────────────────────

export function hashEmbed(text, dim = FALLBACK_DIM) {
  const vec = new Float32Array(dim).fill(0);
  const s   = text.toLowerCase().slice(0, 4096);
  for (let i = 0; i < s.length - 1; i++) {
    const bigram = (s.charCodeAt(i) * 31 + s.charCodeAt(i + 1)) >>> 0;
    vec[bigram % dim] += 1;
  }
  // L2 normalise to unit vector
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= norm;
  return Array.from(vec);
}

// ── LM Studio embeddings ──────────────────────────────────────────────────────

async function _lmStudioEmbed(text) {
  const db      = getDb();
  const row     = db.table('agent_settings').first({ agent_id: 'researcher' });
  const baseUrl = (row?.base_url || 'http://localhost:1234/v1').replace(/\/+$/, '');
  const apiKey  = row?.api_key  || 'lm-studio';

  const body = { input: text };
  if (row?.model_name) body.model = row.model_name;

  const res = await fetch(`${baseUrl}/embeddings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Embeddings API HTTP ${res.status}`);
  const data = await res.json();
  const vec  = data.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length === 0) throw new Error('No embedding in response');
  return vec;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Embed a text string. Returns a float[] vector.
 * Uses LM Studio if available, otherwise falls back to hashEmbed.
 */
export async function embed(text) {
  const now = Date.now();
  if (!_useLMStudio && now < _retryAfter) {
    return hashEmbed(text, _detectedDim || FALLBACK_DIM);
  }
  try {
    const vec = await _lmStudioEmbed(text);
    if (!_detectedDim) {
      _detectedDim = vec.length;
      logger.info(`LM Studio embeddings: ${_detectedDim}-dim`);
    }
    _useLMStudio = true;
    return vec;
  } catch (err) {
    if (_useLMStudio) {
      logger.error(`LM Studio embeddings unavailable — using hash fallback: ${err.message}`);
    }
    _useLMStudio = false;
    _retryAfter  = now + RETRY_DELAY;
    return hashEmbed(text, _detectedDim || FALLBACK_DIM);
  }
}

/** Returns the embedding dimension (detected or fallback). */
export function getEmbedDim() {
  return _detectedDim || FALLBACK_DIM;
}

/** Re-enable LM Studio embeddings (e.g. after model is loaded). */
export function resetEmbedder() {
  _useLMStudio = true;
  _detectedDim = null;
  logger.info('Embedder reset — will retry LM Studio on next call');
}

/**
 * Long-Term Memory (LTM) — per-agent HNSW vector index using hnswlib-node.
 *
 * Each agent gets its own index stored in:
 *   backend/data/ltm/<agentId>/index.hnsw   — binary HNSW graph
 *   backend/data/ltm/<agentId>/metadata.json — content + metadata per entry
 *
 * Features:
 *   - Lazy init: index is created/loaded on first access
 *   - Dimension lock: recorded on first embed call, enforced thereafter
 *   - Dimension mismatch: old index wiped and rebuilt if embed dim changes
 *   - Max 10 000 entries per agent (configurable via MAX_ELEMENTS)
 *
 * Using hnswlib-node directly (ESM-compatible via dynamic import cached below).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, writeFile, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embed, getEmbedDim } from './embedder.js';
import { createLogger } from '../logger/winston.logger.js';

const logger  = createLogger('ltm');
const LTM_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/ltm');

const MAX_ELEMENTS = 10_000;
const M            = 16;   // HNSW graph connectivity
const EF_CONST     = 200;  // build-time search depth
const EF_SEARCH    = 100;  // query-time search depth

// ── Dynamic import cache ──────────────────────────────────────────────────────
let _HierarchicalNSW = null;
async function getHNSW() {
  if (_HierarchicalNSW) return _HierarchicalNSW;
  const mod = await import('hnswlib-node');
  _HierarchicalNSW = mod.default.HierarchicalNSW;
  return _HierarchicalNSW;
}

// ── Per-agent store instances ─────────────────────────────────────────────────
const _stores = new Map(); // agentId → AgentVectorStore

class AgentVectorStore {
  constructor(agentId) {
    this.agentId      = agentId;
    this.dir          = join(LTM_DIR, agentId);
    this.idxPath      = join(this.dir, 'index.hnsw');
    this.metaPath     = join(this.dir, 'metadata.json');
    this.index        = null;
    this.metadata     = []; // array index == HNSW label
    this.dim          = null;
    this._ready       = false;
    this._initPromise = null; // gate: prevents concurrent inits
  }

  async _init() {
    if (this._ready) return;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit().catch(err => {
      this._initPromise = null; // allow retry on failure
      throw err;
    });
    return this._initPromise;
  }

  async _doInit() {
    mkdirSync(this.dir, { recursive: true });

    // Load saved dimension + metadata
    if (existsSync(this.metaPath)) {
      try {
        const saved    = JSON.parse(readFileSync(this.metaPath, 'utf8'));
        this.dim       = saved.dim   || null;
        this.metadata  = saved.entries || [];
      } catch (err) {
        logger.warn(`[${this.agentId}] LTM metadata corrupt, starting fresh: ${err.message}`);
        this.dim      = null;
        this.metadata = [];
      }
    }

    // Detect embedding dimension if not saved yet
    if (!this.dim) {
      await embed('dim-probe'); // warm up the embedder
      this.dim = getEmbedDim();
    }

    const HierarchicalNSW = await getHNSW();
    this.index = new HierarchicalNSW('cosine', this.dim);

    if (existsSync(this.idxPath) && this.metadata.length > 0) {
      try {
        this.index.readIndex(this.idxPath, true);
        logger.info(`[${this.agentId}] LTM loaded: ${this.metadata.length} entries, ${this.dim}-dim`);
      } catch (err) {
        logger.warn(`[${this.agentId}] LTM index unreadable, rebuilding: ${err.message}`);
        this._wipeAndRebuild(HierarchicalNSW);
      }
    } else {
      this.index.initIndex(MAX_ELEMENTS, M, EF_CONST, EF_SEARCH);
    }

    this._ready = true;
  } // end _doInit

  _wipeAndRebuild(HierarchicalNSW) {
    this.metadata = [];
    try { rmSync(this.idxPath, { force: true }); } catch { /* ignore */ }
    this.index = new HierarchicalNSW('cosine', this.dim);
    this.index.initIndex(MAX_ELEMENTS, M, EF_CONST, EF_SEARCH);
  }

  async add(content, metadata = {}) {
    await this._init();

    const vec = await embed(content);

    // If dimension changed (new embedding model), wipe and start fresh
    if (vec.length !== this.dim) {
      logger.warn(`[${this.agentId}] Embed dim changed ${this.dim}→${vec.length}, wiping LTM index`);
      this.dim = vec.length;
      const HierarchicalNSW = await getHNSW();
      this._wipeAndRebuild(HierarchicalNSW);
    }

    if (this.metadata.length >= MAX_ELEMENTS) {
      logger.warn(`[${this.agentId}] LTM at max capacity (${MAX_ELEMENTS}), skipping`);
      return;
    }

    const label = this.metadata.length;
    this.metadata.push({
      content:  content.slice(0, 600),
      metadata,
      ts:       Date.now(),
    });
    this.index.addPoint(vec, label);
    this._save();
    logger.info(`[${this.agentId}] LTM stored entry #${label}`);
  }

  async search(queryText, k = 5) {
    await this._init();
    if (this.metadata.length === 0) return [];

    const vec = await embed(queryText);
    if (vec.length !== this.dim) return [];

    const kActual = Math.min(k, this.metadata.length);
    try {
      const result = this.index.searchKnn(vec, kActual, undefined);
      return result.neighbors
        .map((label, i) => ({
          content:    this.metadata[label]?.content || '',
          metadata:   this.metadata[label]?.metadata || {},
          ts:         this.metadata[label]?.ts || 0,
          similarity: parseFloat((1 - result.distances[i]).toFixed(4)),
        }))
        .filter(r => r.similarity >= 0.3)  // discard low-relevance matches
        .sort((a, b) => b.similarity - a.similarity);
    } catch (err) {
      logger.warn(`[${this.agentId}] LTM search failed: ${err.message}`);
      return [];
    }
  }

  clear() {
    this.metadata = [];
    try { rmSync(this.dir, { recursive: true, force: true }); } catch { /* ignore */ }
    this._ready = false;
    this.index  = null;
    logger.info(`[${this.agentId}] LTM cleared`);
  }

  getStats() {
    return {
      agentId:  this.agentId,
      entries:  this.metadata.length,
      dim:      this.dim,
      maxSize:  MAX_ELEMENTS,
      ready:    this._ready,
    };
  }

  _save() {
    try {
      this.index.writeIndex(this.idxPath);
      // Write metadata asynchronously to avoid blocking the event loop
      const json = JSON.stringify({ dim: this.dim, entries: this.metadata });
      writeFile(this.metaPath, json, 'utf8', (err) => {
        if (err) logger.warn(`[${this.agentId}] LTM metadata save failed: ${err.message}`);
      });
    } catch (err) {
      logger.warn(`[${this.agentId}] LTM save failed: ${err.message}`);
    }
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

export function getVectorStore(agentId) {
  if (!_stores.has(agentId)) _stores.set(agentId, new AgentVectorStore(agentId));
  return _stores.get(agentId);
}

export async function addToLTM(agentId, content, metadata = {}) {
  return getVectorStore(agentId).add(content, metadata);
}

export async function queryLTM(agentId, queryText, k = 5) {
  return getVectorStore(agentId).search(queryText, k);
}

export function getLTMStats(agentId) {
  if (!_stores.has(agentId)) {
    return { agentId, entries: 0, dim: null, maxSize: MAX_ELEMENTS, ready: false };
  }
  return _stores.get(agentId).getStats();
}

export function clearLTM(agentId) {
  getVectorStore(agentId).clear();
}

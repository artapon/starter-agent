/**
 * Short-Term Memory (STM) — per-agent, per-session ring buffer.
 *
 * Replaces LangChain BufferWindowMemory with a plain class that:
 *   - Maintains a fixed-size ring buffer of {input, output} pairs
 *   - Implements the same duck-type interface: loadMemoryVariables() / saveContext()
 *   - Returns real HumanMessage / AIMessage instances so toLMStudioMessages() works
 *
 * Window sizes (number of exchange PAIRS stored, not individual messages):
 *   researcher:  6  — research convos are long, limit context aggressively
 *   planner:     8  — needs goal + research context
 *   worker:     10  — code tasks reference prior steps
 *   reviewer:    6  — reviews are self-contained
 */

import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('stm');

export const STM_WINDOWS = {
  researcher: 6,
  planner:    8,
  worker:     10,
  reviewer:   6,
};

const _cache = new Map(); // `${agentId}:${sessionId}` → ShortTermMemory

// ── ShortTermMemory class ─────────────────────────────────────────────────────

export class ShortTermMemory {
  constructor(agentId) {
    this.agentId = agentId;
    this.k       = STM_WINDOWS[agentId] ?? 8;
    this._pairs  = []; // [{ input: string, output: string }]
  }

  /** LangChain-compatible: returns { chat_history: BaseMessage[] } */
  async loadMemoryVariables(_values = {}) {
    const messages = this._pairs.flatMap(({ input, output }) => [
      new HumanMessage(input),
      new AIMessage(output),
    ]);
    return { chat_history: messages };
  }

  /** LangChain-compatible: saves one input/output exchange */
  async saveContext({ input }, { output }) {
    if (this._pairs.length >= this.k) this._pairs.shift();
    this._pairs.push({ input: String(input || ''), output: String(output || '') });
  }

  clear() {
    this._pairs = [];
  }

  get size() {
    return this._pairs.length;
  }

  /** Serialize to plain JSON for DB snapshot */
  toSnapshot() {
    // Include chat_history in legacy format so the existing controller/frontend
    // can still display messages without changes.
    const chat_history = this._pairs.flatMap(({ input, output }) => [
      { type: 'human', data: { content: input } },
      { type: 'ai',    data: { content: output } },
    ]);
    return { pairs: this._pairs, chat_history };
  }

  /** Restore from a DB snapshot (supports both new pairs format and legacy chat_history) */
  fromSnapshot(snap) {
    if (!snap) return;
    if (Array.isArray(snap.pairs) && snap.pairs.length > 0) {
      this._pairs = snap.pairs.slice(-this.k);
      return;
    }
    // Backward compat: old snapshots had only chat_history as LangChain message objects
    const msgs = snap.chat_history || [];
    for (let i = 0; i + 1 < msgs.length; i += 2) {
      const input  = msgs[i]?.data?.content  || msgs[i]?.kwargs?.content  || msgs[i]?.content  || '';
      const output = msgs[i+1]?.data?.content || msgs[i+1]?.kwargs?.content || msgs[i+1]?.content || '';
      if (input) this._pairs.push({ input, output });
    }
    if (this._pairs.length > this.k) this._pairs = this._pairs.slice(-this.k);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Get or create the STM instance for agentId + sessionId.
 * Does NOT restore from DB — call fromSnapshot() after if needed.
 */
export function getSTM(agentId, sessionId) {
  const key = `${agentId}:${sessionId}`;
  if (!_cache.has(key)) {
    _cache.set(key, new ShortTermMemory(agentId));
    logger.debug(`STM created: ${key}`);
  }
  return _cache.get(key);
}

export function deleteSTM(agentId, sessionId) {
  _cache.delete(`${agentId}:${sessionId}`);
}

export function getSTMStats() {
  const stats = {};
  for (const [key, mem] of _cache.entries()) {
    stats[key] = { size: mem.size, maxSize: mem.k };
  }
  return stats;
}

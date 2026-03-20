/**
 * Three-tier memory coordinator.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Short-Term Memory (STM)  —  core/memory/stm.store.js                   │
 * │    • In-memory ring buffer, k exchanges per agent                        │
 * │    • Same duck-type as LangChain BufferWindowMemory                      │
 * │    • Persisted as DB snapshots; restored on next session start           │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Working Memory (WM)  —  core/memory/wm.store.js                        │
 * │    • In-memory key-value, per agentId + runId                            │
 * │    • Holds current task context (step desc, plan id, loop count…)        │
 * │    • Set by workflow.nodes.js; cleared by workflow.runner.js after run   │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Long-Term Memory (LTM)  —  core/memory/vector.store.js                 │
 * │    • hnswlib-node HNSW index on disk, per agent                         │
 * │    • Embeddings via LM Studio /v1/embeddings (hash fallback)             │
 * │    • Auto-ingested on snapshotMemory(); queried before LLM calls         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Public API (backward-compatible with old BufferWindowMemory usage):
 *   memoryStore.getMemory(agentId, sessionId)  → STM instance
 *   memoryStore.snapshotMemory(agentId, sessionId)
 *   memoryStore.clearMemory(agentId, sessionId)
 *   memoryStore.getSnapshots(agentId, sessionId?)
 *   memoryStore.getAllAgentMemories()
 *
 * New API:
 *   memoryStore.setWorkingContext(agentId, runId, data)
 *   memoryStore.getWorkingContext(agentId, runId)
 *   memoryStore.clearWorkingMemory(runId)
 *   memoryStore.getLTMContext(agentId, queryText, k?)  → formatted string
 *   memoryStore.storeToLTM(agentId, content, metadata?)
 *   memoryStore.getLTMStats(agentId)
 *   memoryStore.getWMStats()
 *   memoryStore.getSTMStats()
 */

import { getDb }                           from '../../../core/database/db.js';
import { createLogger }                    from '../../../core/logger/winston.logger.js';
import { getSTM, deleteSTM, getSTMStats }  from '../../../core/memory/stm.store.js';
import { WorkingMemory }                   from '../../../core/memory/wm.store.js';
import { addToLTM, queryLTM, getLTMStats, clearLTM } from '../../../core/memory/vector.store.js';

const logger = createLogger('memory');

export class MemoryStore {
  constructor() {
    this.db = getDb();
  }

  // ── Short-Term Memory ────────────────────────────────────────────────────────

  /**
   * Returns the STM instance for agentId + sessionId.
   * Restores from last DB snapshot if the instance is new (cold start).
   * Same interface as LangChain BufferWindowMemory.
   */
  getMemory(agentId, sessionId) {
    const mem = getSTM(agentId, sessionId);
    // First access (size === 0) → try to restore from DB snapshot
    if (mem.size === 0) {
      const snaps = this.db.table('memory_snapshots').all(
        { agent_id: agentId, session_id: sessionId },
        { orderBy: 'created_at', order: 'desc', limit: 1 }
      );
      if (snaps.length > 0) {
        try {
          mem.fromSnapshot(JSON.parse(snaps[0].snapshot_json));
        } catch { /* cold start is fine */ }
      }
    }
    return mem;
  }

  /**
   * Snapshot the current STM to the DB.
   * Also asynchronously ingests the latest exchange into LTM.
   */
  async snapshotMemory(agentId, sessionId) {
    const mem  = getSTM(agentId, sessionId);
    const snap = mem.toSnapshot();

    this.db.table('memory_snapshots').insert({
      agent_id:      agentId,
      session_id:    sessionId,
      snapshot_json: JSON.stringify(snap),
      created_at:    Math.floor(Date.now() / 1000),
    });

    // Fire-and-forget LTM ingestion — never blocks the agent
    if (snap.pairs?.length > 0) {
      const last    = snap.pairs[snap.pairs.length - 1];
      const content = `Goal: ${last.input.slice(0, 400)}\nResult: ${last.output.slice(0, 400)}`;
      this.storeToLTM(agentId, content, { agentId, sessionId }).catch(err =>
        logger.error(`LTM ingest failed for ${agentId}: ${err.message}`)
      );
    }

    return snap;
  }

  getSnapshots(agentId, sessionId = null) {
    const where = sessionId
      ? { agent_id: agentId, session_id: sessionId }
      : { agent_id: agentId };
    return this.db.table('memory_snapshots').all(where, { orderBy: 'created_at', order: 'desc', limit: 50 });
  }

  clearMemory(agentId, sessionId) {
    deleteSTM(agentId, sessionId);
    this.db.table('memory_snapshots').delete({ agent_id: agentId, session_id: sessionId });
    logger.info(`Cleared STM for ${agentId}:${sessionId}`);
  }

  getAllAgentMemories() {
    const all = this.db.table('memory_snapshots').all({}, { orderBy: 'created_at', order: 'desc' });

    // Build summary map — newest snapshot first (desc order), count per key
    const seen = new Map(); // key → summary object
    for (const row of all) {
      const key = `${row.agent_id}:${row.session_id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          agent_id:       row.agent_id,
          session_id:     row.session_id,
          last_updated:   row.created_at,
          snapshot_count: 1,
          preview:        null,
        });
      } else {
        seen.get(key).snapshot_count++;
      }
    }

    // Resolve preview for each session
    for (const entry of seen.values()) {
      entry.preview = this._resolveSessionPreview(entry.agent_id, entry.session_id);
    }

    return [...seen.values()];
  }

  /**
   * Resolve a short preview string for a session:
   *   - Workflow session (<projectId>:<runId>)  → goal from workflow_runs
   *   - Chat session (proj_<projectId>)          → first user message from messages
   *   - Any session fallback                     → first human input from earliest snapshot
   */
  _resolveSessionPreview(agentId, sessionId) {
    // ── Workflow: <projectId>:<runId> ──────────────────────────────────────
    const colonIdx = sessionId.indexOf(':');
    if (colonIdx > 0) {
      const runId = sessionId.slice(colonIdx + 1);
      const run   = this.db.table('workflow_runs').first({ id: runId });
      if (run) {
        try {
          const state = JSON.parse(run.graph_state_json);
          const goal  = state.goal || state.userGoal;
          if (goal) return goal;
        } catch { /* fall through */ }
      }
    }

    // ── Chat: proj_<projectId> ─────────────────────────────────────────────
    if (sessionId.startsWith('proj_')) {
      const msg = this.db.table('messages').all({ session_id: sessionId, role: 'user' }, { orderBy: 'ts', order: 'asc', limit: 1 });
      if (msg.length && msg[0].content) return msg[0].content;
    }

    // ── Fallback: first human input from the earliest snapshot ─────────────
    const rows = this.db.table('memory_snapshots').all(
      { agent_id: agentId, session_id: sessionId },
      { orderBy: 'created_at', order: 'asc', limit: 1 }
    );
    if (rows.length) {
      try {
        const snap = JSON.parse(rows[0].snapshot_json || '{}');
        if (Array.isArray(snap.pairs) && snap.pairs[0]?.input) return snap.pairs[0].input;
        if (Array.isArray(snap.chat_history)) {
          const first = snap.chat_history.find(m => m.type === 'human');
          if (first) return first.data?.content || first.kwargs?.content || first.content || null;
        }
      } catch { /* ignore */ }
    }

    return null;
  }

  getSTMStats() {
    return getSTMStats();
  }

  // ── Working Memory ────────────────────────────────────────────────────────────

  setWorkingContext(agentId, runId, data) {
    WorkingMemory.set(agentId, runId, data);
  }

  getWorkingContext(agentId, runId) {
    return WorkingMemory.get(agentId, runId);
  }

  /** Call at end of each run (workflow.runner.js finally block). */
  clearWorkingMemory(runId) {
    WorkingMemory.clearRun(runId);
    logger.debug(`Working memory cleared for run: ${runId}`);
  }

  getWMStats() {
    return WorkingMemory.getStats();
  }

  getWMLatest() {
    return WorkingMemory.getAllLatest();
  }

  getWMLatestForAgent(agentId) {
    return WorkingMemory.getLatestForAgent(agentId);
  }

  // ── Long-Term Memory ──────────────────────────────────────────────────────────

  async storeToLTM(agentId, content, metadata = {}) {
    try {
      await addToLTM(agentId, content, metadata);
    } catch (err) {
      logger.error(`LTM store failed for ${agentId}: ${err.message}`);
    }
  }

  async queryLTMRaw(agentId, queryText, k = 3) {
    try {
      return await queryLTM(agentId, queryText, k);
    } catch (err) {
      logger.error(`LTM query failed for ${agentId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Query LTM and return a formatted string ready to inject into a system prompt.
   * Returns '' when no relevant results exist (safe to skip in prompts).
   */
  async getLTMContext(agentId, queryText, k = 3) {
    const results = await this.queryLTMRaw(agentId, queryText, k);
    if (!results.length) return '';
    const lines = results.map((r, i) =>
      `[Memory ${i + 1}] (relevance: ${r.similarity})\n${r.content}`
    );
    return `=== RELEVANT PAST EXPERIENCE ===\n${lines.join('\n\n')}\n=== END PAST EXPERIENCE ===`;
  }

  getLTMStats(agentId) {
    return getLTMStats(agentId);
  }

  clearLTM(agentId) {
    clearLTM(agentId);
  }
}

// Singleton
export const memoryStore = new MemoryStore();

import { BufferWindowMemory } from 'langchain/memory';
import { getDb } from '../../../core/database/db.js';
import { createLogger } from '../../../core/logger/winston.logger.js';

const logger = createLogger('memory');
const _memories = new Map(); // `${agentId}:${sessionId}` → BufferWindowMemory

export class MemoryStore {
  constructor() {
    this.db = getDb();
  }

  getKey(agentId, sessionId) {
    return `${agentId}:${sessionId}`;
  }

  getMemory(agentId, sessionId) {
    const key = this.getKey(agentId, sessionId);
    if (!_memories.has(key)) {
      _memories.set(key, new BufferWindowMemory({
        k: 20,
        returnMessages: true,
        memoryKey: 'chat_history',
      }));
    }
    return _memories.get(key);
  }

  async snapshotMemory(agentId, sessionId) {
    const memory = this.getMemory(agentId, sessionId);
    const vars = await memory.loadMemoryVariables({});
    const snapshot = JSON.stringify(vars);

    this.db.table('memory_snapshots').insert({
      agent_id: agentId,
      session_id: sessionId,
      snapshot_json: snapshot,
      created_at: Math.floor(Date.now() / 1000),
    });

    return vars;
  }

  getSnapshots(agentId, sessionId = null) {
    const where = sessionId ? { agent_id: agentId, session_id: sessionId } : { agent_id: agentId };
    return this.db.table('memory_snapshots').all(where, { orderBy: 'created_at', order: 'desc', limit: 50 });
  }

  clearMemory(agentId, sessionId) {
    const key = this.getKey(agentId, sessionId);
    _memories.delete(key);
    this.db.table('memory_snapshots').delete({ agent_id: agentId, session_id: sessionId });
    logger.info(`Cleared memory for ${agentId}:${sessionId}`);
  }

  getAllAgentMemories() {
    // Group by agent_id + session_id, return latest snapshot per group
    const all = this.db.table('memory_snapshots').all({}, { orderBy: 'created_at', order: 'desc' });
    const seen = new Map();
    for (const row of all) {
      const key = `${row.agent_id}:${row.session_id}`;
      if (!seen.has(key)) {
        seen.set(key, { agent_id: row.agent_id, session_id: row.session_id, last_updated: row.created_at, snapshot_count: 1 });
      } else {
        seen.get(key).snapshot_count++;
      }
    }
    return [...seen.values()];
  }
}

// Singleton
export const memoryStore = new MemoryStore();

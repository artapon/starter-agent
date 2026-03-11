import { memoryStore } from '../services/memory.store.js';

export class MemoryController {
  getLatest = (req, res, next) => {
    try {
      const agents = ['researcher', 'planner', 'worker', 'reviewer'];
      const result = agents.map(agentId => {
        const snaps = memoryStore.getSnapshots(agentId);
        if (!snaps.length) return null;
        const snap = snaps[0];
        let messages = [];
        try {
          const vars = JSON.parse(snap.snapshot_json);
          messages = vars.chat_history || [];
        } catch { /* ignore */ }
        return { agentId, sessionId: snap.session_id, ts: snap.created_at, messages };
      }).filter(Boolean);
      res.json(result);
    } catch (e) { next(e); }
  };

  getAll = (req, res, next) => {
    try {
      res.json(memoryStore.getAllAgentMemories());
    } catch (e) { next(e); }
  };

  getByAgent = (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { sessionId } = req.query;
      res.json(memoryStore.getSnapshots(agentId, sessionId || null));
    } catch (e) { next(e); }
  };

  clearMemory = (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
      memoryStore.clearMemory(agentId, sessionId);
      res.json({ ok: true });
    } catch (e) { next(e); }
  };
}

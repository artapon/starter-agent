import { memoryStore } from '../services/memory.store.js';

export class MemoryController {
  // ── STM endpoints (unchanged) ──────────────────────────────────────────────

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
      const { agentId }   = req.params;
      const { sessionId } = req.query;
      res.json(memoryStore.getSnapshots(agentId, sessionId || null));
    } catch (e) { next(e); }
  };

  clearMemory = (req, res, next) => {
    try {
      const { agentId }   = req.params;
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
      memoryStore.clearMemory(agentId, sessionId);
      res.json({ ok: true });
    } catch (e) { next(e); }
  };

  // ── STM stats ──────────────────────────────────────────────────────────────

  getSTMStats = (req, res, next) => {
    try {
      res.json(memoryStore.getSTMStats());
    } catch (e) { next(e); }
  };

  // ── Working Memory endpoints ────────────────────────────────────────────────

  getWMStats = (req, res, next) => {
    try {
      // Returns { counts: {agentId: n}, latest: {agentId: context} }
      const { WorkingMemory } = memoryStore._wm ? { WorkingMemory: memoryStore._wm } : {};
      res.json({
        counts: memoryStore.getWMStats(),
        latest: memoryStore.getWMLatest(),
      });
    } catch (e) { next(e); }
  };

  getWMContext = (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { runId }   = req.query;
      if (runId) {
        res.json(memoryStore.getWorkingContext(agentId, runId));
      } else {
        res.json(memoryStore.getWMLatestForAgent(agentId));
      }
    } catch (e) { next(e); }
  };

  // ── Long-Term Memory endpoints ──────────────────────────────────────────────

  getLTMStats = (req, res, next) => {
    try {
      const agents = ['researcher', 'planner', 'worker', 'reviewer'];
      const stats  = req.params.agentId
        ? memoryStore.getLTMStats(req.params.agentId)
        : Object.fromEntries(agents.map(a => [a, memoryStore.getLTMStats(a)]));
      res.json(stats);
    } catch (e) { next(e); }
  };

  queryLTM = async (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { q, k }    = req.query;
      if (!q) return res.status(400).json({ error: 'q (query) required' });
      const results = await memoryStore.queryLTMRaw(agentId, q, parseInt(k) || 5);
      res.json(results);
    } catch (e) { next(e); }
  };

  storeLTM = async (req, res, next) => {
    try {
      const { agentId } = req.params;
      const { content, metadata } = req.body;
      if (!content) return res.status(400).json({ error: 'content required' });
      await memoryStore.storeToLTM(agentId, content, metadata || {});
      res.json({ ok: true });
    } catch (e) { next(e); }
  };

  clearLTM = (req, res, next) => {
    try {
      const { agentId } = req.params;
      memoryStore.clearLTM(agentId);
      res.json({ ok: true });
    } catch (e) { next(e); }
  };
}

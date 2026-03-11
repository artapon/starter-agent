import { Router } from 'express';
import { getDb } from '../../core/database/db.js';
import { getAdapter } from '../../core/adapters/llm/adapter.registry.js';

const router = Router();
const db = getDb();

router.get('/stats', async (req, res, next) => {
  try {
    const totalRuns = db.table('workflow_runs').count();
    const activeRuns = db.table('workflow_runs').count({ status: 'running' });
    const totalMessages = db.table('messages').count();
    const totalLogs = db.table('logs').count();
    const settings = db.table('agent_settings').all();

    const agentStatuses = await Promise.all(
      ['researcher', 'planner', 'developer', 'reviewer'].map(async (id) => {
        try {
          const adapter = getAdapter(id);
          const available = await adapter.isAvailable();
          return { agentId: id, available, model: adapter.getModelName() };
        } catch {
          return { agentId: id, available: false, model: 'unknown' };
        }
      })
    );

    res.json({
      totalRuns,
      activeRuns,
      totalMessages,
      totalLogs,
      agents: agentStatuses,
      settings,
      ts: Date.now(),
    });
  } catch (e) { next(e); }
});

router.get('/recent-runs', (req, res, next) => {
  try {
    const runs = db.table('workflow_runs').all({}, { orderBy: 'started_at', order: 'desc', limit: 20 });
    res.json(runs);
  } catch (e) { next(e); }
});

export const DashboardModule = { router };

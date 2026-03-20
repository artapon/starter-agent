import { Router } from 'express';
import { getDb } from '../../core/database/db.js';
import { getAdapter } from '../../core/adapters/llm/adapter.registry.js';

const router = Router();
const db = getDb();

// ── Stats cache (5 second TTL) ────────────────────────────────────────────────
let _statsCache = null;
let _statsCacheTs = 0;
const STATS_TTL = 5000;

router.get('/stats', async (req, res, next) => {
  try {
    const now = Date.now();
    // Return cached result if still fresh
    if (_statsCache && now - _statsCacheTs < STATS_TTL) {
      return res.json(_statsCache);
    }

    const totalRuns     = db.table('workflow_runs').count();
    const activeRuns    = db.table('workflow_runs').count({ status: 'running' });
    const totalMessages = db.table('messages').count();
    const totalLogs     = db.table('logs').count();
    const settings      = db.table('agent_settings').all();

    const agentStatuses = await Promise.all(
      ['researcher', 'planner', 'worker', 'reviewer'].map(async (id) => {
        try {
          const adapter = getAdapter(id);
          const available = await adapter.isAvailable();
          return { agentId: id, available, model: adapter.getModelName() };
        } catch {
          return { agentId: id, available: false, model: 'unknown' };
        }
      })
    );

    _statsCache = {
      totalRuns,
      activeRuns,
      totalMessages,
      totalLogs,
      agents: agentStatuses,
      settings,
      ts: now,
    };
    _statsCacheTs = now;

    res.json(_statsCache);
  } catch (e) { next(e); }
});

router.get('/tokens', (req, res, next) => {
  try {
    const now     = Date.now();
    const DAY     = 24 * 60 * 60 * 1000;
    const all     = db.table('token_usage').all();

    // Single pass: accumulate totals and per-agent sums
    let today = 0, weekly = 0, monthly = 0, total = 0;
    const byAgent = {};
    for (const r of all) {
      const t  = r.total_tokens || 0;
      const dt = now - (r.ts || 0);
      total  += t;
      if (dt < DAY)       today   += t;
      if (dt < 7 * DAY)   weekly  += t;
      if (dt < 30 * DAY)  monthly += t;
      if (r.agent_id) byAgent[r.agent_id] = (byAgent[r.agent_id] || 0) + t;
    }

    res.json({ today, weekly, monthly, total, byAgent });
  } catch (e) { next(e); }
});

router.get('/recent-runs', (req, res, next) => {
  try {
    const runs = db.table('workflow_runs').all({}, { orderBy: 'started_at', order: 'desc', limit: 20 });
    res.json(runs);
  } catch (e) { next(e); }
});

export const DashboardModule = { router };

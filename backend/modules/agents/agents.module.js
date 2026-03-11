import { Router } from 'express';
import { getDb } from '../../core/database/db.js';
import { getAdapter } from '../../core/adapters/llm/adapter.registry.js';

const router = Router();
const db = getDb();

// GET /api/agents
router.get('/', (req, res, next) => {
  try {
    const settings = db.table('agent_settings').all({}, { orderBy: 'agent_id' });
    res.json(settings);
  } catch (e) { next(e); }
});

// GET /api/agents/models/list?baseUrl=&apiKey=  — MUST be before /:agentId routes
router.get('/models/list', async (req, res, next) => {
  try {
    const baseUrl = (req.query.baseUrl || 'http://localhost:1234/v1').replace(/\/$/, '');
    const apiKey  = req.query.apiKey || 'lm-studio';

    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `LM Studio returned ${response.status}` });
    }

    const data = await response.json();
    const models = (data.data || []).map(m => ({ id: m.id, object: m.object }));
    res.json({ models });
  } catch (e) {
    res.status(503).json({ error: `Cannot reach LM Studio: ${e.message}` });
  }
});

// GET /api/agents/:agentId/status
router.get('/:agentId/status', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const adapter = getAdapter(agentId);
    const available = await adapter.isAvailable();
    res.json({ agentId, available, model: adapter.getModelName(), baseUrl: adapter.getBaseURL() });
  } catch (e) { next(e); }
});

export const AgentsModule = { router };

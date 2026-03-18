import { Router } from 'express';
import { ResearcherAgent } from './services/researcher.agent.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ agentId: 'researcher', status: 'ready' });
});

// Run researcher only (no full workflow) — used by Debug page "Research only" mode
router.post('/research', async (req, res) => {
  const { goal, sessionId: sid } = req.body;
  if (!goal?.trim()) return res.status(400).json({ error: 'goal is required' });
  const sessionId = sid || uuidv4();
  const runId     = uuidv4();
  const sm        = req.app.get('socketManager');
  const agent     = new ResearcherAgent(sm);
  try {
    const findings = await agent.research(goal.trim(), sessionId, runId);
    res.json({ findings, sessionId, runId });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(499).json({ error: 'Aborted' });
    res.status(500).json({ error: err.message });
  }
});

export const ResearcherModule = { router };

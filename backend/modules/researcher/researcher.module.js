import { Router } from 'express';
import { ResearcherAgent } from './services/researcher.agent.js';
import { ensureDebugWorkspace, getDebugWorkspacePath } from '../../core/workspace/debug.workspace.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/status', (req, res) => {
  const debugWorkspace = getDebugWorkspacePath();
  res.json({ agentId: 'researcher', status: 'ready', debugWorkspace });
});

// Run researcher only (no full workflow) — used by Debug page "Research only" mode
router.post('/research', async (req, res) => {
  const { goal, sessionId: sid, skill = null } = req.body;
  if (!goal?.trim()) return res.status(400).json({ error: 'goal is required' });
  const sessionId      = sid || uuidv4();
  const runId          = uuidv4();
  const sm             = req.app.get('socketManager');
  const agent          = new ResearcherAgent(sm);
  const debugWorkspace = ensureDebugWorkspace();
  try {
    const findings = await agent.research(goal.trim(), sessionId, runId, skill || null);
    res.json({ findings, sessionId, runId, debugWorkspace });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(499).json({ error: 'Aborted' });
    res.status(500).json({ error: err.message });
  }
});

export const ResearcherModule = { router };

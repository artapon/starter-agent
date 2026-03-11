import { Router } from 'express';

const router = Router();

// Placeholder for future researcher-specific routes
router.get('/status', (req, res) => {
  res.json({ agentId: 'researcher', status: 'ready' });
});

export const ResearcherModule = { router };

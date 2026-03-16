import { Router }           from 'express';
import { MemoryController } from './controllers/memory.controller.js';

const controller = new MemoryController();
const router     = Router();

// ── Long-Term Memory (must be before /:agentId catch-all) ────────────────────
router.get   ('/ltm/stats',              controller.getLTMStats);
router.get   ('/ltm/:agentId/stats',     controller.getLTMStats);
router.get   ('/ltm/:agentId/query',     controller.queryLTM);
router.delete('/ltm/:agentId',           controller.clearLTM);

// ── Working Memory ────────────────────────────────────────────────────────────
router.get('/wm/stats',      controller.getWMStats);
router.get('/wm/:agentId',   controller.getWMContext);

// ── Short-Term Memory / Snapshots ─────────────────────────────────────────────
router.get   ('/stm/stats',  controller.getSTMStats);
router.get   ('/latest',     controller.getLatest);
router.get   ('/',           controller.getAll);
router.get   ('/:agentId',   controller.getByAgent);
router.delete('/:agentId',   controller.clearMemory);

export const MemoryModule = { router };

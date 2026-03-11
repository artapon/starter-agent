import { Router } from 'express';
import { MemoryController } from './controllers/memory.controller.js';

const controller = new MemoryController();
const router = Router();

router.get('/', controller.getAll);
router.get('/latest', controller.getLatest);
router.get('/:agentId', controller.getByAgent);
router.delete('/:agentId', controller.clearMemory);

export const MemoryModule = { router };

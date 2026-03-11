import { Router } from 'express';
import { WorkerController } from './controllers/worker.controller.js';

export const WorkerModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const controller = new WorkerController(null);
      const router = Router();
      router.post('/execute', controller.execute);
      router.get('/subtasks', controller.getSubtasks);
      this._router = router;
    }
    return this._router;
  },
};

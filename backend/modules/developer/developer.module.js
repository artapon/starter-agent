import { Router } from 'express';
import { DeveloperController } from './controllers/developer.controller.js';

export const DeveloperModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const controller = new DeveloperController(null);
      const router = Router();
      router.post('/execute', controller.execute);
      router.get('/subtasks', controller.getSubtasks);
      this._router = router;
    }
    return this._router;
  },
};

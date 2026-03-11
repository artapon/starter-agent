import { Router } from 'express';
import { WorkflowController } from './controllers/workflow.controller.js';

export const WorkflowModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const controller = new WorkflowController(null);
      const router = Router();
      router.post('/start', controller.start);
      router.post('/stop/:runId', controller.stop);
      router.get('/runs', controller.getRuns);
      router.get('/runs/:runId', controller.getRun);
      this._router = router;
    }
    return this._router;
  },
};

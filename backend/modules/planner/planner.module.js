import { Router } from 'express';
import { PlannerController } from './controllers/planner.controller.js';

let _controller = null;

function createRouter(socketManager) {
  _controller = new PlannerController(socketManager);
  const router = Router();
  router.post('/plan', _controller.plan);
  router.get('/plans', _controller.getPlans);
  router.get('/plans/:id', _controller.getPlan);
  return router;
}

export const PlannerModule = {
  _router: null,
  get router() {
    if (!this._router) this._router = createRouter(null);
    return this._router;
  },
};

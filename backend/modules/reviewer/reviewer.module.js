import { Router } from 'express';
import { ReviewerController } from './controllers/reviewer.controller.js';

export const ReviewerModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const controller = new ReviewerController(null);
      const router = Router();
      router.post('/review', controller.review);
      this._router = router;
    }
    return this._router;
  },
};

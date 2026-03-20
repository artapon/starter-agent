import { Router } from 'express';
import { CronController } from './controllers/cron.controller.js';

export const CronModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const router = Router();
      router.get('/',                CronController.list);
      router.get('/:id',             CronController.get);
      router.post('/',               CronController.create);
      router.put('/:id',             CronController.update);
      router.delete('/:id',          CronController.delete);
      router.put('/:id/toggle',      CronController.toggle);
      router.post('/:id/run',        CronController.runNow);
      router.post('/validate',       CronController.validate);
      this._router = router;
    }
    return this._router;
  },
};

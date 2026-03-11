import { Router } from 'express';
import { ChatController } from './controllers/chat.controller.js';

export const ChatModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const controller = new ChatController(null);
      const router = Router();
      router.post('/message', controller.sendMessage);
      router.post('/stop/:sessionId', controller.stopSession);
      router.get('/sessions', controller.getSessions);
      router.get('/history/:sessionId', controller.getHistory);
      router.delete('/sessions/:sessionId', controller.clearSession);
      this._router = router;
    }
    return this._router;
  },
};

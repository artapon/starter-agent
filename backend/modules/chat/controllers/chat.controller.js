import { ChatService } from '../services/chat.service.js';

export class ChatController {
  constructor(socketManager) {
    this.service = new ChatService(socketManager);
  }

  sendMessage = async (req, res, next) => {
    try {
      const sm = req.app.get('socketManager');
      if (sm) { this.service.socketManager = sm; this.service.workflowRunner.socketManager = sm; }

      const { content, sessionId, projectId } = req.body;
      if (!content) return res.status(400).json({ error: 'content is required' });
      const result = await this.service.handleMessage(sessionId, content, projectId || null);
      res.json(result);
    } catch (e) { next(e); }
  };

  stopSession = (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const ok = this.service.stopSession(sessionId);
      res.json({ ok, sessionId });
    } catch (e) { next(e); }
  };

  getHistory = (req, res, next) => {
    try {
      const { sessionId } = req.params;
      res.json(this.service.getHistory(sessionId));
    } catch (e) { next(e); }
  };

  getSessions = (req, res, next) => {
    try {
      res.json(this.service.getSessions());
    } catch (e) { next(e); }
  };

  clearSession = (req, res, next) => {
    try {
      const { sessionId } = req.params;
      this.service.clearSession(sessionId);
      res.json({ ok: true });
    } catch (e) { next(e); }
  };
}

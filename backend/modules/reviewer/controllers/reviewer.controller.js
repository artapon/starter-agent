import { ReviewerAgent } from '../services/reviewer.agent.js';
import { v4 as uuidv4 } from 'uuid';

export class ReviewerController {
  constructor(socketManager) {
    this.agent = new ReviewerAgent(socketManager);
  }

  review = async (req, res, next) => {
    try {
      const { content, task, sessionId = uuidv4(), subtaskId, skill } = req.body;
      if (!content || !task) return res.status(400).json({ error: 'content and task are required' });
      const result = await this.agent.review(content, task, sessionId, subtaskId, null, skill || null);
      res.json({ sessionId, ...result });
    } catch (e) { next(e); }
  };
}

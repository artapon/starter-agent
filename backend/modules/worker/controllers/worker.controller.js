import { WorkerAgent } from '../services/worker.agent.js';
import { getDb } from '../../../core/database/db.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkerController {
  constructor(socketManager) {
    this.agent = new WorkerAgent(socketManager);
    this.db = getDb();
  }

  execute = async (req, res, next) => {
    try {
      const { task, sessionId = uuidv4(), planId } = req.body;
      if (!task) return res.status(400).json({ error: 'task is required' });
      const result = await this.agent.execute(task, sessionId, planId);
      res.json({ sessionId, ...result });
    } catch (e) { next(e); }
  };

  getSubtasks = (req, res, next) => {
    try {
      const { planId } = req.query;
      const where = planId ? { plan_id: planId } : {};
      const rows = this.db.table('subtasks').all(where, { orderBy: 'created_at', order: 'desc', limit: 50 });
      res.json(rows);
    } catch (e) { next(e); }
  };
}

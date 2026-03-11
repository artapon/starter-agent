import { PlannerAgent } from '../services/planner.agent.js';
import { getDb } from '../../../core/database/db.js';
import { v4 as uuidv4 } from 'uuid';

export class PlannerController {
  constructor(socketManager) {
    this.agent = new PlannerAgent(socketManager);
    this.db = getDb();
  }

  plan = async (req, res, next) => {
    try {
      const { goal, sessionId = uuidv4() } = req.body;
      if (!goal) return res.status(400).json({ error: 'goal is required' });

      const result = await this.agent.plan(goal, sessionId);
      res.json({ sessionId, ...result });
    } catch (e) { next(e); }
  };

  getPlans = (req, res, next) => {
    try {
      const { sessionId } = req.query;
      const where = sessionId ? { session_id: sessionId } : {};
      const plans = this.db.table('plans').all(where, { orderBy: 'created_at', order: 'desc', limit: 50 });
      res.json(plans);
    } catch (e) { next(e); }
  };

  getPlan = (req, res, next) => {
    try {
      const plan = this.db.table('plans').first({ id: req.params.id });
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      res.json(plan);
    } catch (e) { next(e); }
  };
}

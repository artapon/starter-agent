import { WorkflowRunner, stopWorkflowRun } from '../services/workflow.runner.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowController {
  constructor(socketManager) {
    this.runner = new WorkflowRunner(socketManager);
  }

  start = async (req, res, next) => {
    try {
      const { goal, sessionId = uuidv4(), projectId = null } = req.body;
      if (!goal) return res.status(400).json({ error: 'goal is required' });

      // Pre-generate runId so the client can use it immediately for stop
      const runId = uuidv4();
      res.json({ runId, sessionId, projectId, status: 'started' });

      // Execute in background with the pre-generated runId
      this.runner.run(goal, sessionId, null, runId, projectId).catch((err) => {
        console.error('Workflow background error:', err.message);
      });
    } catch (e) { next(e); }
  };

  stop = async (req, res, next) => {
    try {
      const { runId } = req.params;
      const ok = stopWorkflowRun(runId);
      res.json({ ok, runId });
    } catch (e) { next(e); }
  };

  getRuns = (req, res, next) => {
    try {
      const { sessionId } = req.query;
      res.json(this.runner.getRuns(sessionId || null));
    } catch (e) { next(e); }
  };

  getRun = (req, res, next) => {
    try {
      const run = this.runner.getRun(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json(run);
    } catch (e) { next(e); }
  };
}

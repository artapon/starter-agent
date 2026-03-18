import { Router } from 'express';
import { agentQueue } from '../../core/queue/agent.queue.js';

export const QueueModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const router = Router();

      // GET /api/queue — current queue snapshot
      router.get('/', (req, res) => {
        res.json({ queue: agentQueue.getSnapshot() });
      });

      // DELETE /api/queue/:jobId — cancel a queued (not yet running) job
      router.delete('/:jobId', (req, res) => {
        const ok = agentQueue.cancel(req.params.jobId);
        res.json({ ok, jobId: req.params.jobId });
      });

      this._router = router;
    }
    return this._router;
  },
};

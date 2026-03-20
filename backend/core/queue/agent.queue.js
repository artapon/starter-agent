import { createLogger } from '../logger/winston.logger.js';
import { getSocketManager } from '../socket/socket.manager.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('queue');

/**
 * Lightweight in-memory sequential job queue.
 *
 * Jobs (workflow runs or chat messages) are processed one at a time —
 * the next job only starts after the current one resolves or rejects.
 * Queued jobs can be cancelled before they start running.
 *
 * Usage:
 *   const result = await agentQueue.enqueue('workflow', 'Build a todo app', () => runner.run(...), runId);
 */
class AgentQueue {
  constructor() {
    /** @type {Array<{id,type,label,runId,runFn,resolve,reject,status,queuedAt,startedAt}>} */
    this._jobs    = [];
    this._running = false;
  }

  /**
   * Add a job to the queue.
   * @param {'workflow'|'chat'} type
   * @param {string}   label        - human-readable description (shown in UI)
   * @param {Function} runFn        - async () => result, called when job is next
   * @param {string}   [runId]      - pre-assigned runId to surface to the client
   * @param {Function} [onEnqueued] - sync callback(jobId) fired immediately after the job is registered
   * @returns {Promise<any>}        - resolves/rejects when the job finishes
   */
  enqueue(type, label, runFn, runId = null, onEnqueued = null, projectId = null) {
    return new Promise((resolve, reject) => {
      const job = {
        id:        uuidv4(),
        type,
        label:     label.slice(0, 120),
        runId:     runId || null,
        projectId: projectId || null,
        runFn,
        resolve,
        reject,
        status:    'queued',
        queuedAt:  Date.now(),
        startedAt: null,
      };

      this._jobs.push(job);
      onEnqueued?.(job.id);

      logger.info(`Queued [${type}] "${job.label}"`, { jobId: job.id, depth: this._jobs.length });
      this._emit();
      this._drain();
    });
  }

  /**
   * Cancel a job that is still waiting in the queue (not yet running).
   * Has no effect on already-running jobs — use stopWorkflowRun() for those.
   * @returns {boolean} true if the job was found and removed
   */
  cancel(jobId) {
    const idx = this._jobs.findIndex(j => j.id === jobId && j.status === 'queued');
    if (idx === -1) return false;

    const [job] = this._jobs.splice(idx, 1);
    job.reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
    logger.info(`Cancelled queued job: ${jobId}`);
    this._emit();
    return true;
  }

  /**
   * Update the runId for a job (called once the workflow runner assigns one).
   */
  setRunId(jobId, runId) {
    const job = this._jobs.find(j => j.id === jobId);
    if (job) job.runId = runId;
  }

  /** Public snapshot — safe to send to the client. */
  getSnapshot() {
    let queuePos = 0;
    return this._jobs.map(j => {
      if (j.status === 'queued') queuePos++;
      return {
        id:        j.id,
        type:      j.type,
        label:     j.label,
        runId:     j.runId,
        projectId: j.projectId,
        status:    j.status,                            // 'queued' | 'running'
        position:  j.status === 'queued' ? queuePos : null,
        queuedAt:  j.queuedAt,
        startedAt: j.startedAt,
      };
    });
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _drain() {
    if (this._running) return;

    const next = this._jobs.find(j => j.status === 'queued');
    if (!next) return;

    this._running    = true;
    next.status      = 'running';
    next.startedAt   = Date.now();

    logger.info(`Starting [${next.type}] "${next.label}"`, { jobId: next.id });
    this._emit();

    Promise.resolve()
      .then(() => next.runFn())
      .then(result => {
        this._finish(next, () => next.resolve(result));
        logger.info(`Job complete: ${next.id}`);
      })
      .catch(err => {
        this._finish(next, () => next.reject(err));
        if (!err.cancelled) logger.error(`Job failed: ${next.id} — ${err.message}`);
      });
  }

  _finish(job, settle) {
    this._jobs    = this._jobs.filter(j => j.id !== job.id);
    this._running = false;
    settle();
    this._emit();
    this._drain();   // pick up the next waiting job
  }

  _emit() {
    try {
      const io = getSocketManager();
      if (io) io.emit('queue:updated', { queue: this.getSnapshot(), ts: Date.now() });
    } catch { /* never crash over a socket emit */ }
  }
}

// Singleton — one queue for the entire process
export const agentQueue = new AgentQueue();

import { CronJob, validateCronExpression } from 'cron';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../../core/database/db.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { agentQueue } from '../../../core/queue/agent.queue.js';

const logger = createLogger('cron');

// Use the server's local timezone so cron expressions match local clock time
const SERVER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNextRun(job) {
  try {
    const nd = job.nextDate();
    return Math.floor(nd.toMillis() / 1000);
  } catch {
    return null;
  }
}

/** Lazy-import agents so cron service boots before LangChain finishes loading */
async function runTarget(jobRecord, socketManager) {
  const sessionId = `cron-${jobRecord.id.slice(0, 8)}-${Date.now()}`;
  const projectId = jobRecord.project_id || null;
  const label     = `[cron] ${jobRecord.name}`;

  if (jobRecord.target === 'workflow') {
    const { WorkflowRunner } = await import('../../workflow/services/workflow.runner.js');
    const runner = new WorkflowRunner(socketManager);
    const runId  = uuidv4();
    await agentQueue.enqueue(
      'workflow',
      label,
      () => runner.run(jobRecord.prompt, sessionId, null, runId, projectId),
      runId,
      null,
      projectId,
    );
    return;
  }

  if (jobRecord.target === 'researcher') {
    const { ResearcherAgent } = await import('../../researcher/services/researcher.agent.js');
    const agent = new ResearcherAgent(socketManager);
    await agentQueue.enqueue('workflow', label, () => agent.research(jobRecord.prompt, sessionId, null));
    return;
  }

  if (jobRecord.target === 'planner') {
    const { PlannerAgent } = await import('../../planner/services/planner.agent.js');
    const agent = new PlannerAgent(socketManager);
    await agentQueue.enqueue('workflow', label, () => agent.plan(jobRecord.prompt, sessionId, null));
    return;
  }

  if (jobRecord.target === 'worker') {
    const { WorkerAgent } = await import('../../worker/services/worker.agent.js');
    const agent = new WorkerAgent(socketManager);
    await agentQueue.enqueue('workflow', label, () => agent.execute(jobRecord.prompt, sessionId, null, null));
    return;
  }

  throw new Error(`Unknown target: ${jobRecord.target}`);
}

// ── Service ───────────────────────────────────────────────────────────────────

class CronService {
  constructor() {
    this._cronJobs = new Map(); // jobId → CronJob instance
    this.db = null;
    this.socketManager = null;
  }

  /** Call once from server.js after socket manager is available */
  init(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
    this._seedTable();
    this._loadAll();
  }

  _seedTable() {
    // Ensure the table exists by inserting and immediately deleting a no-op sentinel
    // (the JSON DB creates a table lazily on first write)
    const table = this.db.table('cron_jobs');
    if (!table.first({})) {
      // table is empty — nothing to seed, just ensure it exists
    }
  }

  _loadAll() {
    const jobs = this.db.table('cron_jobs').all({ enabled: 1 });
    for (const job of jobs) this._schedule(job);
    logger.info(`Cron service started — ${jobs.length} job(s) active (timezone: ${SERVER_TZ})`);
  }

  _schedule(jobRecord) {
    this._unschedule(jobRecord.id);
    if (!jobRecord.enabled) return;

    try {
      const tz = jobRecord.timezone || SERVER_TZ;
      const cronJob = new CronJob(
        jobRecord.schedule,
        () => this._fire(jobRecord.id),
        null,
        true,  // start immediately
        tz,
      );
      this._cronJobs.set(jobRecord.id, cronJob);
      const nextRun = getNextRun(cronJob);
      this.db.table('cron_jobs').update({ id: jobRecord.id }, { next_run: nextRun });
      logger.info(`Scheduled "${jobRecord.name}" → ${jobRecord.schedule}`);
    } catch (e) {
      logger.error(`Failed to schedule "${jobRecord.name}": ${e.message}`);
      this.db.table('cron_jobs').update({ id: jobRecord.id }, { last_status: 'error', last_error: e.message });
    }
  }

  _unschedule(id) {
    if (this._cronJobs.has(id)) {
      try { this._cronJobs.get(id).stop(); } catch {}
      this._cronJobs.delete(id);
    }
  }

  async _fire(jobId) {
    const job = this.db.table('cron_jobs').first({ id: jobId });
    if (!job || !job.enabled) return;

    logger.info(`Firing cron job "${job.name}"`);

    this.db.table('cron_jobs').update({ id: jobId }, {
      last_run:    Math.floor(Date.now() / 1000),
      last_status: 'running',
      run_count:   (job.run_count || 0) + 1,
    });
    this.socketManager?.emit('cron:status', { id: jobId, status: 'running' });

    try {
      await runTarget(job, this.socketManager);
      this.db.table('cron_jobs').update({ id: jobId }, { last_status: 'success', last_error: '' });
      this.socketManager?.emit('cron:status', { id: jobId, status: 'success' });
      logger.info(`Cron job "${job.name}" completed`);
    } catch (err) {
      logger.error(`Cron job "${job.name}" failed: ${err.message}`);
      this.db.table('cron_jobs').update({ id: jobId }, { last_status: 'error', last_error: err.message });
      this.socketManager?.emit('cron:status', { id: jobId, status: 'error', error: err.message });
    }

    // Refresh next_run after tick
    const cronJob = this._cronJobs.get(jobId);
    if (cronJob) {
      const nextRun = getNextRun(cronJob);
      this.db.table('cron_jobs').update({ id: jobId }, { next_run: nextRun });
    }
    this.socketManager?.emit('cron:updated', { id: jobId });
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  list() {
    return this.db.table('cron_jobs').all({}, { orderBy: 'created_at', order: 'desc' }) || [];
  }

  get(id) {
    return this.db.table('cron_jobs').first({ id });
  }

  create(data) {
    const { name, schedule, target, prompt, enabled = true, project_id = null } = data;
    const validation = validateCronExpression(schedule);
    if (!validation.valid) throw new Error(`Invalid cron expression: ${schedule}`);

    const id = uuidv4();
    const record = {
      id,
      name:        String(name).trim(),
      schedule:    String(schedule).trim(),
      target:      String(target),
      prompt:      String(prompt).trim(),
      project_id:  project_id || null,
      enabled:     enabled ? 1 : 0,
      last_run:    null,
      next_run:    null,
      last_status: null,
      last_error:  '',
      run_count:   0,
      created_at:  Math.floor(Date.now() / 1000),
    };
    this.db.table('cron_jobs').insert(record);
    if (record.enabled) this._schedule({ ...record, enabled: true });
    return this.get(id);
  }

  update(id, data) {
    const existing = this.get(id);
    if (!existing) throw new Error('Job not found');

    const updates = {};
    if (data.name       !== undefined) updates.name       = String(data.name).trim();
    if (data.prompt     !== undefined) updates.prompt     = String(data.prompt).trim();
    if (data.target     !== undefined) updates.target     = String(data.target);
    if (data.enabled    !== undefined) updates.enabled    = data.enabled ? 1 : 0;
    if ('project_id' in data)          updates.project_id = data.project_id || null;
    if (data.schedule !== undefined) {
      const validation = validateCronExpression(data.schedule);
      if (!validation.valid) throw new Error(`Invalid cron expression: ${data.schedule}`);
      updates.schedule = String(data.schedule).trim();
    }

    this.db.table('cron_jobs').update({ id }, updates);
    const updated = this.get(id);

    // Re-schedule if schedule, enabled, or target changed
    if ('schedule' in updates || 'enabled' in updates || 'target' in updates) {
      if (updated.enabled) {
        this._schedule(updated);
      } else {
        this._unschedule(id);
        this.db.table('cron_jobs').update({ id }, { next_run: null });
      }
    }
    return this.get(id);
  }

  delete(id) {
    this._unschedule(id);
    this.db.table('cron_jobs').delete({ id });
  }

  toggle(id) {
    const job = this.get(id);
    if (!job) throw new Error('Job not found');
    return this.update(id, { enabled: !job.enabled });
  }

  runNow(id) {
    const job = this.get(id);
    if (!job) throw new Error('Job not found');
    // Fire async — don't await so the HTTP response returns immediately
    this._fire(id).catch(e => logger.error(`runNow failed for "${job.name}": ${e.message}`));
    return { ok: true, message: `Job "${job.name}" triggered` };
  }

  validate(schedule) {
    const result = validateCronExpression(schedule);
    return { valid: result.valid, error: result.valid ? null : result.error?.message };
  }
}

export const cronService = new CronService();

import { cronService } from '../services/cron.service.js';

function ok(res, data) {
  res.json({ data });
}

function err(res, e, status = 400) {
  res.status(status).json({ error: e.message });
}

export const CronController = {
  list(req, res) {
    try { ok(res, cronService.list()); } catch (e) { err(res, e, 500); }
  },

  get(req, res) {
    try {
      const job = cronService.get(req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      ok(res, job);
    } catch (e) { err(res, e, 500); }
  },

  create(req, res) {
    try { ok(res, cronService.create(req.body)); } catch (e) { err(res, e); }
  },

  update(req, res) {
    try { ok(res, cronService.update(req.params.id, req.body)); } catch (e) { err(res, e); }
  },

  delete(req, res) {
    try { cronService.delete(req.params.id); res.json({ ok: true }); } catch (e) { err(res, e); }
  },

  toggle(req, res) {
    try { ok(res, cronService.toggle(req.params.id)); } catch (e) { err(res, e); }
  },

  runNow(req, res) {
    try { ok(res, cronService.runNow(req.params.id)); } catch (e) { err(res, e); }
  },

  validate(req, res) {
    try { ok(res, cronService.validate(req.body.schedule)); } catch (e) { err(res, e); }
  },
};

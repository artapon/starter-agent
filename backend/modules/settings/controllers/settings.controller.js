import { SettingsService } from '../services/settings.service.js';

export class SettingsController {
  constructor(service) {
    this.service = service;
  }

  getAll = (req, res, next) => {
    try {
      res.json(this.service.getAll());
    } catch (e) { next(e); }
  };

  getByAgent = (req, res, next) => {
    try {
      const s = this.service.getByAgentId(req.params.agentId);
      if (!s) return res.status(404).json({ error: 'Agent not found' });
      res.json(s);
    } catch (e) { next(e); }
  };

  update = (req, res, next) => {
    try {
      const updated = this.service.update(req.params.agentId, req.body);
      res.json(updated);
    } catch (e) { next(e); }
  };

  // ── Global ─────────────────────────────────────────────────────────────────

  getGlobal = (req, res, next) => {
    try { res.json(this.service.getGlobal()); } catch (e) { next(e); }
  };

  updateGlobal = (req, res, next) => {
    try { res.json(this.service.updateGlobal(req.body)); } catch (e) { next(e); }
  };

  // ── Tools ──────────────────────────────────────────────────────────────────

  getTools = (req, res, next) => {
    try {
      res.json(this.service.getTools(req.params.agentId));
    } catch (e) { next(e); }
  };

  updateTools = (req, res, next) => {
    try {
      const { enabledTools } = req.body;
      if (!Array.isArray(enabledTools)) {
        return res.status(400).json({ error: 'enabledTools must be an array of tool names' });
      }
      const result = this.service.updateTools(req.params.agentId, enabledTools);
      res.json(result);
    } catch (e) { next(e); }
  };
}

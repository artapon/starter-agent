import { SettingsService } from '../services/settings.service.js';
import { clearAllSTM } from '../../../core/memory/stm.store.js';
import { clearLTM } from '../../../core/memory/vector.store.js';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../reports');
const AGENTS = ['researcher', 'planner', 'worker', 'reviewer'];

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

  // ── Subskills ──────────────────────────────────────────────────────────────

  getSubskills = (req, res, next) => {
    try { res.json(this.service.getSubskills()); } catch (e) { next(e); }
  };

  setSubskill = (req, res, next) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      res.json(this.service.setSubskill(name));
    } catch (e) { next(e); }
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

  // ── Browser search tools ───────────────────────────────────────────────────

  getBrowserTools = (req, res, next) => {
    try { res.json(this.service.getBrowserTools()); } catch (e) { next(e); }
  };

  updateBrowserTools = (req, res, next) => {
    try {
      const { tools } = req.body;
      if (!Array.isArray(tools)) return res.status(400).json({ error: 'tools must be an array' });
      res.json(this.service.updateBrowserTools(tools));
    } catch (e) { next(e); }
  };

  addBrowserTool = (req, res, next) => {
    try { res.json(this.service.addBrowserTool(req.body)); }
    catch (e) { e.status = 400; next(e); }
  };

  editBrowserTool = (req, res, next) => {
    try { res.json(this.service.editBrowserTool(req.params.sourceName, req.body)); }
    catch (e) { e.status = 400; next(e); }
  };

  deleteBrowserTool = (req, res, next) => {
    try { res.json(this.service.deleteBrowserTool(req.params.sourceName)); }
    catch (e) { e.status = 400; next(e); }
  };

  reset = (req, res, next) => {
    try {
      const db = this.service.db;

      // Clear DB tables
      for (const table of ['memory_snapshots', 'workflow_runs', 'subtasks', 'plans',
                            'chat_messages', 'logs', 'rl_outcomes', 'token_usage']) {
        try { db.table(table).delete({}); } catch { /* table may not exist yet */ }
      }

      // Clear in-memory STM
      clearAllSTM();

      // Clear LTM vector indexes for all agents
      for (const agentId of AGENTS) {
        try { clearLTM(agentId); } catch { /* ignore if index not initialized */ }
      }

      // Delete all report session folders
      if (existsSync(REPORTS_DIR)) {
        for (const entry of readdirSync(REPORTS_DIR, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            try { rmSync(join(REPORTS_DIR, entry.name), { recursive: true, force: true }); } catch { /* ignore */ }
          }
        }
      }

      res.json({ ok: true });
    } catch (e) { next(e); }
  };
}

import { Router } from 'express';
import { projectStore } from '../../core/projects/project.store.js';
import { getDb } from '../../core/database/db.js';
import { deleteSTM } from '../../core/memory/stm.store.js';
import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../reports');
const AGENTS = ['researcher', 'planner', 'worker', 'reviewer'];

export const ProjectsModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const router = Router();

      // List all projects
      router.get('/', (req, res) => {
        try { res.json(projectStore.list()); }
        catch (e) { res.status(500).json({ error: e.message }); }
      });

      // Get one project
      router.get('/:id', (req, res) => {
        try {
          const p = projectStore.get(req.params.id);
          if (!p) return res.status(404).json({ error: 'Not found' });
          res.json(p);
        } catch (e) { res.status(500).json({ error: e.message }); }
      });

      // Create project
      router.post('/', (req, res) => {
        try {
          const { title, description } = req.body;
          if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
          res.status(201).json(projectStore.create({ title, description }));
        } catch (e) { res.status(500).json({ error: e.message }); }
      });

      // Update project
      router.put('/:id', (req, res) => {
        try {
          const { title, description } = req.body;
          const p = projectStore.update(req.params.id, { title, description });
          if (!p) return res.status(404).json({ error: 'Not found' });
          res.json(p);
        } catch (e) { res.status(500).json({ error: e.message }); }
      });

      // Delete project + all related data
      router.delete('/:id', (req, res) => {
        try {
          const { id } = req.params;
          const ok = projectStore.delete(id);
          if (!ok) return res.status(404).json({ error: 'Not found' });

          const db = getDb();
          const chatSessionId = `proj_${id}`;

          // 1. Chat messages for this project's session
          try { db.table('messages').delete({ session_id: chatSessionId }); } catch { /* ignore */ }

          // 2. Memory snapshots for chat session
          try { db.table('memory_snapshots').delete({ session_id: chatSessionId }); } catch { /* ignore */ }

          // 3. Workflow runs + their memory snapshots, subtasks, plans
          const runs = db.table('workflow_runs').all({ project_id: id });
          for (const run of runs) {
            try { db.table('memory_snapshots').delete({ session_id: run.id }); } catch { /* ignore */ }
            try { db.table('subtasks').delete({ plan_id: run.id }); } catch { /* ignore */ }
            try { db.table('plans').delete({ run_id: run.id }); } catch { /* ignore */ }
          }
          try { db.table('workflow_runs').delete({ project_id: id }); } catch { /* ignore */ }

          // 4. Clear STM in-memory for chat + each run session
          for (const agentId of AGENTS) {
            deleteSTM(agentId, chatSessionId);
            for (const run of runs) deleteSTM(agentId, run.id);
          }

          // 5. Delete report folder for this project's session
          const reportFolder = join(REPORTS_DIR, chatSessionId);
          if (existsSync(reportFolder)) {
            try { rmSync(reportFolder, { recursive: true, force: true }); } catch { /* ignore */ }
          }

          res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
      });

      this._router = router;
    }
    return this._router;
  },
};

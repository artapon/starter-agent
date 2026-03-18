import { Router } from 'express';
import { projectStore } from '../../core/projects/project.store.js';

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

      // Delete project
      router.delete('/:id', (req, res) => {
        try {
          const ok = projectStore.delete(req.params.id);
          if (!ok) return res.status(404).json({ error: 'Not found' });
          res.json({ ok: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
      });

      this._router = router;
    }
    return this._router;
  },
};

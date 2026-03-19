import { Router } from 'express';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WorkerController } from './controllers/worker.controller.js';
import { getAdapter } from '../../core/adapters/llm/adapter.registry.js';
import { getWorkspacePath } from '../../core/workspace/workspace.path.js';
import { setActiveRunWorkspace, clearActiveRunWorkspace } from '../../core/tools/tool.implementations.js';

const DEBUG_FOLDER = 'debug';

function ensureDebugWorkspace() {
  const debugPath = join(getWorkspacePath(), DEBUG_FOLDER);
  mkdirSync(debugPath, { recursive: true });
  return debugPath;
}

export const WorkerModule = {
  _router: null,
  get router() {
    if (!this._router) {
      const router = Router();

      // Status endpoint — used by Debug page
      router.get('/status', (req, res) => {
        try {
          const adapter        = getAdapter('worker');
          const debugWorkspace = join(getWorkspacePath(), DEBUG_FOLDER);
          res.json({ agentId: 'worker', status: 'ready', model: adapter?._settings?.model_name || 'unknown', debugWorkspace });
        } catch {
          res.json({ agentId: 'worker', status: 'error', model: 'unknown' });
        }
      });

      // Execute — scope all file writes to workspace/debug
      router.post('/execute', async (req, res, next) => {
        const sm             = req.app.get('socketManager');
        const debugWorkspace = ensureDebugWorkspace();
        setActiveRunWorkspace(debugWorkspace);
        try {
          const ctrl = new WorkerController(sm);
          // Inject debugWorkspace into response after controller finishes
          const origJson = res.json.bind(res);
          res.json = (body) => origJson({ ...body, debugWorkspace });
          await ctrl.execute(req, res, next);
        } finally {
          clearActiveRunWorkspace();
        }
      });

      router.get('/subtasks', (req, res, next) => {
        const ctrl = new WorkerController(null);
        return ctrl.getSubtasks(req, res, next);
      });

      this._router = router;
    }
    return this._router;
  },
};

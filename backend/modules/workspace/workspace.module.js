import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../../core/database/db.js';
import { projectStore } from '../../core/projects/project.store.js';
import { toFolderName } from '../../core/workspace/workspace.path.js';

const router = Router();

// Project root is 3 levels up from backend/modules/workspace/
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_WORKSPACE = path.join(PROJECT_ROOT, 'workspace');

function getWorkspacePath() {
  try {
    const row = getDb().table('global_settings').first({ key: 'workspace_path' });
    const val = row?.value;
    if (!val) return DEFAULT_WORKSPACE;
    return path.isAbsolute(val) ? val : path.resolve(PROJECT_ROOT, val);
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

function resolveWorkspace(projectId) {
  const base = getWorkspacePath();
  if (!projectId) return base;
  const project = projectStore.get(projectId);
  if (!project) return base;
  const folderName = project.folderName || toFolderName(project.title);
  return path.join(base, folderName);
}

function buildTree(dir, base) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.map((e) => {
    const fullPath = path.join(dir, e.name);
    const relPath = path.relative(base, fullPath).replace(/\\/g, '/');
    if (e.isDirectory()) {
      return { name: e.name, path: relPath, type: 'dir', children: buildTree(fullPath, base) };
    }
    const stat = fs.statSync(fullPath);
    return { name: e.name, path: relPath, type: 'file', size: stat.size };
  });
}

// GET /api/workspace/files?projectId=<id> — returns file tree
router.get('/files', (req, res, next) => {
  try {
    const workspace = resolveWorkspace(req.query.projectId || null);
    if (!fs.existsSync(workspace)) {
      return res.json({ workspace, tree: [] });
    }
    res.json({ workspace, tree: buildTree(workspace, workspace) });
  } catch (e) { next(e); }
});

// GET /api/workspace/file?path=relative/path&projectId=<id> — returns file content
router.get('/file', (req, res, next) => {
  try {
    const workspace = resolveWorkspace(req.query.projectId || null);
    const relPath = (req.query.path || '').replace(/^\/+/, '');
    const abs = path.resolve(workspace, relPath);
    if (!abs.startsWith(workspace)) return res.status(400).json({ error: 'Path traversal denied' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(abs);
    if (stat.size > 500_000) return res.status(413).json({ error: 'File too large to preview' });
    res.json({ path: relPath, content: fs.readFileSync(abs, 'utf-8') });
  } catch (e) { next(e); }
});

export const WorkspaceModule = { router };

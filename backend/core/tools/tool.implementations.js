import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger/winston.logger.js';
import { getDb } from '../database/db.js';
import { SocketEvents } from '../socket/socket.events.js';

// Project root is 3 levels up from backend/core/tools/
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

let _socketManager = null;
export function setToolSocketManager(sm) { _socketManager = sm; }
function notifyWorkspaceChanged() {
  _socketManager?.emit(SocketEvents.WORKSPACE_CHANGED, { ts: Date.now() });
}

const logger = createLogger('tools');

const DEFAULT_WORKSPACE = path.join(PROJECT_ROOT, 'workspace');

// Per-run workspace override — set by WorkflowRunner when a project is active.
// Cleared in the run's finally block. Safe because the queue runs jobs sequentially.
let _activeRunWorkspace = null;
export function setActiveRunWorkspace(absPath) { _activeRunWorkspace = absPath; }
export function clearActiveRunWorkspace()      { _activeRunWorkspace = null; }

// Workspace root — read dynamically from global_settings so it can be changed at runtime.
// Relative values in the DB are resolved against PROJECT_ROOT, not process.cwd().
function getWorkspace() {
  if (_activeRunWorkspace) return _activeRunWorkspace;
  try {
    const row = getDb().table('global_settings').first({ key: 'workspace_path' });
    const val = row?.value;
    if (!val) return DEFAULT_WORKSPACE;
    return path.isAbsolute(val) ? val : path.resolve(PROJECT_ROOT, val);
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

function safeResolve(filePath) {
  const workspace = getWorkspace();
  const resolved = path.resolve(workspace, filePath.replace(/^\/+/, ''));
  if (!resolved.startsWith(workspace)) throw new Error('Path traversal denied');
  return resolved;
}

function ensureWorkspace() {
  const workspace = getWorkspace();
  if (!fs.existsSync(workspace)) fs.mkdirSync(workspace, { recursive: true });
}

// ── read_file ────────────────────────────────────────────────────────────────
export const readFileTool = new DynamicStructuredTool({
  name: 'read_file',
  description: 'Read the content of a file. Path is relative to workspace.',
  schema: z.object({ path: z.string().describe('File path relative to workspace') }),
  func: async ({ path: filePath }) => {
    ensureWorkspace();
    const abs = safeResolve(filePath);
    if (!fs.existsSync(abs)) return `Error: File not found: ${filePath}`;
    const content = fs.readFileSync(abs, 'utf-8');
    logger.info(`read_file: ${filePath}`, { agentId: 'tool' });
    return content;
  },
});

// ── write_file ───────────────────────────────────────────────────────────────
export const writeFileTool = new DynamicStructuredTool({
  name: 'write_file',
  description: 'Write content to a file, creating directories as needed.',
  schema: z.object({
    path: z.string().describe('File path relative to workspace'),
    content: z.string().describe('Content to write'),
  }),
  func: async ({ path: filePath, content }) => {
    ensureWorkspace();
    const abs = safeResolve(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    logger.info(`write_file: ${filePath}`, { agentId: 'tool' });
    notifyWorkspaceChanged();
    return `Written: ${filePath}`;
  },
});

// ── replace_in_file ──────────────────────────────────────────────────────────
export const replaceInFileTool = new DynamicStructuredTool({
  name: 'replace_in_file',
  description: 'Find and replace a string within a file.',
  schema: z.object({
    path: z.string().describe('File path relative to workspace'),
    search: z.string().describe('String to find'),
    replace: z.string().describe('String to replace with'),
  }),
  func: async ({ path: filePath, search, replace }) => {
    ensureWorkspace();
    const abs = safeResolve(filePath);
    if (!fs.existsSync(abs)) return `Error: File not found: ${filePath}`;
    const original = fs.readFileSync(abs, 'utf-8');
    const updated = original.split(search).join(replace);
    if (original === updated) return `No matches found for "${search}" in ${filePath}`;
    fs.writeFileSync(abs, updated, 'utf-8');
    logger.info(`replace_in_file: ${filePath}`, { agentId: 'tool' });
    notifyWorkspaceChanged();
    return `Replaced in: ${filePath}`;
  },
});

// ── bulk_write ───────────────────────────────────────────────────────────────
export const bulkWriteTool = new DynamicStructuredTool({
  name: 'bulk_write',
  description: 'Write multiple files at once.',
  schema: z.object({
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })).describe('Array of {path, content} objects'),
  }),
  func: async ({ files }) => {
    ensureWorkspace();
    const results = [];
    for (const { path: filePath, content } of files) {
      const abs = safeResolve(filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
      results.push(filePath);
    }
    logger.info(`bulk_write: ${results.length} files`, { agentId: 'tool' });
    notifyWorkspaceChanged();
    return `Written ${results.length} files: ${results.join(', ')}`;
  },
});

// ── apply_blueprint ──────────────────────────────────────────────────────────
export const applyBlueprintTool = new DynamicStructuredTool({
  name: 'apply_blueprint',
  description: 'Parse a JSON blueprint and create all files described in it. Blueprint format: {"files": [{"path": "...", "content": "..."}]}',
  schema: z.object({ content: z.string().describe('JSON blueprint string') }),
  func: async ({ content }) => {
    ensureWorkspace();
    let blueprint;
    try {
      blueprint = JSON.parse(content);
    } catch {
      return 'Error: Invalid JSON blueprint';
    }
    const files = blueprint.files || [];
    if (!files.length) return 'Error: Blueprint has no files array';
    const written = [];
    for (const { path: filePath, content: fileContent } of files) {
      const abs = safeResolve(filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, fileContent, 'utf-8');
      written.push(filePath);
    }
    logger.info(`apply_blueprint: ${written.length} files`, { agentId: 'tool' });
    notifyWorkspaceChanged();
    return `Blueprint applied: ${written.length} files created`;
  },
});

// ── list_files ───────────────────────────────────────────────────────────────
export const listFilesTool = new DynamicStructuredTool({
  name: 'list_files',
  description: 'List files and directories at a given path in the workspace.',
  schema: z.object({ path: z.string().describe('Directory path relative to workspace. Use "." for workspace root.') }),
  func: async ({ path: dirPath = '.' }) => {
    ensureWorkspace();
    const abs = safeResolve(dirPath);
    if (!fs.existsSync(abs)) return `Error: Directory not found: ${dirPath}`;
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const lines = entries.map((e) => `${e.isDirectory() ? '[DIR] ' : '[FILE]'} ${e.name}`);
    logger.info(`list_files: ${dirPath}`, { agentId: 'tool' });
    return lines.length ? lines.join('\n') : '(empty directory)';
  },
});

// ── create_directory ─────────────────────────────────────────────────────────
export const createDirectoryTool = new DynamicStructuredTool({
  name: 'create_directory',
  description: 'Create a directory (including parent directories).',
  schema: z.object({ path: z.string().describe('Directory path relative to workspace') }),
  func: async ({ path: dirPath }) => {
    ensureWorkspace();
    const abs = safeResolve(dirPath);
    fs.mkdirSync(abs, { recursive: true });
    logger.info(`create_directory: ${dirPath}`, { agentId: 'tool' });
    return `Created directory: ${dirPath}`;
  },
});

// ── bulk_read ────────────────────────────────────────────────────────────────
export const bulkReadTool = new DynamicStructuredTool({
  name: 'bulk_read',
  description: 'Read multiple files and return their contents.',
  schema: z.object({ paths: z.array(z.string()).describe('Array of file paths to read') }),
  func: async ({ paths }) => {
    ensureWorkspace();
    const results = [];
    for (const filePath of paths) {
      const abs = safeResolve(filePath);
      if (!fs.existsSync(abs)) {
        results.push(`--- ${filePath} ---\nError: Not found`);
      } else {
        results.push(`--- ${filePath} ---\n${fs.readFileSync(abs, 'utf-8')}`);
      }
    }
    logger.info(`bulk_read: ${paths.length} files`, { agentId: 'tool' });
    return results.join('\n\n');
  },
});

// ── scaffold_project ──────────────────────────────────────────────────────────
const SCAFFOLD_TYPES = {
  'express-api': (name) => ({
    files: [
      { path: `${name}/package.json`, content: JSON.stringify({ name, version: '1.0.0', type: 'module', scripts: { dev: 'node --watch index.js', start: 'node index.js' }, dependencies: { express: '^4.19.0', cors: '^2.8.5', dotenv: '^16.0.0' } }, null, 2) },
      { path: `${name}/index.js`, content: `import 'dotenv/config';\nimport express from 'express';\nimport cors from 'cors';\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get('/api/health', (req, res) => res.json({ status: 'ok' }));\n\napp.listen(process.env.PORT || 3000, () => console.log('Server running'));\n` },
      { path: `${name}/.env`, content: 'PORT=3000\nNODE_ENV=development\n' },
      { path: `${name}/src/routes/index.js`, content: `import { Router } from 'express';\nexport const router = Router();\nrouter.get('/', (req, res) => res.json({ ok: true }));\n` },
    ],
  }),
  'vue-app': (name) => ({
    files: [
      { path: `${name}/package.json`, content: JSON.stringify({ name, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { vue: '^3.4.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-vue': '^5.0.0' } }, null, 2) },
      { path: `${name}/index.html`, content: `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"/><title>${name}</title></head>\n<body><div id="app"></div><script type="module" src="/src/main.js"></script></body>\n</html>\n` },
      { path: `${name}/src/main.js`, content: `import { createApp } from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');\n` },
      { path: `${name}/src/App.vue`, content: `<template><div><h1>${name}</h1></div></template>\n<script setup>\n</script>\n` },
    ],
  }),
  'fullstack': (name) => ({
    files: [
      { path: `${name}/package.json`, content: JSON.stringify({ name, workspaces: ['backend', 'frontend'], scripts: { dev: 'concurrently "npm run dev --workspace=backend" "npm run dev --workspace=frontend"' }, devDependencies: { concurrently: '^8.0.0' } }, null, 2) },
      { path: `${name}/backend/package.json`, content: JSON.stringify({ name: `${name}-backend`, type: 'module', scripts: { dev: 'node --watch index.js' }, dependencies: { express: '^4.19.0', cors: '^2.8.5' } }, null, 2) },
      { path: `${name}/backend/index.js`, content: `import express from 'express';\nimport cors from 'cors';\nconst app = express();\napp.use(cors());\napp.use(express.json());\napp.get('/api/health', (_,r)=>r.json({ok:true}));\napp.listen(3000, ()=>console.log('Backend :3000'));\n` },
      { path: `${name}/frontend/package.json`, content: JSON.stringify({ name: `${name}-frontend`, type: 'module', scripts: { dev: 'vite --port 5173' }, dependencies: { vue: '^3.4.0' }, devDependencies: { vite: '^5.0.0', '@vitejs/plugin-vue': '^5.0.0' } }, null, 2) },
    ],
  }),
};

export const scaffoldProjectTool = new DynamicStructuredTool({
  name: 'scaffold_project',
  description: 'Scaffold a project from a template. Types: express-api, vue-app, fullstack.',
  schema: z.object({
    type: z.enum(['express-api', 'vue-app', 'fullstack', 'express-api-swagger', 'modular-standard', 'fullstack-auth', 'landing-page']).describe('Project template type'),
    name: z.string().describe('Project name / directory name'),
  }),
  func: async ({ type, name }) => {
    ensureWorkspace();
    const factory = SCAFFOLD_TYPES[type] || SCAFFOLD_TYPES['express-api'];
    const { files } = factory(name);
    for (const { path: filePath, content } of files) {
      const abs = safeResolve(filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
    }
    logger.info(`scaffold_project: ${type}/${name}`, { agentId: 'tool' });
    notifyWorkspaceChanged();
    return `Scaffolded "${type}" project "${name}" with ${files.length} files in workspace/${name}/`;
  },
});

// ── order_fix ─────────────────────────────────────────────────────────────────
export const orderFixTool = new DynamicStructuredTool({
  name: 'order_fix',
  description: 'Send a corrective instruction back. Use when you detect an issue that needs fixing before proceeding.',
  schema: z.object({ instructions: z.string().describe('What needs to be fixed and how') }),
  func: async ({ instructions }) => {
    logger.info(`order_fix issued`, { agentId: 'tool' });
    return `ORDER_FIX: ${instructions}`;
  },
});

// ── request_review ────────────────────────────────────────────────────────────
export const requestReviewTool = new DynamicStructuredTool({
  name: 'request_review',
  description: 'Signal that the current output is ready for the reviewer agent to evaluate.',
  schema: z.object({}),
  func: async () => {
    logger.info(`request_review triggered`, { agentId: 'tool' });
    return 'REVIEW_REQUESTED: Output flagged for review.';
  },
});

// ── Tool map ──────────────────────────────────────────────────────────────────
export const TOOL_MAP = {
  read_file: readFileTool,
  write_file: writeFileTool,
  replace_in_file: replaceInFileTool,
  bulk_write: bulkWriteTool,
  apply_blueprint: applyBlueprintTool,
  list_files: listFilesTool,
  create_directory: createDirectoryTool,
  bulk_read: bulkReadTool,
  scaffold_project: scaffoldProjectTool,
  order_fix: orderFixTool,
  request_review: requestReviewTool,
};

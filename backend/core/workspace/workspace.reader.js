import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('workspace-reader');

const PROJECT_ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_WORKSPACE = path.join(PROJECT_ROOT, 'workspace');

export function getWorkspacePath() {
  try {
    const row = getDb().table('global_settings').first({ key: 'workspace_path' });
    const val = row?.value;
    if (!val) return DEFAULT_WORKSPACE;
    return path.isAbsolute(val) ? val : path.resolve(PROJECT_ROOT, val);
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.cache', '__pycache__', '.pytest_cache', 'venv', '.venv',
  'vendor', '.idea', '.vscode',
]);

// File extensions whose content we'll read (others are listed but not read)
const READABLE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.vue', '.svelte',
  '.json', '.jsonc',
  '.md', '.txt', '.env.example', '.env.sample',
  '.html', '.css', '.scss', '.sass',
  '.py', '.rb', '.go', '.java', '.cs', '.php', '.rs',
  '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.sh', '.bash', '.zsh',
  '.sql',
]);

// Priority files — always read if they exist, regardless of depth
const PRIORITY_FILES = [
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'tsconfig.json', 'tsconfig.base.json',
  'vite.config.js', 'vite.config.ts', 'webpack.config.js',
  '.env', '.env.example', '.env.sample',
  'README.md', 'readme.md',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.eslintrc.json', '.eslintrc.js', '.prettierrc', '.prettierrc.json',
  'jest.config.js', 'jest.config.ts', 'vitest.config.js', 'vitest.config.ts',
  'babel.config.js', 'rollup.config.js',
  'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
  'server.js', 'server.ts',
];

const MAX_FILE_BYTES   = 8_000;   // max bytes to read per file
const MAX_TOTAL_CHARS  = 40_000;  // hard cap on total context chars
const MAX_TREE_FILES   = 400;     // max entries in the tree listing

// ── Tree walker ───────────────────────────────────────────────────────────────

/**
 * Walk the workspace and return a flat list of relative file paths.
 * Directories in SKIP_DIRS are pruned entirely.
 */
function walkTree(dir, base = '', results = [], count = { n: 0 }) {
  if (count.n >= MAX_TREE_FILES) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  // Sort: dirs first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (count.n >= MAX_TREE_FILES) break;
    if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.env.sample') {
      // Skip hidden files/dirs except the specific env examples
      if (entry.isDirectory()) continue;
    }
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push({ rel, type: 'dir' });
      count.n++;
      walkTree(path.join(dir, entry.name), rel, results, count);
    } else {
      results.push({ rel, type: 'file', abs: path.join(dir, entry.name) });
      count.n++;
    }
  }
  return results;
}

// ── File reader ───────────────────────────────────────────────────────────────

function readFileSafe(absPath) {
  try {
    const stat = fs.statSync(absPath);
    if (stat.size > MAX_FILE_BYTES * 2) {
      // For very large files return only the first MAX_FILE_BYTES
      const buf = Buffer.alloc(MAX_FILE_BYTES);
      const fd  = fs.openSync(absPath, 'r');
      const bytesRead = fs.readSync(fd, buf, 0, MAX_FILE_BYTES, 0);
      fs.closeSync(fd);
      return buf.slice(0, bytesRead).toString('utf8') + '\n… [truncated]';
    }
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

function isReadable(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return READABLE_EXTS.has(ext);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a full workspace context string for injection into agent prompts.
 *
 * Returns an object:
 *   { context: string, fileCount: number, isEmpty: boolean }
 *
 * The context contains:
 *   1. File tree (all files, up to MAX_TREE_FILES)
 *   2. Content of priority files (package.json, README, config, etc.)
 *   3. Content of remaining readable files (within char budget)
 */
export function buildWorkspaceContext(wsPathOverride) {
  const wsPath = wsPathOverride || getWorkspacePath();

  if (!fs.existsSync(wsPath)) {
    return { context: '', fileCount: 0, isEmpty: true };
  }

  const entries = walkTree(wsPath);
  const files   = entries.filter(e => e.type === 'file');

  if (!files.length) {
    return { context: '', fileCount: 0, isEmpty: true };
  }

  // ── 1. Tree section ───────────────────────────────────────────────────────
  const treeLines = entries.map(e =>
    e.type === 'dir' ? `📁 ${e.rel}/` : `📄 ${e.rel}`
  );
  const treeBlock = treeLines.join('\n');

  // ── 2. Decide which files to read ─────────────────────────────────────────
  const priorityNames = new Set(PRIORITY_FILES.map(f => f.toLowerCase()));

  // Priority files first, then other readable files
  const toRead = [
    ...files.filter(f => priorityNames.has(path.basename(f.rel).toLowerCase()) && isReadable(f.rel)),
    ...files.filter(f => !priorityNames.has(path.basename(f.rel).toLowerCase()) && isReadable(f.rel)),
  ];

  // ── 3. Read files within the char budget ──────────────────────────────────
  const contentSections = [];
  let charBudget = MAX_TOTAL_CHARS - treeBlock.length - 500; // reserve 500 for headers

  for (const file of toRead) {
    if (charBudget <= 0) break;
    const raw = readFileSafe(file.abs);
    if (!raw) continue;
    const trimmed = raw.slice(0, Math.min(raw.length, MAX_FILE_BYTES));
    const section = `\n--- ${file.rel} ---\n${trimmed}`;
    if (section.length > charBudget) {
      // Truncate this file to fit the remaining budget
      const partial = section.slice(0, charBudget);
      contentSections.push(partial + '\n… [truncated]');
      charBudget = 0;
    } else {
      contentSections.push(section);
      charBudget -= section.length;
    }
  }

  const context = [
    '=== EXISTING WORKSPACE PROJECT ===',
    '',
    '## File Tree',
    treeBlock,
    '',
    '## File Contents',
    ...contentSections,
    '',
    '=== END WORKSPACE PROJECT ===',
  ].join('\n');

  logger.info(`Workspace context built: ${files.length} files, ${context.length} chars`, { agentId: 'workspace-reader' });
  return { context, fileCount: files.length, isEmpty: false };
}

/**
 * Compact workspace summary for the Planner agent.
 * Returns the full file tree + content of the most critical config/entry files only
 * (package.json, README, tsconfig, main entry points) — kept well under 8 000 chars
 * so it fits comfortably inside the planner's prompt budget.
 */
export function buildWorkspaceSummary(wsPathOverride) {
  const wsPath = wsPathOverride || getWorkspacePath();
  if (!fs.existsSync(wsPath)) return { summary: '', fileCount: 0, isEmpty: true };

  const entries = walkTree(wsPath);
  const files   = entries.filter(e => e.type === 'file');
  if (!files.length) return { summary: '', fileCount: 0, isEmpty: true };

  const treeBlock = entries.map(e =>
    e.type === 'dir' ? `📁 ${e.rel}/` : `📄 ${e.rel}`
  ).join('\n');

  // Only read the highest-priority config/entry files for the summary
  const SUMMARY_PRIORITY = new Set([
    'package.json', 'tsconfig.json', 'tsconfig.base.json',
    'readme.md', 'readme.txt',
    '.env.example', '.env.sample',
    'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
    'server.js', 'server.ts',
    'vite.config.js', 'vite.config.ts',
    'docker-compose.yml', 'docker-compose.yaml',
  ]);

  const toRead = files.filter(f =>
    SUMMARY_PRIORITY.has(path.basename(f.rel).toLowerCase()) && isReadable(f.rel)
  );

  const MAX_SUMMARY_CHARS = 6_000;
  const contentSections = [];
  let budget = MAX_SUMMARY_CHARS - treeBlock.length - 300;

  for (const file of toRead) {
    if (budget <= 0) break;
    const raw = readFileSafe(file.abs);
    if (!raw) continue;
    const snippet = raw.slice(0, Math.min(raw.length, 2_000));
    const section = `\n--- ${file.rel} ---\n${snippet}`;
    if (section.length > budget) {
      contentSections.push(section.slice(0, budget) + '\n… [truncated]');
      budget = 0;
    } else {
      contentSections.push(section);
      budget -= section.length;
    }
  }

  const summary = [
    '=== EXISTING WORKSPACE PROJECT ===',
    '',
    '## File Tree (full)',
    treeBlock,
    '',
    '## Key File Contents',
    ...contentSections,
    '',
    '=== END WORKSPACE PROJECT ===',
  ].join('\n');

  return { summary, fileCount: files.length, isEmpty: false };
}

/**
 * Read specific files from the workspace by relative path.
 * Returns a formatted string with file contents.
 */
export function readWorkspaceFiles(relPaths) {
  const wsPath = getWorkspacePath();
  const sections = [];
  for (const rel of relPaths) {
    const abs = path.resolve(wsPath, rel.replace(/^\/+/, ''));
    // Security: ensure it stays inside workspace
    if (!abs.startsWith(wsPath)) continue;
    const content = readFileSafe(abs);
    if (content != null) {
      sections.push(`--- ${rel} ---\n${content.slice(0, MAX_FILE_BYTES)}`);
    }
  }
  return sections.join('\n\n');
}

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getWorkspacePath } from './workspace.path.js';

const DEBUG_FOLDER = 'debug';

/**
 * Ensure the debug sub-folder exists inside the active workspace.
 * Returns the absolute path to workspace/debug/.
 */
export function ensureDebugWorkspace() {
  const debugPath = join(getWorkspacePath(), DEBUG_FOLDER);
  mkdirSync(debugPath, { recursive: true });
  return debugPath;
}

/**
 * Return the debug workspace path without creating it.
 */
export function getDebugWorkspacePath() {
  return join(getWorkspacePath(), DEBUG_FOLDER);
}

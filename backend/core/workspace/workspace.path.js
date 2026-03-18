import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../database/db.js';

const PROJECT_ROOT      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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

/** Convert a project title to a safe folder name (spaces → underscores). */
export function toFolderName(title) {
  return (title || '').trim().replace(/\s+/g, '_');
}

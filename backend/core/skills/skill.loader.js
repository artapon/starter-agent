import { readFileSync, existsSync, readdirSync, watchFile } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('skill-loader');

// Project root is 3 levels up from backend/core/skills/
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILLS_ROOT   = join(PROJECT_ROOT, 'skills');

const SKILL_FILES = {
  global:     'SKILL.md',
  researcher: 'RESEARCHER.md',
  planner:    'PLANNER.md',
  worker:     'WORKER.md',
  reviewer:   'REVIEWER.md',
};

// Per-subskill cache: { [subskill]: { [agentId | 'global']: string } }
const cache = {};

// In-memory active subskill name (populated lazily from DB)
let _activeSubskill = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readSkill(subskill, filename) {
  const filePath = join(SKILLS_ROOT, subskill, filename);
  if (!existsSync(filePath)) return '';
  try {
    // Escape { and } so LangChain's ChatPromptTemplate doesn't treat them as variables
    return readFileSync(filePath, 'utf8').trim().replace(/\{/g, '{{').replace(/\}/g, '}}');
  } catch (err) {
    logger.warn(`Could not read skill file ${subskill}/${filename}: ${err.message}`);
    return '';
  }
}

function clearCache(subskill) {
  if (subskill) delete cache[subskill];
  else Object.keys(cache).forEach(k => delete cache[k]);
}

// Watch all skill files and bust their subskill's cache on change
try {
  const subskills = readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);
  for (const subskill of subskills) {
    for (const filename of Object.values(SKILL_FILES)) {
      const filePath = join(SKILLS_ROOT, subskill, filename);
      watchFile(filePath, { interval: 2000 }, () => {
        clearCache(subskill);
        logger.info(`Skill file changed, cache cleared: ${subskill}/${filename}`);
      });
    }
  }
} catch { /* skills dir may not exist yet */ }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all available subskill profile names (subdirectories of /skills/).
 * @returns {string[]}
 */
export function listSubskills() {
  try {
    return readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return ['default'];
  }
}

/**
 * Get the currently active subskill name.
 * Reads from DB on first call; cached in memory thereafter.
 * @returns {string}
 */
export function getActiveSubskill() {
  if (_activeSubskill) return _activeSubskill;
  try {
    const row = getDb().table('global_settings').first({ key: 'active_subskill' });
    _activeSubskill = row?.value || 'default';
  } catch {
    _activeSubskill = 'default';
  }
  return _activeSubskill;
}

/**
 * Change the active subskill and clear all caches.
 * @param {string} name
 */
export function setActiveSubskill(name) {
  _activeSubskill = name;
  clearCache(); // clear every subskill's cache so the new one is freshly loaded
  logger.info(`Active subskill set to: ${name}`);
}

/**
 * Get the skill prompt block for an agent under the currently active subskill.
 * Combines global SKILL.md + agent-specific file from the active profile directory.
 *
 * @param {'researcher'|'planner'|'worker'|'reviewer'} agentId
 * @returns {string}
 */
export function getSkillPrompt(agentId) {
  const subskill = getActiveSubskill();
  if (!cache[subskill]) cache[subskill] = {};
  const sub = cache[subskill];

  if (!(agentId in sub)) {
    sub[agentId] = SKILL_FILES[agentId] ? readSkill(subskill, SKILL_FILES[agentId]) : '';
  }
  if (!('global' in sub)) {
    sub.global = readSkill(subskill, SKILL_FILES.global);
  }

  const parts = [];
  if (sub.global)   parts.push(`## Global Expert Skills\n${sub.global}`);
  if (sub[agentId]) parts.push(`## ${agentId.charAt(0).toUpperCase() + agentId.slice(1)} Expert Skills\n${sub[agentId]}`);

  if (!parts.length) return '';
  return `\n\n---\n${parts.join('\n\n')}`;
}

import { readFileSync, existsSync, readdirSync, watchFile } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('skill-loader');

// Project root is 3 levels up from backend/core/skills/
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILLS_ROOT   = join(PROJECT_ROOT, 'skills');
const LIBRARY_ROOT  = join(SKILLS_ROOT, 'library');

// Skill library metadata — descriptions used in the planner skill menu
const LIBRARY_SKILL_DESCRIPTIONS = {
  researcher: {
    'design':   'HTML/CSS/UI/UX, portfolio, landing page, visual design, typography, accessibility',
    'backend':  'API design, authentication, security, packages, performance, error handling',
    'general':  'general-purpose — detects task type and applies the right research focus',
  },
  worker: {
    'html-css':  'HTML/CSS/design tasks: portfolio, landing page, visual components',
    'nodejs':    'Node.js/Express backend: APIs, services, middleware, error handling',
    'vue':       'Vue 3 + Vuetify frontend: components, Composition API, scoped styles',
    'fullstack': 'full-stack: HTML/CSS or Vue frontend + Node.js backend together',
    'general':   'general-purpose — covers any task type with core quality rules',
  },
  reviewer: {
    'design':    'visual quality, real content, responsiveness, semantic HTML, accessibility',
    'backend':   'code correctness, security, error handling, completeness, performance',
    'fullstack': 'design quality + code correctness + frontend/backend integration',
    'general':   'general-purpose — detects task type and applies the matching lens',
  },
};

// Library skill cache: { 'researcher:design': string }
const libraryCache = {};

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
    logger.error(`Could not read skill file ${subskill}/${filename}: ${err.message}`);
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

// ── Raw readers (no brace-escaping — for agents that build prompts manually) ──

function readSkillRaw(subskill, filename) {
  const filePath = join(SKILLS_ROOT, subskill, filename);
  if (!existsSync(filePath)) return '';
  try {
    return readFileSync(filePath, 'utf8').trim();
  } catch (err) {
    logger.error(`Could not read raw skill file ${subskill}/${filename}: ${err.message}`);
    return '';
  }
}

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
 * Get the raw (no brace-escaping) combined skill content for an agent.
 * Safe to use as a plain string in manually-built message arrays.
 * Combines global SKILL.md + agent-specific file.
 *
 * @param {'researcher'|'planner'|'worker'|'reviewer'} agentId
 * @returns {string}
 */
export function getRawSkillPrompt(agentId) {
  const subskill = getActiveSubskill();
  if (!cache[subskill]) cache[subskill] = {};
  const cacheKey = `raw_${agentId}`;

  if (!(cacheKey in cache[subskill])) {
    const global = readSkillRaw(subskill, SKILL_FILES.global);
    const agent  = SKILL_FILES[agentId] ? readSkillRaw(subskill, SKILL_FILES[agentId]) : '';
    cache[subskill][cacheKey] = [global, agent].filter(Boolean).join('\n\n---\n\n');
  }
  return cache[subskill][cacheKey];
}

/**
 * Parse the `## Sources` line from an agent's skill file.
 * Returns an array of source names, or null if the section is absent
 * (meaning "use all available sources").
 *
 * Example line:  `web, github, npm, stackoverflow, hackernews`
 *
 * @param {'researcher'|'planner'|'worker'|'reviewer'} agentId
 * @returns {string[]|null}
 */
export function getSkillSources(agentId) {
  const subskill = getActiveSubskill();
  const content  = readSkillRaw(subskill, SKILL_FILES[agentId] || '');
  const match    = content.match(/^##\s+Sources\s*\r?\n([^\r\n]+)/mi);
  if (!match) return null;
  return match[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
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

// ── Library skill API ──────────────────────────────────────────────────────────

/**
 * List available skill names for an agent from the library.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @returns {string[]}
 */
export function listLibrarySkills(agentId) {
  return Object.keys(LIBRARY_SKILL_DESCRIPTIONS[agentId] || {});
}

/**
 * Read the raw content of a library skill file.
 * Returns empty string if not found.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string} skillName
 * @returns {string}
 */
export function getLibrarySkillRaw(agentId, skillName) {
  if (!agentId || !skillName) return '';
  const key = `${agentId}:${skillName}`;
  if (key in libraryCache) return libraryCache[key];
  const filePath = join(LIBRARY_ROOT, agentId, `${skillName}.md`);
  if (!existsSync(filePath)) {
    logger.warn(`Library skill not found: ${agentId}/${skillName}.md`);
    libraryCache[key] = '';
    return '';
  }
  try {
    libraryCache[key] = readFileSync(filePath, 'utf8').trim();
    // Watch for changes
    watchFile(filePath, { interval: 2000 }, () => {
      delete libraryCache[key];
      logger.info(`Library skill changed, cache cleared: ${agentId}/${skillName}`);
    });
  } catch (err) {
    logger.error(`Could not read library skill ${agentId}/${skillName}: ${err.message}`);
    libraryCache[key] = '';
  }
  return libraryCache[key];
}

/**
 * Get raw library skill prompt for agents that build messages manually (no brace-escaping).
 * Falls back to getRawSkillPrompt() if skill not found.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string|null} skillName
 * @returns {string}
 */
export function getRawLibrarySkillPrompt(agentId, skillName) {
  if (!skillName) return getRawSkillPrompt(agentId);
  const content = getLibrarySkillRaw(agentId, skillName);
  if (!content) return getRawSkillPrompt(agentId);
  const label = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  return `\n\n---\n## ${label} Expert Skills — ${skillName}\n${content}`;
}

/**
 * Get brace-escaped library skill prompt for agents that use ChatPromptTemplate.
 * Falls back to getSkillPrompt() if skill not found.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string|null} skillName
 * @returns {string}
 */
export function getLibrarySkillPrompt(agentId, skillName) {
  if (!skillName) return getSkillPrompt(agentId);
  const content = getLibrarySkillRaw(agentId, skillName);
  if (!content) return getSkillPrompt(agentId);
  const escaped = content.replace(/\{/g, '{{').replace(/\}/g, '}}');
  const label = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  return `\n\n---\n## ${label} Expert Skills — ${skillName}\n${escaped}`;
}

/**
 * Build a formatted skill selection menu for injection into the Planner prompt.
 * Lists every available library skill with its description.
 * @returns {string}
 */
export function buildSkillMenu() {
  const lines = ['\n\n---\n## Agent Skill Selection\n'];
  lines.push('Choose the best skill for each agent based on the task type.');
  lines.push('Add an `"agentSkills"` key to your JSON output.\n');
  for (const [agent, skills] of Object.entries(LIBRARY_SKILL_DESCRIPTIONS)) {
    lines.push(`### ${agent} skills`);
    for (const [name, desc] of Object.entries(skills)) {
      lines.push(`- "${name}" — ${desc}`);
    }
    lines.push('');
  }
  lines.push('Example: {"agentSkills":{"researcher":"design","worker":"html-css","reviewer":"design"}}');
  return lines.join('\n');
}

import { readFileSync, existsSync, readdirSync, watchFile, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../database/db.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('skill-loader');

// Project root is 3 levels up from backend/core/skills/
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILLS_ROOT   = join(PROJECT_ROOT, 'skills');
const LIBRARY_ROOT  = join(SKILLS_ROOT, 'library');

// Fallback descriptions used only when a skill file has no leading `> description` line
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
 * Scans the filesystem — only returns skills that actually have a file.
 * Always includes 'general' even if no general.md exists (it's the default fallback).
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @returns {string[]}
 */
export function listLibrarySkills(agentId) {
  const dir = join(LIBRARY_ROOT, agentId);
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    const names = files.map(f => f.replace(/\.md$/, ''));
    if (!names.includes('general')) names.push('general');
    return names.sort();
  } catch {
    // Directory doesn't exist yet — only offer general
    return ['general'];
  }
}

/**
 * Extract a one-line description from a library skill file.
 * Reads the first blockquote line (`> ...`) in the file.
 * Falls back to LIBRARY_SKILL_DESCRIPTIONS metadata, then to the skill name itself.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string} skillName
 * @returns {string}
 */
function getSkillFileDescription(agentId, skillName) {
  const content = getLibrarySkillRaw(agentId, skillName);
  if (content) {
    const match = content.match(/^>\s+(.+)/m);
    if (match) return match[1].trim();
  }
  return LIBRARY_SKILL_DESCRIPTIONS[agentId]?.[skillName] || skillName;
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
 * Defaults to the library's "general" skill when skillName is null/missing.
 * Falls back to getRawSkillPrompt() only if the library file is also missing.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string|null} skillName
 * @returns {string}
 */
export function getRawLibrarySkillPrompt(agentId, skillName) {
  // Planner may return comma-separated names (e.g. "backend, general") — take the first
  const name    = (skillName || 'general').split(',')[0].trim() || 'general';
  const content = getLibrarySkillRaw(agentId, name);
  const label   = agentId.charAt(0).toUpperCase() + agentId.slice(1);

  if (content) {
    return `\n\n---\n## ${label} Expert Skills — ${name}\n${content}`;
  }

  // Skill file missing: build a targeted directive so the agent doesn't silently
  // behave as general. Prepend a focused instruction, then fall back to general content.
  const generalContent = getLibrarySkillRaw(agentId, 'general');
  const baseText = (generalContent || getRawSkillPrompt(agentId)).trim();
  if (name === 'general') {
    return `\n\n---\n## ${label} Expert Skills — general\n${baseText}`;
  }
  const focusDirective = `**Skill focus: "${name}"** — This task requires specialised expertise in "${name}". Apply your deepest knowledge of ${name}-related tools, patterns, and best practices throughout your work. Treat every decision through the lens of a ${name} specialist.`;
  return `\n\n---\n## ${label} Expert Skills — ${name} (focused)\n${focusDirective}\n\n${baseText}`;
}

/**
 * Get brace-escaped library skill prompt for agents that use ChatPromptTemplate.
 * Defaults to the library's "general" skill when skillName is null/missing.
 * Falls back to getSkillPrompt() only if the library file is also missing.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string|null} skillName
 * @returns {string}
 */
export function getLibrarySkillPrompt(agentId, skillName) {
  // Planner may return comma-separated names (e.g. "backend, general") — take the first
  const name    = (skillName || 'general').split(',')[0].trim() || 'general';
  const content = getLibrarySkillRaw(agentId, name);
  const label   = agentId.charAt(0).toUpperCase() + agentId.slice(1);

  if (content) {
    const escaped = content.replace(/\{/g, '{{').replace(/\}/g, '}}');
    return `\n\n---\n## ${label} Expert Skills — ${name}\n${escaped}`;
  }

  // Skill file missing: targeted directive + general content (brace-escaped)
  const generalContent = getLibrarySkillRaw(agentId, 'general');
  const rawBase = (generalContent || '').replace(/\{/g, '{{').replace(/\}/g, '}}').trim()
                  || getSkillPrompt(agentId).trim();
  if (name === 'general') {
    return `\n\n---\n## ${label} Expert Skills — general\n${rawBase}`;
  }
  const focusDirective = `**Skill focus: "${name}"** — This task requires specialised expertise in "${name}". Apply your deepest knowledge of ${name}-related tools, patterns, and best practices throughout your work. Treat every decision through the lens of a ${name} specialist.`;
  return `\n\n---\n## ${label} Expert Skills — ${name} (focused)\n${focusDirective}\n\n${rawBase}`;
}

/**
 * Build a formatted skill selection menu for injection into the Planner prompt.
 * Lists only skills that actually exist as files in skills/library/<agent>/.
 * Descriptions are extracted from the file's first `> ` blockquote line.
 * @returns {string}
 */
export function buildSkillMenu() {
  const agents = ['researcher', 'worker', 'reviewer'];
  const lines = ['\n\n---\n## Agent Skill Selection\n'];
  lines.push('Choose ONE skill name per agent — a single string, never a comma-separated list.');
  lines.push('Rules:');
  lines.push('1. Pick the skill whose name/description best matches the task domain.');
  lines.push('2. Only fall back to "general" if no other skill is a reasonable match.');
  lines.push('3. If no existing skill fits well, **propose a new descriptive name** (e.g. `react-ts`, `python-fastapi`, `data-pipeline`). The new skill will be created — do not force "general" when a specialist name better describes the work.');
  lines.push('⚠️ Each value must be exactly ONE skill name — e.g. "backend", not "backend, general".');
  lines.push('Add an `"agentSkills"` key to your JSON output.\n');

  for (const agent of agents) {
    const skills = listLibrarySkills(agent);
    lines.push(`### ${agent} skills`);
    for (const name of skills) {
      const desc = getSkillFileDescription(agent, name);
      lines.push(`- "${name}" — ${desc}`);
    }
    lines.push('');
  }

  lines.push('Example: {{"agentSkills":{{"researcher":"design","worker":"html-css","reviewer":"design"}}}}');
  return lines.join('\n');
}

// ── Library CRUD (management API) ─────────────────────────────────────────────

/**
 * Parse the category from a skill file's first <!-- category: X --> comment.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string} skillName
 * @returns {string|null}
 */
export function getSkillCategory(agentId, skillName) {
  const content = getLibrarySkillRaw(agentId, skillName);
  if (!content) return null;
  const m = content.match(/^<!--\s*category:\s*(.+?)\s*-->/m);
  return m ? m[1].trim() : null;
}

/**
 * Return metadata for a single library skill.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string} skillName
 * @returns {object}
 */
export function getSkillMeta(agentId, skillName) {
  const content = getLibrarySkillRaw(agentId, skillName);
  return {
    agentId,
    name: skillName,
    exists: !!content,
    description: getSkillFileDescription(agentId, skillName),
    category: getSkillCategory(agentId, skillName),
    path: `skills/library/${agentId}/${skillName}.md`,
  };
}

/**
 * List all library skills across all agents with metadata.
 * Returns array sorted by agentId then name.
 * @returns {object[]}
 */
export function listAllLibrarySkills() {
  const agents = ['researcher', 'worker', 'reviewer'];
  const result = [];
  for (const agentId of agents) {
    for (const name of listLibrarySkills(agentId)) {
      result.push(getSkillMeta(agentId, name));
    }
  }
  return result;
}

/**
 * Write (create or update) a library skill file.
 * Prepends <!-- category: X --> header if category is provided.
 * Clears the library cache entry after writing.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string} skillName
 * @param {string} content
 * @param {string|null} category
 */
export function writeLibrarySkill(agentId, skillName, content, category = null) {
  if (!agentId || !skillName) throw new Error('agentId and skillName are required');
  const dir = join(LIBRARY_ROOT, agentId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `${skillName}.md`);
  // Build file content: optional category header, then user content
  let fileContent = content || '';
  // Remove any existing category header from the content before re-adding
  fileContent = fileContent.replace(/^<!--\s*category:.*?-->\s*\n?/m, '').trimStart();
  if (category) {
    fileContent = `<!-- category: ${category} -->\n${fileContent}`;
  }
  writeFileSync(filePath, fileContent, 'utf8');
  // Bust cache
  const key = `${agentId}:${skillName}`;
  delete libraryCache[key];
  logger.info(`Library skill written: ${agentId}/${skillName}`, { category });
}

/**
 * Delete a library skill file and clear its cache entry.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @param {string} skillName
 * @returns {boolean}
 */
export function deleteLibrarySkill(agentId, skillName) {
  if (!agentId || !skillName) throw new Error('agentId and skillName are required');
  const filePath = join(LIBRARY_ROOT, agentId, `${skillName}.md`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  const key = `${agentId}:${skillName}`;
  delete libraryCache[key];
  logger.info(`Library skill deleted: ${agentId}/${skillName}`);
  return true;
}

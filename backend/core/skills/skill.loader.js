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
// Keys are full skillIds: "category/skillName"
const LIBRARY_SKILL_DESCRIPTIONS = {
  researcher: {
    'web-development/design':   'HTML/CSS/UI/UX, portfolio, landing page, visual design, typography, accessibility',
    'web-development/backend':  'API design, authentication, security, packages, performance, error handling',
    'general/general':          'general-purpose — detects task type and applies the right research focus',
  },
  worker: {
    'web-development/html-css':  'HTML/CSS/design tasks: portfolio, landing page, visual components',
    'web-development/nodejs':    'Node.js/Express backend: APIs, services, middleware, error handling',
    'web-development/vue':       'Vue 3 + Vuetify frontend: components, Composition API, scoped styles',
    'web-development/fullstack': 'full-stack: HTML/CSS or Vue frontend + Node.js backend together',
    'general/general':           'general-purpose — covers any task type with core quality rules',
  },
  reviewer: {
    'web-development/design':    'visual quality, real content, responsiveness, semantic HTML, accessibility',
    'web-development/backend':   'code correctness, security, error handling, completeness, performance',
    'web-development/fullstack': 'design quality + code correctness + frontend/backend integration',
    'general/general':           'general-purpose — detects task type and applies the matching lens',
  },
};

// Library skill cache: { 'researcher:web-development/design': string }
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
 * Returns an array of source names, or null if the section is absent.
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
 * Resolve the file path for a library skill.
 * skillId format: "category/skillName" (e.g. "web-development/backend")
 * Backwards compat: bare "skillName" tries flat path then "general/skillName".
 * @param {string} agentId
 * @param {string} skillId
 * @returns {string|null} absolute path or null if not found
 */
function resolveSkillPath(agentId, skillId) {
  if (skillId.includes('/')) {
    const slash    = skillId.indexOf('/');
    const category = skillId.slice(0, slash);
    const name     = skillId.slice(slash + 1);
    return join(LIBRARY_ROOT, agentId, category, `${name}.md`);
  }
  // Backwards compat: flat file
  const flat = join(LIBRARY_ROOT, agentId, `${skillId}.md`);
  if (existsSync(flat)) return flat;
  // Try general/<skillId>
  return join(LIBRARY_ROOT, agentId, 'general', `${skillId}.md`);
}

/**
 * List available skill identifiers for an agent from the library.
 * Scans category subdirectories recursively.
 * Returns "category/skillName" strings (e.g. ["web-development/backend", "general/general"]).
 * Always includes "general/general" even if no file exists.
 * @param {'researcher'|'worker'|'reviewer'} agentId
 * @returns {string[]}
 */
export function listLibrarySkills(agentId) {
  const agentDir = join(LIBRARY_ROOT, agentId);
  try {
    if (!existsSync(agentDir)) return ['general/general'];
    const result = [];
    const entries = readdirSync(agentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const catDir = join(agentDir, entry.name);
        try {
          const files = readdirSync(catDir).filter(f => f.endsWith('.md'));
          for (const f of files) {
            result.push(`${entry.name}/${f.replace(/\.md$/, '')}`);
          }
        } catch { /* ignore unreadable dirs */ }
      }
    }
    if (!result.some(s => s === 'general/general')) result.push('general/general');
    return result.sort();
  } catch {
    return ['general/general'];
  }
}

/**
 * Extract a one-line description from a library skill file.
 * Reads the first blockquote line (`> ...`) in the file.
 * Falls back to LIBRARY_SKILL_DESCRIPTIONS metadata, then to the skill name itself.
 * @param {string} agentId
 * @param {string} skillId  "category/skillName"
 * @returns {string}
 */
function getSkillFileDescription(agentId, skillId) {
  const content = getLibrarySkillRaw(agentId, skillId);
  if (content) {
    const match = content.match(/^>\s+(.+)/m);
    if (match) return match[1].trim();
  }
  return LIBRARY_SKILL_DESCRIPTIONS[agentId]?.[skillId] || skillId;
}

/**
 * Read the raw content of a library skill file.
 * skillId: "category/skillName" (e.g. "web-development/backend")
 * Returns empty string if not found.
 * @param {string} agentId
 * @param {string} skillId
 * @returns {string}
 */
export function getLibrarySkillRaw(agentId, skillId) {
  if (!agentId || !skillId) return '';
  const key = `${agentId}:${skillId}`;
  if (key in libraryCache) return libraryCache[key];

  const filePath = resolveSkillPath(agentId, skillId);
  if (!existsSync(filePath)) {
    logger.warn(`Library skill not found: ${agentId}/${skillId}`);
    libraryCache[key] = '';
    return '';
  }
  try {
    libraryCache[key] = readFileSync(filePath, 'utf8').trim();
    watchFile(filePath, { interval: 2000 }, () => {
      delete libraryCache[key];
      logger.info(`Library skill changed, cache cleared: ${agentId}/${skillId}`);
    });
  } catch (err) {
    logger.error(`Could not read library skill ${agentId}/${skillId}: ${err.message}`);
    libraryCache[key] = '';
  }
  return libraryCache[key];
}

/**
 * Get raw library skill prompt for agents that build messages manually (no brace-escaping).
 * skillId: "category/skillName" or legacy bare name.
 * Defaults to "general/general" when skillId is null/missing.
 * @param {string} agentId
 * @param {string|null} skillId
 * @returns {string}
 */
export function getRawLibrarySkillPrompt(agentId, skillId) {
  // Planner may return comma-separated names — take the first
  const id      = (skillId || 'general/general').split(',')[0].trim() || 'general/general';
  const content = getLibrarySkillRaw(agentId, id);
  const label   = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  const display = id.includes('/') ? id.split('/').pop() : id;

  if (content) {
    return `\n\n---\n## ${label} Expert Skills — ${display}\n${content}`;
  }

  // Skill file missing: build a targeted directive so the agent doesn't silently
  // behave as general. Prepend a focused instruction, then fall back to general content.
  const generalContent = getLibrarySkillRaw(agentId, 'general/general');
  const baseText = (generalContent || getRawSkillPrompt(agentId)).trim();
  if (id === 'general/general' || id === 'general') {
    return `\n\n---\n## ${label} Expert Skills — general\n${baseText}`;
  }
  const focusDirective = `**Skill focus: "${id}"** — This task requires specialised expertise in "${display}". Apply your deepest knowledge of ${display}-related tools, patterns, and best practices throughout your work. Treat every decision through the lens of a ${display} specialist.`;
  return `\n\n---\n## ${label} Expert Skills — ${display} (focused)\n${focusDirective}\n\n${baseText}`;
}

/**
 * Get brace-escaped library skill prompt for agents that use ChatPromptTemplate.
 * skillId: "category/skillName" or legacy bare name.
 * @param {string} agentId
 * @param {string|null} skillId
 * @returns {string}
 */
export function getLibrarySkillPrompt(agentId, skillId) {
  // Planner may return comma-separated names — take the first
  const id      = (skillId || 'general/general').split(',')[0].trim() || 'general/general';
  const content = getLibrarySkillRaw(agentId, id);
  const label   = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  const display = id.includes('/') ? id.split('/').pop() : id;

  if (content) {
    const escaped = content.replace(/\{/g, '{{').replace(/\}/g, '}}');
    return `\n\n---\n## ${label} Expert Skills — ${display}\n${escaped}`;
  }

  // Skill file missing: targeted directive + general content (brace-escaped)
  const generalContent = getLibrarySkillRaw(agentId, 'general/general');
  const rawBase = (generalContent || '').replace(/\{/g, '{{').replace(/\}/g, '}}').trim()
                  || getSkillPrompt(agentId).trim();
  if (id === 'general/general' || id === 'general') {
    return `\n\n---\n## ${label} Expert Skills — general\n${rawBase}`;
  }
  const focusDirective = `**Skill focus: "${id}"** — This task requires specialised expertise in "${display}". Apply your deepest knowledge of ${display}-related tools, patterns, and best practices throughout your work. Treat every decision through the lens of a ${display} specialist.`;
  return `\n\n---\n## ${label} Expert Skills — ${display} (focused)\n${focusDirective}\n\n${rawBase}`;
}

/**
 * Build a formatted skill selection menu for injection into the Planner prompt.
 * Skills are grouped by category. Identifiers use "category/name" format.
 * @returns {string}
 */
export function buildSkillMenu() {
  const agents = ['researcher', 'worker', 'reviewer'];
  const lines = ['\n\n---\n## Agent Skill Selection\n'];
  lines.push('Choose ONE skill identifier per agent — format: "category/name" (e.g. "web-development/backend").');
  lines.push('Rules:');
  lines.push('1. Pick the skill whose description best matches the task domain.');
  lines.push('2. Fall back to "general/general" only if no other skill fits.');
  lines.push('3. If no existing skill fits well, **propose a new identifier** (e.g. "mobile/react-native", "data/python-pipeline"). The new skill will be created automatically.');
  lines.push('⚠️ Each value must be exactly ONE skill identifier — e.g. "web-development/backend", not "web-development/backend, general/general".');
  lines.push('Add an `"agentSkills"` key to your JSON output.\n');

  for (const agent of agents) {
    const skills = listLibrarySkills(agent);
    // Group by category
    const byCategory = {};
    for (const skillId of skills) {
      const cat = skillId.includes('/') ? skillId.slice(0, skillId.indexOf('/')) : 'general';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(skillId);
    }
    lines.push(`### ${agent} skills`);
    for (const [cat, catSkills] of Object.entries(byCategory).sort()) {
      lines.push(`  **${cat}**`);
      for (const skillId of catSkills) {
        const desc = getSkillFileDescription(agent, skillId);
        lines.push(`  - "${skillId}" — ${desc}`);
      }
    }
    lines.push('');
  }

  lines.push('Example: {{"agentSkills":{{"researcher":"web-development/design","worker":"web-development/html-css","reviewer":"web-development/design"}}}}');
  return lines.join('\n');
}

// ── Library CRUD (management API) ─────────────────────────────────────────────

/**
 * Get the category from a skillId path.
 * "web-development/backend" → "web-development"
 * @param {string} agentId
 * @param {string} skillId
 * @returns {string|null}
 */
export function getSkillCategory(agentId, skillId) {
  if (skillId && skillId.includes('/')) {
    return skillId.slice(0, skillId.indexOf('/'));
  }
  return null;
}

/**
 * Return metadata for a single library skill.
 * @param {string} agentId
 * @param {string} skillId  "category/skillName"
 * @returns {object}
 */
export function getSkillMeta(agentId, skillId) {
  const content   = getLibrarySkillRaw(agentId, skillId);
  const category  = getSkillCategory(agentId, skillId);
  const skillName = skillId.includes('/') ? skillId.slice(skillId.indexOf('/') + 1) : skillId;
  return {
    agentId,
    skillId,
    name:        skillName,   // bare skill name for display
    exists:      !!content,
    description: getSkillFileDescription(agentId, skillId),
    category,
    path:        `skills/library/${agentId}/${skillId}.md`,
  };
}

/**
 * List all library skills across all agents with metadata.
 * Returns array sorted by agentId then skillId.
 * @returns {object[]}
 */
export function listAllLibrarySkills() {
  const agents = ['researcher', 'worker', 'reviewer'];
  const result = [];
  for (const agentId of agents) {
    for (const skillId of listLibrarySkills(agentId)) {
      result.push(getSkillMeta(agentId, skillId));
    }
  }
  return result;
}

/**
 * Write (create or update) a library skill file.
 * skillId: "category/skillName" — the category directory is created automatically.
 * If skillId has no "/" and a separate category is provided, it is combined.
 * Returns the resolved full skillId.
 * @param {string} agentId
 * @param {string} skillId   "category/skillName" or bare "skillName"
 * @param {string} content
 * @param {string|null} category  used only when skillId has no "/"
 * @returns {string}  resolved fullSkillId
 */
export function writeLibrarySkill(agentId, skillId, content, category = null) {
  if (!agentId || !skillId) throw new Error('agentId and skillId are required');

  let resolvedCategory, skillName;
  if (skillId.includes('/')) {
    const slash    = skillId.indexOf('/');
    resolvedCategory = skillId.slice(0, slash);
    skillName        = skillId.slice(slash + 1);
  } else {
    resolvedCategory = category || 'general';
    skillName        = skillId;
  }

  const dir      = join(LIBRARY_ROOT, agentId, resolvedCategory);
  const filePath = join(dir, `${skillName}.md`);
  mkdirSync(dir, { recursive: true });

  // Strip any legacy <!-- category: X --> header from content
  let fileContent = (content || '').replace(/^<!--\s*category:.*?-->\s*\n?/m, '').trimStart();
  writeFileSync(filePath, fileContent, 'utf8');

  const fullSkillId = `${resolvedCategory}/${skillName}`;
  // Bust cache for both the input id and the resolved id
  delete libraryCache[`${agentId}:${skillId}`];
  delete libraryCache[`${agentId}:${fullSkillId}`];
  logger.info(`Library skill written: ${agentId}/${fullSkillId}`);
  return fullSkillId;
}

/**
 * Delete a library skill file and clear its cache entry.
 * @param {string} agentId
 * @param {string} skillId  "category/skillName"
 * @returns {boolean}
 */
export function deleteLibrarySkill(agentId, skillId) {
  if (!agentId || !skillId) throw new Error('agentId and skillId are required');
  const filePath = resolveSkillPath(agentId, skillId);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  delete libraryCache[`${agentId}:${skillId}`];
  logger.info(`Library skill deleted: ${agentId}/${skillId}`);
  return true;
}

import { readFileSync, existsSync, watchFile } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('skill-loader');

// Project root is 3 levels up from backend/core/skills/
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// Skill files live in the /skills folder at the project root
const SKILLS_DIR = join(PROJECT_ROOT, 'skills');

const SKILL_FILES = {
  global:    'SKILL.md',
  planner:   'PLANNER.md',
  developer: 'DEVELOPER.md',
  reviewer:  'REVIEWER.md',
};

// In-memory cache — invalidated when files change on disk
const cache = {};

function readSkill(filename) {
  const filePath = join(SKILLS_DIR, filename);
  if (!existsSync(filePath)) return '';
  try {
    // Escape { and } so LangChain's ChatPromptTemplate doesn't treat them as variables
    const content = readFileSync(filePath, 'utf8').trim().replace(/\{/g, '{{').replace(/\}/g, '}}');
    return content;
  } catch (err) {
    logger.warn(`Could not read skill file ${filename}: ${err.message}`);
    return '';
  }
}

// Watch each skill file and bust cache on change
for (const [key, filename] of Object.entries(SKILL_FILES)) {
  const filePath = join(SKILLS_DIR, filename);
  watchFile(filePath, { interval: 2000 }, () => {
    delete cache[key];
    logger.info(`Skill file changed, cache cleared: ${filename}`);
  });
}

/**
 * Get the skill prompt block for an agent.
 * Returns a formatted string combining global SKILL.md + agent-specific skill file.
 * Returns '' if both are empty.
 *
 * @param {'planner'|'developer'|'reviewer'} agentId
 */
export function getSkillPrompt(agentId) {
  if (!(agentId in cache)) {
    cache[agentId] = readSkill(SKILL_FILES[agentId]);
  }
  if (!('global' in cache)) {
    cache.global = readSkill(SKILL_FILES.global);
  }

  const parts = [];
  if (cache.global) parts.push(`## Global Expert Skills\n${cache.global}`);
  if (cache[agentId]) parts.push(`## ${agentId.charAt(0).toUpperCase() + agentId.slice(1)} Expert Skills\n${cache[agentId]}`);

  if (!parts.length) return '';
  return `\n\n---\n${parts.join('\n\n')}`;
}

import { getDb } from '../database/db.js';
import { getLibrarySkillRaw } from './skill.loader.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('skill-requests');

/**
 * Check agentSkills from a plan against the library.
 * Any skill that has no file in skills/library/<agent>/<skill>.md is recorded
 * as a "requested skill" so the user knows what to create.
 *
 * @param {{ researcher?: string, worker?: string, reviewer?: string } | null} agentSkills
 * @param {string} goal  — truncated goal string for context
 */
export function checkAndRecordSkillRequests(agentSkills, goal = '') {
  if (!agentSkills) return;
  const agents = ['researcher', 'worker', 'reviewer'];
  for (const agentId of agents) {
    const skillName = agentSkills[agentId];
    if (!skillName || skillName === 'general') continue; // general always exists
    const content = getLibrarySkillRaw(agentId, skillName);
    if (!content) {
      recordSkillRequest(agentId, skillName, goal);
    }
  }
}

/**
 * Persist a skill request. Deduplicates by agent_id + skill_name — only the
 * first occurrence is stored (insertOrIgnore), so the table stays lean.
 */
export function recordSkillRequest(agentId, skillName, goal = '') {
  const db = getDb();
  const truncatedGoal = (goal || '').slice(0, 200);
  const inserted = db.table('skill_requests').insertOrIgnore(['agent_id', 'skill_name'], {
    agent_id:     agentId,
    skill_name:   skillName,
    goal:         truncatedGoal,
    requested_at: Math.floor(Date.now() / 1000),
  });
  if (inserted) {
    logger.info(`Skill requested: ${agentId}/${skillName}`, { goal: truncatedGoal });
  }
}

/** Return all pending skill requests, newest first. */
export function getSkillRequests() {
  return getDb().table('skill_requests').all({}, { orderBy: 'requested_at', order: 'desc' });
}

/** Remove a single skill request by id. */
export function dismissSkillRequest(id) {
  return getDb().table('skill_requests').delete({ id: Number(id) });
}

/** Remove all skill requests. */
export function clearSkillRequests() {
  return getDb().table('skill_requests').delete({});
}

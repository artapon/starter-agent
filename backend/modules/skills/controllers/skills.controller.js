import { listAllLibrarySkills, getLibrarySkillRaw, writeLibrarySkill, deleteLibrarySkill } from '../../../core/skills/skill.loader.js';
import { getSkillRequests, dismissSkillRequest, clearSkillRequests } from '../../../core/skills/skill.requests.js';
import { createLogger } from '../../../core/logger/winston.logger.js';

const logger = createLogger('skills-controller');

// ── Library CRUD ────────────────────────────────────────────────────────────

export function listSkills(req, res) {
  try {
    const skills = listAllLibrarySkills();
    // Annotate with "requested" flag from skill_requests table
    const requests = getSkillRequests();
    const requestedSet = new Set(requests.map(r => `${r.agent_id}:${r.skill_name}`));
    const result = skills.map(s => ({ ...s, requested: requestedSet.has(`${s.agentId}:${s.name}`) }));
    // Also add pure-requested skills that don't have a file yet
    for (const r of requests) {
      const key = `${r.agent_id}:${r.skill_name}`;
      if (!result.some(s => s.agentId === r.agent_id && s.name === r.skill_name)) {
        result.push({
          agentId: r.agent_id, name: r.skill_name,
          exists: false, description: '', category: null,
          path: `skills/library/${r.agent_id}/${r.skill_name}.md`,
          requested: true, requestId: r.id, requestGoal: r.goal,
        });
      }
    }
    // Add requestId and requestGoal for skills that have a request
    for (const s of result) {
      const r = requests.find(r => r.agent_id === s.agentId && r.skill_name === s.name);
      if (r) { s.requested = true; s.requestId = r.id; s.requestGoal = r.goal; }
    }
    res.json(result);
  } catch (err) {
    logger.error(`listSkills: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

export function getSkill(req, res) {
  try {
    const { agentId, skillName } = req.params;
    const content = getLibrarySkillRaw(agentId, skillName);
    if (content === '') return res.status(404).json({ error: 'Skill not found' });
    res.json({ agentId, name: skillName, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export function createSkill(req, res) {
  try {
    const { agentId, name, category, content } = req.body;
    if (!agentId || !name) return res.status(400).json({ error: 'agentId and name are required' });
    if (!['researcher', 'worker', 'reviewer'].includes(agentId))
      return res.status(400).json({ error: 'agentId must be researcher, worker, or reviewer' });
    writeLibrarySkill(agentId, name, content || '', category || null);
    // If a request exists for this skill, auto-dismiss it
    try {
      const requests = getSkillRequests();
      const r = requests.find(r => r.agent_id === agentId && r.skill_name === name);
      if (r) dismissSkillRequest(r.id);
    } catch { /* non-fatal */ }
    res.json({ ok: true, agentId, name });
  } catch (err) {
    logger.error(`createSkill: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

export function updateSkill(req, res) {
  try {
    const { agentId, skillName } = req.params;
    const { content, category } = req.body;
    writeLibrarySkill(agentId, skillName, content || '', category ?? null);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`updateSkill: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

export function deleteSkill(req, res) {
  try {
    const { agentId, skillName } = req.params;
    const deleted = deleteLibrarySkill(agentId, skillName);
    if (!deleted) return res.status(404).json({ error: 'Skill not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error(`deleteSkill: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

// ── Skill Requests (kept for compatibility) ────────────────────────────────

export function listRequests(req, res) {
  try { res.json(getSkillRequests()); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

export function dismissRequest(req, res) {
  try { dismissSkillRequest(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

export function clearRequests(req, res) {
  try { clearSkillRequests(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
}

import { listAllLibrarySkills, getLibrarySkillRaw, writeLibrarySkill, deleteLibrarySkill } from '../../../core/skills/skill.loader.js';
import { getSkillRequests, dismissSkillRequest, clearSkillRequests } from '../../../core/skills/skill.requests.js';
import { createLogger } from '../../../core/logger/winston.logger.js';

const logger = createLogger('skills-controller');

// ── Library CRUD ────────────────────────────────────────────────────────────

export function listSkills(req, res) {
  try {
    const skills = listAllLibrarySkills();
    const requests = getSkillRequests();
    // Match by full skillId
    const requestedSet = new Set(requests.map(r => `${r.agent_id}:${r.skill_name}`));
    const result = skills.map(s => ({ ...s, requested: requestedSet.has(`${s.agentId}:${s.skillId}`) }));

    // Add pure-requested skills that don't have a file yet
    for (const r of requests) {
      const skillId   = r.skill_name;
      const slash     = skillId.indexOf('/');
      const skillName = slash >= 0 ? skillId.slice(slash + 1) : skillId;
      const category  = slash >= 0 ? skillId.slice(0, slash) : null;
      if (!result.some(s => s.agentId === r.agent_id && s.skillId === skillId)) {
        result.push({
          agentId: r.agent_id, skillId, name: skillName,
          exists: false, description: '', category,
          path: `skills/library/${r.agent_id}/${skillId}.md`,
          requested: true, requestId: r.id, requestGoal: r.goal,
        });
      }
    }

    // Annotate with requestId / requestGoal for skills that have a matching request
    for (const s of result) {
      const r = requests.find(r => r.agent_id === s.agentId && r.skill_name === s.skillId);
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
    const { agentId } = req.params;
    const skillId = req.params[0];
    const content = getLibrarySkillRaw(agentId, skillId);
    if (content === '') return res.status(404).json({ error: 'Skill not found' });
    const slash     = skillId.indexOf('/');
    const skillName = slash >= 0 ? skillId.slice(slash + 1) : skillId;
    res.json({ agentId, skillId, name: skillName, content });
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

    // Construct skillId: name may already include category ("web-development/backend")
    // or combine with separate category field
    const skillId = name.includes('/') ? name : (category ? `${category}/${name}` : `general/${name}`);
    const fullSkillId = writeLibrarySkill(agentId, skillId, content || '');

    // Auto-dismiss any matching skill request
    try {
      const requests = getSkillRequests();
      const r = requests.find(r =>
        r.agent_id === agentId &&
        (r.skill_name === fullSkillId || r.skill_name === name || r.skill_name === skillId)
      );
      if (r) dismissSkillRequest(r.id);
    } catch { /* non-fatal */ }

    const slash     = fullSkillId.indexOf('/');
    const skillName = slash >= 0 ? fullSkillId.slice(slash + 1) : fullSkillId;
    res.json({ ok: true, agentId, skillId: fullSkillId, name: skillName });
  } catch (err) {
    logger.error(`createSkill: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

export function updateSkill(req, res) {
  try {
    const { agentId } = req.params;
    const skillId = req.params[0];
    const { content } = req.body;
    writeLibrarySkill(agentId, skillId, content || '');
    res.json({ ok: true });
  } catch (err) {
    logger.error(`updateSkill: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

export function deleteSkill(req, res) {
  try {
    const { agentId } = req.params;
    const skillId = req.params[0];
    const deleted = deleteLibrarySkill(agentId, skillId);
    if (!deleted) return res.status(404).json({ error: 'Skill not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error(`deleteSkill: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

// ── Skill Requests ────────────────────────────────────────────────────────────

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

import { Router } from 'express';
import * as controller from '../controllers/skills.controller.js';

const router = Router();

// Skill requests — must come BEFORE /:agentId/* to avoid param collision
router.get('/requests',        controller.listRequests);
router.delete('/requests/all', controller.clearRequests);
router.delete('/requests/:id', controller.dismissRequest);

// Library CRUD
router.get('/',    controller.listSkills);
router.post('/',   controller.createSkill);
// Wildcard captures "category/skillName" (e.g. researcher/web-development/backend)
router.get('/:agentId/*',    controller.getSkill);
router.put('/:agentId/*',    controller.updateSkill);
router.delete('/:agentId/*', controller.deleteSkill);

export default router;

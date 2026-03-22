import { Router } from 'express';
import * as controller from '../controllers/skills.controller.js';

const router = Router();

// Skill requests — must come BEFORE /:agentId/:skillName to avoid param collision
router.get('/requests',        controller.listRequests);
router.delete('/requests/all', controller.clearRequests);
router.delete('/requests/:id', controller.dismissRequest);

// Library CRUD
router.get('/',                       controller.listSkills);
router.post('/',                      controller.createSkill);
router.get('/:agentId/:skillName',    controller.getSkill);
router.put('/:agentId/:skillName',    controller.updateSkill);
router.delete('/:agentId/:skillName', controller.deleteSkill);

export default router;

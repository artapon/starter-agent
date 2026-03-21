import { Router } from 'express';

export function createSettingsRouter(controller) {
  const router = Router();
  router.post('/reset', controller.reset);
  router.get('/', controller.getAll);

  // Global settings — must be before /:agentId to avoid route conflict
  router.get('/global', controller.getGlobal);
  router.put('/global', controller.updateGlobal);

  // Subskill profiles — must be before /:agentId to avoid route conflict
  router.get('/subskills', controller.getSubskills);
  router.put('/subskill', controller.setSubskill);

  // Skill requests — must be before /:agentId to avoid route conflict
  router.get('/skill-requests',        controller.getSkillRequests);
  router.delete('/skill-requests/all', controller.clearSkillRequests);
  router.delete('/skill-requests/:id', controller.dismissSkillRequest);

  // Browser search source settings — must be before /:agentId
  router.get('/browser/tools',                  controller.getBrowserTools);
  router.put('/browser/tools',                  controller.updateBrowserTools);
  router.post('/browser/tools',                 controller.addBrowserTool);
  router.put('/browser/tools/:sourceName',      controller.editBrowserTool);
  router.delete('/browser/tools/:sourceName',   controller.deleteBrowserTool);

  // Per-agent settings
  router.get('/:agentId', controller.getByAgent);
  router.put('/:agentId', controller.update);

  // Tool management
  router.get('/:agentId/tools', controller.getTools);
  router.put('/:agentId/tools', controller.updateTools);

  return router;
}

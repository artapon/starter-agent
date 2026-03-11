import { Router } from 'express';

export function createSettingsRouter(controller) {
  const router = Router();
  router.get('/', controller.getAll);
  // Global settings — must be before /:agentId to avoid route conflict
  router.get('/global', controller.getGlobal);
  router.put('/global', controller.updateGlobal);
  // Per-agent settings
  router.get('/:agentId', controller.getByAgent);
  router.put('/:agentId', controller.update);
  // Tool management
  router.get('/:agentId/tools', controller.getTools);
  router.put('/:agentId/tools', controller.updateTools);
  return router;
}

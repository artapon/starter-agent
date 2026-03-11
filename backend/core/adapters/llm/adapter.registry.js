import { LMStudioAdapter } from './lmstudio.adapter.js';
import { getDb } from '../../database/db.js';
import { createLogger } from '../../logger/winston.logger.js';

const logger = createLogger('adapter-registry');
const _adapters = new Map();

export function getAdapter(agentId) {
  if (_adapters.has(agentId)) return _adapters.get(agentId);

  const db = getDb();
  const settings = db.table('agent_settings').first({ agent_id: agentId });

  if (!settings) {
    throw new Error(`No settings found for agent: ${agentId}`);
  }

  const adapter = new LMStudioAdapter(settings);
  _adapters.set(agentId, adapter);
  logger.info(`Created adapter for ${agentId}`, { model: settings.model_name });
  return adapter;
}

export function refreshAdapter(agentId, newSettings) {
  if (_adapters.has(agentId)) {
    _adapters.get(agentId).updateSettings(newSettings);
  } else {
    const adapter = new LMStudioAdapter(newSettings);
    _adapters.set(agentId, adapter);
  }
}

export function invalidateAdapter(agentId) {
  _adapters.delete(agentId);
}

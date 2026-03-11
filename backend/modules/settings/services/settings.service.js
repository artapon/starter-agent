import { getDb } from '../../../core/database/db.js';
import { refreshAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { getAgentToolConfig, updateAgentTools } from '../../../core/tools/tool.registry.js';
import { createLogger } from '../../../core/logger/winston.logger.js';

const logger = createLogger('settings');

export class SettingsService {
  constructor(socketManager) {
    this.db = getDb();
    this.socketManager = socketManager;
  }

  getAll() {
    return this.db.table('agent_settings').all({}, { orderBy: 'agent_id' });
  }

  getByAgentId(agentId) {
    return this.db.table('agent_settings').first({ agent_id: agentId });
  }

  update(agentId, data) {
    const allowed = ['model_name', 'base_url', 'api_key', 'temperature', 'max_tokens', 'context_window', 'system_prompt', 'compression_enabled'];
    const patch = {};
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }

    if (Object.keys(patch).length === 0) return this.getByAgentId(agentId);

    patch.updated_at = Math.floor(Date.now() / 1000);
    this.db.table('agent_settings').update({ agent_id: agentId }, patch);

    const updated = this.getByAgentId(agentId);
    refreshAdapter(agentId, updated);
    this.socketManager?.emit('agent:config_updated', { agentId, settings: updated });

    logger.info(`Settings updated for ${agentId}`, { model: updated.model_name });
    return updated;
  }

  // ── Global settings ────────────────────────────────────────────────────────

  getGlobal() {
    const rows = this.db.table('global_settings').all();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  updateGlobal(patch) {
    for (const [key, value] of Object.entries(patch)) {
      this.db.table('global_settings').upsert(['key'], { key, value: String(value) });
    }
    return this.getGlobal();
  }

  // ── Tools ──────────────────────────────────────────────────────────────────

  getTools(agentId) {
    return getAgentToolConfig(agentId);
  }

  updateTools(agentId, enabledToolNames) {
    updateAgentTools(agentId, enabledToolNames);
    this.socketManager?.emit('agent:config_updated', { agentId, toolsUpdated: true, enabledTools: enabledToolNames });
    logger.info(`Tools updated for ${agentId}: [${enabledToolNames.join(', ')}]`, { agentId });
    return getAgentToolConfig(agentId);
  }
}

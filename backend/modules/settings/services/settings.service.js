import { getDb } from '../../../core/database/db.js';
import { refreshAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { getAgentToolConfig, updateAgentTools } from '../../../core/tools/tool.registry.js';
import { listSubskills, getActiveSubskill, setActiveSubskill } from '../../../core/skills/skill.loader.js';
import { SEARCH_ADAPTERS } from '../../../core/browser/web.search.tools.js';
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

  // ── Subskills ──────────────────────────────────────────────────────────────

  getSubskills() {
    return {
      available: listSubskills(),
      active: getActiveSubskill(),
    };
  }

  setSubskill(name) {
    const available = listSubskills();
    if (!available.includes(name)) {
      throw new Error(`Unknown subskill: "${name}". Available: ${available.join(', ')}`);
    }
    this.db.table('global_settings').upsert(['key'], { key: 'active_subskill', value: name });
    setActiveSubskill(name);
    this.socketManager?.emit('settings:subskill_changed', { active: name });
    logger.info(`Subskill profile changed to: ${name}`);
    return { available, active: name };
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

  // ── Browser search tools ───────────────────────────────────────────────────

  getBrowserTools() {
    const rows   = this.db.table('browser_tools').all({});
    const rowMap = Object.fromEntries(rows.map(r => [r.source_name, r]));

    // Built-in adapters — merged with DB state
    const builtins = Object.entries(SEARCH_ADAPTERS).map(([key, adapter]) => {
      const row = rowMap[key];
      return {
        source_name:  key,
        label:        adapter.label,
        description:  adapter.description,
        source_type:  adapter.sourceType,
        is_custom:    false,
        enabled:      row ? (row.enabled === 1 || row.enabled === '1') : true,
        browse_count: row ? (parseInt(row.browse_count, 10) || adapter.browseCount || 1) : (adapter.browseCount || 1),
      };
    });

    // User-added custom sources
    const customs = rows
      .filter(r => r.is_custom === 1 || r.is_custom === '1')
      .map(r => ({
        source_name:  r.source_name,
        label:        r.label        || r.source_name,
        description:  r.description  || '',
        url_template: r.url_template || '',
        query_type:   r.query_type   || 'full',
        source_type:  r.source_type  || 'web',
        is_custom:    true,
        enabled:      (r.enabled === 1 || r.enabled === '1'),
        browse_count: parseInt(r.browse_count, 10) || 1,
      }));

    return [...builtins, ...customs];
  }

  updateBrowserTools(tools) {
    for (const { source_name, enabled, browse_count } of tools) {
      this.db.table('browser_tools').upsert(['source_name'], {
        source_name,
        enabled:      enabled ? 1 : 0,
        browse_count: Math.max(1, Math.min(5, parseInt(browse_count, 10) || 1)),
      });
    }
    this.socketManager?.emit('settings:browser_tools_updated', { tools: this.getBrowserTools() });
    logger.info(`Browser tools updated: ${tools.map(t => `${t.source_name}=${t.enabled?'on':'off'}`).join(', ')}`);
    return this.getBrowserTools();
  }

  addBrowserTool(data) {
    const { label, url_template, description = '', query_type = 'full', browse_count = 1 } = data;
    if (!label?.trim())                          throw new Error('label is required');
    if (!url_template?.includes('{query}'))      throw new Error('url_template must contain {query}');

    // Generate a unique slug
    let base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'custom';
    const existing = new Set(this.db.table('browser_tools').all({}).map(r => r.source_name));
    let source_name = base, i = 2;
    while (existing.has(source_name)) source_name = `${base}_${i++}`;

    this.db.table('browser_tools').insert({
      source_name,
      enabled:      1,
      browse_count: Math.max(1, Math.min(5, parseInt(browse_count, 10) || 1)),
      is_custom:    1,
      label:        label.trim(),
      description:  description.trim(),
      url_template: url_template.trim(),
      query_type,
      source_type:  'web',
    });
    logger.info(`Custom browser source added: ${source_name} ("${label}")`);
    return this.getBrowserTools();
  }

  editBrowserTool(source_name, data) {
    const row = this.db.table('browser_tools').first({ source_name });
    if (!row)                                         throw new Error(`Source not found: ${source_name}`);
    if (!(row.is_custom === 1 || row.is_custom === '1')) throw new Error('Cannot edit built-in sources');

    const { label, url_template, description = '', query_type = 'full', browse_count = 1 } = data;
    if (!label?.trim())                          throw new Error('label is required');
    if (!url_template?.includes('{query}'))      throw new Error('url_template must contain {query}');

    this.db.table('browser_tools').update({ source_name }, {
      label:        label.trim(),
      description:  description.trim(),
      url_template: url_template.trim(),
      query_type,
      browse_count: Math.max(1, Math.min(5, parseInt(browse_count, 10) || 1)),
    });
    logger.info(`Custom browser source updated: ${source_name}`);
    return this.getBrowserTools();
  }

  deleteBrowserTool(source_name) {
    const row = this.db.table('browser_tools').first({ source_name });
    if (!row)                                         throw new Error(`Source not found: ${source_name}`);
    if (!(row.is_custom === 1 || row.is_custom === '1')) throw new Error('Cannot delete built-in sources');

    this.db.table('browser_tools').delete({ source_name });
    logger.info(`Custom browser source deleted: ${source_name}`);
    return this.getBrowserTools();
  }
}

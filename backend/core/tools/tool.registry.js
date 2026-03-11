import { getDb } from '../database/db.js';
import { TOOL_MAP } from './tool.implementations.js';
import { ALL_TOOLS } from './tool.definitions.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('tool-registry');

/**
 * Returns an array of enabled LangChain tool instances for a given agent.
 */
export function getToolsForAgent(agentId) {
  const db = getDb();
  const rows = db.table('agent_tools').all({ agent_id: agentId, enabled: 1 });

  const tools = rows
    .map(({ tool_name }) => TOOL_MAP[tool_name])
    .filter(Boolean);

  logger.info(`Tools loaded for ${agentId}: [${tools.map(t => t.name).join(', ')}]`, { agentId });
  return tools;
}

/**
 * Returns the full tool config (with metadata + enabled state) for UI display.
 */
export function getAgentToolConfig(agentId) {
  const db = getDb();
  const rows = db.table('agent_tools').all({ agent_id: agentId });
  const enabledMap = Object.fromEntries(rows.map(r => [r.tool_name, Boolean(r.enabled)]));

  return ALL_TOOLS.map((tool) => ({
    ...tool,
    enabled: enabledMap[tool.name] ?? false,
  }));
}

/**
 * Update which tools are enabled for an agent.
 * @param {string} agentId
 * @param {string[]} enabledToolNames - array of tool names to enable (rest disabled)
 */
export function updateAgentTools(agentId, enabledToolNames) {
  const db = getDb();
  const enabled = new Set(enabledToolNames);
  const table = db.table('agent_tools');

  for (const tool of ALL_TOOLS) {
    table.upsert(['agent_id', 'tool_name'], {
      agent_id: agentId,
      tool_name: tool.name,
      enabled: enabled.has(tool.name) ? 1 : 0,
    });
  }

  logger.info(`Tools updated for ${agentId}: ${enabledToolNames.join(', ')}`, { agentId });
}

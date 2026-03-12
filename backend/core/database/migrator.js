import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_TOOLS, DEFAULT_AGENT_TOOLS } from '../tools/tool.definitions.js';

// Project root is 3 levels up from backend/core/database/
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_WORKSPACE = path.join(PROJECT_ROOT, 'workspace');

export function runMigrations(db) {
  // Seed / enforce absolute workspace path (upsert so stale relative paths get corrected)
  const globalTable = db.table('global_settings');
  globalTable.upsert(['key'], { key: 'workspace_path',        value: DEFAULT_WORKSPACE });
  globalTable.insertOrIgnore(['key'], { key: 'active_subskill',          value: 'default' });
  globalTable.insertOrIgnore(['key'], { key: 'workflow_loop_enabled',    value: '0' });
  globalTable.insertOrIgnore(['key'], { key: 'workflow_max_loops',       value: '3' });
  globalTable.insertOrIgnore(['key'], { key: 'workflow_recursion_limit', value: '200' });

  // Seed default agent settings if not present
  const agents = [
    { agent_id: 'researcher', model_name: 'qwen2.5-7b-instruct',       temperature: 0.4, max_tokens: 4096 },
    { agent_id: 'planner',    model_name: 'qwen2.5-7b-instruct',       temperature: 0.3, max_tokens: 4096 },
    { agent_id: 'worker',     model_name: 'qwen2.5-coder-7b-instruct', temperature: 0.2, max_tokens: 8192 },
    { agent_id: 'reviewer',   model_name: 'qwen2.5-7b-instruct',       temperature: 0.1, max_tokens: 4096 },
  ];

  const agentSettingsTable = db.table('agent_settings');
  for (const agent of agents) {
    agentSettingsTable.insertOrIgnore(['agent_id'], {
      ...agent,
      base_url: 'http://localhost:1234/v1',
      api_key: 'lm-studio',
      context_window: 8192,
      system_prompt: null,
      compression_enabled: 1,
      updated_at: Math.floor(Date.now() / 1000),
    });
  }

  // Seed / enforce default agent tools (upsert so existing rows get corrected)
  const agentToolsTable = db.table('agent_tools');
  for (const [agentId, enabledTools] of Object.entries(DEFAULT_AGENT_TOOLS)) {
    for (const tool of ALL_TOOLS) {
      agentToolsTable.upsert(['agent_id', 'tool_name'], {
        agent_id: agentId,
        tool_name: tool.name,
        enabled: enabledTools.includes(tool.name) ? 1 : 0,
      });
    }
  }
}

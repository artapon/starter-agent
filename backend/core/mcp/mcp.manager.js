/**
 * Web search tools for the Researcher Agent.
 * Replaced the @modelcontextprotocol/server-puppeteer MCP approach with
 * dependency-free tools that use Node.js native fetch:
 *   search_google  — DuckDuckGo HTML search
 *   search_github  — GitHub public REST API
 *   browse_url     — HTTP fetch + HTML-to-text
 *
 * Returns the same { tools, client } shape so the researcher agent is unchanged.
 */
import { getWebSearchTools } from '../browser/web.search.tools.js';
import { getSkillSources } from '../skills/skill.loader.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('mcp');

export async function getPuppeteerMCPTools() {
  const sources = getSkillSources('researcher');
  const tools = getWebSearchTools(sources);
  logger.info(`Web search tools loaded [sources: ${sources?.join(',') || 'all'}]: [${tools.map(t => t.name).join(', ')}]`);
  // client.close() is a no-op — no subprocess to clean up
  return { tools, client: { close: async () => {} } };
}

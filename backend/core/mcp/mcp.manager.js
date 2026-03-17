/**
 * Web search tools for the Researcher Agent.
 * Returns all registered search adapters + browse_url as LangChain tools.
 * Source filtering is handled by the researcher agent based on browser_tools DB settings.
 *
 * Returns the same { tools, client } shape for compatibility.
 */
import { getWebSearchTools } from '../browser/web.search.tools.js';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('mcp');

export async function getPuppeteerMCPTools() {
  const tools = getWebSearchTools(); // all adapters — researcher filters by DB settings
  logger.info(`Web search tools loaded: [${tools.map(t => t.name).join(', ')}]`);
  return { tools, client: { close: async () => {} } };
}

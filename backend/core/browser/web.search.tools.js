/**
 * Web search tools — dependency-free, uses native Node.js fetch.
 * No browser, no Chromium, no npx required.
 *
 * Tools:
 *   search_google  — DuckDuckGo HTML search (no API key)
 *   search_github  — GitHub public REST API  (no API key)
 *   browse_url     — fetch page + strip HTML to plain text
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('web-search');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── DuckDuckGo HTML Search ──────────────────────────────────────────────────
async function duckduckgoSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`);
  const html = await res.text();

  // Extract real URLs — DDG wraps them as href="//duckduckgo.com/l/?uddg=<encoded>&amp;rut=..."
  const seen = new Set();
  const urls = [];
  const urlRe = /uddg=(https?[^&"]+)/g;
  let m;
  while ((m = urlRe.exec(html)) !== null && urls.length < 6) {
    const u = decodeURIComponent(m[1]);
    if (u.startsWith('http') && !u.includes('duckduckgo.com') && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }

  // Extract titles
  const titles = [];
  const titleRe = /class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = titleRe.exec(html)) !== null) {
    titles.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  // Extract snippets
  const snippets = [];
  const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span)>/g;
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  return urls.slice(0, 5).map((url, i) => ({
    url,
    title:   titles[i]   || '',
    snippet: snippets[i] || '',
  }));
}

// ─── GitHub REST API ─────────────────────────────────────────────────────────
async function githubSearch(query) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=6`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.github.v3+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status}`);
  const data = await res.json();

  return (data.items || []).slice(0, 5).map(r => ({
    url:         r.html_url,
    title:       r.full_name,
    description: r.description || '',
    stars:       r.stargazers_count,
    language:    r.language || '',
    topics:      (r.topics || []).slice(0, 5),
  }));
}

// ─── Page fetcher ────────────────────────────────────────────────────────────
async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text')) return `[binary content — skipped]`;

  const html = await res.text();

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// ─── LangChain tool definitions ──────────────────────────────────────────────
export function getWebSearchTools() {
  const searchGoogleTool = new DynamicStructuredTool({
    name: 'search_google',
    description: 'Search the web (via DuckDuckGo) for articles, docs, and resources about a topic. Returns up to 5 results with titles, URLs, and snippets.',
    schema: z.object({
      query: z.string().describe('The search query, e.g. "Node.js real-time chat Socket.IO best practices"'),
    }),
    func: async ({ query }) => {
      logger.info(`Web search: "${query}"`, { agentId: 'researcher' });
      try {
        const results = await duckduckgoSearch(query);
        logger.info(`Web search returned ${results.length} results for "${query}"`, { agentId: 'researcher' });
        return JSON.stringify(results, null, 2);
      } catch (err) {
        logger.warn(`Web search failed: ${err.message}`, { agentId: 'researcher' });
        return `Search failed: ${err.message}`;
      }
    },
  });

  const searchGithubTool = new DynamicStructuredTool({
    name: 'search_github',
    description: 'Search GitHub for open-source repositories on a topic. Returns repos sorted by stars with name, description, language, and URL.',
    schema: z.object({
      query: z.string().describe('GitHub search query, e.g. "socket.io chat nodejs"'),
    }),
    func: async ({ query }) => {
      logger.info(`GitHub search: "${query}"`, { agentId: 'researcher' });
      try {
        const results = await githubSearch(query);
        logger.info(`GitHub search returned ${results.length} repos for "${query}"`, { agentId: 'researcher' });
        return JSON.stringify(results, null, 2);
      } catch (err) {
        logger.warn(`GitHub search failed: ${err.message}`, { agentId: 'researcher' });
        return `GitHub search failed: ${err.message}`;
      }
    },
  });

  const browseUrlTool = new DynamicStructuredTool({
    name: 'browse_url',
    description: 'Fetch and read the content of a webpage. Use this to read articles, documentation, GitHub READMEs, and other pages found in search results.',
    schema: z.object({
      url: z.string().describe('The full URL to browse, e.g. "https://socket.io/docs/v4/"'),
    }),
    func: async ({ url }) => {
      logger.info(`Browse: ${url}`, { agentId: 'researcher' });
      try {
        const text = await fetchPageText(url);
        logger.info(`Browse complete: ${url} (${text.length} chars)`, { agentId: 'researcher' });
        return text;
      } catch (err) {
        logger.warn(`Browse failed for ${url}: ${err.message}`, { agentId: 'researcher' });
        return `Failed to read ${url}: ${err.message}`;
      }
    },
  });

  return [searchGoogleTool, searchGithubTool, browseUrlTool];
}

/**
 * Global web search tool engine.
 *
 * This file is source-agnostic. No hardcoded list of "these are the sources" exists here.
 * Which adapters are activated is controlled entirely by the skill file (RESEARCHER.md ## Sources).
 *
 * To add a new search source without touching any agent code:
 *   1. Write an async search function below that returns a result array.
 *   2. Add an entry to SEARCH_ADAPTERS with the adapter config.
 *   3. Add its key name to `## Sources` in the relevant RESEARCHER.md.
 *
 * Adapter shape:
 * {
 *   toolName        — LangChain tool name (used by researcher to look up by name)
 *   label           — Human-readable label for logs and context headers
 *   description     — LangChain tool description shown to the LLM
 *   queryType       — 'full'  : use natural-language goal sentence (e.g. web search)
 *                     'keywords' : use extracted technical keywords (e.g. API searches)
 *   sourceType      — Type string for visitedSources / classifyUrl
 *   placeholderUrl  — fn(query) → URL used as a source placeholder before results arrive
 *   contextLabel    — Section header injected into the LLM web context block
 *   formatContext   — fn(results) → multiline string for the LLM context section
 *   formatSnippet   — fn(results) → one-liner for the source card preview
 *   browseCount     — How many result URLs to browse for page content (default 1)
 *   getBrowseUrl    — Optional fn(result) → URL override for browsing (e.g. HN discussion link)
 *   fn              — async fn(query) → result[]
 * }
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createLogger } from '../logger/winston.logger.js';

const logger = createLogger('web-search');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Search implementations ───────────────────────────────────────────────────

async function duckduckgoSearch(query) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };

  // Try html endpoint first, fall back to lite endpoint
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ];

  let html = '';
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) { logger.warn(`DuckDuckGo ${endpoint} returned HTTP ${res.status}`); continue; }
      html = await res.text();
      if (html.length > 500) break; // got a real response
    } catch (err) {
      logger.warn(`DuckDuckGo fetch failed (${endpoint}): ${err.message}`);
    }
  }
  if (!html) throw new Error('DuckDuckGo: all endpoints failed');

  const seen = new Set(), urls = [];
  let m;

  // Strategy 1: uddg= redirect params
  const uddgRe = /uddg=(https?[^&"]+)/g;
  while ((m = uddgRe.exec(html)) !== null && urls.length < 6) {
    const u = decodeURIComponent(m[1]);
    if (u.startsWith('http') && !u.includes('duckduckgo.com') && !seen.has(u)) { seen.add(u); urls.push(u); }
  }

  // Strategy 2: direct href links (lite endpoint or alternate format)
  if (urls.length === 0) {
    const hrefRe = /href="(https?:\/\/(?!(?:www\.)?duckduckgo\.com)[^"]+)"/g;
    while ((m = hrefRe.exec(html)) !== null && urls.length < 6) {
      const u = m[1];
      if (!seen.has(u)) { seen.add(u); urls.push(u); }
    }
  }

  const titles = [], titleRe = /class="result(?:__a|[-_]link)"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = titleRe.exec(html)) !== null) titles.push(m[1].replace(/<[^>]+>/g, '').trim());
  const snippets = [], snippetRe = /class="result(?:__snippet|[-_]snippet)"[^>]*>([\s\S]*?)<\/(?:a|span|td)>/g;
  while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, '').trim());

  logger.info(`DuckDuckGo: parsed ${urls.length} URLs, ${titles.length} titles`, { agentId: 'researcher' });
  return urls.slice(0, 5).map((url, i) => ({ url, title: titles[i] || url, snippet: snippets[i] || '' }));
}

async function githubSearch(query) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=6`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.github.v3+json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).slice(0, 5).map(r => ({
    url: r.html_url, title: r.full_name, description: r.description || '',
    stars: r.stargazers_count, forks: r.forks_count, language: r.language || '',
    topics: (r.topics || []).slice(0, 6), defaultBranch: r.default_branch || 'main', updatedAt: r.updated_at,
  }));
}

async function npmSearch(query) {
  const safeQuery = query.slice(0, 64).trim();
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(safeQuery)}&size=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`npm registry returned HTTP ${res.status}`);
  const data = await res.json();
  const results = (data.objects || []).slice(0, 5).map(obj => ({
    url: obj.package.links?.npm || `https://www.npmjs.com/package/${obj.package.name}`,
    repoUrl: obj.package.links?.repository || '',
    name: obj.package.name, description: obj.package.description || '',
    version: obj.package.version, keywords: (obj.package.keywords || []).slice(0, 6), publishedAt: obj.package.date,
  }));
  await Promise.allSettled(results.map(async (pkg) => {
    try {
      const dlRes = await fetch(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg.name)}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000),
      });
      if (dlRes.ok) { const dl = await dlRes.json(); pkg.monthlyDownloads = dl.downloads || 0; }
    } catch { /* analytics only */ }
  }));
  return results;
}

async function stackOverflowSearch(query) {
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=votes&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=5&filter=default`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Stack Overflow API returned HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).slice(0, 5).map(item => ({
    url: item.link, title: item.title, score: item.score,
    answerCount: item.answer_count, isAnswered: item.is_answered, tags: item.tags || [],
  }));
}

async function hackernewsSearch(query) {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HN Algolia returned HTTP ${res.status}`);
  const data = await res.json();
  return (data.hits || []).slice(0, 5).map(h => ({
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    title: h.title || '', points: h.points || 0, comments: h.num_comments || 0,
    discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

// ─── Page fetcher ─────────────────────────────────────────────────────────────

async function fetchPageText(url, maxChars = 5000) {
  // npmjs.com → use registry JSON API (avoids 403)
  const npmMatch = url.match(/^https?:\/\/(www\.)?npmjs\.com\/package\/([^?#]+)/);
  if (npmMatch) {
    const pkgName = decodeURIComponent(npmMatch[2]);
    const regRes = await fetch(`https://registry.npmjs.org/${pkgName}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (regRes.ok) {
      const data = await regRes.json();
      const latest = data['dist-tags']?.latest || '';
      const info = data.versions?.[latest] || {};
      const readme = (data.readme || '').slice(0, 3000);
      return [`Package: ${data.name}  Version: ${latest}`, `Description: ${data.description || ''}`,
        `Keywords: ${(info.keywords || []).join(', ')}`, `Homepage: ${info.homepage || ''}`,
        `Repository: ${info.repository?.url || ''}`, `\nREADME:\n${readme}`].join('\n').slice(0, maxChars);
    }
  }

  // GitHub repo root → fetch raw README
  const ghMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)\/?$/);
  if (ghMatch) {
    const [, owner, repo] = ghMatch;
    for (const branch of ['main', 'master', 'dev']) {
      try {
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`, {
          headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000),
        });
        if (rawRes.ok) {
          const text = await rawRes.text();
          logger.info(`Fetched raw README for ${owner}/${repo} (${text.length} chars)`, { agentId: 'researcher' });
          return text.slice(0, maxChars);
        }
      } catch { /* try next branch */ }
    }
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text')) return '[binary content — skipped]';

  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '').replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '').replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

// ─── Adapter registry ─────────────────────────────────────────────────────────
// Add a new search source here + one word in RESEARCHER.md ## Sources.

export const SEARCH_ADAPTERS = {

  web: {
    toolName:       'search_web',
    label:          'Web Search',
    description:    'Search the web (via DuckDuckGo) for articles, docs, and resources. Returns up to 5 results with titles, URLs, and snippets.',
    queryType:      'full',
    sourceType:     'google',
    placeholderUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    contextLabel:   'WEB SEARCH RESULTS (articles, docs, tutorials)',
    formatContext:  (r) => r.map((x, i) => `[${i+1}] ${x.title}\nURL: ${x.url}\nSnippet: ${x.snippet}`).join('\n\n'),
    formatSnippet:  (r) => r.map(x => `${x.title} — ${x.url}`).join('\n'),
    browseCount:    2,
    fn:             duckduckgoSearch,
  },

  github: {
    toolName:       'search_github',
    label:          'GitHub Repositories',
    description:    'Search GitHub for open-source repositories sorted by stars. Returns name, description, language, topics, and star/fork counts.',
    queryType:      'keywords',
    sourceType:     'github',
    placeholderUrl: (q) => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
    contextLabel:   'GITHUB REPOSITORIES (sorted by stars)',
    formatContext:  (r) => r.map(x => `Repo: ${x.title} (★${x.stars}, ${x.language})\nURL: ${x.url}\nDesc: ${x.description}\nTopics: ${(x.topics||[]).join(', ')||'n/a'}`).join('\n\n'),
    formatSnippet:  (r) => r.map(x => `${x.title} ★${x.stars} — ${x.description}`).join('\n'),
    browseCount:    2,
    fn:             githubSearch,
  },

  npm: {
    toolName:       'search_npm',
    label:          'npm Packages',
    description:    'Search the npm registry for JavaScript/Node.js packages with download counts and version info.',
    queryType:      'keywords',
    sourceType:     'npm',
    placeholderUrl: (q) => `https://www.npmjs.com/search?q=${encodeURIComponent(q)}`,
    contextLabel:   'NPM PACKAGES',
    formatContext:  (r) => r.map(x => { const dl = x.monthlyDownloads ? `${Math.round(x.monthlyDownloads/1000)}k/mo` : '?'; return `${x.name} v${x.version} (${dl})\nURL: ${x.url}\nDesc: ${x.description}\nKeywords: ${(x.keywords||[]).join(', ')||'n/a'}`; }).join('\n\n'),
    formatSnippet:  (r) => r.map(x => `${x.name} v${x.version} — ${x.description}`).join('\n'),
    browseCount:    1,
    fn:             npmSearch,
  },

  stackoverflow: {
    toolName:       'search_stackoverflow',
    label:          'Stack Overflow',
    description:    'Search Stack Overflow for top-voted Q&A threads. Returns score, answer count, and tags.',
    queryType:      'keywords',
    sourceType:     'stackoverflow',
    placeholderUrl: (q) => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}`,
    contextLabel:   'STACK OVERFLOW TOP QUESTIONS',
    formatContext:  (r) => r.map(x => `[${x.score}pts, ${x.answerCount} answers${x.isAnswered?' ✓':''}] ${x.title}\n${x.url}\nTags: ${(x.tags||[]).join(', ')||'n/a'}`).join('\n\n'),
    formatSnippet:  (r) => r.map(x => `[${x.score}pts] ${x.title}`).join('\n'),
    browseCount:    1,
    fn:             stackOverflowSearch,
  },

  hackernews: {
    toolName:       'search_hackernews',
    label:          'HackerNews',
    description:    'Search HackerNews discussions for community sentiment, real-world experience reports, and expert opinions.',
    queryType:      'keywords',
    sourceType:     'hackernews',
    placeholderUrl: (q) => `https://hn.algolia.com/?q=${encodeURIComponent(q)}`,
    contextLabel:   'HACKERNEWS COMMUNITY DISCUSSIONS',
    formatContext:  (r) => r.map(x => `[${x.points}pts, ${x.comments} comments] ${x.title}\n${x.url}`).join('\n\n'),
    formatSnippet:  (r) => r.map(x => `[${x.points}pts] ${x.title}`).join('\n'),
    browseCount:    1,
    getBrowseUrl:   (r) => r.discussionUrl || r.url,
    fn:             hackernewsSearch,
  },

};

// ─── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Build LangChain DynamicStructuredTools for the given source names.
 * Pass null/undefined to activate all registered adapters.
 * browse_url is always included regardless of the sources list.
 *
 * @param {string[]|null} sources  - Adapter keys from SEARCH_ADAPTERS, e.g. ['web','github']
 * @returns {DynamicStructuredTool[]}
 */
export function getWebSearchTools(sources = null) {
  const toActivate = (sources?.length ? sources.filter(s => SEARCH_ADAPTERS[s]) : Object.keys(SEARCH_ADAPTERS));

  const tools = toActivate.map(key => {
    const adapter = SEARCH_ADAPTERS[key];
    return new DynamicStructuredTool({
      name:        adapter.toolName,
      description: adapter.description,
      schema:      z.object({ query: z.string().describe('Search query') }),
      func: async ({ query }) => {
        logger.info(`[${adapter.label}] Searching: "${query}"`, { agentId: 'researcher' });
        try {
          const results = await adapter.fn(query);
          logger.info(`[${adapter.label}] ${results.length} results`, { agentId: 'researcher' });
          return JSON.stringify(results, null, 2);
        } catch (err) {
          logger.warn(`[${adapter.label}] failed: ${err.message}`, { agentId: 'researcher' });
          return `Search failed: ${err.message}`;
        }
      },
    });
  });

  tools.push(new DynamicStructuredTool({
    name:        'browse_url',
    description: 'Fetch and read the content of a webpage. GitHub repo URLs automatically fetch the raw README. npmjs.com URLs use the registry API.',
    schema:      z.object({ url: z.string().describe('Full URL to browse') }),
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
  }));

  return tools;
}

// ─── Keyword extractor ────────────────────────────────────────────────────────

/**
 * Extract focused technical keywords from a natural-language goal.
 * Used by adapters with queryType:'keywords'.
 */
export function extractKeywords(text, max = 60) {
  const cleaned = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const stop = new Set([
    'a','an','the','with','and','or','for','to','of','in','on','at','by','from',
    'as','is','are','was','were','that','this','it','its','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','may','might',
    'build','building','create','creating','make','making','develop','developing',
    'write','writing','implement','implementing','add','adding','setup','set',
    'use','using','run','running','get','getting','need','want','include','including',
    'how','what','where','when','which','who','up','can','able','based',
    'simple','basic','complete','full','new','my','our','your','their',
    'app','application','web','website','system','project','feature',
    'functionality','support','like','such','example','approach','style','way',
    'structure','pattern','architecture','hierarchical','operations','operation',
    'model','view','controller','real','realtime',
  ]);
  const keywords = cleaned.toLowerCase().replace(/[^a-z0-9\s.#+\-_]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !stop.has(w));
  const joined = keywords.join(' ');
  if (joined.length <= max) return joined;
  const cut = joined.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

// ─── URL classifier ───────────────────────────────────────────────────────────

/**
 * Classify a URL into a sourceType string matching SEARCH_ADAPTERS sourceType values.
 */
export function classifyUrl(url) {
  if (!url) return 'web';
  for (const adapter of Object.values(SEARCH_ADAPTERS)) {
    if (adapter.sourceType === 'google' && url.includes('google.com')) return 'google';
    if (adapter.sourceType === 'github' && (url.includes('github.com') || url.includes('raw.githubusercontent.com'))) return 'github';
    if (adapter.sourceType === 'npm' && (url.includes('npmjs.com') || url.includes('registry.npmjs.org'))) return 'npm';
    if (adapter.sourceType === 'stackoverflow' && url.includes('stackoverflow.com')) return 'stackoverflow';
    if (adapter.sourceType === 'hackernews' && url.includes('ycombinator.com')) return 'hackernews';
  }
  return 'web';
}

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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Search implementations ───────────────────────────────────────────────────

/**
 * Google Search — extracts AI Overview, featured snippet, and organic results.
 *
 * Priority: AI Overview → Featured Snippet → organic results.
 * Uses multi-strategy HTML parsing because Google's class names change frequently.
 * Gracefully returns organic results if no AI Overview is found in the static HTML
 * (Google may render the AI Overview via JS, which fetch() cannot capture).
 */
async function googleSearch(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&num=8`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google returned HTTP ${res.status}`);

  // Strip scripts/styles before parsing
  const html = (await res.text())
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const results = [];
  const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

  // ── 1. AI Overview (multi-strategy) ─────────────────────────────────
  let aiText = '';

  // Strategy A: "AI overview" marker text followed by content
  {
    const m = html.match(/AI\s+[Oo]verview[\s\S]{0,300}?(?:class|jsname)="[^"]{3,50}"[^>]*>([\s\S]{80,3000}?)(?=<\/div>\s*<(?:div|h|p))/);
    if (m) { const t = strip(m[1]); if (t.length > 80) aiText = t.slice(0, 2000); }
  }

  // Strategy B: jsname="yynA5e" — known AI Overview container
  if (!aiText) {
    const m = html.match(/jsname="yynA5e"[^>]*>([\s\S]{80,3000}?)<\/div>\s*<\/div>/);
    if (m) { const t = strip(m[1]); if (t.length > 80) aiText = t.slice(0, 2000); }
  }

  // Strategy C: longest data-hveid block (AI Overview tends to be the lengthiest)
  if (!aiText) {
    const blocks = [];
    const re = /data-hveid="[^"]+"[^>]*class="[^"]{2,30}"[^>]*>([\s\S]{200,4000}?)<\/div>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = strip(m[1]);
      if (t.length > 200 && !/Privacy|Terms|©|cookie/i.test(t.slice(0, 100))) blocks.push(t);
    }
    if (blocks.length) aiText = blocks.sort((a, b) => b.length - a.length)[0].slice(0, 2000);
  }

  if (aiText) {
    results.push({ type: 'ai_overview', url, title: 'AI Overview', text: aiText });
  }

  // ── 2. Featured Snippet (only if no AI Overview found) ───────────────
  if (!aiText) {
    const fsPatterns = [
      /class="[^"]*hgKElc[^"]*"[^>]*>([\s\S]{50,1200}?)<\/(?:span|div)>/,
      /class="[^"]*ILfuVd[^"]*"[^>]*>([\s\S]{50,1200}?)<\/div>/,
      /class="[^"]*LGOjhe[^"]*"[^>]*>([\s\S]{50,1200}?)<\/div>/,
      /class="[^"]*yDYNvb[^"]*"[^>]*>([\s\S]{50,1200}?)<\/div>/,
    ];
    for (const pattern of fsPatterns) {
      const m = html.match(pattern);
      if (m) { const t = strip(m[1]); if (t.length > 50) { results.push({ type: 'featured', url, title: 'Featured Snippet', text: t.slice(0, 800) }); break; } }
    }
  }

  // ── 3. Organic results ───────────────────────────────────────────────
  const seen = new Set();
  const urls = [], titles = [], snips = [];
  let m;

  const urlRe = /href="(https?:\/\/(?!www\.google\.)[^"#?]{10,}?)"/g;
  while ((m = urlRe.exec(html)) !== null && urls.length < 8) {
    const u = m[1];
    if (!seen.has(u) && !u.includes('google.com') && u.startsWith('http')) { seen.add(u); urls.push(u); }
  }
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  while ((m = h3Re.exec(html)) !== null && titles.length < 8) { const t = strip(m[1]); if (t) titles.push(t); }
  const snipRe = /class="[^"]*(?:VwiC3b|yXK7lf|MUxGbd|lEBKkf)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/g;
  while ((m = snipRe.exec(html)) !== null && snips.length < 8) { const t = strip(m[1]); if (t.length > 20) snips.push(t); }

  urls.slice(0, 5).forEach((url, i) => {
    results.push({ type: 'result', url, title: titles[i] || url, snippet: snips[i] || '' });
  });

  logger.info(`Google: AI Overview=${!!aiText}, featured=${results.some(r=>r.type==='featured')}, results=${urls.length}`, { agentId: 'researcher' });
  return results;
}

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
      if (!res.ok) { logger.error(`DuckDuckGo ${endpoint} returned HTTP ${res.status}`); continue; }
      html = await res.text();
      if (html.length > 500) break; // got a real response
    } catch (err) {
      logger.error(`DuckDuckGo fetch failed (${endpoint}): ${err.message}`);
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

  // ── FIRST: Google — AI Overview has priority ─────────────────────────
  google: {
    toolName:       'search_google',
    label:          'Google + AI Overview',
    description:    'Search Google and extract AI Overview or featured snippet. Returns AI-generated summary first, followed by organic results.',
    queryType:      'full',
    sourceType:     'google',
    placeholderUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    contextLabel:   'GOOGLE SEARCH — AI OVERVIEW & RESULTS',
    formatContext: (results) => {
      const parts = [];
      const ai  = results.find(r => r.type === 'ai_overview');
      const ft  = results.find(r => r.type === 'featured');
      const org = results.filter(r => r.type === 'result');
      if (ai) parts.push(`★ AI OVERVIEW:\n${ai.text}`);
      else if (ft) parts.push(`★ FEATURED SNIPPET:\n${ft.text}`);
      if (org.length) parts.push(org.map((r, i) => `[${i+1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`).join('\n\n'));
      return parts.join('\n\n---\n\n') || '(No results)';
    },
    formatSnippet: (results) => {
      const ai = results.find(r => r.type === 'ai_overview');
      if (ai) return `AI Overview: ${ai.text.slice(0, 200)}`;
      const ft = results.find(r => r.type === 'featured');
      if (ft) return `Featured: ${ft.text.slice(0, 200)}`;
      return results.filter(r => r.type === 'result').map(r => r.title).join(' | ');
    },
    browseCount:    2,
    fn:             googleSearch,
  },

  // ── DuckDuckGo fallback web search ────────────────────────────────────
  web: {
    toolName:       'search_web',
    label:          'DuckDuckGo',
    description:    'Search the web via DuckDuckGo for articles, docs, and resources. Returns up to 5 results with titles, URLs, and snippets.',
    queryType:      'full',
    sourceType:     'duckduckgo',
    placeholderUrl: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    contextLabel:   'DUCKDUCKGO WEB RESULTS (articles, docs, tutorials)',
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
          logger.error(`[${adapter.label}] failed: ${err.message}`, { agentId: 'researcher' });
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
        logger.error(`Browse failed for ${url}: ${err.message}`, { agentId: 'researcher' });
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
  if (url.includes('google.com') || url.includes('googleapis.com'))       return 'google';
  if (url.includes('duckduckgo.com'))                                      return 'duckduckgo';
  if (url.includes('github.com') || url.includes('raw.githubusercontent')) return 'github';
  if (url.includes('npmjs.com')  || url.includes('registry.npmjs.org'))   return 'npm';
  if (url.includes('stackoverflow.com'))                                   return 'stackoverflow';
  if (url.includes('ycombinator.com'))                                     return 'hackernews';
  return 'web';
}

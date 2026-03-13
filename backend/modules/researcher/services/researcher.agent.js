import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { getPuppeteerMCPTools } from '../../../core/mcp/mcp.manager.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getSkillPrompt } from '../../../core/skills/skill.loader.js';

const logger = createLogger('researcher');

// ─── Prompts ─────────────────────────────────────────────────────────────────

const BASE_PROMPT = `You are a Research Agent. Your job is to deeply analyze a goal before any code is written.

Output ONLY a valid JSON object — no markdown, no explanation:
{{"topic":"<goal summary>","summary":"<2-3 sentence analysis>","approaches":[{{"name":"<approach>","pros":["<pro>"],"cons":["<con>"]}}],"keyConsiderations":["<consideration>"],"recommendedApproach":"<which approach and why>","techStack":["<tech>"],"potentialChallenges":["<challenge>"]}}

Rules:
- Identify the best architectural patterns and frameworks for the goal
- List 2-3 concrete approaches with trade-offs
- Flag security, performance, and scalability concerns
- Return raw JSON only`;

// Used when MCP is enabled — context is injected before the goal
const MCP_ANALYSIS_PROMPT = `You are a Research Agent. The following web search results and page content were gathered automatically from Google, GitHub, and relevant pages. Use this real-world information to produce accurate, up-to-date findings.

{webContext}

Based on the above research, analyze the goal and output ONLY a valid JSON object — no markdown, no explanation:
{{"topic":"<goal summary>","summary":"<2-3 sentence analysis citing the sources above>","approaches":[{{"name":"<approach>","pros":["<pro>"],"cons":["<con>"]}}],"keyConsiderations":["<consideration>"],"recommendedApproach":"<which approach and why, referencing what you found>","techStack":["<tech>"],"potentialChallenges":["<challenge>"],"sources":[{sources}]}}

Rules:
- Base your findings on the actual search results and page content above
- Cite specific repos, articles, or docs you found
- Return raw JSON only`;

function getSystemPrompt() {
  return BASE_PROMPT + getSkillPrompt('researcher');
}

function buildMCPSystemPrompt(webContext, sourceUrls) {
  const sourcesJson = sourceUrls.map(u => `"${u}"`).join(',');
  return MCP_ANALYSIS_PROMPT
    .replace('{webContext}', webContext)
    .replace('{sources}', sourcesJson)
    + getSkillPrompt('researcher');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyUrl(url) {
  if (!url) return 'web';
  if (url.includes('google.com/search')) return 'google';
  if (url.includes('github.com')) return 'github';
  return 'web';
}

function parseFindings(rawOutput, goal) {
  try {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : rawOutput);
  } catch {
    return {
      topic: goal,
      summary: rawOutput,
      approaches: [],
      keyConsiderations: [],
      recommendedApproach: '',
      techStack: [],
      potentialChallenges: [],
    };
  }
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export class ResearcherAgent {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.db = getDb();
  }

  _isMCPEnabled() {
    const row = this.db.table('global_settings').first({ key: 'researcher_mcp_enabled' });
    return row?.value === '1';
  }

  async research(goal, sessionId, runId = null) {
    logger.info(`Researching goal: ${goal}`, { agentId: 'researcher', sessionId });
    this.socketManager?.emitAgentStatus('researcher', 'working', goal);

    if (this._isMCPEnabled()) {
      try {
        return await this._researchWithMCP(goal, sessionId, runId);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        logger.warn(`MCP research failed, falling back to plain: ${err.message}`, { agentId: 'researcher' });
        this.socketManager?.emitAgentStatus('researcher', 'working', 'Web search unavailable, using plain research...');
      }
    }

    return this._researchPlain(goal, sessionId, runId);
  }

  // ── Plain (no web search) ────────────────────────────────────────────────

  async _researchPlain(goal, sessionId, runId) {
    const compressedGoal = compressString(goal, 4096);
    const adapter = getAdapter('researcher');
    const memory = memoryStore.getMemory('researcher', sessionId);
    let rawOutput = '';

    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', getSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Research this goal and provide findings: {goal}'],
      ]);
      const histVars = await memory.loadMemoryVariables({});
      const messages = await prompt.formatMessages({
        goal: compressedGoal,
        chat_history: histVars.chat_history || [],
      });

      const signal = runId ? getAbortSignal(runId) : undefined;
      rawOutput = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(messages),
        signal,
        this.socketManager,
        sessionId,
        'researcher'
      );
      await memory.saveContext({ input: goal }, { output: rawOutput });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      logger.error(`Researcher LLM unavailable: ${err.message}`, { agentId: 'researcher' });
      throw new Error(`Researcher failed — check model name in Settings. Detail: ${err.message}`);
    }

    const findings = parseFindings(rawOutput, goal);
    await memoryStore.snapshotMemory('researcher', sessionId);
    this.socketManager?.emitAgentStatus('researcher', 'idle');
    this.socketManager?.emit('memory:updated', { agentId: 'researcher', sessionId });
    logger.info(`Research complete for: ${goal}`, { agentId: 'researcher' });
    return findings;
  }

  // ── MCP (web search → compile → LLM analysis) ───────────────────────────
  //
  // Calls search_google, search_github, and browse_url directly —
  // NO createToolCallingAgent / AgentExecutor / Zod schema binding.
  // The compiled web content is injected into the system prompt, then
  // the existing streamAndEmit path handles the LLM call.

  async _researchWithMCP(goal, sessionId, runId) {
    const sm = this.socketManager;
    const signal = runId ? getAbortSignal(runId) : undefined;

    sm?.emitAgentStatus('researcher', 'working', 'Loading web search tools...');
    const { tools, client } = await getPuppeteerMCPTools();
    const [googleTool, githubTool, browseTool] = tools;

    const visitedSources = [];

    const emitSources = () =>
      sm?.emit('researcher:web_sources', { sessionId, sources: [...visitedSources] });

    const addSource = (url, type, snippet = '') => {
      const existing = visitedSources.find(s => s.url === url);
      if (existing) { if (snippet) existing.snippet = snippet; return; }
      visitedSources.push({ url, type, snippet, ts: Date.now() });
      emitSources();
    };

    try {
      // ── Step 1: Google search ───────────────────────────────────────────
      const keywords = compressString(goal, 200);

      sm?.emitAgentStatus('researcher', 'working', `Searching Google: ${keywords}`);
      addSource(`https://www.google.com/search?q=${encodeURIComponent(keywords)}`, 'google');

      let googleResults = [];
      try {
        const raw = await googleTool.invoke({ query: keywords }, { signal });
        googleResults = JSON.parse(raw);
        const source = visitedSources.find(s => s.type === 'google');
        if (source) {
          source.snippet = googleResults.map(r => `${r.title} — ${r.url}`).join('\n');
          emitSources();
        }
        logger.info(`Google: ${googleResults.length} results`, { agentId: 'researcher' });
      } catch (err) {
        logger.warn(`Google search error: ${err.message}`, { agentId: 'researcher' });
      }

      // ── Step 2: GitHub search ───────────────────────────────────────────
      sm?.emitAgentStatus('researcher', 'working', `Searching GitHub: ${keywords}`);
      addSource(`https://github.com/search?q=${encodeURIComponent(keywords)}&type=repositories`, 'github');

      let githubResults = [];
      try {
        const raw = await githubTool.invoke({ query: keywords }, { signal });
        githubResults = JSON.parse(raw);
        const source = visitedSources.find(s => s.type === 'github');
        if (source) {
          source.snippet = githubResults.map(r => `${r.title} ★${r.stars} — ${r.description}`).join('\n');
          emitSources();
        }
        logger.info(`GitHub: ${githubResults.length} repos`, { agentId: 'researcher' });
      } catch (err) {
        logger.warn(`GitHub search error: ${err.message}`, { agentId: 'researcher' });
      }

      // ── Step 3: Browse top pages ────────────────────────────────────────
      // Try top 3 Google results + top 2 GitHub repos; skip failures, target 3 successful reads
      const urlsToBrowse = [
        ...googleResults.slice(0, 3).map(r => r.url),
        ...githubResults.slice(0, 2).map(r => r.url),
      ].filter(Boolean);

      const pageContents = [];
      for (const url of urlsToBrowse) {
        sm?.emitAgentStatus('researcher', 'working', `Reading: ${url}`);
        addSource(url, classifyUrl(url));
        try {
          const text = await browseTool.invoke({ url }, { signal });
          if (text.startsWith('Failed to read') || text.startsWith('[binary')) {
            logger.warn(`Browse skipped: ${text.slice(0, 80)}`, { agentId: 'researcher' });
          } else {
            addSource(url, classifyUrl(url), text.slice(0, 300));
            pageContents.push({ url, text });
            logger.info(`Read ${url} (${text.length} chars)`, { agentId: 'researcher' });
          }
        } catch (err) {
          logger.warn(`Browse failed for ${url}: ${err.message}`, { agentId: 'researcher' });
        }
      }

      // ── Step 4: Compile web context ─────────────────────────────────────
      const sections = [];

      if (googleResults.length) {
        sections.push(
          '=== GOOGLE SEARCH RESULTS ===\n' +
          googleResults.map((r, i) =>
            `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
          ).join('\n\n')
        );
      }

      if (githubResults.length) {
        sections.push(
          '=== GITHUB REPOSITORIES ===\n' +
          githubResults.map(r =>
            `Repo: ${r.title} (★${r.stars}, ${r.language})\nURL: ${r.url}\nDescription: ${r.description}\nTopics: ${r.topics?.join(', ') || 'n/a'}`
          ).join('\n\n')
        );
      }

      for (const { url, text } of pageContents) {
        sections.push(`=== PAGE CONTENT: ${url} ===\n${text.slice(0, 2000)}`);
      }

      const webContext = sections.join('\n\n---\n\n') ||
        '(No web results retrieved — analyze from knowledge only)';

      const sourceUrls = visitedSources.map(s => s.url);

      // ── Step 5: LLM analysis using compiled context ─────────────────────
      sm?.emitAgentStatus('researcher', 'working', 'Analyzing search results...');

      const adapter = getAdapter('researcher');
      const memory = memoryStore.getMemory('researcher', sessionId);
      const histVars = await memory.loadMemoryVariables({});
      const compressedGoal = compressString(goal, 2048);

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', buildMCPSystemPrompt(webContext, sourceUrls)],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Goal to research: {goal}'],
      ]);
      const messages = await prompt.formatMessages({
        goal: compressedGoal,
        chat_history: histVars.chat_history || [],
      });

      const rawOutput = await streamAndEmit(
        adapter._settings,
        toLMStudioMessages(messages),
        signal,
        sm,
        sessionId,
        'researcher'
      );

      await memory.saveContext({ input: goal }, { output: rawOutput });

      // ── Step 6: Parse and return ────────────────────────────────────────
      const findings = parseFindings(rawOutput, goal);
      if (!findings.sources && sourceUrls.length) findings.sources = sourceUrls;

      // Final sources emit with full snippets
      emitSources();
      logger.info(`MCP research complete — ${visitedSources.length} sources`, { agentId: 'researcher' });

      await memoryStore.snapshotMemory('researcher', sessionId);
      sm?.emitAgentStatus('researcher', 'idle');
      sm?.emit('memory:updated', { agentId: 'researcher', sessionId });
      return findings;

    } finally {
      try { await client.close(); } catch {}
    }
  }
}

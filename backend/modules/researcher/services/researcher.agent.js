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

const BASE_PROMPT = `You are an Expert Research Agent. Your task is to provide a deep architectural and technical analysis of a goal before any implementation begins.

CRITICAL: Your entire response MUST be exactly one valid JSON object. Do not include any introductory text, markdown code blocks, or follow-up explanations.

Format your response as follows:
{{
  "topic": "Concise summary of the goal",
  "summary": "2-3 sentences of deep technical analysis, focusing on architecture and feasibility.",
  "approaches": [
    {{
      "name": "Approach Name",
      "pros": ["Pro 1", "Pro 2"],
      "cons": ["Con 1", "Con 2"]
    }}
  ],
  "keyConsiderations": ["Consideration 1", "Consideration 2"],
  "recommendedApproach": "A detailed recommendation of which approach to take and why.",
  "techStack": ["Technology 1", "Technology 2"],
  "potentialChallenges": ["Challenge 1", "Challenge 2"]
}}

Guidelines:
- Identify industry-standard architectural patterns (e.g., Microservices, Event-Driven, Serverless).
- For each approach, provide concrete technical pros and cons.
- Highlight security, performance, and scalability as core considerations.`;

// Used when MCP is enabled — context is injected before the goal
const MCP_ANALYSIS_PROMPT = `You are an Expert Research Agent. Use the following web search results and site content to provide a data-driven technical analysis.

=== WEB CONTEXT START ===
{webContext}
=== WEB CONTEXT END ===

CRITICAL: Your entire response MUST be exactly one valid JSON object. Do not include any introductory text, markdown code blocks, or follow-up explanations.

Format your response as follows:
{{
  "topic": "Concise summary of the goal",
  "summary": "2-3 sentences of analysis incorporating specific findings from the sources above.",
  "approaches": [
    {{
      "name": "Approach Name",
      "pros": ["Pro 1 (citing source if relevant)", "Pro 2"],
      "cons": ["Con 1", "Con 2"]
    }}
  ],
  "keyConsiderations": ["Consideration 1", "Consideration 2"],
  "recommendedApproach": "Recommendation based on search results and best practices.",
  "techStack": ["Technology 1", "Technology 2"],
  "potentialChallenges": ["Challenge 1", "Challenge 2"],
  "sources": {sourcesJson}
}}

Guidelines:
- Cite specific repositories, documentation, or articles found in the context.
- Prioritize modern, well-supported technologies found during research.
- Ensure the recommended approach is backed by the evidence in the web context.`;

function escapePromptBraces(s) {
  if (!s) return '';
  return s.replace(/\{/g, '{{').replace(/\}/g, '}}');
}

function getSystemPrompt() {
  return BASE_PROMPT + escapePromptBraces(getSkillPrompt('researcher'));
}

function getMCPSystemPrompt() {
  return MCP_ANALYSIS_PROMPT + escapePromptBraces(getSkillPrompt('researcher'));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyUrl(url) {
  if (!url) return 'web';
  if (url.includes('google.com/search')) return 'google';
  if (url.includes('github.com')) return 'github';
  return 'web';
}

function parseFindings(rawOutput, goal) {
  if (!rawOutput) return { topic: goal, summary: '', approaches: [] };

  try {
    // Try to find all JSON-like blocks
    // We look for balanced braces or just the last matching { ... }
    const blocks = [];
    let braceCount = 0;
    let startIdx = -1;

    for (let i = 0; i < rawOutput.length; i++) {
      if (rawOutput[i] === '{') {
        if (braceCount === 0) startIdx = i;
        braceCount++;
      } else if (rawOutput[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) {
          blocks.push(rawOutput.slice(startIdx, i + 1));
          startIdx = -1;
        }
      }
    }

    // If we found multiple blocks, take the one that seems most complete (usually the first or last)
    // Or just try JSON.parse on each until one works
    for (let i = blocks.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(blocks[i]);
        if (parsed.topic || parsed.summary || parsed.approaches) {
          return parsed;
        }
      } catch (e) { /* ignore */ }
    }

    // Fallback to original regex if simple brace matching failed
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // If it still fails, it might be the "{} {}" case. Try to fix it.
        try {
          // Take only the first object if there are multiple
          const firstObjMatch = rawOutput.match(/\{[\s\S]*?\}/);
          if (firstObjMatch) return JSON.parse(firstObjMatch[0]);
        } catch (e2) { /* ignore */ }
      }
    }

    throw new Error('No valid JSON found');
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
        ['system', getMCPSystemPrompt()],
        new MessagesPlaceholder('chat_history'),
        ['human', 'Goal to research: {goal}'],
      ]);
      const messages = await prompt.formatMessages({
        goal: compressedGoal,
        chat_history: histVars.chat_history || [],
        webContext: webContext,
        sourcesJson: JSON.stringify(sourceUrls),
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

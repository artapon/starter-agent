import { getAdapter } from '../../../core/adapters/llm/adapter.registry.js';
import { getPuppeteerMCPTools } from '../../../core/mcp/mcp.manager.js';
import { memoryStore } from '../../memory/services/memory.store.js';
import { compressString } from '../../../core/middleware/prompt.compression.js';
import { createLogger } from '../../../core/logger/winston.logger.js';
import { getDb } from '../../../core/database/db.js';
import { getAbortSignal } from '../../../core/abort/abort.registry.js';
import { toLMStudioMessages, streamAndEmit } from '../../../core/utils/stream.utils.js';
import { getRawSkillPrompt } from '../../../core/skills/skill.loader.js';
import { extractKeywords, SEARCH_ADAPTERS } from '../../../core/browser/web.search.tools.js';

const logger = createLogger('researcher');

// All expert persona, output schema, analysis guidelines, and source config
// live in skills/*/RESEARCHER.md — nothing domain-specific is hardcoded here.

// ─── Message builder ─────────────────────────────────────────────────────────

/**
 * Build the OpenAI-format messages array for the LLM call.
 * Layer order (top of system prompt first):
 *   1. LTM context  — relevant past research for this goal
 *   2. Web context  — live search results (MCP mode only)
 *   3. Skill content — RESEARCHER.md expert persona + instructions
 */
function buildMessages(goal, histMessages = [], webContext = null, ltmContext = null) {
  const skillContent  = getRawSkillPrompt('researcher');
  const parts = [];
  if (ltmContext) parts.push(ltmContext);
  if (webContext) parts.push(`=== WEB RESEARCH CONTEXT ===\n${webContext}\n=== END WEB RESEARCH CONTEXT ===`);
  parts.push(skillContent);
  const systemContent = parts.join('\n\n');

  return [
    { role: 'system', content: systemContent },
    ...histMessages,
    { role: 'user', content: `Research this goal and provide your analysis:\n\n${goal}` },
  ];
}

// ─── JSON parser ─────────────────────────────────────────────────────────────

function parseFindings(rawOutput, goal) {
  if (!rawOutput) return _emptyFindings(goal);
  try {
    const blocks = [];
    let braceCount = 0, startIdx = -1;
    for (let i = 0; i < rawOutput.length; i++) {
      if (rawOutput[i] === '{') { if (braceCount === 0) startIdx = i; braceCount++; }
      else if (rawOutput[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) { blocks.push(rawOutput.slice(startIdx, i + 1)); startIdx = -1; }
      }
    }
    for (let i = blocks.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(blocks[i]);
        if (parsed.topic || parsed.summary || parsed.approaches) return _fillMissing(parsed, goal);
      } catch { /* ignore */ }
    }
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) { try { return _fillMissing(JSON.parse(jsonMatch[0]), goal); } catch { /* ignore */ } }
    throw new Error('No valid JSON found');
  } catch {
    return _emptyFindings(goal, rawOutput);
  }
}

function _emptyFindings(goal, summary = '') {
  return { topic: goal, summary, approaches: [], keyConsiderations: [], recommendedApproach: '',
    techStack: [], recommendedPackages: [], antiPatterns: [], productionConsiderations: [],
    versioningNotes: '', potentialChallenges: [] };
}

function _fillMissing(parsed, goal) {
  return {
    topic: parsed.topic || goal, summary: parsed.summary || '',
    approaches: parsed.approaches || [], keyConsiderations: parsed.keyConsiderations || [],
    recommendedApproach: parsed.recommendedApproach || '', techStack: parsed.techStack || [],
    recommendedPackages: parsed.recommendedPackages || [], antiPatterns: parsed.antiPatterns || [],
    productionConsiderations: parsed.productionConsiderations || [],
    versioningNotes: parsed.versioningNotes || '', potentialChallenges: parsed.potentialChallenges || [],
    ...parsed,
  };
}

// ─── Agent ────────────────────────────────────────────────────────────────────

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

  // ── Plain research (no web search) ──────────────────────────────────────────

  async _researchPlain(goal, sessionId, runId) {
    const adapter = getAdapter('researcher');
    const memory  = memoryStore.getMemory('researcher', sessionId);
    let rawOutput = '';
    try {
      // Workflow runs: skip STM history so previous research doesn't bias the current goal.
      const histMessages = runId
        ? []
        : toLMStudioMessages((await memory.loadMemoryVariables({})).chat_history || []);
      const ltmContext   = await memoryStore.getLTMContext('researcher', goal, 3);
      const messages     = buildMessages(compressString(goal, 4096), histMessages, null, ltmContext || null);
      const signal      = runId ? getAbortSignal(runId) : undefined;
      rawOutput = await streamAndEmit(adapter._settings, messages, signal, this.socketManager, sessionId, 'researcher');
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

  // ── MCP research (multi-source web search + LLM analysis) ───────────────────
  //
  // Which sources to search is read from `## Sources` in RESEARCHER.md.
  // All expert analysis guidelines, output schema, and grounding rules
  // come from the skill file — nothing domain-specific is hardcoded here.

  async _researchWithMCP(goal, sessionId, runId) {
    const sm     = this.socketManager;
    const signal = runId ? getAbortSignal(runId) : undefined;

    sm?.emitAgentStatus('researcher', 'working', 'Loading web search tools...');
    const { tools, client } = await getPuppeteerMCPTools();

    // Lookup tools by name (safe against ordering changes)
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));

    // Which sources to search — read from browser_tools DB table (user-configurable)
    const browserRows  = this.db.table('browser_tools').all({});
    const browserConfig = Object.fromEntries(browserRows.map(r => [r.source_name, r]));
    const useSource    = (name) => {
      const row = browserConfig[name];
      return row ? (row.enabled === 1 || row.enabled === '1') : true; // default on if not in DB
    };
    const getBrowseCount = (key) => {
      const row = browserConfig[key];
      return row ? (parseInt(row.browse_count, 10) || 1) : (SEARCH_ADAPTERS[key]?.browseCount ?? 1);
    };

    const enabledList = Object.keys(SEARCH_ADAPTERS).filter(useSource);
    logger.info(`Enabled sources: ${enabledList.join(', ')}`, { agentId: 'researcher' });

    const visitedSources = [];
    const emitSources = () => sm?.emit('researcher:web_sources', { sessionId, sources: [...visitedSources] });
    const addSource = (url, type, snippet = '') => {
      const existing = visitedSources.find(s => s.url === url);
      if (existing) { if (snippet) existing.snippet = snippet; return; }
      visitedSources.push({ url, type, snippet, ts: Date.now() });
      emitSources();
    };

    try {
      const webQuery    = compressString(goal, 200);
      const techKeywords = extractKeywords(goal, 60);
      logger.info(`Queries — web: "${webQuery.slice(0,60)}", tech: "${techKeywords}"`, { agentId: 'researcher' });

      // ── Phase 1: Parallel searches (driven by SEARCH_ADAPTERS registry) ────
      sm?.emitAgentStatus('researcher', 'working', 'Searching...');

      // Register placeholder source cards before results arrive
      for (const [key, adapter] of Object.entries(SEARCH_ADAPTERS)) {
        if (useSource(key)) {
          const q = adapter.queryType === 'full' ? webQuery : techKeywords;
          addSource(adapter.placeholderUrl(q), adapter.sourceType);
        }
      }

      // Build search task list dynamically from the registry
      const activeTasks = Object.entries(SEARCH_ADAPTERS)
        .filter(([key, adapter]) => useSource(key) && byName[adapter.toolName])
        .map(([key, adapter]) => {
          const q = adapter.queryType === 'full' ? webQuery : techKeywords;
          return { key, adapter, promise: byName[adapter.toolName].invoke({ query: q }, { signal }) };
        });

      const settled = await Promise.allSettled(activeTasks.map(t => t.promise));

      // Map results back by adapter key
      const searchResults = {};
      activeTasks.forEach(({ key, adapter }, i) => {
        searchResults[key] = _parseSearchResult(settled[i], adapter.label);
      });

      const counts = Object.entries(searchResults).map(([k, v]) => `${k}:${v.length}`).join(' ');
      logger.info(`Search — ${counts}`, { agentId: 'researcher' });

      // Update source snippet cards using each adapter's formatSnippet
      for (const [key, adapter] of Object.entries(SEARCH_ADAPTERS)) {
        const results = searchResults[key];
        if (results?.length) {
          _updateSourceSnippet(visitedSources, adapter.sourceType, adapter.formatSnippet(results), emitSources);
        }
      }

      // ── Phase 2: Selective browsing (browseCount from DB settings) ───────
      const urlsToBrowse = [];
      for (const [key, adapter] of Object.entries(SEARCH_ADAPTERS)) {
        const results = searchResults[key] || [];
        const count   = getBrowseCount(key);
        results.slice(0, count).forEach(r => {
          const url = adapter.getBrowseUrl ? adapter.getBrowseUrl(r) : r.url;
          if (url) urlsToBrowse.push({ url, type: adapter.sourceType });
        });
      }

      // Custom sources: browse the formatted search URL directly
      const customRows = browserRows.filter(r => (r.is_custom === 1 || r.is_custom === '1') && useSource(r.source_name));
      for (const src of customRows) {
        const q   = (src.query_type === 'keywords') ? techKeywords : webQuery;
        const url = (src.url_template || '').replace('{query}', encodeURIComponent(q));
        if (url && url !== src.url_template) {
          addSource(url, src.source_type || 'web');
          urlsToBrowse.push({ url, type: src.source_type || 'web' });
        }
      }

      const pageContents = [];
      let successfulBrowses = 0;

      for (const { url, type } of urlsToBrowse) {
        if (successfulBrowses >= 7) break;
        sm?.emitAgentStatus('researcher', 'working', `Reading: ${url}`);
        addSource(url, type);
        try {
          const text = await byName['browse_url'].invoke({ url }, { signal });
          if (text.startsWith('Failed to read') || text.startsWith('[binary')) {
            logger.warn(`Browse skipped: ${text.slice(0, 80)}`, { agentId: 'researcher' });
          } else {
            addSource(url, type, text.slice(0, 300));
            pageContents.push({ url, text, type });
            successfulBrowses++;
            logger.info(`Read ${url} (${text.length} chars)`, { agentId: 'researcher' });
          }
        } catch (err) {
          logger.warn(`Browse failed for ${url}: ${err.message}`, { agentId: 'researcher' });
        }
      }

      // ── Phase 3: Compile context (contextLabel + formatContext from adapter) ─
      const sourceTypeToAdapter = Object.fromEntries(
        Object.values(SEARCH_ADAPTERS).map(a => [a.sourceType, a])
      );
      const sections    = [];
      const deepContext = []; // structured for Debug UI

      for (const [key, adapter] of Object.entries(SEARCH_ADAPTERS)) {
        const results = searchResults[key];
        if (results?.length) {
          const content = adapter.formatContext(results);
          sections.push(`=== ${adapter.contextLabel} ===\n${content}`);
          deepContext.push({ label: adapter.contextLabel, type: adapter.sourceType, kind: 'search', content });
        }
      }
      for (const { url, text, type } of pageContents) {
        const adapterLabel = sourceTypeToAdapter[type]?.label?.toUpperCase() || 'PAGE';
        const content      = text.slice(0, 3000);
        sections.push(`=== ${adapterLabel}: ${url} ===\n${content}`);
        deepContext.push({ label: adapterLabel, type, kind: 'page', url, content });
      }

      const webContext = sections.join('\n\n---\n\n') || '(No web results — analyse from knowledge only)';

      // Emit structured deep context so the Debug page can show what the LLM received
      sm?.emit('researcher:deep_context', { sessionId, sections: deepContext });

      // ── Save knowledge context to STM + LTM ───────────────────────────
      sm?.emitAgentStatus('researcher', 'working', 'Saving knowledge context to memory…');
      const memory = memoryStore.getMemory('researcher', sessionId);

      // STM: one compact entry capturing what was gathered (shows in Memory view)
      const stmSummary = deepContext
        .map(s => `[${s.label}]\n${s.content.slice(0, 300)}`)
        .join('\n\n---\n\n')
        .slice(0, 3000);
      await memory.saveContext(
        { input: `Web knowledge gathered for: ${goal.slice(0, 200)}` },
        { output: stmSummary },
      );

      // LTM: one entry per section so each can be retrieved by future queries
      const ltmPromises = deepContext
        .filter(s => s.content.length > 50)
        .map(s => memoryStore.storeToLTM(
          'researcher',
          `[${s.label}] (topic: ${goal.slice(0, 150)})\n${s.content.slice(0, 1200)}`,
          { agentId: 'researcher', sessionId, goal: goal.slice(0, 150), sourceType: s.type, kind: s.kind },
        ));
      await Promise.allSettled(ltmPromises);

      const ltmCount = ltmPromises.length;
      logger.info(`Knowledge context saved — 1 STM entry, ${ltmCount} LTM entries`, { agentId: 'researcher' });
      sm?.emit('researcher:memory_saved', { sessionId, stm: 1, ltm: ltmCount });

      // ── Phase 4: LLM expert analysis (all instructions from RESEARCHER.md) ──
      sm?.emitAgentStatus('researcher', 'working', 'Analysing...');
      const adapter      = getAdapter('researcher');
      const histMessages = runId
        ? []
        : toLMStudioMessages((await memory.loadMemoryVariables({})).chat_history || []);
      const ltmContext   = await memoryStore.getLTMContext('researcher', goal, 3);
      const messages     = buildMessages(compressString(goal, 2048), histMessages, webContext, ltmContext || null);

      const rawOutput = await streamAndEmit(adapter._settings, messages, signal, sm, sessionId, 'researcher');
      await memory.saveContext({ input: goal }, { output: rawOutput });

      const findings = parseFindings(rawOutput, goal);
      findings.sources = visitedSources; // always use full visited list

      emitSources();
      logger.info(`MCP research complete — ${visitedSources.length} sources, ${pageContents.length} pages read`, { agentId: 'researcher' });
      await memoryStore.snapshotMemory('researcher', sessionId);
      sm?.emitAgentStatus('researcher', 'idle');
      sm?.emit('memory:updated', { agentId: 'researcher', sessionId });
      return findings;

    } finally {
      try { await client.close(); } catch {}
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _parseSearchResult(settled, label) {
  if (settled.status === 'rejected') {
    if (settled.reason !== 'source disabled') {
      logger.warn(`${label} search failed: ${settled.reason}`, { agentId: 'researcher' });
    }
    return [];
  }
  try {
    const val = settled.value;
    if (typeof val === 'string' && val.startsWith('Search failed:')) {
      logger.warn(`${label} search error: ${val}`, { agentId: 'researcher' });
      return [];
    }
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function _updateSourceSnippet(sources, type, snippet, emitSources) {
  const source = sources.find(s => s.type === type);
  if (source && snippet) { source.snippet = snippet; emitSources(); }
}

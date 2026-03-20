<template>
  <div class="debug-root">

    <!-- ── Tab bar ──────────────────────────────────────────────────── -->
    <div class="debug-tabs">
      <button
        v-for="t in tabs" :key="t.id"
        class="debug-tab"
        :class="{ 'debug-tab--active': activeTab === t.id }"
        @click="activeTab = t.id"
      >
        <v-icon size="14" class="mr-1">{{ t.icon }}</v-icon>
        {{ t.label }}
      </button>
    </div>

    <!-- ── Researcher tab ───────────────────────────────────────────── -->
    <div v-if="activeTab === 'researcher'" class="tab-body">

      <div class="dbg-title">
        <v-icon size="18" color="#22D3EE">mdi-magnify</v-icon>
        <div>
          <div class="dbg-title__name">Researcher Agent + Puppeteer MCP</div>
          <div class="dbg-title__sub">Step-by-step walkthrough to verify your Researcher Agent is working — with and without MCP web browsing.</div>
        </div>
      </div>

      <!-- Debug workspace banner -->
      <div class="debug-workspace-banner">
        <v-icon size="14" color="#22D3EE">mdi-folder-outline</v-icon>
        <span>Debug workspace:</span>
        <code class="debug-workspace-path">{{ debugWorkspacePath || 'workspace/debug' }}</code>
        <span class="debug-workspace-hint">(created automatically when you run a task)</span>
      </div>

      <!-- Section 1: Backend Connection -->
      <div class="section-label">1 — Backend Connection</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#6366F1">mdi-server-network</v-icon>
            <span class="card-title">Backend Status</span>
          </div>
          <span class="badge" :class="connBadgeClass">
            <span class="dot" :class="connPulse ? 'dot-pulse' : ''"></span>
            {{ connBadgeText }}
          </span>
        </div>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Socket.IO</div>
            <div class="stat-value" v-html="socketStatusHtml"></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Researcher Agent</div>
            <div class="stat-value" v-html="agentStatusHtml"></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">MCP Setting</div>
            <div class="stat-value" v-html="mcpStatusHtml"></div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-cyan" :disabled="checkingBackend" @click="checkBackend">
            <v-icon size="13">mdi-connection</v-icon> Check Backend
          </button>
          <button class="btn btn-grey" @click="checkMCPSetting">
            <v-icon size="13">mdi-flag-outline</v-icon> Read MCP Flag
          </button>
        </div>
      </div>

      <!-- Section 2: MCP Toggle -->
      <div class="section-label">2 — MCP Enable / Disable</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#22D3EE">mdi-web</v-icon>
            <span class="card-title">Puppeteer MCP Toggle</span>
          </div>
          <span class="badge" :class="mcpEnabled ? 'badge-cyan' : 'badge-grey'">
            {{ mcpEnabled ? '● MCP On' : '○ MCP Off' }}
          </span>
        </div>
        <div class="info-box">
          When <strong>enabled</strong>, the Researcher Agent spawns a Puppeteer browser via
          <code>npx @modelcontextprotocol/server-puppeteer</code>, browses relevant web pages,
          then produces its JSON findings from real content.<br>
          When <strong>disabled</strong>, the agent uses LLM knowledge only (faster, no browser).
        </div>
        <div class="toggle-row">
          <label class="toggle">
            <input type="checkbox" :checked="mcpEnabled" @change="toggleMCP($event.target.checked)" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label" :style="mcpEnabled ? 'color:#22D3EE' : ''">
            {{ mcpEnabled ? 'Puppeteer MCP Enabled' : 'Puppeteer MCP Disabled' }}
          </span>
        </div>
        <div v-if="mcpSaveResult" class="mcp-save-result" :class="mcpSaveOk ? 'text-green' : 'text-red'">
          {{ mcpSaveResult }}
        </div>
        <div class="warn-box">
          ⚠️ MCP requires <code>npx</code> to be available in your PATH and internet access on first run to download
          <code>@modelcontextprotocol/server-puppeteer</code>. The first research call will be slower (~5–15 sec) while npx downloads the package.
        </div>
      </div>

      <!-- Section 3: Live Test -->
      <div class="section-label">3 — Run a Live Research Test</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#10B981">mdi-play-circle-outline</v-icon>
            <span class="card-title">Research Task</span>
          </div>
          <div class="card-header-right">
            <div class="mode-toggle-row">
              <label class="toggle toggle--sm">
                <input type="checkbox" :checked="researchOnly" @change="researchOnly = $event.target.checked" />
                <span class="slider"></span>
              </label>
              <span class="mode-toggle-label" :style="researchOnly ? 'color:#22D3EE' : 'color:rgba(226,232,240,0.4)'">
                {{ researchOnly ? 'Research only' : 'Full workflow' }}
              </span>
            </div>
            <span class="badge" :class="runBadgeClass">
              <span class="dot" :class="runPulse ? 'dot-pulse' : ''"></span>
              {{ runBadgeText }}
            </span>
          </div>
        </div>
        <div class="input-row">
          <input
            v-model="goalInput"
            class="goal-input"
            placeholder="Enter a research goal…"
            @keydown.enter="!running && runResearch()"
          />
          <button class="btn btn-green" :disabled="running" @click="runResearch">
            <v-icon size="13">mdi-play</v-icon> Run Research
          </button>
          <button class="btn btn-red" :disabled="!running" @click="stopRun">
            <v-icon size="13">mdi-stop</v-icon> Stop
          </button>
        </div>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: progressWidth, transition: progressTransition }"></div></div>
        <div class="log-grid">
          <div>
            <div class="log-header">Agent Status Log</div>
            <div class="log-stream" ref="logStreamEl">
              <div v-for="(entry, i) in agentLog" :key="i" class="log-line">
                <span class="log-ts">{{ entry.ts }}</span>
                <span class="log-tag" :class="entry.tag">{{ entry.icon }}</span>
                <span class="log-msg">{{ entry.msg }}</span>
              </div>
            </div>
          </div>
          <div>
            <div class="log-header">Token Stream (LLM output)</div>
            <div class="log-stream log-stream--mono" ref="chatStreamEl">{{ chatBuffer }}</div>
          </div>
        </div>
      </div>

      <!-- Section 4: Web Sources -->
      <div class="section-label">
        4 — Web Sources
        <span class="section-sub">(live · MCP only)</span>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#22D3EE">mdi-link-variant</v-icon>
            <span class="card-title">Pages Visited by Researcher</span>
          </div>
          <span class="badge" :class="webSources.length ? 'badge-cyan' : 'badge-grey'">
            {{ webSources.length ? `${webSources.length} sources` : 'Waiting…' }}
          </span>
        </div>
        <div v-if="!webSources.length" class="empty-hint">
          Enable MCP and run a research task — every URL the agent navigates to will appear here in real time.
        </div>
        <div v-else class="sources-list">
          <div v-for="(s, i) in webSources" :key="i" class="source-card" :style="{ borderLeftColor: sourceColor(s.type) }">
            <div class="source-card__top">
              <span>{{ sourceIcon(s.type) }}</span>
              <span class="source-badge" :style="{ color: sourceColor(s.type) }">{{ sourceLabel(s) }}</span>
              <span class="source-idx">#{{ i + 1 }}</span>
              <span v-if="!s.snippet" class="source-loading">⏳ loading…</span>
              <span v-else class="source-ok">✓ content</span>
            </div>
            <a :href="s.url" target="_blank" rel="noopener" class="source-url" :style="{ color: sourceColor(s.type) }">{{ s.url }}</a>
            <div v-if="s.snippet" class="source-snippet">{{ s.snippet.slice(0, 360) }}</div>
          </div>
        </div>
      </div>

      <!-- Section 5: Search Result Summary -->
      <div class="section-label">
        5 — Search Result Summary
        <span class="section-sub">(per-source breakdown)</span>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#A78BFA">mdi-chart-bar</v-icon>
            <span class="card-title">What Was Found</span>
          </div>
          <span class="badge" :class="sourceGroups.length ? 'badge-cyan' : 'badge-grey'">
            {{ sourceGroups.length ? `${sourceGroups.length} source type${sourceGroups.length > 1 ? 's' : ''}` : 'Waiting…' }}
          </span>
        </div>

        <div v-if="!sourceGroups.length" class="empty-hint">
          Run a research task — search result counts and snippets will appear here in real time.
        </div>

        <template v-else>
          <!-- Stats row -->
          <div class="srsum-stats">
            <div class="srsum-stat">
              <div class="srsum-stat__num" style="color:#22D3EE">{{ webSources.length }}</div>
              <div class="srsum-stat__label">Total Sources</div>
            </div>
            <div class="srsum-stat">
              <div class="srsum-stat__num" style="color:#10B981">{{ webSources.filter(s => s.snippet).length }}</div>
              <div class="srsum-stat__label">Pages Read</div>
            </div>
            <div class="srsum-stat">
              <div class="srsum-stat__num" style="color:#A78BFA">{{ sourceGroups.length }}</div>
              <div class="srsum-stat__label">Source Types</div>
            </div>
            <div class="srsum-stat">
              <div class="srsum-stat__num" style="color:#F59E0B">
                {{ webSources.length ? Math.round(webSources.filter(s => s.snippet).length / webSources.length * 100) : 0 }}%
              </div>
              <div class="srsum-stat__label">Read Rate</div>
            </div>
          </div>

          <!-- Per-type group rows -->
          <div class="srsum-groups">
            <div
              v-for="g in sourceGroups" :key="g.type"
              class="srsum-group"
              :style="{ borderLeftColor: g.color }"
            >
              <div class="srsum-group__header">
                <span class="srsum-group__icon">{{ sourceIcon(g.type) }}</span>
                <span class="srsum-group__label" :style="{ color: g.color }">{{ g.label }}</span>
                <span class="srsum-group__badge" :style="{ borderColor: g.color, color: g.color }">
                  {{ g.count }} found
                </span>
                <span v-if="g.readCount" class="srsum-group__read">
                  {{ g.readCount }} read
                </span>
                <span v-if="g.pending" class="source-loading">⏳ loading…</span>
              </div>
              <div v-if="g.snippet" class="srsum-group__snippet">{{ g.snippet.slice(0, 400) }}</div>
              <div v-else-if="g.count" class="srsum-group__no-snippet">No content extracted</div>
            </div>
          </div>
        </template>
      </div>

      <!-- Section 6: Deep Research Phase -->
      <div class="section-label">
        6 — Deep Research Phase
        <span class="section-sub">(what the LLM received · MCP only)</span>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#F59E0B">mdi-brain</v-icon>
            <span class="card-title">Knowledge Context Sent to LLM</span>
          </div>
          <span class="badge" :class="deepSections.length ? 'badge-yellow' : 'badge-grey'">
            {{ deepSections.length ? `${deepSections.length} section${deepSections.length > 1 ? 's' : ''}` : 'Waiting…' }}
          </span>
        </div>

        <div v-if="!deepSections.length" class="empty-hint">
          Enable MCP and run a research task — the compiled knowledge context sent to the LLM will appear here.
        </div>

        <template v-else>
          <!-- Summary bar -->
          <div class="deep-summary-bar">
            <span class="deep-summary-item">
              <span style="color:#F59E0B">{{ deepSections.filter(s => s.kind === 'search').length }}</span>
              search results
            </span>
            <span class="deep-summary-sep">·</span>
            <span class="deep-summary-item">
              <span style="color:#22D3EE">{{ deepSections.filter(s => s.kind === 'page').length }}</span>
              full pages
            </span>
            <span class="deep-summary-sep">·</span>
            <span class="deep-summary-item">
              <span style="color:#10B981">{{ deepSections.reduce((a, s) => a + s.content.length, 0).toLocaleString() }}</span>
              chars total
            </span>
          </div>

          <!-- Memory saved banner -->
          <div v-if="memorySaved" class="deep-memory-banner">
            <v-icon size="14" color="#10B981">mdi-database-check-outline</v-icon>
            <span>Knowledge context saved to memory —</span>
            <span class="deep-mem-pill deep-mem-pill--stm">STM {{ memorySaved.stm }} entry</span>
            <span class="deep-mem-pill deep-mem-pill--ltm">LTM {{ memorySaved.ltm }} entries</span>
          </div>
          <div v-else-if="deepSections.length" class="deep-memory-banner deep-memory-banner--pending">
            <v-icon size="14" color="rgba(226,232,240,0.3)">mdi-database-clock-outline</v-icon>
            <span>Saving to memory…</span>
          </div>

          <!-- Context cards -->
          <div class="deep-sections">
            <div
              v-for="(s, i) in deepSections" :key="i"
              class="deep-section"
              :style="{ borderLeftColor: sourceColor(s.type) }"
            >
              <!-- Header row — always visible, click to expand -->
              <div class="deep-section__header" @click="expandedDeep[i] = !expandedDeep[i]">
                <span class="deep-section__icon">{{ sourceIcon(s.type) }}</span>
                <div class="deep-section__meta">
                  <div class="deep-section__label" :style="{ color: sourceColor(s.type) }">
                    {{ s.label }}
                  </div>
                  <div v-if="s.url" class="deep-section__url">{{ s.url }}</div>
                </div>
                <div class="deep-section__right">
                  <span class="deep-section__kind" :class="s.kind === 'page' ? 'kind-page' : 'kind-search'">
                    {{ s.kind === 'page' ? '📄 full page' : '🔍 search results' }}
                  </span>
                  <span class="deep-section__chars">{{ s.content.length.toLocaleString() }} chars</span>
                  <v-icon size="14" style="color:rgba(226,232,240,0.3)">
                    {{ expandedDeep[i] ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                  </v-icon>
                </div>
              </div>

              <!-- Expandable content -->
              <div v-if="expandedDeep[i]" class="deep-section__content">
                <pre class="deep-section__pre">{{ s.content }}</pre>
              </div>
              <div v-else class="deep-section__preview">{{ s.content.slice(0, 220) }}{{ s.content.length > 220 ? '…' : '' }}</div>
            </div>
          </div>
        </template>
      </div>

      <!-- Section 7: Output Inspector -->
      <div class="section-label">7 — Research Output Inspector</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#A78BFA">mdi-code-json</v-icon>
            <span class="card-title">Parsed JSON Findings</span>
          </div>
          <span class="badge" :class="findings ? 'badge-green' : 'badge-grey'">
            {{ findings ? '✓ Parsed' : 'Waiting…' }}
          </span>
        </div>
        <div v-if="!findings" class="empty-hint">Run a research task above — the parsed JSON will appear here.</div>
        <template v-else>
          <div class="findings-grid">
            <div v-if="findings.topic" class="findings-field">
              <div class="findings-label">Topic</div>
              <div class="findings-val" style="color:#22D3EE">{{ findings.topic }}</div>
            </div>
            <div v-if="findings.summary" class="findings-field">
              <div class="findings-label">Technical Summary</div>
              <div class="findings-val">{{ findings.summary }}</div>
            </div>
          </div>

          <template v-if="findings.approaches?.length">
            <div class="findings-section-title">Architectural Approaches</div>
            <div class="approaches-list">
              <div v-for="a in findings.approaches" :key="a.name" class="approach-card">
                <div class="approach-name">🚀 {{ a.name }}</div>
                <div class="approach-cols">
                  <div>
                    <div class="col-label col-label--green">Strengths</div>
                    <div v-for="p in a.pros||[]" :key="p" class="bullet-item">• {{ p }}</div>
                  </div>
                  <div>
                    <div class="col-label col-label--red">Weaknesses</div>
                    <div v-for="c in a.cons||[]" :key="c" class="bullet-item">• {{ c }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div v-if="findings.recommendedApproach" class="recommended-box">
            <span style="font-size:20px">⭐</span>
            <div class="recommended-text">{{ findings.recommendedApproach }}</div>
          </div>

          <div v-if="findings.techStack?.length || findings.keyConsiderations?.length" class="two-col">
            <div>
              <div v-if="findings.keyConsiderations?.length">
                <div class="findings-section-title">Key Considerations</div>
                <div v-for="c in findings.keyConsiderations" :key="c" class="diag-row">
                  <span class="diag-dot" style="color:#22D3EE">•</span>{{ c }}
                </div>
              </div>
            </div>
            <div>
              <div v-if="findings.techStack?.length">
                <div class="findings-section-title">Tech Stack</div>
                <div class="pill-list">
                  <span v-for="t in findings.techStack" :key="t" class="pill">{{ t }}</span>
                </div>
              </div>
            </div>
          </div>

          <template v-if="findings.potentialChallenges?.length">
            <div class="findings-section-title">Potential Challenges</div>
            <div class="challenges-grid">
              <div v-for="c in findings.potentialChallenges" :key="c" class="challenge-item">
                <span style="color:#EF4444">⚠</span> {{ c }}
              </div>
            </div>
          </template>

          <template v-if="findings.sources?.length">
            <div class="findings-section-title">Sources Used</div>
            <div class="sources-list">
              <a v-for="url in findings.sources" :key="url"
                :href="url" target="_blank" rel="noopener"
                class="source-link-row">
                <span class="source-domain-tag">{{ domainOf(url) }}</span>
                <span class="source-link-url">{{ url }}</span>
              </a>
            </div>
          </template>

          <div class="raw-json-toggle">
            <button class="btn btn-grey" style="font-size:11px" @click="showRaw = !showRaw">
              <v-icon size="12">{{ showRaw ? 'mdi-chevron-up' : 'mdi-code-braces' }}</v-icon>
              {{ showRaw ? 'Hide' : 'Show' }} raw JSON
            </button>
          </div>
          <pre v-if="showRaw" class="raw-json">{{ JSON.stringify(findings, null, 2) }}</pre>
        </template>
      </div>

      <!-- Section 6: What to Expect -->
      <div class="section-label">6 — What to Expect</div>
      <div class="card">
        <div class="two-col">
          <div>
            <div class="card-subtitle">MCP Disabled (Plain Research)</div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Agent status:</strong> <code>working → idle</code></div></div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Token stream:</strong> JSON blob starts streaming immediately</div></div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Duration:</strong> typically 5–30 seconds depending on model</div></div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Output:</strong> JSON with <code>topic, summary, approaches, keyConsiderations, techStack</code></div></div>
          </div>
          <div>
            <div class="card-subtitle">MCP Enabled (Web Search Research)</div>
            <div class="diag-row"><span class="diag-dot">🌐</span><div><strong>Status 1:</strong> <code>MCP: Starting Puppeteer browser…</code></div></div>
            <div class="diag-row"><span class="diag-dot">🔍</span><div><strong>Status 2:</strong> <code>Searching Google: &lt;keywords&gt;</code></div></div>
            <div class="diag-row"><span class="diag-dot">🐙</span><div><strong>Status 3:</strong> <code>Searching GitHub: &lt;keywords&gt;</code></div></div>
            <div class="diag-row"><span class="diag-dot">📄</span><div><strong>Status 4:</strong> <code>Reading: https://…</code></div></div>
            <div class="diag-row"><span class="diag-dot">⏱️</span><div><strong>Duration:</strong> 30–90 sec depending on pages read</div></div>
            <div class="diag-row"><span class="diag-dot">🔁</span><div><strong>On failure:</strong> auto-falls back to plain research</div></div>
          </div>
        </div>
      </div>

      <!-- Section 7: Troubleshooting -->
      <div class="section-label">7 — Troubleshooting</div>
      <div class="card">
        <div class="two-col">
          <div>
            <div class="card-subtitle">Web search not returning results</div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>No browser needed — uses Node.js native <code>fetch</code>. Check internet access from the server machine.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>DuckDuckGo may rate-limit heavy use. Check backend log for <code style="color:#EF4444">Web search failed</code>.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>GitHub API returns empty for very niche queries. Try broader keywords.</div></div>
          </div>
          <div>
            <div class="card-subtitle">Researcher returning no output</div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>Go to <strong>Settings → researcher</strong> and click <strong>Test Connection</strong>. Must show <code>Online</code>.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>LM Studio must be running with a model loaded on <code>http://localhost:1234</code>.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>If token stream shows raw text (not JSON), the model ignored format instructions. Try a larger model.</div></div>
          </div>
        </div>
        <div class="section-divider" />
        <div class="card-subtitle">Available web search tools</div>
        <div class="pill-list" style="margin-top:8px">
          <span class="pill">🔍 search_google</span>
          <span class="pill">🐙 search_github</span>
          <span class="pill">📦 search_npm</span>
          <span class="pill">💬 search_stackoverflow</span>
          <span class="pill">🔶 search_hackernews</span>
          <span class="pill">📄 browse_url</span>
        </div>
        <div class="code-block" style="margin-top:10px"># Verify internet access from backend:
curl -s "https://api.github.com/search/repositories?q=nodejs&per_page=1" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).items[0].full_name)"</div>
      </div>

      <!-- Section 8: Backend Logs -->
      <div class="section-label">8 — Backend Logs (live)</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="rgba(226,232,240,0.4)">mdi-console</v-icon>
            <span class="card-title">All backend log entries</span>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:4px 10px" @click="backendLog = []">Clear</button>
        </div>
        <div class="backend-log" ref="backendLogEl">
          <div v-for="(entry, i) in backendLog" :key="i"
            class="backend-log__line"
            :style="{ color: logColor(entry.level, entry.highlight) }"
          >
            <span class="backend-log__ts">{{ entry.ts }}</span>
            <span class="backend-log__src">[{{ entry.source }}]</span>
            {{ entry.msg }}
          </div>
        </div>
      </div>

    </div><!-- /tab-body researcher -->

    <!-- ── Planner tab ──────────────────────────────────────────────── -->
    <div v-if="activeTab === 'planner'" class="tab-body">

      <div class="dbg-title">
        <v-icon size="18" color="#A78BFA">mdi-clipboard-list-outline</v-icon>
        <div>
          <div class="dbg-title__name">Planner Agent</div>
          <div class="dbg-title__sub">Run the Planner agent directly — provide a goal and inspect the generated step-by-step execution plan.</div>
        </div>
      </div>

      <!-- Section 1: Generate a Plan -->
      <div class="section-label">1 — Generate a Plan</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#A78BFA">mdi-play-circle-outline</v-icon>
            <span class="card-title">Planner Task</span>
          </div>
          <span class="badge" :class="pRunBadgeClass">
            <span class="dot" :class="pRunPulse ? 'dot-pulse' : ''"></span>
            {{ pRunBadgeText }}
          </span>
        </div>
        <div class="input-row">
          <input
            v-model="pGoalInput"
            class="goal-input"
            placeholder="Enter a goal to plan… e.g. Build a REST API with JWT auth"
            @keydown.enter="!pRunning && runPlanner()"
          />
          <button class="btn btn-purple" :disabled="pRunning || !pGoalInput.trim()" @click="runPlanner">
            <v-icon size="13">mdi-play</v-icon> Generate Plan
          </button>
          <button class="btn btn-grey" @click="pClearAll">
            <v-icon size="13">mdi-refresh</v-icon> Clear
          </button>
        </div>
        <div class="progress-bar"><div class="progress-fill progress-fill--purple" :style="{ width: pProgressWidth, transition: pProgressTransition }"></div></div>
        <div>
          <div class="log-header">Status Log</div>
          <div class="log-stream" ref="pLogStreamEl">
            <div v-for="(entry, i) in pAgentLog" :key="i" class="log-line">
              <span class="log-ts">{{ entry.ts }}</span>
              <span class="log-tag" :class="entry.tag">{{ entry.icon }}</span>
              <span class="log-msg">{{ entry.msg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Plan Result -->
      <div class="section-label">2 — Plan Result</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#A78BFA">mdi-clipboard-list-outline</v-icon>
            <span class="card-title">Generated Plan</span>
          </div>
          <span class="badge" :class="pPlan ? 'badge-purple' : 'badge-grey'">
            {{ pPlan ? `${(pPlan.steps||[]).length} steps` : 'Waiting…' }}
          </span>
        </div>
        <div v-if="!pPlan" class="empty-hint">Run a planner task above — the generated plan will appear here.</div>
        <template v-else>
          <!-- Meta row -->
          <div class="plan-meta">
            <div class="plan-meta__item plan-meta__item--wide">
              <div class="plan-meta__label">Goal</div>
              <div class="plan-meta__val" style="color:#A78BFA">{{ pPlan.goal }}</div>
            </div>
            <div v-if="pPlan.priority" class="plan-meta__item">
              <div class="plan-meta__label">Priority</div>
              <div class="plan-meta__val">{{ pPlan.priority }}</div>
            </div>
            <div v-if="pPlan.estimatedSteps" class="plan-meta__item">
              <div class="plan-meta__label">Est. Steps</div>
              <div class="plan-meta__val" style="color:#22D3EE">{{ pPlan.estimatedSteps }}</div>
            </div>
            <div v-if="pPlan.sessionId" class="plan-meta__item">
              <div class="plan-meta__label">Session</div>
              <div class="plan-meta__val font-mono" style="font-size:11px;color:rgba(226,232,240,0.35)">{{ pPlan.sessionId.slice(0,12) }}…</div>
            </div>
          </div>

          <!-- Steps -->
          <div class="steps-list">
            <div v-for="(step, i) in (pPlan.steps || [])" :key="step.id || i" class="step-card">
              <div class="step-card__header">
                <div class="step-num">{{ i + 1 }}</div>
                <div class="step-id font-mono">{{ step.id }}</div>
                <div class="step-desc">{{ step.description }}</div>
                <span v-if="step.agentHint" class="step-agent-badge">{{ step.agentHint }}</span>
              </div>
              <div v-if="step.dependsOn?.length" class="step-deps">
                <span class="step-deps__label">Depends on:</span>
                <span v-for="d in step.dependsOn" :key="d" class="step-dep-pill">{{ d }}</span>
              </div>
            </div>
          </div>

          <div class="raw-json-toggle">
            <button class="btn btn-grey" style="font-size:11px" @click="pShowRaw = !pShowRaw">
              <v-icon size="12">{{ pShowRaw ? 'mdi-chevron-up' : 'mdi-code-braces' }}</v-icon>
              {{ pShowRaw ? 'Hide' : 'Show' }} raw JSON
            </button>
          </div>
          <pre v-if="pShowRaw" class="raw-json">{{ JSON.stringify(pPlan, null, 2) }}</pre>
        </template>
      </div>

      <!-- Section 3: Recent Plans -->
      <div class="section-label">3 — Recent Plans</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#6366F1">mdi-history</v-icon>
            <span class="card-title">Plan History</span>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:4px 10px" @click="fetchRecentPlans">
            <v-icon size="12">mdi-refresh</v-icon> Refresh
          </button>
        </div>
        <div v-if="!pRecentPlans.length" class="empty-hint">No plans yet — run the planner above.</div>
        <div v-else class="plan-history-list">
          <div v-for="p in pRecentPlans" :key="p.id"
            class="plan-history-row"
            :class="{ 'plan-history-row--active': pSelectedHistoryPlan?.id === p.id }"
            @click="pSelectedHistoryPlan = p"
          >
            <span class="font-mono" style="font-size:10px;color:rgba(226,232,240,0.3)">{{ p.id.slice(0,10) }}</span>
            <div class="plan-history-row__goal">{{ parsePlanGoal(p) }}</div>
            <span class="plan-history-row__steps">{{ parsePlanStepCount(p) }} steps</span>
            <span style="font-size:10px;color:rgba(226,232,240,0.3);flex-shrink:0">
              {{ p.created_at ? new Date(p.created_at * 1000).toLocaleString() : '' }}
            </span>
            <button class="btn btn-grey" style="font-size:10px;padding:2px 8px;margin-left:4px;flex-shrink:0" @click.stop="loadHistoryPlan(p)">
              <v-icon size="11">mdi-arrow-top-right</v-icon> Load
            </button>
          </div>
        </div>
      </div>

      <!-- Section 4: Backend Logs -->
      <div class="section-label">4 — Backend Logs (live)</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="rgba(226,232,240,0.4)">mdi-console</v-icon>
            <span class="card-title">All backend log entries</span>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:4px 10px" @click="pBackendLog = []">Clear</button>
        </div>
        <div class="backend-log" ref="pBackendLogEl">
          <div v-for="(entry, i) in pBackendLog" :key="i"
            class="backend-log__line"
            :style="{ color: logColor(entry.level, entry.highlight) }"
          >
            <span class="backend-log__ts">{{ entry.ts }}</span>
            <span class="backend-log__src">[{{ entry.source }}]</span>
            {{ entry.msg }}
          </div>
        </div>
      </div>

    </div><!-- /tab-body planner -->

    <!-- ── Worker tab ────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'worker'" class="tab-body">

      <div class="dbg-title">
        <v-icon size="18" color="#10B981">mdi-code-braces</v-icon>
        <div>
          <div class="dbg-title__name">Worker Agent</div>
          <div class="dbg-title__sub">Run the Worker agent directly — provide a task and inspect the JSON blueprint output, written files, and live token stream.</div>
        </div>
      </div>

      <!-- Debug workspace banner -->
      <div class="debug-workspace-banner">
        <v-icon size="14" color="#10B981">mdi-folder-outline</v-icon>
        <span>Debug workspace:</span>
        <code class="debug-workspace-path">{{ debugWorkspacePath || 'workspace/debug' }}</code>
        <span class="debug-workspace-hint">(all files written here — created automatically)</span>
      </div>

      <!-- Section 1: Backend Connection -->
      <div class="section-label">1 — Backend Connection</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#6366F1">mdi-server-network</v-icon>
            <span class="card-title">Worker Status</span>
          </div>
          <span class="badge" :class="wConnBadgeClass">
            <span class="dot" :class="wConnPulse ? 'dot-pulse' : ''"></span>
            {{ wConnBadgeText }}
          </span>
        </div>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Socket.IO</div>
            <div class="stat-value" v-html="socketStatusHtml"></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Worker Agent</div>
            <div class="stat-value" v-html="wAgentStatusHtml"></div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Debug Workspace</div>
            <div class="stat-value" style="font-size:11px;font-family:monospace;color:#10B981">
              {{ debugWorkspacePath ? debugWorkspacePath.replace(/\\/g, '/').split('/').slice(-2).join('/') : 'workspace/debug' }}
            </div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-cyan" :disabled="wCheckingBackend" @click="wCheckBackend">
            <v-icon size="13">mdi-connection</v-icon> Check Backend
          </button>
        </div>
      </div>

      <!-- Section 2: Thinking Model Toggle -->
      <div class="section-label">2 — Model Thinking</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#F59E0B">mdi-brain</v-icon>
            <span class="card-title">Thinking Model</span>
          </div>
          <span class="badge" :class="wThinkingModel ? 'badge-yellow' : 'badge-grey'">
            {{ wThinkingModel ? '● Thinking On' : '○ Thinking Off' }}
          </span>
        </div>
        <div class="info-box">
          When <strong>enabled</strong>, the Worker treats the model as a thinking model (Qwen3, DeepSeek-R1, QwQ).
          <code>&lt;think&gt;</code> blocks are silently stripped; <code>response_format</code> is skipped since
          thinking models stall when forced into a JSON schema.<br>
          When <strong>disabled</strong>, the Worker forces <code>response_format: json_schema</code> on the
          model — better JSON reliability for non-thinking models.
        </div>
        <div class="toggle-row">
          <label class="toggle">
            <input type="checkbox" :checked="wThinkingModel" @change="toggleWorkerThinking($event.target.checked)" />
            <span class="slider"></span>
          </label>
          <span class="toggle-label" :style="wThinkingModel ? 'color:#F59E0B' : ''">
            {{ wThinkingModel ? 'Thinking Model Enabled' : 'Thinking Model Disabled' }}
          </span>
        </div>
        <div v-if="wThinkingSaveResult" class="mcp-save-result" :class="wThinkingSaveOk ? 'text-green' : 'text-red'">
          {{ wThinkingSaveResult }}
        </div>
      </div>

      <!-- Section 3: Run a Task -->
      <div class="section-label">3 — Run a Worker Task</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#10B981">mdi-play-circle-outline</v-icon>
            <span class="card-title">Worker Task</span>
          </div>
          <span class="badge" :class="wRunBadgeClass">
            <span class="dot" :class="wRunPulse ? 'dot-pulse' : ''"></span>
            {{ wRunBadgeText }}
          </span>
        </div>
        <div class="worker-input-area">
          <textarea
            v-model="wTaskInput"
            class="worker-textarea"
            placeholder="Describe what the Worker should implement…&#10;&#10;Example: Create a simple Express.js REST API with GET /health and GET /users endpoints. Return mock JSON data. Include proper error handling."
            :disabled="wRunning"
          ></textarea>
        </div>
        <div class="input-row">
          <button class="btn btn-green" :disabled="wRunning || !wTaskInput.trim()" @click="runWorker()">
            <v-icon size="13">mdi-play</v-icon> Run Worker
          </button>
          <button class="btn btn-red" :disabled="!wRunning" @click="wStopRun">
            <v-icon size="13">mdi-stop</v-icon> Stop
          </button>
          <button
            v-if="wTruncated || wLastRawOutput"
            class="btn btn-orange"
            :disabled="wRunning"
            @click="runWorker(true)"
            title="Continue from where the model was truncated"
          >
            <v-icon size="13">mdi-play-speed</v-icon> Continue
          </button>
          <button class="btn btn-grey" style="margin-left:auto" @click="wClearAll">
            <v-icon size="13">mdi-refresh</v-icon> Clear
          </button>
        </div>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: wProgressWidth, transition: wProgressTransition }"></div></div>
        <div class="log-grid">
          <div>
            <div class="log-header">Agent Status Log</div>
            <div class="log-stream" ref="wLogStreamEl">
              <div v-for="(entry, i) in wAgentLog" :key="i" class="log-line">
                <span class="log-ts">{{ entry.ts }}</span>
                <span class="log-tag" :class="entry.tag">{{ entry.icon }}</span>
                <span class="log-msg">{{ entry.msg }}</span>
              </div>
            </div>
          </div>
          <div>
            <div class="log-header">Token Stream (raw LLM output)</div>
            <div class="log-stream log-stream--mono" ref="wChatStreamEl">{{ wChatBuffer }}</div>
          </div>
        </div>
      </div>

      <!-- Section 3: Blueprint Inspector -->
      <div class="section-label">4 — Blueprint Inspector</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#A78BFA">mdi-file-code-outline</v-icon>
            <span class="card-title">Parsed JSON Blueprint</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <div v-if="wBlueprint" class="view-mode-toggle">
              <button
                class="view-mode-btn"
                :class="{ 'view-mode-btn--active': wViewMode === 'all' }"
                @click="wViewMode = 'all'"
              ><v-icon size="12">mdi-view-list</v-icon> All</button>
              <button
                class="view-mode-btn"
                :class="{ 'view-mode-btn--active': wViewMode === 'step' }"
                @click="wViewMode = 'step'; wCurrentFileIdx = 0"
              ><v-icon size="12">mdi-file-arrow-right-outline</v-icon> File by File</button>
            </div>
            <span class="badge" :class="wBlueprint ? 'badge-green' : 'badge-grey'">
              {{ wBlueprint ? `${(wBlueprint.files||[]).length} file(s)` : 'Waiting…' }}
            </span>
          </div>
        </div>
        <div v-if="!wBlueprint" class="empty-hint">Run a worker task above — the parsed JSON blueprint will appear here.</div>
        <template v-else>
          <!-- Summary bar -->
          <div class="bp-summary">
            <div class="bp-stat">
              <div class="bp-stat__num" style="color:#10B981">{{ (wBlueprint.files||[]).length }}</div>
              <div class="bp-stat__label">Files</div>
            </div>
            <div class="bp-stat">
              <div class="bp-stat__num" style="color:#22D3EE">{{ wTotalLines }}</div>
              <div class="bp-stat__label">Total Lines</div>
            </div>
            <div class="bp-stat">
              <div class="bp-stat__num" style="color:#A78BFA">{{ wTotalChars.toLocaleString() }}</div>
              <div class="bp-stat__label">Characters</div>
            </div>
            <div class="bp-stat">
              <div class="bp-stat__num" :style="{ color: wWrittenFiles.length ? '#10B981' : '#EF4444' }">{{ wWrittenFiles.length }}</div>
              <div class="bp-stat__label">Written</div>
            </div>
          </div>

          <!-- Summary text -->
          <div v-if="wBlueprint.summary" class="bp-summary-text">
            <v-icon size="14" color="#F59E0B" class="mr-1">mdi-information-outline</v-icon>
            {{ wBlueprint.summary }}
          </div>

          <!-- Written files banner -->
          <div v-if="wWrittenFiles.length" class="bp-written-banner">
            <v-icon size="14" color="#10B981">mdi-check-circle-outline</v-icon>
            <span>{{ wWrittenFiles.length }} file(s) written to workspace:</span>
            <span v-for="f in wWrittenFiles" :key="f" class="bp-file-pill">{{ f }}</span>
          </div>
          <div v-else-if="wBlueprint" class="bp-written-banner bp-written-banner--warn">
            <v-icon size="14" color="#F59E0B">mdi-alert-outline</v-icon>
            <span>No files written — blueprint may be incomplete or all paths were empty.</span>
          </div>

          <!-- ── All files view ── -->
          <div v-if="wViewMode === 'all'" class="bp-files">
            <div v-for="(file, i) in wBlueprint.files||[]" :key="i" class="bp-file">
              <div class="bp-file__header" @click="wExpandedFiles[i] = !wExpandedFiles[i]">
                <span class="bp-file__icon">{{ fileIcon(file.path) }}</span>
                <span class="bp-file__path">{{ file.path }}</span>
                <div class="bp-file__meta">
                  <span class="bp-file__lines">{{ lineCount(file.content) }} lines</span>
                  <span class="bp-file__chars">{{ (file.content||'').length.toLocaleString() }} chars</span>
                  <span :class="wWrittenFiles.includes(file.path) ? 'bp-written-ok' : 'bp-written-pending'">
                    {{ wWrittenFiles.includes(file.path) ? '✓ written' : '○ not written' }}
                  </span>
                </div>
                <v-icon size="14" style="color:rgba(226,232,240,0.3);margin-left:6px">
                  {{ wExpandedFiles[i] ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                </v-icon>
              </div>
              <div v-if="wExpandedFiles[i]" class="bp-file__content">
                <pre class="bp-file__pre">{{ file.content }}</pre>
              </div>
              <div v-else class="bp-file__preview">{{ (file.content||'').slice(0,300) }}{{ (file.content||'').length > 300 ? '…' : '' }}</div>
            </div>
          </div>

          <!-- ── File by file view ── -->
          <div v-else class="bp-step">
            <div class="bp-step__nav">
              <button class="btn btn-grey" :disabled="wCurrentFileIdx === 0" @click="wCurrentFileIdx--">
                <v-icon size="14">mdi-chevron-left</v-icon> Prev
              </button>
              <div class="bp-step__counter">
                <span class="bp-step__idx">{{ wCurrentFileIdx + 1 }}</span>
                <span class="bp-step__sep">/</span>
                <span class="bp-step__total">{{ (wBlueprint.files||[]).length }}</span>
              </div>
              <button class="btn btn-grey" :disabled="wCurrentFileIdx >= (wBlueprint.files||[]).length - 1" @click="wCurrentFileIdx++">
                Next <v-icon size="14">mdi-chevron-right</v-icon>
              </button>
            </div>

            <template v-if="wBlueprint.files && wBlueprint.files[wCurrentFileIdx]">
              <div class="bp-step__pills">
                <span v-for="(f, i) in wBlueprint.files" :key="i"
                  class="bp-step__pill"
                  :class="{ 'bp-step__pill--active': i === wCurrentFileIdx, 'bp-step__pill--done': wWrittenFiles.includes(f.path) }"
                  @click="wCurrentFileIdx = i"
                  :title="f.path"
                >{{ fileIcon(f.path) }}</span>
              </div>

              <div class="bp-step__file">
                <div class="bp-step__file-header">
                  <span class="bp-file__icon">{{ fileIcon(wBlueprint.files[wCurrentFileIdx].path) }}</span>
                  <span class="bp-step__path">{{ wBlueprint.files[wCurrentFileIdx].path }}</span>
                  <div class="bp-file__meta" style="margin-left:auto">
                    <span class="bp-file__lines">{{ lineCount(wBlueprint.files[wCurrentFileIdx].content) }} lines</span>
                    <span class="bp-file__chars">{{ (wBlueprint.files[wCurrentFileIdx].content||'').length.toLocaleString() }} chars</span>
                    <span :class="wWrittenFiles.includes(wBlueprint.files[wCurrentFileIdx].path) ? 'bp-written-ok' : 'bp-written-pending'">
                      {{ wWrittenFiles.includes(wBlueprint.files[wCurrentFileIdx].path) ? '✓ written' : '○ not written' }}
                    </span>
                  </div>
                </div>
                <pre class="bp-step__pre">{{ wBlueprint.files[wCurrentFileIdx].content }}</pre>
              </div>
            </template>
          </div>

          <!-- Raw JSON toggle -->
          <div class="raw-json-toggle">
            <button class="btn btn-grey" style="font-size:11px" @click="wShowRaw = !wShowRaw">
              <v-icon size="12">{{ wShowRaw ? 'mdi-chevron-up' : 'mdi-code-braces' }}</v-icon>
              {{ wShowRaw ? 'Hide' : 'Show' }} raw JSON
            </button>
          </div>
          <pre v-if="wShowRaw" class="raw-json">{{ JSON.stringify(wBlueprint, null, 2) }}</pre>
        </template>
      </div>

      <!-- Section 4: What to Expect -->
      <div class="section-label">5 — What to Expect</div>
      <div class="card">
        <div class="two-col">
          <div>
            <div class="card-subtitle">Normal Behaviour</div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Token stream:</strong> JSON blob starting with <code>{"files":[</code></div></div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Agent status:</strong> <code>working → idle</code></div></div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Blueprint Inspector:</strong> files list with content populated</div></div>
            <div class="diag-row"><span class="diag-dot">✅</span><div><strong>Duration:</strong> 10–120 seconds depending on file count and model</div></div>
          </div>
          <div>
            <div class="card-subtitle">Thinking Models (Qwen3, DeepSeek, QwQ)</div>
            <div class="diag-row"><span class="diag-dot">🧠</span><div>Token stream begins with <code>&lt;think&gt;</code> — this is reasoning; it is stripped before JSON extraction</div></div>
            <div class="diag-row"><span class="diag-dot">⏱️</span><div>Thinking can take 30–120 seconds before the JSON appears</div></div>
            <div class="diag-row"><span class="diag-dot">⚠️</span><div>If no JSON appears after thinking: model ran out of tokens. Increase <strong>max_tokens</strong> in Settings → worker.</div></div>
            <div class="diag-row"><span class="diag-dot">✂️</span><div>If files are cut off mid-content: token limit hit during output. Increase <strong>max_tokens</strong> or reduce file count in the task.</div></div>
          </div>
        </div>
      </div>

      <!-- Section 5: Troubleshooting -->
      <div class="section-label">6 — Troubleshooting</div>
      <div class="card">
        <div class="two-col">
          <div>
            <div class="card-subtitle">Worker produces no files</div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>Check token stream — if it shows only <code>&lt;think&gt;</code> content, all tokens were used in reasoning. Increase <code>max_tokens</code>.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>If stream is empty, LM Studio may be offline. Go to Settings → worker → Test Connection.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>If token stream has text (no JSON): model ignored format instructions. Try a larger or instruction-tuned model.</div></div>
          </div>
          <div>
            <div class="card-subtitle">Files cut off / incomplete content</div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>JSON blueprint is truncated mid-string — token limit hit. Increase <code>max_tokens</code> in Settings (try 65 536).</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>Simplify the task: ask for fewer files, or split into multiple runs.</div></div>
            <div class="diag-row"><span class="diag-dot">🔹</span><div>Worker writes files to <code>workspace/&lt;Project&gt;/</code> when a project is active, otherwise to <code>workspace/</code>.</div></div>
          </div>
        </div>
      </div>

      <!-- Section 6: Backend Logs -->
      <div class="section-label">7 — Backend Logs (live)</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="rgba(226,232,240,0.4)">mdi-console</v-icon>
            <span class="card-title">All backend log entries</span>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:4px 10px" @click="wBackendLog = []">Clear</button>
        </div>
        <div class="backend-log" ref="wBackendLogEl">
          <div v-for="(entry, i) in wBackendLog" :key="i"
            class="backend-log__line"
            :style="{ color: logColor(entry.level, entry.highlight) }"
          >
            <span class="backend-log__ts">{{ entry.ts }}</span>
            <span class="backend-log__src">[{{ entry.source }}]</span>
            {{ entry.msg }}
          </div>
        </div>
      </div>

    </div><!-- /tab-body worker -->

    <!-- ── Reviewer tab ──────────────────────────────────────────────── -->
    <div v-if="activeTab === 'reviewer'" class="tab-body">

      <div class="dbg-title">
        <v-icon size="18" color="#F59E0B">mdi-eye-check-outline</v-icon>
        <div>
          <div class="dbg-title__name">Reviewer Agent</div>
          <div class="dbg-title__sub">Run the Reviewer agent directly — submit code or content with a task description and inspect the quality score, feedback, and dimension breakdown.</div>
        </div>
      </div>

      <!-- Section 1: Submit for Review -->
      <div class="section-label">1 — Submit for Review</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#F59E0B">mdi-play-circle-outline</v-icon>
            <span class="card-title">Review Request</span>
          </div>
          <span class="badge" :class="rvRunBadgeClass">
            <span class="dot" :class="rvRunPulse ? 'dot-pulse' : ''"></span>
            {{ rvRunBadgeText }}
          </span>
        </div>
        <div class="review-inputs">
          <div>
            <div class="log-header">Task Description</div>
            <input
              v-model="rvTaskInput"
              class="goal-input"
              placeholder="Describe the task that was implemented… e.g. Create a REST API with JWT auth"
              :disabled="rvRunning"
            />
          </div>
          <div>
            <div class="log-header">Content to Review</div>
            <textarea
              v-model="rvContentInput"
              class="worker-textarea"
              placeholder="Paste the code or output to review…"
              :disabled="rvRunning"
            ></textarea>
          </div>
        </div>
        <div class="input-row">
          <button class="btn btn-amber" :disabled="rvRunning || !rvContentInput.trim() || !rvTaskInput.trim()" @click="runReviewer">
            <v-icon size="13">mdi-play</v-icon> Run Review
          </button>
          <button class="btn btn-grey" @click="rvClearAll">
            <v-icon size="13">mdi-refresh</v-icon> Clear
          </button>
        </div>
        <div class="progress-bar"><div class="progress-fill progress-fill--amber" :style="{ width: rvProgressWidth, transition: rvProgressTransition }"></div></div>
        <div>
          <div class="log-header">Status Log</div>
          <div class="log-stream" ref="rvLogStreamEl">
            <div v-for="(entry, i) in rvAgentLog" :key="i" class="log-line">
              <span class="log-ts">{{ entry.ts }}</span>
              <span class="log-tag" :class="entry.tag">{{ entry.icon }}</span>
              <span class="log-msg">{{ entry.msg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Review Result -->
      <div class="section-label">2 — Review Result</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="#F59E0B">mdi-chart-bar</v-icon>
            <span class="card-title">Quality Report</span>
          </div>
          <span v-if="rvResult" class="badge" :class="rvResult.approved ? 'badge-green' : 'badge-red'">
            {{ rvResult.approved ? '✓ Approved' : '✗ Rejected' }}
          </span>
          <span v-else class="badge badge-grey">Waiting…</span>
        </div>
        <div v-if="!rvResult" class="empty-hint">Run a review above — the quality report will appear here.</div>
        <template v-else>
          <!-- Score row -->
          <div class="rv-score-row">
            <div class="rv-score-circle" :class="rvResult.score >= 7 ? 'rv-score--pass' : 'rv-score--fail'">
              <span class="rv-score-num">{{ rvResult.score }}</span>
              <span class="rv-score-denom">/10</span>
            </div>
            <div class="rv-score-meta">
              <div class="rv-score-label" :style="{ color: rvResult.score >= 9 ? '#10B981' : rvResult.score >= 7 ? '#F59E0B' : '#EF4444' }">
                {{ rvResult.score >= 9 ? 'Excellent' : rvResult.score >= 7 ? 'Good' : rvResult.score >= 5 ? 'Adequate' : rvResult.score >= 3 ? 'Poor' : 'Critical' }}
              </div>
              <div class="rv-score-sub">Threshold: 7 — {{ rvResult.approved ? 'above' : 'below' }}</div>
            </div>
            <!-- Dimension bars -->
            <div v-if="rvResult.dimensions" class="rv-dims">
              <div v-for="(val, key) in rvResult.dimensions" :key="key" class="rv-dim-row">
                <span class="rv-dim-label">{{ key }}</span>
                <div class="rv-dim-bar-track">
                  <div class="rv-dim-bar-fill" :style="{ width: (val * 10) + '%', background: val >= 7 ? '#10B981' : val >= 5 ? '#F59E0B' : '#EF4444' }"></div>
                </div>
                <span class="rv-dim-val">{{ val }}/10</span>
              </div>
            </div>
          </div>

          <!-- Feedback -->
          <div class="rv-feedback">
            <div class="rv-feedback__label">Feedback</div>
            <div class="rv-feedback__text">{{ rvResult.feedback }}</div>
          </div>

          <!-- Suggestions -->
          <div v-if="rvResult.suggestions?.length" class="rv-suggestions">
            <div class="rv-feedback__label">Suggestions</div>
            <div v-for="(s, i) in rvResult.suggestions" :key="i" class="rv-suggestion-item">
              <span class="rv-suggestion-num">{{ i + 1 }}</span>
              <span>{{ s }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Section 3: Backend Logs -->
      <div class="section-label">3 — Backend Logs (live)</div>
      <div class="card">
        <div class="card-header">
          <div class="card-header-left">
            <v-icon size="15" color="rgba(226,232,240,0.4)">mdi-console</v-icon>
            <span class="card-title">All backend log entries</span>
          </div>
          <button class="btn btn-grey" style="font-size:11px;padding:4px 10px" @click="rvBackendLog = []">Clear</button>
        </div>
        <div class="backend-log" ref="rvBackendLogEl">
          <div v-for="(entry, i) in rvBackendLog" :key="i"
            class="backend-log__line"
            :style="{ color: logColor(entry.level, entry.highlight) }"
          >
            <span class="backend-log__ts">{{ entry.ts }}</span>
            <span class="backend-log__src">[{{ entry.source }}]</span>
            {{ entry.msg }}
          </div>
        </div>
      </div>

    </div><!-- /tab-body reviewer -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();

const tabs = [
  { id: 'researcher', label: 'Researcher', icon: 'mdi-magnify' },
  { id: 'planner',    label: 'Planner',    icon: 'mdi-clipboard-list-outline' },
  { id: 'worker',     label: 'Worker',     icon: 'mdi-code-braces' },
  { id: 'reviewer',   label: 'Reviewer',   icon: 'mdi-eye-check-outline' },
];
const activeTab = ref('researcher');

// ── Shared debug workspace path (both tabs) ───────────────────────────
const debugWorkspacePath = ref('');

// ── Connection ────────────────────────────────────────────────────────
const connBadgeText  = ref('Connecting…');
const connBadgeClass = ref('badge-grey');
const connPulse      = ref(false);
const socketStatusHtml = ref(`<span style="color:rgba(226,232,240,0.4)">Connecting to <code>http://localhost:3000</code>…</span>`);
const agentStatusHtml  = ref('<span style="color:rgba(226,232,240,0.4)">—</span>');
const mcpStatusHtml    = ref('<span style="color:rgba(226,232,240,0.4)">—</span>');
const checkingBackend  = ref(false);

// ── MCP ───────────────────────────────────────────────────────────────
const mcpEnabled    = ref(false);
const mcpSaveResult = ref('');
const mcpSaveOk     = ref(false);

// ── Run ───────────────────────────────────────────────────────────────
const goalInput     = ref('How to build a real-time chat app with Node.js and Socket.IO');
const researchOnly  = ref(true);
const running       = ref(false);
const currentRunId  = ref(null);
const runBadgeText  = ref('Idle');
const runBadgeClass = ref('badge-grey');
const runPulse      = ref(false);
const progressPct   = ref(0);
const progressIndet = ref(false);

const progressWidth = computed(() => progressIndet.value ? '60%' : progressPct.value + '%');
const progressTransition = computed(() => progressIndet.value ? 'width 2s ease' : 'width .4s ease');

// ── Logs ──────────────────────────────────────────────────────────────
const agentLog    = ref([]);
const chatBuffer  = ref('');
const backendLog  = ref([]);
const logStreamEl    = ref(null);
const chatStreamEl   = ref(null);
const backendLogEl   = ref(null);

// ── Sources / findings / deep context ────────────────────────────────
const webSources   = ref([]);
const findings     = ref(null);
const showRaw      = ref(false);
const deepSections  = ref([]);  // structured context sent to LLM
const expandedDeep  = ref({});  // { [index]: true } for expanded cards
const memorySaved   = ref(null); // { stm, ltm } counts after save

const sourceGroups = computed(() => {
  const map = {};
  for (const s of webSources.value) {
    const t = s.type || 'web';
    if (!map[t]) map[t] = { type: t, count: 0, readCount: 0, pending: 0, snippet: '' };
    map[t].count++;
    if (s.snippet) { map[t].readCount++; if (!map[t].snippet) map[t].snippet = s.snippet; }
    else           { map[t].pending++; }
  }
  return Object.values(map).map(g => ({
    ...g,
    label: sourceLabel({ type: g.type, url: '' }),
    color: sourceColor(g.type),
  }));
});

// ── Helpers ───────────────────────────────────────────────────────────
function ts() {
  return new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function appendLog(icon, tag, msg) {
  agentLog.value.push({ ts: ts(), icon, tag, msg });
  nextTick(() => { if (logStreamEl.value) logStreamEl.value.scrollTop = logStreamEl.value.scrollHeight; });
}
function appendBackendLog(level, source, msg, highlight) {
  backendLog.value.push({ ts: ts(), level, source, msg, highlight });
  if (backendLog.value.length > 500) backendLog.value.splice(0, 100);
  nextTick(() => { if (backendLogEl.value) backendLogEl.value.scrollTop = backendLogEl.value.scrollHeight; });
}
function logColor(level, highlight) {
  if (level === 'error') return '#EF4444';
  if (level === 'warn')  return '#F59E0B';
  if (highlight)         return '#22D3EE';
  return 'rgba(226,232,240,0.3)';
}
function setRunBadge(color, text, pulse = false) {
  runBadgeClass.value = `badge-${color}`;
  runBadgeText.value  = text;
  runPulse.value      = pulse;
}
function domainOf(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return 'web'; }
}
function sourceIcon(type) {
  return { google: '🔍', github: '🐙', npm: '📦', stackoverflow: '💬', hackernews: '🔶' }[type] || '🌐';
}
function sourceColor(type) {
  return { google: '#F59E0B', github: '#A78BFA', npm: '#EF4444', stackoverflow: '#F97316', hackernews: '#F59E0B' }[type] || '#22D3EE';
}
function sourceLabel(s) {
  return { google: 'Google Search', github: 'GitHub', npm: 'npm', stackoverflow: 'Stack Overflow', hackernews: 'Hacker News' }[s.type] || domainOf(s.url);
}

// ── API calls ─────────────────────────────────────────────────────────
async function checkBackend() {
  checkingBackend.value = true;
  try {
    const { data } = await axios.get('/api/agents/researcher/status');
    agentStatusHtml.value = data.available
      ? `<span style="color:#10B981">Online</span> — model: <code>${data.model}</code>`
      : `<span style="color:#EF4444">Offline</span> — LM Studio not reachable`;
    appendLog('🔍', 'tag-status', `Agent check: ${data.available ? 'ONLINE' : 'OFFLINE'} (${data.model})`);
    connBadgeText.value  = data.available ? '● Connected' : '● Offline';
    connBadgeClass.value = data.available ? 'badge-green' : 'badge-red';
  } catch (e) {
    agentStatusHtml.value = `<span style="color:#EF4444">Error: ${e.message}</span>`;
  } finally {
    checkingBackend.value = false;
  }
  // Also fetch researcher status for debug workspace path
  try {
    const { data } = await axios.get('/api/researcher/status');
    if (data.debugWorkspace) debugWorkspacePath.value = data.debugWorkspace;
  } catch { /* ignore */ }
}

async function checkMCPSetting() {
  try {
    const { data } = await axios.get('/api/settings/global');
    const enabled = data.researcher_mcp_enabled === '1';
    mcpEnabled.value    = enabled;
    mcpStatusHtml.value = enabled
      ? `<span style="color:#22D3EE">Enabled</span>`
      : `<span style="color:rgba(226,232,240,0.4)">Disabled</span>`;
    appendLog('⚙️', 'tag-status', `MCP flag: researcher_mcp_enabled = "${data.researcher_mcp_enabled || '0'}"`);
  } catch (e) {
    mcpStatusHtml.value = `<span style="color:#EF4444">Error: ${e.message}</span>`;
  }
}

async function toggleMCP(enabled) {
  mcpSaveResult.value = 'Saving…';
  mcpSaveOk.value     = false;
  try {
    await axios.put('/api/settings/global', { researcher_mcp_enabled: enabled ? '1' : '0' });
    mcpEnabled.value    = enabled;
    mcpStatusHtml.value = enabled
      ? `<span style="color:#22D3EE">Enabled</span>`
      : `<span style="color:rgba(226,232,240,0.4)">Disabled</span>`;
    mcpSaveOk.value     = true;
    mcpSaveResult.value = `✓ Saved: researcher_mcp_enabled = "${enabled ? '1' : '0'}"`;
    appendLog('💾', 'tag-mcp', `MCP toggled: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  } catch (e) {
    mcpSaveOk.value     = false;
    mcpSaveResult.value = `✗ Failed: ${e.message}`;
  }
}

async function runResearch() {
  const goal = goalInput.value.trim();
  if (!goal) return;

  // Reset state
  agentLog.value     = [];
  chatBuffer.value   = '';
  webSources.value   = [];
  findings.value     = null;
  showRaw.value      = false;
  deepSections.value = [];
  expandedDeep.value = {};
  memorySaved.value  = null;
  running.value      = true;
  currentRunId.value = null;
  setRunBadge('cyan', '● Starting…', true);
  progressPct.value   = 5;
  progressIndet.value = false;

  if (researchOnly.value) {
    // ── Research-only mode: run Researcher agent directly ──────────────
    appendLog('🔬', 'tag-wf', `Research only: "${goal}"`);
    try {
      progressIndet.value = true;
      const { data } = await axios.post('/api/researcher/research', { goal });
      currentRunId.value = data.runId;
      if (data.debugWorkspace) debugWorkspacePath.value = data.debugWorkspace;
      appendLog('🆔', 'tag-wf', `runId: ${data.runId}`);
      appendLog('🆔', 'tag-wf', `sessionId: ${data.sessionId}`);
      appendLog('📁', 'tag-wf', `Workspace: ${data.debugWorkspace || 'workspace/debug'}`);
      if (data.findings) findings.value = data.findings;
      setRunBadge('green', '✓ Complete');
      progressPct.value   = 100;
      progressIndet.value = false;
      running.value       = false;
    } catch (e) {
      if (e.response?.status !== 499) {
        appendLog('❌', 'tag-error', `Research failed: ${e.message}`);
      }
      setRunBadge('red', '✗ Failed');
      progressPct.value   = 0;
      progressIndet.value = false;
      running.value       = false;
    }
  } else {
    // ── Full workflow mode ─────────────────────────────────────────────
    appendLog('🚀', 'tag-wf', `Starting full workflow: "${goal}"`);
    try {
      const { data } = await axios.post('/api/workflow/start', { goal });
      currentRunId.value = data.runId;
      appendLog('🆔', 'tag-wf', `runId: ${data.runId}`);
      appendLog('🆔', 'tag-wf', `sessionId: ${data.sessionId}`);
      progressPct.value = 10;
    } catch (e) {
      appendLog('❌', 'tag-error', `Failed to start: ${e.message}`);
      setRunBadge('red', '✗ Failed');
      running.value = false;
    }
  }
}

function stopRun() {
  if (!currentRunId.value) return;
  socket.emit('workflow:stop', { runId: currentRunId.value });
  appendLog('■', 'tag-error', `Stop requested for runId: ${currentRunId.value}`);
}

function tryParseFromChat() {
  const buf = chatBuffer.value;
  if (!buf) return;
  const blocks = [];
  let braceCount = 0, startIdx = -1;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === '{') { if (braceCount === 0) startIdx = i; braceCount++; }
    else if (buf[i] === '}') {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) { blocks.push(buf.slice(startIdx, i + 1)); startIdx = -1; }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const f = JSON.parse(blocks[i]);
      if (f.topic || f.summary) { findings.value = f; return; }
    } catch { /* ignore */ }
  }
}

// ── Worker tab state ──────────────────────────────────────────────────
const wConnBadgeText   = ref('Connecting…');
const wConnBadgeClass  = ref('badge-grey');
const wConnPulse       = ref(false);
const wAgentStatusHtml = ref('<span style="color:rgba(226,232,240,0.4)">—</span>');
const wCheckingBackend = ref(false);

// ── Worker thinking model toggle ───────────────────────────────────────
const wThinkingModel      = ref(true);
const wThinkingSaveResult = ref('');
const wThinkingSaveOk     = ref(false);

const wTaskInput    = ref('create professional portfolio.html using html and pure css for represent AI Engineer expert');
const wTruncated    = ref(false);
const wLastRawOutput = ref('');
const wRunning      = ref(false);
const wRunBadgeText = ref('Idle');
const wRunBadgeClass = ref('badge-grey');
const wRunPulse     = ref(false);
const wProgressPct  = ref(0);
const wProgressIndet = ref(false);

const wProgressWidth      = computed(() => wProgressIndet.value ? '60%' : wProgressPct.value + '%');
const wProgressTransition = computed(() => wProgressIndet.value ? 'width 2s ease' : 'width .4s ease');

const wAgentLog    = ref([]);
const wChatBuffer  = ref('');
const wBackendLog  = ref([]);
const wLogStreamEl   = ref(null);
const wChatStreamEl  = ref(null);
const wBackendLogEl  = ref(null);

const wBlueprint     = ref(null);
const wWrittenFiles  = ref([]);
const wShowRaw       = ref(false);
const wExpandedFiles = ref({});
const wViewMode      = ref('all');   // 'all' | 'step'
const wCurrentFileIdx = ref(0);

const wTotalLines = computed(() =>
  (wBlueprint.value?.files || []).reduce((acc, f) => acc + lineCount(f.content), 0)
);
const wTotalChars = computed(() =>
  (wBlueprint.value?.files || []).reduce((acc, f) => acc + (f.content || '').length, 0)
);

function lineCount(content) { return (content || '').split('\n').length; }
function fileIcon(path = '') {
  const ext = path.split('.').pop().toLowerCase();
  return { js: '🟨', ts: '🔷', vue: '💚', html: '🌐', css: '🎨', json: '📋', md: '📝', py: '🐍', sh: '🔧', env: '🔒' }[ext] || '📄';
}

function wAppendLog(icon, tag, msg) {
  wAgentLog.value.push({ ts: ts(), icon, tag, msg });
  nextTick(() => { if (wLogStreamEl.value) wLogStreamEl.value.scrollTop = wLogStreamEl.value.scrollHeight; });
}
function wAppendBackendLog(level, source, msg, highlight) {
  wBackendLog.value.push({ ts: ts(), level, source, msg, highlight });
  if (wBackendLog.value.length > 500) wBackendLog.value.splice(0, 100);
  nextTick(() => { if (wBackendLogEl.value) wBackendLogEl.value.scrollTop = wBackendLogEl.value.scrollHeight; });
}
function setWRunBadge(color, text, pulse = false) {
  wRunBadgeClass.value = `badge-${color}`;
  wRunBadgeText.value  = text;
  wRunPulse.value      = pulse;
}

function tryParseBlueprint() {
  const buf = wChatBuffer.value;
  if (!buf) return;
  // Try anchoring on {"files":[
  const idx = buf.indexOf('{"files"');
  if (idx !== -1) {
    const blocks = [];
    let depth = 0, start = -1;
    for (let i = idx; i < buf.length; i++) {
      if (buf[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (buf[i] === '}' && depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) { blocks.push(buf.slice(start, i + 1)); start = -1; }
      }
    }
    for (let i = blocks.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(blocks[i]);
        if (parsed.files) { wBlueprint.value = parsed; return; }
      } catch { /* ignore */ }
    }
  }
  // Fallback: brace scan from end
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (buf[i] === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) { blocks.push(buf.slice(start, i + 1)); start = -1; }
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(blocks[i]);
      if (parsed.files) { wBlueprint.value = parsed; return; }
    } catch { /* ignore */ }
  }
}

async function wCheckBackend() {
  wCheckingBackend.value = true;
  try {
    const { data } = await axios.get('/api/worker/status');
    wAgentStatusHtml.value = data.status === 'ready'
      ? `<span style="color:#10B981">Online</span> — model: <code>${data.model}</code>`
      : `<span style="color:#EF4444">Offline</span> — LM Studio not reachable`;
    wAppendLog('💻', 'tag-status', `Agent check: ${data.status === 'ready' ? 'ONLINE' : 'OFFLINE'} (${data.model})`);
    wConnBadgeText.value  = data.status === 'ready' ? '● Connected' : '● Offline';
    wConnBadgeClass.value = data.status === 'ready' ? 'badge-green' : 'badge-red';
    if (data.debugWorkspace) debugWorkspacePath.value = data.debugWorkspace;
    await loadWorkerThinkingModel();
  } catch (e) {
    wAgentStatusHtml.value = `<span style="color:#EF4444">Error: ${e.message}</span>`;
    wConnBadgeText.value  = '● Error';
    wConnBadgeClass.value = 'badge-red';
  } finally {
    wCheckingBackend.value = false;
  }
}

async function loadWorkerThinkingModel() {
  try {
    const { data } = await axios.get('/api/settings/worker');
    wThinkingModel.value = data.thinking_model !== undefined ? Boolean(data.thinking_model) : true;
  } catch { /* silent — keep default */ }
}

async function toggleWorkerThinking(enabled) {
  wThinkingSaveResult.value = 'Saving…';
  wThinkingSaveOk.value     = false;
  try {
    await axios.put('/api/settings/worker', { thinking_model: enabled ? 1 : 0 });
    wThinkingModel.value      = enabled;
    wThinkingSaveOk.value     = true;
    wThinkingSaveResult.value = `✓ Saved: thinking_model = ${enabled ? 'enabled' : 'disabled'}`;
    wAppendLog('⚙️', 'tag-status', `Thinking model: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  } catch (e) {
    wThinkingSaveOk.value     = false;
    wThinkingSaveResult.value = `✗ Failed: ${e.message}`;
  }
}

async function runWorker(isContinue = false) {
  const task = wTaskInput.value.trim();
  if (!task) return;

  if (!isContinue) {
    wAgentLog.value     = [];
    wChatBuffer.value   = '';
    wBlueprint.value    = null;
    wWrittenFiles.value = [];
    wShowRaw.value      = false;
    wExpandedFiles.value = {};
    wViewMode.value      = 'all';
    wCurrentFileIdx.value = 0;
    wLastRawOutput.value = '';
    wTruncated.value    = false;
  } else {
    wAppendLog('▶', 'tag-wf', 'Continuing from truncated output…');
  }

  wRunning.value      = true;
  setWRunBadge('cyan', isContinue ? '● Continuing…' : '● Starting…', true);
  wProgressPct.value   = isContinue ? 50 : 5;
  wProgressIndet.value = true;

  if (!isContinue) {
    wAppendLog('💻', 'tag-wf', `Task: "${task.slice(0, 80)}${task.length > 80 ? '…' : ''}"`);
    wAppendLog('📁', 'tag-wf', `Workspace: ${debugWorkspacePath.value || 'workspace/debug'}`);
  }

  const body = { task };
  if (isContinue && wLastRawOutput.value) body.continueFrom = wLastRawOutput.value;

  try {
    const { data } = await axios.post('/api/worker/execute', body);
    if (data.debugWorkspace) debugWorkspacePath.value = data.debugWorkspace;
    wLastRawOutput.value = data.rawOutput || '';
    wTruncated.value     = Boolean(data.truncated);
    wAppendLog('✅', 'tag-done', `Execution complete — result: ${data.result || '(no result)'}`);
    if (wTruncated.value) {
      wAppendLog('⚠️', 'tag-error', 'Output truncated — model hit token limit. Use Continue to resume.');
    }
    // Parse written files from result string
    if (data.result && data.result.startsWith('Implemented')) {
      const match = data.result.match(/: (.+)$/);
      if (match) wWrittenFiles.value = match[1].split(', ').map(f => f.trim());
    }
    setWRunBadge(wTruncated.value ? 'yellow' : 'green', wTruncated.value ? '⚠ Truncated' : '✓ Complete');
    wProgressPct.value   = 100;
    wProgressIndet.value = false;
    wRunning.value       = false;
    // Parse blueprint from chat buffer
    setTimeout(tryParseBlueprint, 200);
  } catch (e) {
    wAppendLog('❌', 'tag-error', `Worker failed: ${e.response?.data?.error || e.message}`);
    setWRunBadge('red', '✗ Failed');
    wProgressPct.value   = 0;
    wProgressIndet.value = false;
    wRunning.value       = false;
  }
}

function wStopRun() {
  // Worker execute is synchronous HTTP — there's no run ID to abort.
  // Signal intent via log; the HTTP request will complete.
  wAppendLog('■', 'tag-error', 'Stop requested — worker will finish current HTTP call');
}

function wClearAll() {
  wAgentLog.value     = [];
  wChatBuffer.value   = '';
  wBlueprint.value    = null;
  wWrittenFiles.value = [];
  wShowRaw.value      = false;
  wExpandedFiles.value = {};
  wViewMode.value      = 'all';
  wCurrentFileIdx.value = 0;
  wProgressPct.value  = 0;
  wProgressIndet.value = false;
  wLastRawOutput.value = '';
  wTruncated.value    = false;
  setWRunBadge('grey', 'Idle');
}

// ── Planner tab state ─────────────────────────────────────────────────
const pGoalInput     = ref('Build a REST API with JWT authentication and CRUD endpoints');
const pRunning       = ref(false);
const pRunBadgeText  = ref('Idle');
const pRunBadgeClass = ref('badge-grey');
const pRunPulse      = ref(false);
const pProgressPct   = ref(0);
const pProgressIndet = ref(false);
const pProgressWidth = computed(() => pProgressIndet.value ? '60%' : pProgressPct.value + '%');
const pProgressTransition = computed(() => pProgressIndet.value ? 'width 2s ease' : 'width .4s ease');
const pAgentLog      = ref([]);
const pBackendLog    = ref([]);
const pLogStreamEl   = ref(null);
const pBackendLogEl  = ref(null);
const pPlan          = ref(null);
const pShowRaw       = ref(false);
const pRecentPlans   = ref([]);
const pSelectedHistoryPlan = ref(null);

function setPRunBadge(color, text, pulse = false) {
  pRunBadgeClass.value = `badge-${color}`;
  pRunBadgeText.value  = text;
  pRunPulse.value      = pulse;
}
function pAppendLog(icon, tag, msg) {
  pAgentLog.value.push({ ts: ts(), icon, tag, msg });
  nextTick(() => { if (pLogStreamEl.value) pLogStreamEl.value.scrollTop = pLogStreamEl.value.scrollHeight; });
}
function pAppendBackendLog(level, source, msg, highlight) {
  pBackendLog.value.push({ ts: ts(), level, source, msg, highlight });
  if (pBackendLog.value.length > 500) pBackendLog.value.splice(0, 100);
  nextTick(() => { if (pBackendLogEl.value) pBackendLogEl.value.scrollTop = pBackendLogEl.value.scrollHeight; });
}
function parsePlanGoal(plan) {
  try {
    const d = typeof plan.plan_json === 'string' ? JSON.parse(plan.plan_json) : plan;
    return d.goal || plan.goal || '(no goal)';
  } catch { return plan.goal || '(no goal)'; }
}
function parsePlanStepCount(plan) {
  try {
    const d = typeof plan.plan_json === 'string' ? JSON.parse(plan.plan_json) : plan;
    return (d.steps || []).length;
  } catch { return 0; }
}
function loadHistoryPlan(p) {
  try {
    const d = typeof p.plan_json === 'string' ? JSON.parse(p.plan_json) : p;
    pPlan.value = { ...d, sessionId: p.session_id || d.sessionId };
    pSelectedHistoryPlan.value = p;
    pAppendLog('📋', 'tag-wf', `Loaded plan: ${parsePlanGoal(p)}`);
  } catch (e) {
    pAppendLog('❌', 'tag-error', `Failed to parse plan: ${e.message}`);
  }
}
async function fetchRecentPlans() {
  try {
    const { data } = await axios.get('/api/planner/plans');
    pRecentPlans.value = data;
  } catch { /* keep existing */ }
}
async function runPlanner() {
  const goal = pGoalInput.value.trim();
  if (!goal) return;
  pAgentLog.value = [];
  pPlan.value     = null;
  pShowRaw.value  = false;
  pRunning.value  = true;
  setPRunBadge('cyan', '● Planning…', true);
  pProgressPct.value   = 5;
  pProgressIndet.value = true;
  pAppendLog('📋', 'tag-wf', `Goal: "${goal}"`);
  try {
    const { data } = await axios.post('/api/planner/plan', { goal });
    pPlan.value = data;
    setPRunBadge('green', '✓ Complete');
    pProgressPct.value   = 100;
    pProgressIndet.value = false;
    pRunning.value       = false;
    pAppendLog('✅', 'tag-done', `Plan complete — ${(data.steps || []).length} steps generated`);
    fetchRecentPlans();
  } catch (e) {
    pAppendLog('❌', 'tag-error', `Planner failed: ${e.response?.data?.error || e.message}`);
    setPRunBadge('red', '✗ Failed');
    pProgressPct.value   = 0;
    pProgressIndet.value = false;
    pRunning.value       = false;
  }
}
function pClearAll() {
  pAgentLog.value      = [];
  pPlan.value          = null;
  pShowRaw.value       = false;
  pProgressPct.value   = 0;
  pProgressIndet.value = false;
  setPRunBadge('grey', 'Idle');
}

// ── Reviewer tab state ────────────────────────────────────────────────
const rvTaskInput    = ref('');
const rvContentInput = ref('');
const rvRunning      = ref(false);
const rvRunBadgeText  = ref('Idle');
const rvRunBadgeClass = ref('badge-grey');
const rvRunPulse      = ref(false);
const rvProgressPct   = ref(0);
const rvProgressIndet = ref(false);
const rvProgressWidth = computed(() => rvProgressIndet.value ? '60%' : rvProgressPct.value + '%');
const rvProgressTransition = computed(() => rvProgressIndet.value ? 'width 2s ease' : 'width .4s ease');
const rvAgentLog     = ref([]);
const rvBackendLog   = ref([]);
const rvLogStreamEl  = ref(null);
const rvBackendLogEl = ref(null);
const rvResult       = ref(null);

function setRvRunBadge(color, text, pulse = false) {
  rvRunBadgeClass.value = `badge-${color}`;
  rvRunBadgeText.value  = text;
  rvRunPulse.value      = pulse;
}
function rvAppendLog(icon, tag, msg) {
  rvAgentLog.value.push({ ts: ts(), icon, tag, msg });
  nextTick(() => { if (rvLogStreamEl.value) rvLogStreamEl.value.scrollTop = rvLogStreamEl.value.scrollHeight; });
}
function rvAppendBackendLog(level, source, msg, highlight) {
  rvBackendLog.value.push({ ts: ts(), level, source, msg, highlight });
  if (rvBackendLog.value.length > 500) rvBackendLog.value.splice(0, 100);
  nextTick(() => { if (rvBackendLogEl.value) rvBackendLogEl.value.scrollTop = rvBackendLogEl.value.scrollHeight; });
}
async function runReviewer() {
  const content = rvContentInput.value.trim();
  const task    = rvTaskInput.value.trim();
  if (!content || !task) return;
  rvAgentLog.value      = [];
  rvResult.value        = null;
  rvRunning.value       = true;
  setRvRunBadge('cyan', '● Reviewing…', true);
  rvProgressPct.value   = 5;
  rvProgressIndet.value = true;
  rvAppendLog('🔍', 'tag-wf', `Task: "${task}" — ${content.length} chars to review`);
  try {
    const { data } = await axios.post('/api/reviewer/review', { content, task });
    rvResult.value        = data;
    rvProgressPct.value   = 100;
    rvProgressIndet.value = false;
    rvRunning.value       = false;
    const verdict = data.approved ? '✅ Approved' : '❌ Rejected';
    setRvRunBadge(data.approved ? 'green' : 'red', data.approved ? '✓ Approved' : '✗ Rejected');
    rvAppendLog(data.approved ? '✅' : '❌', data.approved ? 'tag-done' : 'tag-error',
      `${verdict} — score ${data.score}/10`);
  } catch (e) {
    rvAppendLog('❌', 'tag-error', `Reviewer failed: ${e.response?.data?.error || e.message}`);
    setRvRunBadge('red', '✗ Failed');
    rvProgressPct.value   = 0;
    rvProgressIndet.value = false;
    rvRunning.value       = false;
  }
}
function rvClearAll() {
  rvAgentLog.value      = [];
  rvResult.value        = null;
  rvProgressPct.value   = 0;
  rvProgressIndet.value = false;
  setRvRunBadge('grey', 'Idle');
}

// ── Socket listeners ──────────────────────────────────────────────────
function onConnect() {
  connBadgeText.value  = '● Connected';
  connBadgeClass.value = 'badge-green';
  connPulse.value      = false;
  socketStatusHtml.value = `<span style="color:#10B981">Connected</span> — id: <code>${socket.id}</code>`;
}
function onDisconnect() {
  connBadgeText.value  = '● Disconnected';
  connBadgeClass.value = 'badge-red';
  connPulse.value      = false;
  socketStatusHtml.value = `<span style="color:#EF4444">Disconnected</span>`;
}
function onConnectError(err) {
  connBadgeText.value  = '● Error';
  connBadgeClass.value = 'badge-red';
  socketStatusHtml.value = `<span style="color:#EF4444">Cannot connect: ${err.message}</span>`;
}
function onAgentStatus(data) {
  // ── Researcher tab ───────────────────────────────────────
  if (data.agentId === 'researcher') {
    const isMCP = data.currentTask && (data.currentTask.includes('MCP') || data.currentTask.includes('Browsing') || data.currentTask.includes('Processing web'));
    appendLog(isMCP ? '🌐' : '⚡', isMCP ? 'tag-mcp' : 'tag-status', `[${data.agentId}] ${data.status}${data.currentTask ? ': ' + data.currentTask : ''}`);
    if (!researchOnly.value) {
      if (data.status === 'idle') {
        setRunBadge('green', '✓ Complete');
        progressPct.value   = 100;
        progressIndet.value = false;
        running.value       = false;
        setTimeout(tryParseFromChat, 300);
      } else if (data.status === 'working') {
        progressIndet.value = true;
      }
    }
  }
  // ── Worker tab ────────────────────────────────────────────
  if (data.agentId === 'worker') {
    wAppendLog('⚡', 'tag-status', `[worker] ${data.status}${data.currentTask ? ': ' + data.currentTask : ''}`);
    if (data.status === 'working') {
      wProgressIndet.value = true;
      setWRunBadge('cyan', '● Working…', true);
    }
  }
  // ── Planner tab ───────────────────────────────────────────
  if (data.agentId === 'planner') {
    pAppendLog('⚡', 'tag-status', `[planner] ${data.status}${data.currentTask ? ': ' + data.currentTask : ''}`);
    if (data.status === 'working') {
      pProgressIndet.value = true;
      setPRunBadge('cyan', '● Working…', true);
    }
  }
  // ── Reviewer tab ──────────────────────────────────────────
  if (data.agentId === 'reviewer') {
    rvAppendLog('⚡', 'tag-status', `[reviewer] ${data.status}${data.currentTask ? ': ' + data.currentTask : ''}`);
    if (data.status === 'working') {
      rvProgressIndet.value = true;
      setRvRunBadge('cyan', '● Reviewing…', true);
    }
  }
}
function onChatChunk(data) {
  if (data.agentId === 'researcher') {
    chatBuffer.value += data.chunk;
    nextTick(() => { if (chatStreamEl.value) chatStreamEl.value.scrollTop = chatStreamEl.value.scrollHeight; });
  }
  if (data.agentId === 'worker') {
    wChatBuffer.value += data.chunk;
    nextTick(() => { if (wChatStreamEl.value) wChatStreamEl.value.scrollTop = wChatStreamEl.value.scrollHeight; });
  }
}
function onWorkflowStarted(data) {
  appendLog('🔄', 'tag-wf', `workflow:started runId=${data.runId}`);
  setRunBadge('cyan', '● Running', true);
  progressPct.value   = 15;
  progressIndet.value = false;
  chatBuffer.value    = '';
}
function onNodeComplete(data) {
  if (data.node === 'researcher') {
    appendLog('✅', 'tag-done', `researcher node complete`);
    progressPct.value   = 40;
    progressIndet.value = false;
    if (data.state?.researchFindings) findings.value = data.state.researchFindings;
  }
}
function onWorkflowComplete() {
  appendLog('🏁', 'tag-done', `workflow:complete`);
  setRunBadge('green', '✓ Done');
  progressPct.value   = 100;
  progressIndet.value = false;
  running.value       = false;
  setTimeout(tryParseFromChat, 300);
}
function onWorkflowStopped() {
  appendLog('■', 'tag-error', 'workflow stopped by user');
  setRunBadge('yellow', '■ Stopped');
  progressPct.value   = 0;
  progressIndet.value = false;
  running.value       = false;
}
function onWorkflowError(data) {
  appendLog('❌', 'tag-error', `workflow error: ${data.error || 'unknown'}`);
  setRunBadge('red', '✗ Error');
  running.value = false;
}
function onWebSources(data) {
  webSources.value = data.sources || [];
}
function onDeepContext(data) {
  deepSections.value = data.sections || [];
  appendLog('🧠', 'tag-wf', `Deep context ready — ${deepSections.value.length} section(s) compiled for LLM`);
}
function onMemorySaved(data) {
  memorySaved.value = data;
  appendLog('💾', 'tag-done', `Memory saved — STM: ${data.stm} entry, LTM: ${data.ltm} entries`);
}
function onLogEntry(entry) {
  const researcherHighlight = entry.agentId === 'researcher' || (entry.message || '').toLowerCase().includes('researcher') || (entry.message || '').toLowerCase().includes('mcp');
  appendBackendLog(entry.level, entry.agentId || '—', entry.message, researcherHighlight);

  const workerHighlight = entry.agentId === 'worker' || (entry.message || '').toLowerCase().includes('worker') || (entry.message || '').toLowerCase().includes('blueprint') || (entry.message || '').toLowerCase().includes('wrote:');
  wAppendBackendLog(entry.level, entry.agentId || '—', entry.message, workerHighlight);

  const plannerHighlight = entry.agentId === 'planner' || (entry.message || '').toLowerCase().includes('planner') || (entry.message || '').toLowerCase().includes('plan');
  pAppendBackendLog(entry.level, entry.agentId || '—', entry.message, plannerHighlight);

  const reviewerHighlight = entry.agentId === 'reviewer' || (entry.message || '').toLowerCase().includes('reviewer') || (entry.message || '').toLowerCase().includes('review');
  rvAppendBackendLog(entry.level, entry.agentId || '—', entry.message, reviewerHighlight);
}

onMounted(async () => {
  socket.on('connect',               onConnect);
  socket.on('disconnect',            onDisconnect);
  socket.on('connect_error',         onConnectError);
  socket.on('agent:status',          onAgentStatus);
  socket.on('chat:response_chunk',   onChatChunk);
  socket.on('workflow:started',      onWorkflowStarted);
  socket.on('workflow:node_complete', onNodeComplete);
  socket.on('workflow:complete',     onWorkflowComplete);
  socket.on('workflow:stopped',      onWorkflowStopped);
  socket.on('workflow:error',        onWorkflowError);
  socket.on('researcher:web_sources',  onWebSources);
  socket.on('researcher:deep_context',  onDeepContext);
  socket.on('researcher:memory_saved',  onMemorySaved);
  socket.on('log:entry',               onLogEntry);

  if (socket.connected) onConnect();

  setTimeout(async () => {
    await checkBackend();
    await checkMCPSetting();
    await wCheckBackend();
    fetchRecentPlans();
  }, 500);
});

onUnmounted(() => {
  socket.off('connect',               onConnect);
  socket.off('disconnect',            onDisconnect);
  socket.off('connect_error',         onConnectError);
  socket.off('agent:status',          onAgentStatus);
  socket.off('chat:response_chunk',   onChatChunk);
  socket.off('workflow:started',      onWorkflowStarted);
  socket.off('workflow:node_complete', onNodeComplete);
  socket.off('workflow:complete',     onWorkflowComplete);
  socket.off('workflow:stopped',      onWorkflowStopped);
  socket.off('workflow:error',        onWorkflowError);
  socket.off('researcher:web_sources',  onWebSources);
  socket.off('researcher:deep_context',  onDeepContext);
  socket.off('researcher:memory_saved',  onMemorySaved);
  socket.off('log:entry',               onLogEntry);
});
</script>

<style scoped>
/* ── Root ────────────────────────────────────────────────────────────── */
.debug-root {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: #08080F;
}

/* ── Tab bar ─────────────────────────────────────────────────────────── */
.debug-tabs {
  display: flex; gap: 2px;
  padding: 8px 20px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: #0D0D1A; flex-shrink: 0;
}
.debug-tab {
  display: flex; align-items: center;
  padding: 6px 16px 8px;
  font-size: 12px; font-weight: 600;
  color: rgba(226,232,240,0.4);
  background: transparent; border: none; cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.debug-tab:hover { color: rgba(226,232,240,0.75); }
.debug-tab--active { color: #22D3EE !important; border-bottom-color: #22D3EE !important; }

/* ── Tab body ────────────────────────────────────────────────────────── */
.tab-body {
  flex: 1; overflow-y: auto;
  padding: 20px 24px 40px;
  display: flex; flex-direction: column; gap: 0;
}

/* ── Page title ──────────────────────────────────────────────────────── */
.dbg-title {
  display: flex; align-items: flex-start; gap: 12px;
  margin-bottom: 20px;
}
.dbg-title__name { font-size: 17px; font-weight: 700; color: #E2E8F0; }
.dbg-title__sub  { font-size: 12px; color: rgba(226,232,240,0.4); margin-top: 2px; line-height: 1.5; }

/* ── Section label ───────────────────────────────────────────────────── */
.section-label {
  font-size: 10px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.12em;
  color: rgba(226,232,240,0.3);
  padding: 16px 0 8px;
  display: flex; align-items: center; gap: 8px;
}
.section-label::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.05); }
.section-sub { font-size: 9px; font-weight: 400; text-transform: none; letter-spacing: 0; color: rgba(34,211,238,0.5); }

/* ── Card ────────────────────────────────────────────────────────────── */
.card {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; overflow: hidden;
  margin-bottom: 4px;
}
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: rgba(255,255,255,0.02);
}
.card-header-left { display: flex; align-items: center; gap: 8px; }
.card-title  { font-size: 13px; font-weight: 600; color: #E2E8F0; }
.card-subtitle { font-size: 12px; font-weight: 700; color: rgba(226,232,240,0.7); margin-bottom: 10px; }

/* ── Badge ───────────────────────────────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700;
  padding: 3px 10px; border-radius: 20px;
}
.badge-grey  { background: rgba(255,255,255,0.06); color: rgba(226,232,240,0.4); }
.badge-green { background: rgba(16,185,129,0.1); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
.badge-cyan  { background: rgba(34,211,238,0.1); color: #22D3EE; border: 1px solid rgba(34,211,238,0.3); }
.badge-red   { background: rgba(239,68,68,0.1);  color: #EF4444; border: 1px solid rgba(239,68,68,0.3); }
.badge-yellow{ background: rgba(245,158,11,0.1); color: #F59E0B; border: 1px solid rgba(245,158,11,0.3); }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }
.dot-pulse { animation: pulse 1.2s ease-in-out infinite; }

/* ── Stat grid (section 1) ───────────────────────────────────────────── */
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
.stat-item { padding: 12px 16px; border-right: 1px solid rgba(255,255,255,0.04); }
.stat-item:last-child { border-right: none; }
.stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(226,232,240,0.3); margin-bottom: 6px; }
.stat-value { font-size: 12px; line-height: 1.5; }

/* ── Buttons ─────────────────────────────────────────────────────────── */
.btn-row { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.04); }
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 14px; border-radius: 7px;
  font-size: 12px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent;
  transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: default; }
.btn:not(:disabled):hover { opacity: 0.85; }
.btn-cyan   { background: rgba(34,211,238,0.1);  color: #22D3EE; border-color: rgba(34,211,238,0.3); }
.btn-grey   { background: rgba(255,255,255,0.06); color: rgba(226,232,240,0.6); }
.btn-green  { background: rgba(16,185,129,0.1);  color: #10B981; border-color: rgba(16,185,129,0.3); }
.btn-red    { background: rgba(239,68,68,0.1);   color: #EF4444; border-color: rgba(239,68,68,0.3); }
.btn-orange { background: rgba(245,158,11,0.1);  color: #F59E0B; border-color: rgba(245,158,11,0.3); }

/* ── Info / warn boxes ───────────────────────────────────────────────── */
.info-box {
  margin: 12px 16px;
  padding: 12px 14px;
  background: rgba(99,102,241,0.04); border: 1px solid rgba(99,102,241,0.15);
  border-radius: 8px; font-size: 12px; color: rgba(226,232,240,0.7); line-height: 1.6;
}
.warn-box {
  margin: 12px 16px;
  padding: 10px 14px;
  background: rgba(245,158,11,0.04); border: 1px solid rgba(245,158,11,0.15);
  border-radius: 8px; font-size: 11px; color: rgba(245,158,11,0.8); line-height: 1.6;
}

/* ── MCP toggle ──────────────────────────────────────────────────────── */
.toggle-row { display: flex; align-items: center; gap: 12px; padding: 8px 16px; }
.toggle { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0; border-radius: 22px;
  background: rgba(255,255,255,0.1); cursor: pointer; transition: 0.2s;
}
.slider::before {
  content: ''; position: absolute;
  width: 16px; height: 16px; left: 3px; bottom: 3px;
  border-radius: 50%; background: #E2E8F0; transition: 0.2s;
}
input:checked + .slider { background: rgba(34,211,238,0.4); }
input:checked + .slider::before { transform: translateX(18px); background: #22D3EE; }
.toggle-label { font-size: 13px; font-weight: 600; }
.mcp-save-result { padding: 2px 16px 8px; font-size: 11px; font-family: monospace; }
.text-green { color: #10B981; }
.text-red   { color: #EF4444; }

/* ── Mode toggle (Research only / Full workflow) ─────────────────────── */
.card-header-right { display: flex; align-items: center; gap: 12px; }
.mode-toggle-row   { display: flex; align-items: center; gap: 8px; }
.toggle--sm        { width: 32px; height: 18px; }
.toggle--sm .slider::before { width: 12px; height: 12px; left: 3px; bottom: 3px; }
.toggle--sm input:checked + .slider::before { transform: translateX(14px); }
.mode-toggle-label { font-size: 11px; font-weight: 700; transition: color 0.2s; white-space: nowrap; }

/* ── Research run ────────────────────────────────────────────────────── */
.input-row { display: flex; gap: 8px; padding: 12px 16px; align-items: center; }
.goal-input {
  flex: 1; padding: 7px 12px; border-radius: 7px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  color: #E2E8F0; font-size: 13px; outline: none;
}
.goal-input:focus { border-color: rgba(34,211,238,0.4); }
.progress-bar { height: 3px; background: rgba(255,255,255,0.06); margin: 0 16px; border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #22D3EE, #6366F1); border-radius: 2px; width: 0; }

.log-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.04); }
.log-grid > div { border-right: 1px solid rgba(255,255,255,0.04); }
.log-grid > div:last-child { border-right: none; }
.log-header { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(226,232,240,0.3); padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.log-stream { height: 220px; overflow-y: auto; padding: 6px 4px; }
.log-stream--mono { font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; color: rgba(226,232,240,0.7); padding: 10px 14px; }
.log-line { display: flex; align-items: flex-start; gap: 6px; padding: 2px 10px; font-size: 11px; line-height: 1.6; }
.log-ts  { color: rgba(255,255,255,0.2); flex-shrink: 0; font-family: monospace; }
.log-tag { flex-shrink: 0; font-size: 13px; }
.log-msg { color: rgba(226,232,240,0.75); word-break: break-word; }
.tag-wf     { filter: hue-rotate(200deg); }
.tag-mcp    { filter: hue-rotate(180deg); }
.tag-status { }
.tag-done   { }
.tag-error  { filter: saturate(2); }

/* ── Sources ─────────────────────────────────────────────────────────── */
.sources-list { display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; }
.source-card {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07);
  border-left-width: 2px; border-radius: 8px; padding: 10px 12px;
}
.source-card__top { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; flex-wrap: wrap; }
.source-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; background: rgba(255,255,255,0.06); border-radius: 5px; }
.source-idx  { font-size: 10px; color: rgba(255,255,255,0.2); font-family: monospace; }
.source-loading { font-size: 10px; color: #F59E0B; }
.source-ok      { font-size: 10px; color: #10B981; }
.source-url { display: block; font-size: 11px; font-family: monospace; word-break: break-all; text-decoration: none; opacity: 0.85; line-height: 1.5; }
.source-snippet { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: rgba(226,232,240,0.5); line-height: 1.65; max-height: 80px; overflow: hidden; }
.empty-hint { padding: 12px 16px; font-size: 12px; color: rgba(226,232,240,0.35); }

/* ── Search Result Summary ───────────────────────────────────────────── */
.srsum-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.srsum-stat {
  padding: 14px 16px;
  border-right: 1px solid rgba(255,255,255,0.04);
  text-align: center;
}
.srsum-stat:last-child { border-right: none; }
.srsum-stat__num   { font-size: 22px; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }
.srsum-stat__label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(226,232,240,0.3); }

.srsum-groups { display: flex; flex-direction: column; gap: 0; }
.srsum-group {
  padding: 12px 16px;
  border-left: 2px solid transparent;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}
.srsum-group:last-child { border-bottom: none; }
.srsum-group:hover { background: rgba(255,255,255,0.015); }
.srsum-group__header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.srsum-group__icon   { font-size: 15px; }
.srsum-group__label  { font-size: 13px; font-weight: 700; }
.srsum-group__badge  {
  font-size: 10px; font-weight: 700; padding: 2px 8px;
  border: 1px solid; border-radius: 20px; opacity: 0.85;
}
.srsum-group__read   { font-size: 10px; color: #10B981; font-weight: 600; background: rgba(16,185,129,0.08); padding: 2px 7px; border-radius: 20px; }
.srsum-group__snippet {
  font-size: 11px; color: rgba(226,232,240,0.6); line-height: 1.65;
  padding-left: 2px; border-left: 2px solid rgba(255,255,255,0.07);
  padding-left: 10px; margin-left: 2px;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.srsum-group__no-snippet { font-size: 10px; color: rgba(226,232,240,0.2); padding-left: 12px; font-style: italic; }

/* ── Deep Research Phase ─────────────────────────────────────────────── */
.deep-summary-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 12px; color: rgba(226,232,240,0.5);
}
.deep-summary-sep  { color: rgba(255,255,255,0.15); }
.deep-summary-item { display: flex; align-items: center; gap: 5px; }
.deep-summary-item span { font-weight: 800; font-size: 14px; }

.deep-memory-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 16px;
  background: rgba(16,185,129,0.06); border-bottom: 1px solid rgba(16,185,129,0.15);
  font-size: 12px; color: rgba(226,232,240,0.6);
}
.deep-memory-banner--pending {
  background: rgba(255,255,255,0.02); border-bottom-color: rgba(255,255,255,0.05);
  color: rgba(226,232,240,0.3);
}
.deep-mem-pill {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px;
}
.deep-mem-pill--stm { background: rgba(99,102,241,0.12); color: #818CF8; border: 1px solid rgba(99,102,241,0.25); }
.deep-mem-pill--ltm { background: rgba(16,185,129,0.1);  color: #10B981; border: 1px solid rgba(16,185,129,0.25); }

.deep-sections { display: flex; flex-direction: column; }
.deep-section {
  border-left: 2px solid transparent;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.deep-section:last-child { border-bottom: none; }

.deep-section__header {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 16px; cursor: pointer;
  transition: background 0.15s;
}
.deep-section__header:hover { background: rgba(255,255,255,0.02); }
.deep-section__icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.deep-section__meta { flex: 1; min-width: 0; }
.deep-section__label { font-size: 12px; font-weight: 700; line-height: 1.4; }
.deep-section__url   { font-size: 10px; font-family: monospace; color: rgba(226,232,240,0.35); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.deep-section__right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.deep-section__kind  { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; }
.kind-page   { background: rgba(34,211,238,0.08); color: #22D3EE; }
.kind-search { background: rgba(245,158,11,0.08); color: #F59E0B; }
.deep-section__chars { font-size: 10px; color: rgba(226,232,240,0.25); font-family: monospace; }

.deep-section__preview {
  padding: 0 16px 12px 42px;
  font-size: 11px; color: rgba(226,232,240,0.4); line-height: 1.65;
  font-family: 'JetBrains Mono', monospace;
  white-space: pre-wrap; word-break: break-word;
}
.deep-section__content { padding: 0 16px 12px 16px; }
.deep-section__pre {
  background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px; padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.65;
  color: rgba(226,232,240,0.75); white-space: pre-wrap; word-break: break-word;
  max-height: 500px; overflow-y: auto;
}

/* ── Findings ────────────────────────────────────────────────────────── */
.findings-grid  { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
.findings-field .findings-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(226,232,240,0.3); margin-bottom: 4px; }
.findings-val   { font-size: 12px; color: rgba(226,232,240,0.85); line-height: 1.7; }
.findings-section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(226,232,240,0.3); padding: 12px 16px 6px; border-top: 1px solid rgba(255,255,255,0.04); }
.approaches-list { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 12px; }
.approach-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px; }
.approach-name { font-weight: 800; font-size: 14px; color: #A78BFA; margin-bottom: 10px; }
.approach-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.col-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.col-label--green { color: #10B981; }
.col-label--red   { color: #EF4444; }
.bullet-item { font-size: 11px; color: rgba(255,255,255,0.7); margin-bottom: 4px; }
.recommended-box { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; margin: 8px 16px; background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; }
.recommended-text { font-size: 13px; color: #10B981; font-weight: 500; line-height: 1.6; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 14px 16px; }
.challenges-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; padding: 0 16px 12px; }
.challenge-item { font-size: 11px; color: rgba(239,68,68,0.85); padding: 8px 12px; background: rgba(239,68,68,0.04); border: 1px solid rgba(239,68,68,0.12); border-radius: 6px; display: flex; gap: 6px; align-items: flex-start; }
.source-link-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; text-decoration: none; margin-bottom: 6px; transition: background 0.15s; }
.source-link-row:hover { background: rgba(255,255,255,0.04); }
.source-domain-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; background: rgba(255,255,255,0.05); border-radius: 4px; color: rgba(226,232,240,0.4); flex-shrink: 0; }
.source-link-url { font-size: 11px; font-family: monospace; color: #22D3EE; word-break: break-all; opacity: 0.8; }
.raw-json-toggle { padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.04); }
.raw-json { padding: 14px 16px; background: rgba(0,0,0,0.4); font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.6; color: rgba(226,232,240,0.7); white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; }

/* ── Diag rows ───────────────────────────────────────────────────────── */
.diag-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: rgba(226,232,240,0.7); margin-bottom: 8px; line-height: 1.6; }
.diag-dot { flex-shrink: 0; font-size: 14px; }

/* ── Pill list ───────────────────────────────────────────────────────── */
.pill-list { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { font-size: 11px; font-weight: 600; padding: 3px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #22D3EE; }

/* ── Code block ──────────────────────────────────────────────────────── */
.code-block {
  background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 8px; padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.7;
  color: rgba(226,232,240,0.65); white-space: pre-wrap; word-break: break-word;
  margin: 0 16px;
}
.section-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 16px 0; }

/* ── Backend log ─────────────────────────────────────────────────────── */
.backend-log {
  height: 220px; overflow-y: auto;
  background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.04);
  padding: 10px 14px;
}
.backend-log__line { font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.7; }
.backend-log__ts  { color: rgba(255,255,255,0.2); margin-right: 6px; }
.backend-log__src { color: rgba(255,255,255,0.3); margin-right: 6px; }

/* ── Debug workspace banner (both tabs) ─────────────────────────────── */
.debug-workspace-banner {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 8px 14px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 12px; color: rgba(226,232,240,0.5);
}
.debug-workspace-path {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: #22D3EE; background: rgba(34,211,238,0.07);
  padding: 1px 7px; border-radius: 4px;
  border: 1px solid rgba(34,211,238,0.2);
}
.debug-workspace-hint {
  font-size: 10px; color: rgba(226,232,240,0.25); font-style: italic;
}

/* ── Worker tab ──────────────────────────────────────────────────────── */
.worker-input-area { padding: 12px 16px 0; }
.worker-textarea {
  width: 100%; min-height: 110px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  color: #E2E8F0; font-size: 13px; font-family: inherit;
  line-height: 1.6; resize: vertical; outline: none;
}
.worker-textarea:focus { border-color: rgba(16,185,129,0.4); }
.worker-textarea:disabled { opacity: 0.5; cursor: not-allowed; }

/* Blueprint summary stats */
.bp-summary {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.bp-stat { padding: 14px 16px; border-right: 1px solid rgba(255,255,255,0.04); text-align: center; }
.bp-stat:last-child { border-right: none; }
.bp-stat__num   { font-size: 22px; font-weight: 800; line-height: 1.1; margin-bottom: 4px; }
.bp-stat__label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(226,232,240,0.3); }

.bp-summary-text {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 16px;
  font-size: 12px; color: rgba(245,158,11,0.9);
  background: rgba(245,158,11,0.03); border-bottom: 1px solid rgba(245,158,11,0.1);
}

.bp-written-banner {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 9px 16px;
  background: rgba(16,185,129,0.05); border-bottom: 1px solid rgba(16,185,129,0.15);
  font-size: 12px; color: rgba(226,232,240,0.6);
}
.bp-written-banner--warn {
  background: rgba(245,158,11,0.04); border-bottom-color: rgba(245,158,11,0.15);
  color: rgba(245,158,11,0.8);
}
.bp-file-pill {
  font-size: 10px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
  padding: 2px 8px; background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.25); border-radius: 4px; color: #10B981;
}

/* Blueprint file cards */
.bp-files { display: flex; flex-direction: column; }
.bp-file {
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.bp-file:last-child { border-bottom: none; }
.bp-file__header {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; cursor: pointer;
  transition: background 0.15s;
}
.bp-file__header:hover { background: rgba(255,255,255,0.02); }
.bp-file__icon { font-size: 16px; flex-shrink: 0; }
.bp-file__path {
  flex: 1; font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
  color: #A78BFA; word-break: break-all;
}
.bp-file__meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.bp-file__lines, .bp-file__chars {
  font-size: 10px; color: rgba(226,232,240,0.3); font-family: monospace;
}
.bp-written-ok      { font-size: 10px; font-weight: 700; color: #10B981; }
.bp-written-pending { font-size: 10px; color: rgba(226,232,240,0.25); }
.bp-file__preview {
  padding: 0 16px 12px 42px;
  font-size: 11px; color: rgba(226,232,240,0.4); line-height: 1.65;
  font-family: 'JetBrains Mono', monospace;
  white-space: pre-wrap; word-break: break-word;
}
.bp-file__content { padding: 0 16px 12px 16px; }
.bp-file__pre {
  background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px; padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.65;
  color: rgba(226,232,240,0.8); white-space: pre-wrap; word-break: break-word;
  max-height: 500px; overflow-y: auto;
}

/* View mode toggle */
.view-mode-toggle { display: flex; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
.view-mode-btn {
  padding: 4px 10px; font-size: 11px; font-weight: 600;
  background: transparent; color: rgba(226,232,240,0.4); border: none; cursor: pointer;
  display: flex; align-items: center; gap: 4px; transition: background 0.15s, color 0.15s;
}
.view-mode-btn:hover { background: rgba(255,255,255,0.05); color: rgba(226,232,240,0.8); }
.view-mode-btn--active { background: rgba(167,139,250,0.15); color: #A78BFA; }

/* File by file step view */
.bp-step { display: flex; flex-direction: column; gap: 0; }
.bp-step__nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.01);
}
.bp-step__counter {
  display: flex; align-items: baseline; gap: 4px;
  font-family: 'JetBrains Mono', monospace;
}
.bp-step__idx   { font-size: 22px; font-weight: 800; color: #A78BFA; line-height: 1; }
.bp-step__sep   { font-size: 14px; color: rgba(226,232,240,0.25); }
.bp-step__total { font-size: 14px; color: rgba(226,232,240,0.4); }
.bp-step__pills {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.bp-step__pill {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; font-size: 14px; cursor: pointer;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  transition: background 0.15s, border-color 0.15s;
}
.bp-step__pill:hover { background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.3); }
.bp-step__pill--active { background: rgba(167,139,250,0.18); border-color: #A78BFA; }
.bp-step__pill--done { border-color: rgba(16,185,129,0.4); }
.bp-step__pill--active.bp-step__pill--done { background: rgba(16,185,129,0.12); border-color: #10B981; }
.bp-step__file { display: flex; flex-direction: column; }
.bp-step__file-header {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.015);
}
.bp-step__path {
  font-size: 13px; font-weight: 700; font-family: 'JetBrains Mono', monospace;
  color: #A78BFA; word-break: break-all;
}
.bp-step__pre {
  background: rgba(0,0,0,0.35); margin: 12px 16px;
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
  padding: 14px 16px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.65;
  color: rgba(226,232,240,0.85); white-space: pre-wrap; word-break: break-word;
  max-height: 600px; overflow-y: auto;
}

/* ── Planner tab ─────────────────────────────────────────────────────── */
.btn-purple { background: rgba(167,139,250,0.1); color: #A78BFA; border-color: rgba(167,139,250,0.3); }
.badge-purple { background: rgba(167,139,250,0.1); color: #A78BFA; border: 1px solid rgba(167,139,250,0.3); }
.progress-fill--purple { background: linear-gradient(90deg, #7C3AED, #A78BFA); }

.plan-meta {
  display: flex; flex-wrap: wrap; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.plan-meta__item { display: flex; flex-direction: column; gap: 3px; }
.plan-meta__item--wide { flex: 1; min-width: 200px; }
.plan-meta__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(226,232,240,0.35); }
.plan-meta__val { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.9); }

.steps-list { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; }
.step-card {
  background: rgba(167,139,250,0.04);
  border: 1px solid rgba(167,139,250,0.12);
  border-radius: 8px; padding: 10px 14px;
}
.step-card__header {
  display: flex; align-items: flex-start; gap: 10px;
}
.step-num {
  flex-shrink: 0;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(167,139,250,0.15); border: 1px solid rgba(167,139,250,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #A78BFA;
}
.step-id {
  flex-shrink: 0;
  font-size: 10px; color: rgba(226,232,240,0.3);
  padding-top: 4px;
}
.step-desc { flex: 1; font-size: 13px; color: rgba(226,232,240,0.85); line-height: 1.5; }
.step-agent-badge {
  flex-shrink: 0;
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
  padding: 2px 7px; border-radius: 10px;
  background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.2); color: #22D3EE;
}
.step-deps {
  display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
  margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.step-deps__label { color: rgba(226,232,240,0.35); }
.step-dep-pill {
  padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 600;
  background: rgba(255,255,255,0.06); color: rgba(226,232,240,0.5);
  border: 1px solid rgba(255,255,255,0.08);
}

.plan-history-list { display: flex; flex-direction: column; }
.plan-history-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  cursor: pointer; transition: background 0.12s;
}
.plan-history-row:last-child { border-bottom: none; }
.plan-history-row:hover { background: rgba(167,139,250,0.04); }
.plan-history-row--active { background: rgba(167,139,250,0.07) !important; border-left: 2px solid #A78BFA; padding-left: 14px; }
.plan-history-row__goal {
  flex: 1; font-size: 12px; color: rgba(226,232,240,0.75);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.plan-history-row__steps {
  font-size: 11px; font-weight: 600; color: #A78BFA; flex-shrink: 0;
}

/* ── Reviewer tab ─────────────────────────────────────────────────────── */
.btn-amber { background: rgba(245,158,11,0.1); color: #F59E0B; border-color: rgba(245,158,11,0.3); }
.badge-amber { background: rgba(245,158,11,0.1); color: #F59E0B; border: 1px solid rgba(245,158,11,0.3); }
.progress-fill--amber { background: linear-gradient(90deg, #B45309, #F59E0B); }

.review-inputs { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 12px; }

.rv-score-row {
  display: flex; align-items: flex-start; gap: 20px;
  padding: 16px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-wrap: wrap;
}
.rv-score-circle {
  flex-shrink: 0;
  width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  border: 3px solid;
}
.rv-score--pass { border-color: #10B981; background: rgba(16,185,129,0.08); }
.rv-score--fail { border-color: #EF4444; background: rgba(239,68,68,0.08); }
.rv-score-num { font-size: 22px; font-weight: 700; line-height: 1; }
.rv-score--pass .rv-score-num { color: #10B981; }
.rv-score--fail .rv-score-num { color: #EF4444; }
.rv-score-denom { font-size: 10px; color: rgba(226,232,240,0.35); }
.rv-score-meta { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
.rv-score-label { font-size: 16px; font-weight: 700; }
.rv-score-sub { font-size: 11px; color: rgba(226,232,240,0.4); }

.rv-dims { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 6px; }
.rv-dim-row { display: flex; align-items: center; gap: 10px; }
.rv-dim-label { font-size: 11px; color: rgba(226,232,240,0.5); width: 90px; flex-shrink: 0; text-transform: capitalize; }
.rv-dim-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.rv-dim-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
.rv-dim-val { font-size: 10px; font-weight: 600; color: rgba(226,232,240,0.5); width: 30px; text-align: right; flex-shrink: 0; }

.rv-feedback { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.rv-feedback__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(226,232,240,0.35); margin-bottom: 6px; }
.rv-feedback__text { font-size: 13px; color: rgba(226,232,240,0.85); line-height: 1.6; }

.rv-suggestions { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.rv-suggestion-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: rgba(245,158,11,0.04); border: 1px solid rgba(245,158,11,0.1);
  border-radius: 6px; padding: 8px 12px;
  font-size: 12px; color: rgba(226,232,240,0.8); line-height: 1.5;
}
.rv-suggestion-num {
  flex-shrink: 0;
  width: 18px; height: 18px; border-radius: 50%;
  background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #F59E0B;
}
</style>

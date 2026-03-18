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

    </div><!-- /tab-body -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();

const tabs = [
  { id: 'researcher', label: 'Researcher', icon: 'mdi-magnify' },
];
const activeTab = ref('researcher');

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
      appendLog('🆔', 'tag-wf', `runId: ${data.runId}`);
      appendLog('🆔', 'tag-wf', `sessionId: ${data.sessionId}`);
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
  if (data.agentId !== 'researcher') return;
  const isMCP = data.currentTask && (data.currentTask.includes('MCP') || data.currentTask.includes('Browsing') || data.currentTask.includes('Processing web'));
  appendLog(isMCP ? '🌐' : '⚡', isMCP ? 'tag-mcp' : 'tag-status', `[${data.agentId}] ${data.status}${data.currentTask ? ': ' + data.currentTask : ''}`);
  // In research-only mode the HTTP response drives completion; only update progress indicator here
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
function onChatChunk(data) {
  if (data.agentId !== 'researcher') return;
  chatBuffer.value += data.chunk;
  nextTick(() => { if (chatStreamEl.value) chatStreamEl.value.scrollTop = chatStreamEl.value.scrollHeight; });
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
  const highlight = entry.agentId === 'researcher' || (entry.message || '').toLowerCase().includes('researcher') || (entry.message || '').toLowerCase().includes('mcp');
  appendBackendLog(entry.level, entry.agentId || '—', entry.message, highlight);
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
</style>

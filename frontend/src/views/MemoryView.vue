<template>
  <div class="mem-root">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <div class="mem-header">
      <div class="mem-header__left">
        <div class="mem-header__title">Memory</div>
        <div class="mem-header__sub">Agent memory — conversation history, active context, learned knowledge</div>
      </div>
      <button class="icon-btn" :class="{ 'icon-btn--spin': loading }" @click="fetchAll" title="Refresh">
        <v-icon size="16">mdi-refresh</v-icon>
      </button>
    </div>

    <!-- ── Global Search ──────────────────────────────────────────────── -->
    <div class="gsearch-bar" :class="{ 'gsearch-bar--active': searchActive }">
      <div class="gsearch-wrap">
        <v-icon size="16" class="gsearch-icon" :color="searchActive ? '#818CF8' : 'rgba(226,232,240,0.3)'">mdi-magnify</v-icon>
        <input
          ref="searchInputRef"
          class="gsearch-input"
          placeholder="Search all agents — sessions, memories…"
          v-model="searchQuery"
          @keydown.escape="clearSearch"
          @keydown.enter="runGlobalSearch"
          autocomplete="off"
          spellcheck="false"
        />
        <button v-if="searchActive" class="gsearch-clear" @click="clearSearch" title="Clear (Esc)">
          <v-icon size="14">mdi-close</v-icon>
        </button>
        <div v-if="globalSearching" class="gsearch-spinner">
          <v-icon size="14" style="animation:spin 0.8s linear infinite">mdi-loading</v-icon>
        </div>
      </div>
    </div>

    <!-- ── Agent selector ─────────────────────────────────────────────── -->
    <template v-if="!searchActive">
    <div class="agent-bar">
      <button
        v-for="a in agents" :key="a"
        class="agent-btn"
        :class="{ 'agent-btn--active': activeAgent === a }"
        :style="activeAgent === a ? `--ac:${AGENT_COLORS[a]}` : ''"
        @click="activeAgent = a"
      >
        <span class="agent-btn__dot" :style="`background:${AGENT_COLORS[a]}`" />
        {{ a }}
        <span v-if="filteredSessions(a).length" class="agent-btn__count">{{ filteredSessions(a).length }}</span>
      </button>
    </div>

    <!-- ── Memory type tabs ────────────────────────────────────────────── -->
    <div class="mem-tabs">
      <button
        v-for="t in TABS" :key="t.id"
        class="mem-tab"
        :class="{ 'mem-tab--active': activeTab === t.id, [`mem-tab--${t.id}`]: true }"
        @click="activeTab = t.id"
      >
        <v-icon size="14">{{ t.icon }}</v-icon>
        {{ t.label }}
        <span class="mem-tab__badge" v-if="t.badge()">{{ t.badge() }}</span>
      </button>
    </div>

    <!-- ── Tab content ─────────────────────────────────────────────────── -->
    <div class="mem-body">

      <!-- ────────────────── Short-Term Memory ─────────────────────────── -->
      <template v-if="activeTab === 'stm'">
        <div class="stm-layout">

          <!-- Session sidebar -->
          <div class="stm-sidebar">
            <div class="sidebar-header">
              <span class="sidebar-title">
                Sessions
                <span class="sidebar-count">{{ filteredSessions(activeAgent).length }}</span>
              </span>
              <div class="sidebar-header__right">
                <!-- Pagination inline in header -->
                <div v-if="totalPages > 1" class="sidebar-pager">
                  <button class="pager-btn" :disabled="sessionPage === 0" @click="sessionPage--">
                    <v-icon size="14">mdi-chevron-left</v-icon>
                  </button>
                  <span class="pager-info">{{ sessionPage + 1 }} / {{ totalPages }}</span>
                  <button class="pager-btn" :disabled="sessionPage >= totalPages - 1" @click="sessionPage++">
                    <v-icon size="14">mdi-chevron-right</v-icon>
                  </button>
                </div>
                <button v-if="selectedSession[activeAgent]"
                  class="danger-btn" title="Clear session"
                  @click="clearSession(activeAgent, selectedSession[activeAgent])">
                  <v-icon size="13">mdi-delete-outline</v-icon>
                </button>
              </div>
            </div>

            <div v-if="!filteredSessions(activeAgent).length" class="empty-hint">
              <v-icon size="22" color="rgba(255,255,255,0.1)">mdi-chat-sleep-outline</v-icon>
              <span>No sessions yet</span>
            </div>

            <button
              v-for="s in pagedSessions" :key="s.session_id"
              class="session-row"
              :class="{ 'session-row--active': selectedSession[activeAgent] === s.session_id }"
              @click="selectSession(activeAgent, s.session_id)"
            >
              <v-icon size="13" :color="sessionTypeColor(s.session_id)">{{ sessionTypeIcon(s.session_id) }}</v-icon>
              <div class="session-row__info">
                <span class="session-row__label">{{ s.preview || 'Untitled session' }}</span>
                <span class="session-row__meta">{{ sessionTypeLabel(s.session_id) }} · {{ s.snapshot_count }} turn{{ s.snapshot_count !== 1 ? 's' : '' }}</span>
              </div>
              <router-link v-if="reportSessions.has(s.session_id)"
                :to="`/report/${s.session_id}`"
                class="report-dot" title="View report" @click.stop>
                <v-icon size="9">mdi-file-chart-outline</v-icon>
              </router-link>
            </button>
          </div>

          <!-- Conversation view -->
          <div class="stm-convo">
            <template v-if="selectedSession[activeAgent] && stmMessages[activeAgent]?.length">
              <div class="convo-scroll">
                <div
                  v-for="(msg, i) in stmMessages[activeAgent]" :key="i"
                  class="msg"
                  :class="msg.role === 'human' ? 'msg--user' : 'msg--agent'"
                >
                  <div class="msg__role" @click="msg.role !== 'human' && toggleMsg(i)">
                    {{ msg.role === 'human' ? 'You' : activeAgent }}
                    <v-icon v-if="msg.role !== 'human'" size="11" style="margin-left:4px;opacity:0.5">
                      {{ collapsedMsgs.has(i) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}
                    </v-icon>
                  </div>
                  <div v-if="!collapsedMsgs.has(i)" class="msg__bubble">{{ msg.content }}</div>
                  <div v-else class="msg__collapsed" @click="toggleMsg(i)">
                    {{ msg.content.slice(0, 80) }}{{ msg.content.length > 80 ? '…' : '' }}
                  </div>
                </div>
              </div>
              <div class="convo-footer">
                <span class="convo-footer__info">
                  {{ Math.round(stmMessages[activeAgent].length / 2) }} / {{ STM_WINDOWS[activeAgent] }} turns
                </span>
                <button
                  class="save-ltm-btn"
                  :disabled="savingToLTM[activeAgent]"
                  @click="saveSTMtoLTM(activeAgent)"
                >
                  <v-icon size="12">{{ savingToLTM[activeAgent] ? 'mdi-loading mdi-spin' : 'mdi-brain-plus' }}</v-icon>
                  {{ savingToLTM[activeAgent] ? 'Saving…' : 'Save to LTM' }}
                </button>
              </div>
            </template>
            <div v-else class="empty-center">
              <v-icon size="32" color="rgba(255,255,255,0.08)">mdi-chat-processing-outline</v-icon>
              <span>{{ selectedSession[activeAgent] ? 'No messages in this session' : 'Select a session to view conversation' }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ────────────────── Working Memory ────────────────────────────── -->
      <template v-if="activeTab === 'wm'">
        <div class="wm-wrap">
          <div v-if="curWMActive" class="wm-live-row">
            <span class="live-dot" /><span class="live-label">Live — updated {{ relativeTime(wmData[activeAgent]?._updatedAt) }}</span>
          </div>

          <template v-if="curWMActive">
            <div v-for="(val, key) in curWMFields" :key="key" class="wm-entry">
              <span class="wm-entry__key">{{ key }}</span>
              <span class="wm-entry__val">{{ val }}</span>
            </div>
          </template>

          <div v-else class="empty-center" style="padding:60px 20px">
            <v-icon size="36" color="rgba(255,255,255,0.08)">mdi-lightning-bolt-outline</v-icon>
            <span>Working memory is populated during active workflow runs</span>
            <span class="empty-sub">Expected fields: {{ WM_SCHEMA[activeAgent].join(', ') }}</span>
          </div>
        </div>
      </template>

      <!-- ────────────────── Long-Term Memory ──────────────────────────── -->
      <template v-if="activeTab === 'ltm'">
        <div class="ltm-wrap">

          <!-- Stats row -->
          <div class="ltm-stats">
            <div class="ltm-stat">
              <v-icon size="13" color="#14B8A6">mdi-database-outline</v-icon>
              <span>{{ ltmStats[activeAgent]?.entries ?? 0 }} entries</span>
            </div>
            <div class="ltm-stat">
              <v-icon size="13" color="#14B8A6">mdi-vector-combine</v-icon>
              <span>{{ ltmStats[activeAgent]?.dim ? ltmStats[activeAgent].dim + '-dim' : 'no index' }}</span>
            </div>
            <div class="ltm-stat" :class="ltmStats[activeAgent]?.ready ? 'ltm-stat--ready' : ''">
              <v-icon size="13" :color="ltmStats[activeAgent]?.ready ? '#4ADE80' : 'rgba(255,255,255,0.2)'">
                {{ ltmStats[activeAgent]?.ready ? 'mdi-check-circle-outline' : 'mdi-circle-outline' }}
              </v-icon>
              <span>{{ ltmStats[activeAgent]?.ready ? 'Ready' : 'Not loaded' }}</span>
            </div>
            <button v-if="ltmStats[activeAgent]?.entries"
              class="danger-btn" title="Clear all LTM entries" style="margin-left:auto"
              @click="clearLTM(activeAgent)">
              <v-icon size="13">mdi-delete-outline</v-icon> Clear
            </button>
          </div>

          <!-- Search -->
          <div class="ltm-search">
            <input
              class="ltm-input"
              :placeholder="`Search ${activeAgent}'s memories…`"
              v-model="ltmQuery[activeAgent]"
              @keydown.enter="searchLTM(activeAgent)"
            />
            <button class="ltm-search-btn"
              :disabled="!ltmQuery[activeAgent]?.trim()"
              @click="searchLTM(activeAgent)">
              <v-icon size="15">mdi-magnify</v-icon>
            </button>
          </div>

          <!-- Results -->
          <div class="ltm-results">
            <template v-if="ltmResults[activeAgent]?.length">
              <div v-for="(r, i) in ltmResults[activeAgent]" :key="i" class="ltm-result">
                <div class="ltm-result__meta">
                  <span class="ltm-result__score">{{ (r.similarity * 100).toFixed(0) }}% match</span>
                  <div class="ltm-result__bar">
                    <div class="ltm-result__bar-fill" :style="`width:${r.similarity * 100}%`" />
                  </div>
                  <span class="ltm-result__date">{{ new Date(r.ts).toLocaleDateString() }}</span>
                </div>
                <div class="ltm-result__text">{{ r.content }}</div>
              </div>
            </template>
            <div v-else-if="ltmSearched[activeAgent]" class="empty-center">
              <v-icon size="28" color="rgba(255,255,255,0.08)">mdi-magnify-close</v-icon>
              <span>No relevant memories found</span>
            </div>
            <div v-else class="empty-center" style="padding:48px 20px">
              <v-icon size="36" color="rgba(255,255,255,0.08)">mdi-brain</v-icon>
              <span>{{ ltmStats[activeAgent]?.entries ? 'Search to retrieve past memories' : 'LTM builds up as the agent runs' }}</span>
              <span v-if="!ltmStats[activeAgent]?.entries" class="empty-sub">Memories are stored automatically after each workflow run</span>
            </div>
          </div>
        </div>
      </template>

    </div><!-- .mem-body -->
    </template><!-- v-if="!searchActive" -->

    <!-- ── Search Results ──────────────────────────────────────────────── -->
    <div v-if="searchActive" class="gsearch-results">

      <!-- Sessions -->
      <div class="gsr-section">
        <div class="gsr-section__header">
          <v-icon size="13" color="#A5B4FC">mdi-chat-processing-outline</v-icon>
          Sessions
          <span class="gsr-count">{{ sessionResults.length }}</span>
        </div>
        <template v-if="sessionResults.length">
          <button
            v-for="r in sessionResults" :key="r.agentId + r.session_id"
            class="gsr-row gsr-row--session"
            @click="navigateToSession(r)"
          >
            <span class="gsr-badge" :style="`background:${AGENT_COLORS[r.agentId]}22;color:${AGENT_COLORS[r.agentId]};border-color:${AGENT_COLORS[r.agentId]}44`">{{ r.agentId }}</span>
            <v-icon size="13" :color="sessionTypeColor(r.session_id)">{{ sessionTypeIcon(r.session_id) }}</v-icon>
            <div class="gsr-row__body">
              <span class="gsr-row__text" v-html="highlightMatch(r.preview, searchQuery)" />
              <span class="gsr-row__meta">{{ r.snapshot_count }} turn{{ r.snapshot_count !== 1 ? 's' : '' }} · {{ sessionTypeLabel(r.session_id) }}</span>
            </div>
            <v-icon size="13" color="rgba(226,232,240,0.2)">mdi-arrow-right</v-icon>
          </button>
        </template>
        <div v-else class="gsr-empty">
          <v-icon size="18" color="rgba(255,255,255,0.08)">mdi-chat-sleep-outline</v-icon>
          No matching sessions
        </div>
      </div>

      <!-- LTM -->
      <div class="gsr-section">
        <div class="gsr-section__header">
          <v-icon size="13" color="#5EEAD4">mdi-brain</v-icon>
          Long-Term Memories
          <span class="gsr-count">{{ ltmGlobalResults.length }}</span>
          <span v-if="globalSearching" class="gsr-searching">
            <v-icon size="11" style="animation:spin 0.8s linear infinite">mdi-loading</v-icon>
            querying…
          </span>
        </div>
        <template v-if="ltmGlobalResults.length">
          <div v-for="(r, i) in ltmGlobalResults" :key="i" class="gsr-row gsr-row--ltm">
            <span class="gsr-badge" :style="`background:${AGENT_COLORS[r.agentId]}22;color:${AGENT_COLORS[r.agentId]};border-color:${AGENT_COLORS[r.agentId]}44`">{{ r.agentId }}</span>
            <v-icon size="13" color="#5EEAD4">mdi-memory</v-icon>
            <div class="gsr-row__body">
              <span class="gsr-row__text">{{ r.content }}</span>
              <span class="gsr-row__meta">
                {{ (r.similarity * 100).toFixed(0) }}% match
                <span class="gsr-bar"><span class="gsr-bar-fill" :style="`width:${r.similarity*100}%`" /></span>
                · {{ new Date(r.ts).toLocaleDateString() }}
              </span>
            </div>
          </div>
        </template>
        <div v-else-if="!globalSearching" class="gsr-empty">
          <v-icon size="18" color="rgba(255,255,255,0.08)">mdi-brain-outline</v-icon>
          No relevant memories found
        </div>
      </div>

    </div><!-- .gsearch-results -->

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();
const router = useRouter();

const agents      = ['planner', 'researcher', 'worker', 'reviewer'];
const activeAgent = ref('planner');
const activeTab   = ref('stm');
const loading     = ref(false);

// ── Global Search ────────────────────────────────────────────────────────────
const searchQuery      = ref('');
const searchInputRef   = ref(null);
const globalSearching  = ref(false);
const ltmGlobalResults = reactive([]);
const searchActive     = computed(() => searchQuery.value.trim().length > 0);

const sessionResults = computed(() => {
  if (!searchActive.value) return [];
  const q = searchQuery.value.toLowerCase();
  const out = [];
  for (const agent of agents) {
    for (const s of (agentSessions[agent] || [])) {
      if ((s.preview || '').toLowerCase().includes(q)) out.push({ ...s, agentId: agent });
    }
  }
  return out;
});

const AGENT_COLORS = { researcher: '#6366F1', planner: '#22D3EE', worker: '#4ADE80', reviewer: '#F59E0B' };
const STM_WINDOWS  = { researcher: 6, planner: 8, worker: 10, reviewer: 6 };
const WM_SCHEMA    = {
  researcher: ['goal', 'sessionId'],
  planner:    ['goal', 'researchSummary', 'recommendedApproach'],
  worker:     ['planId', 'currentStep', 'stepIdx', 'totalSteps'],
  reviewer:   ['stepDescription', 'loopCount'],
};

const TABS = [
  { id: 'stm', label: 'Short-Term', icon: 'mdi-chat-processing-outline',
    badge: () => filteredSessions(activeAgent.value).length || null },
  { id: 'wm',  label: 'Working',    icon: 'mdi-lightning-bolt-outline',
    badge: () => curWMActive.value ? 'LIVE' : null },
  { id: 'ltm', label: 'Long-Term',  icon: 'mdi-brain',
    badge: () => ltmStats[activeAgent.value]?.entries || null },
];

// ── Projects (kept for session filtering, no longer shown as UI) ───────────
const projects    = ref([]);
const projectMap  = computed(() => Object.fromEntries(projects.value.map(p => [p.id, p.title])));

async function loadProjects() {
  try { projects.value = await axios.get('/api/projects').then(r => r.data); }
  catch { projects.value = []; }
}

// ── STM ────────────────────────────────────────────────────────────────────
const agentSessions    = reactive({});
const collapsedMsgs    = ref(new Set());
const selectedSession  = reactive({});
const sessionSnapshots = reactive({});
const stmMessages      = reactive({});
const stmStats         = reactive({});
const reportSessions   = ref(new Set());

// ── WM ─────────────────────────────────────────────────────────────────────
const wmData = reactive({});

// ── LTM ────────────────────────────────────────────────────────────────────
const ltmStats    = reactive({});
const ltmQuery    = reactive({});
const ltmResults  = reactive({});
const ltmSearched = reactive({});
const savingToLTM = reactive({});

// ── Session helpers ─────────────────────────────────────────────────────────
function parseSessionId(sessionId) {
  if (!sessionId) return { type: 'legacy', projectId: null };
  if (sessionId.startsWith('proj_')) return { type: 'chat', projectId: sessionId.slice(5) };
  const colonIdx = sessionId.indexOf(':');
  if (colonIdx > 0) {
    const maybeProjId = sessionId.slice(0, colonIdx);
    if (projectMap.value[maybeProjId]) return { type: 'workflow', projectId: maybeProjId };
  }
  return { type: 'legacy', projectId: null };
}

function sessionLabel(sessionId) {
  const { type, projectId } = parseSessionId(sessionId);
  if (type === 'chat') {
    const name = projectMap.value[projectId];
    return name ? `${name} chat` : 'Chat session';
  }
  if (type === 'workflow') {
    const runId = sessionId.slice(sessionId.indexOf(':') + 1);
    const name  = projectMap.value[projectId];
    return (name ? name + ' · ' : '') + 'Run ' + runId.slice(0, 8);
  }
  return sessionId.slice(0, 12) + '…';
}

function sessionTypeLabel(sessionId) {
  const { type } = parseSessionId(sessionId);
  if (type === 'chat')     return 'Chat';
  if (type === 'workflow') return 'Workflow';
  return 'Session';
}

function sessionTypeIcon(sessionId) {
  const { type } = parseSessionId(sessionId);
  if (type === 'chat')     return 'mdi-chat-outline';
  if (type === 'workflow') return 'mdi-graph';
  return 'mdi-history';
}

function sessionTypeColor(sessionId) {
  const { type } = parseSessionId(sessionId);
  if (type === 'chat')     return '#A5B4FC';
  if (type === 'workflow') return '#67E8F9';
  return 'rgba(226,232,240,0.25)';
}

function filteredSessions(agentId) {
  return agentSessions[agentId] || [];
}

// ── Session pagination ──────────────────────────────────────────────────────
const PAGE_SIZE   = 10;
const sessionPage = ref(0);

// Reset to page 0 when agent changes
watch(activeAgent, () => { sessionPage.value = 0; });

// Debounced LTM search on query change
let _searchDebounce = null;
watch(searchQuery, (val) => {
  clearTimeout(_searchDebounce);
  ltmGlobalResults.splice(0);
  if (val.trim().length >= 2) {
    _searchDebounce = setTimeout(runGlobalSearch, 400);
  }
});

const totalPages = computed(() =>
  Math.ceil(filteredSessions(activeAgent.value).length / PAGE_SIZE)
);

const pagedSessions = computed(() => {
  const start = sessionPage.value * PAGE_SIZE;
  return filteredSessions(activeAgent.value).slice(start, start + PAGE_SIZE);
});

// ── Computed ────────────────────────────────────────────────────────────────
const curWMActive = computed(() => {
  const ctx = wmData[activeAgent.value];
  return ctx && Object.keys(ctx).some(k => k !== '_updatedAt');
});

const curWMFields = computed(() => {
  const ctx = wmData[activeAgent.value] || {};
  return Object.fromEntries(Object.entries(ctx).filter(([k]) => k !== '_updatedAt'));
});

// ── Data fetching ───────────────────────────────────────────────────────────
async function fetchAll() {
  loading.value = true;
  try {
    await Promise.all([fetchSTM(), fetchWM(), fetchLTMStats(), fetchReportSessions()]);
  } finally { loading.value = false; }
}

async function fetchSTM() {
  try {
    const { data } = await axios.get('/api/memory/');
    const grouped  = {};
    for (const item of data) {
      if (!grouped[item.agent_id]) grouped[item.agent_id] = [];
      grouped[item.agent_id].push(item);
    }
    for (const agent of agents) {
      agentSessions[agent] = grouped[agent] || [];
      if (!selectedSession[agent]) {
        const list = agentSessions[agent];
        if (list.length) await selectSession(agent, list[0].session_id);
      }
    }
  } catch { /* ignore */ }
}

async function fetchWM() {
  try {
    const { data } = await axios.get('/api/memory/wm/stats');
    const latest   = data.latest || {};
    for (const agent of agents) { wmData[agent] = latest[agent] || {}; }
  } catch { /* ignore */ }
}

async function fetchLTMStats() {
  try {
    const { data } = await axios.get('/api/memory/ltm/stats');
    for (const [agent, stats] of Object.entries(data || {})) { ltmStats[agent] = stats; }
  } catch { /* ignore */ }
}

async function fetchReportSessions() {
  try {
    const { data } = await axios.get('/api/reports/sessions');
    reportSessions.value = new Set(data.sessions || []);
  } catch { /* no reports yet */ }
}

// ── STM session ─────────────────────────────────────────────────────────────
function toggleMsg(i) {
  const s = new Set(collapsedMsgs.value);
  s.has(i) ? s.delete(i) : s.add(i);
  collapsedMsgs.value = s;
}

async function selectSession(agent, sessionId) {
  if (!sessionId) return;
  selectedSession[agent] = sessionId;
  collapsedMsgs.value = new Set();
  try {
    const { data } = await axios.get(`/api/memory/${agent}?sessionId=${sessionId}`);
    sessionSnapshots[agent] = data;
    stmMessages[agent] = [];
    if (data.length > 0) {
      const snap = JSON.parse(data[0].snapshot_json || '{}');
      if (Array.isArray(snap.pairs) && snap.pairs.length) {
        stmMessages[agent] = snap.pairs.flatMap(p => [
          { role: 'human', content: p.input  },
          { role: 'ai',    content: p.output },
        ]);
      } else if (Array.isArray(snap.chat_history) && snap.chat_history.length) {
        stmMessages[agent] = snap.chat_history.map(m => ({
          role:    m.type === 'ai' ? 'ai' : 'human',
          content: m.data?.content || m.kwargs?.content || m.content || '',
        }));
      }
      stmStats[agent] = { size: Math.round(stmMessages[agent].length / 2) };
      // Collapse all agent messages by default
      collapsedMsgs.value = new Set(
        stmMessages[agent].map((m, i) => m.role !== 'human' ? i : -1).filter(i => i >= 0)
      );
    }
  } catch { /* ignore */ }
}

async function clearSession(agent, sessionId) {
  await axios.delete(`/api/memory/${agent}`, { data: { sessionId } });
  delete selectedSession[agent];
  stmMessages[agent]      = [];
  sessionSnapshots[agent] = [];
  stmStats[agent]         = { size: 0 };
  await fetchSTM();
}

async function saveSTMtoLTM(agent) {
  const messages = stmMessages[agent];
  if (!messages?.length) return;
  savingToLTM[agent] = true;
  try {
    const pairs = [];
    for (let i = 0; i < messages.length - 1; i += 2) {
      const input  = messages[i]?.content    || '';
      const output = messages[i + 1]?.content || '';
      if (input || output) pairs.push(`User: ${input}\nAssistant: ${output}`);
    }
    await axios.post(`/api/memory/ltm/${agent}/store`, {
      content:  pairs.join('\n\n---\n\n'),
      metadata: { agentId: agent, sessionId: selectedSession[agent], source: 'manual' },
    });
    await fetchLTMStats();
  } catch { /* ignore */ }
  finally { savingToLTM[agent] = false; }
}

// ── LTM ────────────────────────────────────────────────────────────────────
async function searchLTM(agent) {
  const q = ltmQuery[agent]?.trim();
  if (!q) return;
  try {
    const { data } = await axios.get(`/api/memory/ltm/${agent}/query?q=${encodeURIComponent(q)}&k=5`);
    ltmResults[agent]  = data;
    ltmSearched[agent] = true;
  } catch {
    ltmResults[agent]  = [];
    ltmSearched[agent] = true;
  }
}

async function clearLTM(agent) {
  await axios.delete(`/api/memory/ltm/${agent}`);
  ltmStats[agent]    = { entries: 0, dim: null, ready: false };
  ltmResults[agent]  = [];
  delete ltmSearched[agent];
}

// ── Global search ────────────────────────────────────────────────────────────
async function runGlobalSearch() {
  const q = searchQuery.value.trim();
  if (!q) return;
  ltmGlobalResults.splice(0);
  globalSearching.value = true;
  try {
    const fetches = agents.map(agent =>
      axios.get(`/api/memory/ltm/${agent}/query?q=${encodeURIComponent(q)}&k=5`)
        .then(({ data }) => data.map(r => ({ ...r, agentId: agent })))
        .catch(() => [])
    );
    const flat = (await Promise.all(fetches)).flat().sort((a, b) => b.similarity - a.similarity);
    ltmGlobalResults.push(...flat);
  } finally {
    globalSearching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = '';
  ltmGlobalResults.splice(0);
  globalSearching.value = false;
  searchInputRef.value?.focus();
}

function navigateToSession(result) {
  activeAgent.value = result.agentId;
  activeTab.value   = 'stm';
  searchQuery.value = '';
  ltmGlobalResults.splice(0);
  setTimeout(() => selectSession(result.agentId, result.session_id), 0);
}

function highlightMatch(text, query) {
  if (!text || !query) return text || '';
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="gsearch-hl">$1</mark>');
}

// ── Utilities ───────────────────────────────────────────────────────────────
function relativeTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000)   return `${Math.round(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  return `${Math.round(d / 3600000)}h ago`;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
let _wmPoll = null;

onMounted(async () => {
  await loadProjects();
  await fetchAll();
  _wmPoll = setInterval(fetchWM, 3000);
  socket.on('memory:updated', () => { fetchSTM(); fetchLTMStats(); });
});

onUnmounted(() => {
  clearInterval(_wmPoll);
  socket.off('memory:updated');
});
</script>

<style scoped>
/* ── Root ───────────────────────────────────────────────────────────────── */
.mem-root {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: #08080F;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.mem-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 14px;
  flex-shrink: 0;
}
.mem-header__left {}
.mem-header__title { font-size: 20px; font-weight: 700; color: #E2E8F0; }
.mem-header__sub   { font-size: 12px; color: rgba(226,232,240,0.35); margin-top: 2px; }

.icon-btn {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid rgba(255,255,255,0.07);
  color: rgba(226,232,240,0.45); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.icon-btn:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.icon-btn--spin .v-icon { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Agent selector ─────────────────────────────────────────────────────── */
.agent-bar {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 0 24px 14px;
  flex-shrink: 0;
}
.agent-btn {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 16px; border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.07);
  font-size: 13px; font-weight: 500;
  color: rgba(226,232,240,0.45); background: transparent;
  cursor: pointer; text-transform: capitalize;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.agent-btn:hover { background: rgba(255,255,255,0.04); color: #E2E8F0; }
.agent-btn--active {
  background: rgba(var(--ac, 99,102,241), 0.1) !important;
  border-color: rgba(var(--ac, 99,102,241), 0.3) !important;
  color: #E2E8F0 !important;
}
.agent-btn__dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; opacity: 0.7;
}
.agent-btn--active .agent-btn__dot { opacity: 1; }
.agent-btn__count {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.5);
}

/* ── Memory type tabs ───────────────────────────────────────────────────── */
.mem-tabs {
  display: flex; gap: 0;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.mem-tab {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 18px;
  font-size: 13px; font-weight: 500;
  color: rgba(226,232,240,0.4); background: transparent;
  border: none; border-bottom: 2px solid transparent;
  cursor: pointer; margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.mem-tab:hover { color: rgba(226,232,240,0.75); }
.mem-tab--active.mem-tab--stm { color: #A5B4FC; border-bottom-color: #6366F1; }
.mem-tab--active.mem-tab--wm  { color: #FCD34D; border-bottom-color: #F59E0B; }
.mem-tab--active.mem-tab--ltm { color: #5EEAD4; border-bottom-color: #14B8A6; }
.mem-tab__badge {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.5);
}
.mem-tab--active.mem-tab--stm .mem-tab__badge { background: rgba(99,102,241,0.15); color: #A5B4FC; }
.mem-tab--active.mem-tab--wm  .mem-tab__badge { background: rgba(245,158,11,0.15); color: #FCD34D; }
.mem-tab--active.mem-tab--ltm .mem-tab__badge { background: rgba(20,184,166,0.15); color: #5EEAD4; }

/* ── Body container ─────────────────────────────────────────────────────── */
.mem-body {
  flex: 1; overflow: hidden;
  display: flex; flex-direction: column;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* STM                                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */
.stm-layout {
  display: flex; flex: 1; overflow: hidden;
}

/* Session sidebar */
.stm-sidebar {
  width: 35%; flex-shrink: 0;
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column;
  overflow-y: auto;
}
.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.sidebar-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(226,232,240,0.3);
}
.sidebar-count {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.4);
  text-transform: none; letter-spacing: 0;
}

.sidebar-header__right { display: flex; align-items: center; gap: 6px; }

.sidebar-pager {
  display: flex; align-items: center; gap: 6px;
}
.pager-btn {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.5); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.pager-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #E2E8F0; }
.pager-btn:disabled { opacity: 0.3; cursor: default; }
.pager-info { font-size: 12px; color: rgba(226,232,240,0.4); font-weight: 500; min-width: 48px; text-align: center; }

.session-row {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 16px;
  background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.03);
  cursor: pointer; text-align: left;
  transition: background 0.12s;
}
.session-row:last-child { border-bottom: none; }
.session-row:hover { background: rgba(255,255,255,0.03); }
.session-row--active { background: rgba(99,102,241,0.07) !important; }
.session-row__info { flex: 1; min-width: 0; }
.session-row__label {
  display: block; font-size: 12px; font-weight: 500; color: #CBD5E1;
  word-break: break-all; white-space: normal;
}
.session-row__meta { font-size: 10px; color: rgba(226,232,240,0.3); }

.report-dot {
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0;
  background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.2);
  color: #22D3EE; text-decoration: none;
  transition: background 0.15s;
}
.report-dot:hover { background: rgba(34,211,238,0.16); }

/* Conversation view */
.stm-convo {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}
.convo-scroll {
  flex: 1; overflow-y: auto;
  padding: 16px 20px; display: flex; flex-direction: column; gap: 10px;
}
.convo-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.01);
  flex-shrink: 0;
}
.convo-footer__info { font-size: 11px; color: rgba(226,232,240,0.3); }

.msg { display: flex; flex-direction: column; gap: 4px; }
.msg__role {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; padding: 0 4px;
}
.msg--user  .msg__role  { color: #A5B4FC; }
.msg--agent .msg__role  { color: rgba(226,232,240,0.35); }
.msg__bubble {
  padding: 9px 13px; border-radius: 10px;
  font-size: 12px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  max-width: 85%;
}
.msg--user  .msg__bubble {
  background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.15); color: #C7D2FE;
}
.msg--agent .msg__bubble {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: #94A3B8;
}
.msg--agent .msg__role { cursor: pointer; user-select: none; }
.msg--agent .msg__role:hover { color: rgba(226,232,240,0.6); }
.msg__collapsed {
  padding: 6px 13px; border-radius: 10px;
  font-size: 12px; color: rgba(148,163,184,0.45);
  background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.07);
  cursor: pointer; max-width: 85%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: background 0.15s;
}
.msg__collapsed:hover { background: rgba(255,255,255,0.04); color: rgba(148,163,184,0.7); }

.save-ltm-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 7px;
  font-size: 12px; font-weight: 600;
  background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.25); color: #14B8A6;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
}
.save-ltm-btn:hover:not(:disabled) { background: rgba(20,184,166,0.2); }
.save-ltm-btn:disabled { opacity: 0.4; cursor: default; }

/* ══════════════════════════════════════════════════════════════════════════ */
/* WM                                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */
.wm-wrap {
  flex: 1; overflow-y: auto;
  padding: 20px 24px; display: flex; flex-direction: column; gap: 10px;
}
.wm-live-row {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #FCD34D;
  padding-bottom: 6px;
}
.live-dot {
  width: 7px; height: 7px; border-radius: 50%; background: #FCD34D; flex-shrink: 0;
  animation: pulse-dot 1.5s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}
.live-label { font-weight: 600; }

.wm-entry {
  display: flex; gap: 16px; align-items: flex-start;
  padding: 10px 14px; border-radius: 8px;
  background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.1);
}
.wm-entry__key {
  font-size: 12px; font-weight: 600; color: #FCD34D;
  min-width: 120px; flex-shrink: 0; opacity: 0.8; padding-top: 1px;
  font-family: monospace;
}
.wm-entry__val {
  font-size: 13px; color: #CBD5E1; line-height: 1.5;
  word-break: break-word; white-space: pre-wrap;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* LTM                                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */
.ltm-wrap {
  flex: 1; overflow: hidden;
  display: flex; flex-direction: column;
}

.ltm-stats {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}
.ltm-stat {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; color: rgba(226,232,240,0.4);
  padding: 4px 10px; border-radius: 6px;
  background: rgba(20,184,166,0.06); border: 1px solid rgba(20,184,166,0.12);
}
.ltm-stat--ready { color: #4ADE80; border-color: rgba(74,222,128,0.2); background: rgba(74,222,128,0.06); }

.ltm-search {
  display: flex; align-items: center;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  gap: 8px;
  flex-shrink: 0;
}
.ltm-input {
  flex: 1; height: 38px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
  color: #CBD5E1; font-size: 13px; padding: 0 14px; outline: none;
  transition: border-color 0.15s;
}
.ltm-input::placeholder { color: rgba(226,232,240,0.25); }
.ltm-input:focus { border-color: rgba(20,184,166,0.4); }
.ltm-search-btn {
  height: 38px; padding: 0 16px;
  background: rgba(20,184,166,0.12); border: 1px solid rgba(20,184,166,0.3);
  border-radius: 8px; cursor: pointer; color: #5EEAD4;
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600;
  transition: background 0.15s;
}
.ltm-search-btn:hover:not(:disabled) { background: rgba(20,184,166,0.22); }
.ltm-search-btn:disabled { opacity: 0.4; cursor: default; }

.ltm-results {
  flex: 1; overflow-y: auto;
  padding: 14px 24px; display: flex; flex-direction: column; gap: 10px;
}
.ltm-result {
  padding: 12px 14px; border-radius: 10px;
  background: rgba(20,184,166,0.05); border: 1px solid rgba(20,184,166,0.12);
  transition: border-color 0.15s;
}
.ltm-result:hover { border-color: rgba(20,184,166,0.22); }
.ltm-result__meta {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.ltm-result__score { font-size: 11px; font-weight: 700; color: #5EEAD4; flex-shrink: 0; }
.ltm-result__bar {
  flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.07);
}
.ltm-result__bar-fill {
  height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, #14B8A6, #06B6D4);
  transition: width 0.3s;
}
.ltm-result__date { font-size: 10px; color: rgba(226,232,240,0.25); flex-shrink: 0; }
.ltm-result__text {
  font-size: 12px; color: #94A3B8; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  max-height: 120px; overflow-y: auto;
}

/* ── Shared ──────────────────────────────────────────────────────────────── */
.empty-hint {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 28px 16px; text-align: center;
  font-size: 12px; color: rgba(226,232,240,0.3);
}
.empty-center {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 8px; text-align: center;
  font-size: 13px; color: rgba(226,232,240,0.35); padding: 20px;
}
.empty-sub { font-size: 11px; color: rgba(226,232,240,0.2); }

.danger-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 600;
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #F87171;
  cursor: pointer; transition: background 0.15s;
}
.danger-btn:hover { background: rgba(239,68,68,0.16); }

/* ── Scrollbars ──────────────────────────────────────────────────────────── */
.stm-sidebar::-webkit-scrollbar,
.convo-scroll::-webkit-scrollbar,
.ltm-results::-webkit-scrollbar,
.wm-wrap::-webkit-scrollbar { width: 4px; }
.stm-sidebar::-webkit-scrollbar-track,
.convo-scroll::-webkit-scrollbar-track,
.ltm-results::-webkit-scrollbar-track,
.wm-wrap::-webkit-scrollbar-track { background: transparent; }
.stm-sidebar::-webkit-scrollbar-thumb  { background: rgba(255,255,255,0.08); border-radius: 2px; }
.convo-scroll::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }
.ltm-results::-webkit-scrollbar-thumb  { background: rgba(20,184,166,0.3); border-radius: 2px; }
.wm-wrap::-webkit-scrollbar-thumb      { background: rgba(245,158,11,0.2); border-radius: 2px; }

/* ══════════════════════════════════════════════════════════════════════════ */
/* GLOBAL SEARCH                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */
.gsearch-bar { padding: 0 24px 12px; flex-shrink: 0; }
.gsearch-wrap {
  display: flex; align-items: center; gap: 10px;
  height: 40px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 0 14px;
  transition: border-color 0.2s, background 0.2s;
}
.gsearch-bar--active .gsearch-wrap,
.gsearch-wrap:focus-within {
  border-color: rgba(99,102,241,0.45);
  background: rgba(99,102,241,0.06);
}
.gsearch-icon { flex-shrink: 0; transition: color 0.2s; }
.gsearch-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 14px; color: #E2E8F0;
}
.gsearch-input::placeholder { color: rgba(226,232,240,0.25); }
.gsearch-clear {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.45); cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.gsearch-clear:hover { background: rgba(255,255,255,0.1); color: #E2E8F0; }
.gsearch-spinner { display: flex; align-items: center; color: #818CF8; flex-shrink: 0; }

/* Results panel */
.gsearch-results {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column;
}
.gsearch-results::-webkit-scrollbar { width: 4px; }
.gsearch-results::-webkit-scrollbar-track { background: transparent; }
.gsearch-results::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.25); border-radius: 2px; }

.gsr-section {
  display: flex; flex-direction: column;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  padding-bottom: 4px;
}
.gsr-section:last-child { border-bottom: none; }

.gsr-section__header {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 24px 8px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: rgba(226,232,240,0.3);
  flex-shrink: 0;
}
.gsr-count {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.45);
  text-transform: none; letter-spacing: 0;
}
.gsr-searching {
  display: flex; align-items: center; gap: 5px;
  margin-left: 4px; font-size: 10px; font-weight: 500; color: #818CF8;
  text-transform: none; letter-spacing: 0;
}

.gsr-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 24px;
  background: transparent; border: none; text-align: left;
  width: 100%; transition: background 0.12s;
}
.gsr-row--session { cursor: pointer; }
.gsr-row--session:hover { background: rgba(99,102,241,0.05); }
.gsr-row--ltm     { cursor: default; }
.gsr-row--ltm:hover { background: rgba(20,184,166,0.04); }

.gsr-badge {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 20px;
  font-size: 10px; font-weight: 700; text-transform: capitalize;
  border: 1px solid; flex-shrink: 0; margin-top: 1px;
}
.gsr-row__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.gsr-row__text {
  font-size: 13px; color: #CBD5E1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
}
.gsr-row__meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: rgba(226,232,240,0.3);
}

.gsr-bar {
  display: inline-block; width: 48px; height: 3px; border-radius: 2px;
  background: rgba(255,255,255,0.07); vertical-align: middle; flex-shrink: 0;
}
.gsr-bar-fill {
  display: block; height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, #14B8A6, #06B6D4);
}

.gsearch-hl {
  background: rgba(99,102,241,0.25); color: #C7D2FE;
  border-radius: 3px; padding: 0 2px; font-style: normal;
}

.gsr-empty {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 24px;
  font-size: 12px; color: rgba(226,232,240,0.25);
}
</style>

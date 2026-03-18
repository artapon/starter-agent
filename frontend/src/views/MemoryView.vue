<template>
  <div class="page-root">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title">Memory</div>
        <div class="page-subtitle">Short-Term · Working · Long-Term per agent</div>
      </div>
      <v-btn icon="mdi-refresh" variant="text" size="small" :loading="loading" @click="fetchAll"
        style="color:rgba(226,232,240,0.5)" />
    </div>

    <!-- Project filter bar -->
    <div class="proj-filter-bar">
      <button
        class="proj-pill"
        :class="{ 'proj-pill--active': !selectedProject }"
        @click="selectProject(null)"
      >
        <v-icon size="13">mdi-layers-outline</v-icon>
        All Projects
      </button>
      <button
        v-for="p in projects" :key="p.id"
        class="proj-pill"
        :class="{ 'proj-pill--active': selectedProject?.id === p.id }"
        @click="selectProject(p)"
      >
        <v-icon size="13" color="#A78BFA">mdi-folder-outline</v-icon>
        {{ p.title }}
      </button>
      <div v-if="!projects.length" style="font-size:12px;color:rgba(226,232,240,0.25);padding:4px 8px">
        No projects — <router-link to="/projects" style="color:#6366F1">create one</router-link>
      </div>
    </div>

    <!-- Project context banner -->
    <div v-if="selectedProject" class="proj-context-banner">
      <div class="proj-context-banner__left">
        <div class="proj-context-banner__icon">
          <v-icon size="18" color="#A78BFA">mdi-folder-outline</v-icon>
        </div>
        <div>
          <div class="proj-context-banner__name">{{ selectedProject.title }}</div>
          <div v-if="selectedProject.description" class="proj-context-banner__desc">
            {{ selectedProject.description }}
          </div>
        </div>
      </div>
      <div class="proj-context-banner__stats">
        <span class="proj-ctx-stat">
          <v-icon size="11" color="#6366F1">mdi-chat-processing-outline</v-icon>
          {{ filteredSessionCount }} sessions
        </span>
        <router-link :to="`/chat?projectId=${selectedProject.id}`" class="proj-ctx-link">
          <v-icon size="11">mdi-chat-outline</v-icon>
          Open in Chat
        </router-link>
        <router-link :to="`/workflow`" class="proj-ctx-link">
          <v-icon size="11">mdi-graph</v-icon>
          Run Workflow
        </router-link>
      </div>
    </div>

    <!-- Agent tabs -->
    <div class="agent-tabs">
      <button
        v-for="a in agents" :key="a"
        class="agent-tab"
        :class="{ 'agent-tab--active': activeAgent === a }"
        @click="switchAgent(a)"
      >
        <span class="agent-tab__dot" :style="`background:${AGENT_COLORS[a]}`" />
        {{ a }}
        <span v-if="filteredSessions(a).length" class="agent-tab__count">
          {{ filteredSessions(a).length }}
        </span>
      </button>
    </div>

    <!-- Tier stat row -->
    <div class="tier-stat-row" :key="activeAgent + (selectedProject?.id || 'all')">
      <div class="tier-stat" style="--accent:#6366F1">
        <v-icon size="14" color="#6366F1">mdi-chat-processing-outline</v-icon>
        <span class="tier-stat__label">Short-Term</span>
        <span class="tier-stat__badge">
          {{ curSTMSize }} / {{ STM_WINDOWS[activeAgent] }} turns
        </span>
      </div>
      <div class="tier-stat" style="--accent:#F59E0B">
        <v-icon size="14" color="#F59E0B">mdi-lightning-bolt-outline</v-icon>
        <span class="tier-stat__label">Working</span>
        <span class="tier-stat__badge" :class="curWMActive ? 'tier-stat__badge--active' : ''">
          {{ curWMActive ? 'Active' : 'Idle' }}
        </span>
      </div>
      <div class="tier-stat" style="--accent:#14B8A6">
        <v-icon size="14" color="#14B8A6">mdi-brain</v-icon>
        <span class="tier-stat__label">Long-Term</span>
        <span class="tier-stat__badge">
          {{ ltmStats[activeAgent]?.entries ?? '—' }} entries
          <span v-if="ltmStats[activeAgent]?.dim" class="tier-stat__dim">
            · {{ ltmStats[activeAgent].dim }}-dim
          </span>
        </span>
      </div>
    </div>

    <!-- Three-column memory grid -->
    <div class="mem-grid" :key="activeAgent + (selectedProject?.id || 'all')">

      <!-- ── Short-Term Memory ──────────────────────────────────────────── -->
      <div class="mem-panel mem-panel--stm">
        <div class="mem-panel__header">
          <div class="mem-panel__header-left">
            <span class="tier-pill tier-pill--stm">STM</span>
            <span class="mem-panel__title">Short-Term Memory</span>
          </div>
          <v-btn v-if="selectedSession[activeAgent]"
            size="x-small" icon="mdi-delete-outline" variant="text" color="error"
            title="Clear this session"
            @click="clearSession(activeAgent, selectedSession[activeAgent])" />
        </div>

        <!-- Session list as cards -->
        <div class="session-list">
          <div v-if="!filteredSessions(activeAgent).length" class="empty-state" style="padding:20px 14px">
            <v-icon size="24" color="rgba(255,255,255,0.1)" class="mb-2">mdi-chat-processing-outline</v-icon>
            <div>{{ selectedProject ? 'No sessions for this project' : 'No sessions yet' }}</div>
          </div>
          <button
            v-for="s in filteredSessions(activeAgent)" :key="s.session_id"
            class="session-card"
            :class="{ 'session-card--active': selectedSession[activeAgent] === s.session_id }"
            @click="selectSession(activeAgent, s.session_id)"
          >
            <div class="session-card__left">
              <div class="session-card__type-icon" :class="sessionTypeClass(s.session_id)">
                <v-icon size="12">{{ sessionTypeIcon(s.session_id) }}</v-icon>
              </div>
              <div>
                <div class="session-card__label">{{ sessionLabel(s.session_id) }}</div>
                <div class="session-card__meta">{{ s.snapshot_count }} snapshot{{ s.snapshot_count !== 1 ? 's' : '' }}</div>
              </div>
            </div>
            <div class="session-card__right">
              <router-link v-if="reportSessions.has(s.session_id)"
                :to="`/report/${s.session_id}`"
                class="report-chip" title="View walkthrough" @click.stop>
                <v-icon size="10">mdi-file-chart-outline</v-icon>
              </router-link>
              <div class="session-card__proj-tag"
                v-if="!selectedProject && sessionProject(s.session_id)">
                <v-icon size="9" color="#A78BFA">mdi-folder-outline</v-icon>
                {{ sessionProject(s.session_id) }}
              </div>
            </div>
          </button>
        </div>

        <!-- Chat messages from latest snapshot -->
        <div v-if="selectedSession[activeAgent]" class="stm-messages">
          <template v-if="stmMessages[activeAgent]?.length">
            <div
              v-for="(msg, i) in stmMessages[activeAgent]" :key="i"
              class="stm-msg"
              :class="msg.role === 'human' ? 'stm-msg--human' : 'stm-msg--ai'"
            >
              <div class="stm-msg__role">{{ msg.role === 'human' ? 'User' : activeAgent }}</div>
              <div class="stm-msg__bubble">{{ msg.content }}</div>
            </div>
          </template>
          <div v-else class="empty-state" style="padding:20px 14px">No messages in this session</div>
        </div>
        <div v-else-if="!filteredSessions(activeAgent).length" class="stm-messages">
          <div class="empty-state" style="padding:20px 14px">
            Select a session above to view conversation
          </div>
        </div>

        <!-- Footer -->
        <div v-if="sessionSnapshots[activeAgent]?.length" class="stm-snap-row">
          <span class="stm-snap-label">{{ sessionSnapshots[activeAgent].length }} snapshots</span>
          <span class="stm-snap-ts">
            Last: {{ new Date((sessionSnapshots[activeAgent][0]?.created_at || 0) * 1000).toLocaleTimeString() }}
          </span>
          <button
            class="stm-to-ltm-btn"
            :class="{ 'stm-to-ltm-btn--loading': savingToLTM[activeAgent] }"
            :disabled="savingToLTM[activeAgent] || !stmMessages[activeAgent]?.length"
            @click="saveSTMtoLTM(activeAgent)"
          >
            <v-icon size="12">{{ savingToLTM[activeAgent] ? 'mdi-loading mdi-spin' : 'mdi-brain-plus' }}</v-icon>
            Save to LTM
          </button>
        </div>
      </div>

      <!-- ── Working Memory ──────────────────────────────────────────────── -->
      <div class="mem-panel mem-panel--wm">
        <div class="mem-panel__header">
          <div class="mem-panel__header-left">
            <span class="tier-pill tier-pill--wm">WM</span>
            <span class="mem-panel__title">Working Memory</span>
          </div>
          <span v-if="curWMActive" class="wm-live-badge">
            <span class="wm-live-badge__dot" />LIVE
          </span>
        </div>

        <div class="wm-body">
          <template v-if="curWMActive">
            <div v-for="(val, key) in curWMFields" :key="key" class="wm-row">
              <span class="wm-row__key">{{ key }}</span>
              <span class="wm-row__val">{{ val }}</span>
            </div>
            <div v-if="wmData[activeAgent]?._updatedAt" class="wm-updated">
              Updated {{ relativeTime(wmData[activeAgent]._updatedAt) }}
            </div>
          </template>
          <div v-else class="wm-idle">
            <v-icon size="28" color="rgba(255,255,255,0.1)">mdi-lightning-bolt-outline</v-icon>
            <div class="wm-idle__text">Waiting for workflow run</div>
            <div class="wm-idle__sub">Working memory is populated during active runs</div>
          </div>
        </div>

        <div class="wm-schema">
          <div class="wm-schema__title">Expected fields</div>
          <div class="wm-schema__fields">
            <span v-for="f in WM_SCHEMA[activeAgent]" :key="f" class="wm-schema__field">{{ f }}</span>
          </div>
        </div>
      </div>

      <!-- ── Long-Term Memory ────────────────────────────────────────────── -->
      <div class="mem-panel mem-panel--ltm">
        <div class="mem-panel__header">
          <div class="mem-panel__header-left">
            <span class="tier-pill tier-pill--ltm">LTM</span>
            <span class="mem-panel__title">Long-Term Memory</span>
          </div>
          <v-btn v-if="ltmStats[activeAgent]?.entries"
            size="x-small" icon="mdi-delete-outline" variant="text" color="error"
            title="Clear LTM index"
            @click="clearLTM(activeAgent)" />
        </div>

        <div class="ltm-stats-bar">
          <div class="ltm-stat-chip">
            <v-icon size="11" color="#14B8A6">mdi-database-outline</v-icon>
            {{ ltmStats[activeAgent]?.entries ?? 0 }} entries
          </div>
          <div class="ltm-stat-chip">
            <v-icon size="11" color="#14B8A6">mdi-vector-combine</v-icon>
            {{ ltmStats[activeAgent]?.dim ? ltmStats[activeAgent].dim + '-dim' : 'no index' }}
          </div>
          <div class="ltm-stat-chip" :class="ltmStats[activeAgent]?.ready ? 'ltm-stat-chip--ready' : ''">
            <v-icon size="11" :color="ltmStats[activeAgent]?.ready ? '#4ADE80' : '#6B7280'">
              {{ ltmStats[activeAgent]?.ready ? 'mdi-check-circle-outline' : 'mdi-circle-outline' }}
            </v-icon>
            {{ ltmStats[activeAgent]?.ready ? 'Ready' : 'Not loaded' }}
          </div>
        </div>

        <div class="ltm-search-row">
          <input
            class="ltm-search-input"
            :placeholder="`Search ${activeAgent} memories…`"
            v-model="ltmQuery[activeAgent]"
            @keydown.enter="searchLTM(activeAgent)"
          />
          <button class="ltm-search-btn"
            @click="searchLTM(activeAgent)"
            :disabled="!ltmQuery[activeAgent]?.trim()">
            <v-icon size="14">mdi-magnify</v-icon>
          </button>
        </div>

        <div class="ltm-results">
          <template v-if="ltmResults[activeAgent]?.length">
            <div v-for="(r, i) in ltmResults[activeAgent]" :key="i" class="ltm-result">
              <div class="ltm-result__header">
                <span class="ltm-result__idx">#{{ i + 1 }}</span>
                <div class="ltm-result__sim-bar">
                  <div class="ltm-result__sim-fill" :style="`width:${r.similarity * 100}%`" />
                </div>
                <span class="ltm-result__score">{{ (r.similarity * 100).toFixed(0) }}%</span>
                <span class="ltm-result__ts">{{ new Date(r.ts).toLocaleDateString() }}</span>
              </div>
              <div class="ltm-result__content">{{ r.content }}</div>
            </div>
          </template>
          <div v-else-if="ltmSearched[activeAgent]" class="empty-state">No relevant memories found</div>
          <div v-else-if="!ltmStats[activeAgent]?.entries" class="empty-state">
            <v-icon size="28" color="rgba(255,255,255,0.1)" class="mb-2">mdi-brain</v-icon>
            <div>LTM builds up as the agent runs.</div>
            <div class="mt-1" style="font-size:11px;opacity:.5">Memories stored automatically after each run.</div>
          </div>
          <div v-else class="empty-state">Type a query to search past memories</div>
        </div>
      </div>

    </div><!-- .mem-grid -->
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';
import { useRoute } from 'vue-router';
import axios from 'axios';

const socket = useSocket();
const route  = useRoute();

const agents      = ['researcher', 'planner', 'worker', 'reviewer'];
const activeAgent = ref('researcher');
const loading     = ref(false);

// ── Projects ──────────────────────────────────────────────────────────────────
const projects       = ref([]);
const selectedProject = ref(null);
const projectMap     = computed(() => Object.fromEntries(projects.value.map(p => [p.id, p.title])));

async function loadProjects() {
  try { projects.value = await axios.get('/api/projects').then(r => r.data); }
  catch { projects.value = []; }
}

function selectProject(p) {
  selectedProject.value = p;
  // Reset STM selections so the filtered list takes effect
  for (const a of agents) {
    delete selectedSession[a];
    stmMessages[a]      = [];
    sessionSnapshots[a] = [];
    stmStats[a]         = {};
  }
  // Auto-select first session of each agent for this project
  for (const a of agents) {
    const list = filteredSessions(a);
    if (list.length) selectSession(a, list[0].session_id);
  }
}

// ── Agent config ──────────────────────────────────────────────────────────────
const AGENT_COLORS = { researcher: '#6366F1', planner: '#22D3EE', worker: '#4ADE80', reviewer: '#F59E0B' };
const STM_WINDOWS  = { researcher: 6, planner: 8, worker: 10, reviewer: 6 };
const WM_SCHEMA    = {
  researcher: ['goal', 'sessionId'],
  planner:    ['goal', 'researchSummary', 'recommendedApproach'],
  worker:     ['planId', 'currentStep', 'stepIdx', 'totalSteps'],
  reviewer:   ['stepDescription', 'loopCount'],
};

// ── STM ───────────────────────────────────────────────────────────────────────
const agentSessions    = reactive({});
const selectedSession  = reactive({});
const sessionSnapshots = reactive({});
const stmMessages      = reactive({});
const stmStats         = reactive({});
const reportSessions   = ref(new Set());

// ── WM ────────────────────────────────────────────────────────────────────────
const wmData = reactive({});

// ── LTM ───────────────────────────────────────────────────────────────────────
const ltmStats    = reactive({});
const ltmQuery    = reactive({});
const ltmResults  = reactive({});
const ltmSearched = reactive({});
const savingToLTM = reactive({});

// ── Session helpers ───────────────────────────────────────────────────────────

/**
 * Identify session type from its ID format:
 *   proj_<projectId>        → project chat
 *   <projectId>:<runId>     → project workflow run
 *   UUID only               → legacy (no project)
 */
function parseSessionId(sessionId) {
  if (!sessionId) return { type: 'legacy', projectId: null };
  if (sessionId.startsWith('proj_')) {
    return { type: 'chat', projectId: sessionId.slice(5) };
  }
  // Check if it's projectId:runId (contains a colon and second part looks like UUID)
  const colonIdx = sessionId.indexOf(':');
  if (colonIdx > 0) {
    const maybeProjId = sessionId.slice(0, colonIdx);
    if (projectMap.value[maybeProjId]) {
      return { type: 'workflow', projectId: maybeProjId };
    }
  }
  return { type: 'legacy', projectId: null };
}

function sessionLabel(sessionId) {
  const { type, projectId } = parseSessionId(sessionId);
  if (type === 'chat') return 'Chat session';
  if (type === 'workflow') {
    const runId = sessionId.slice(sessionId.indexOf(':') + 1);
    return 'Run ' + runId.slice(0, 8);
  }
  return sessionId.slice(0, 12) + '…';
}

function sessionTypeIcon(sessionId) {
  const { type } = parseSessionId(sessionId);
  if (type === 'chat')     return 'mdi-chat-outline';
  if (type === 'workflow') return 'mdi-graph';
  return 'mdi-history';
}

function sessionTypeClass(sessionId) {
  const { type } = parseSessionId(sessionId);
  return {
    'session-type--chat':     type === 'chat',
    'session-type--workflow': type === 'workflow',
    'session-type--legacy':   type === 'legacy',
  };
}

function sessionProject(sessionId) {
  const { projectId } = parseSessionId(sessionId);
  return projectId ? (projectMap.value[projectId] || null) : null;
}

function filteredSessions(agentId) {
  const all = agentSessions[agentId] || [];
  if (!selectedProject.value) return all;
  const pid = selectedProject.value.id;
  return all.filter(s => {
    const { projectId } = parseSessionId(s.session_id);
    return projectId === pid;
  });
}

const filteredSessionCount = computed(() => {
  if (!selectedProject.value) return 0;
  return agents.reduce((sum, a) => sum + filteredSessions(a).length, 0);
});

// ── Computed helpers ──────────────────────────────────────────────────────────
const curSTMSize = computed(() => stmStats[activeAgent.value]?.size ?? '—');

const curWMActive = computed(() => {
  const ctx = wmData[activeAgent.value];
  return ctx && Object.keys(ctx).some(k => k !== '_updatedAt');
});

const curWMFields = computed(() => {
  const ctx = wmData[activeAgent.value] || {};
  return Object.fromEntries(Object.entries(ctx).filter(([k]) => k !== '_updatedAt'));
});

// ── Tab switch ────────────────────────────────────────────────────────────────
function switchAgent(agent) { activeAgent.value = agent; }

// ── Data fetching ─────────────────────────────────────────────────────────────
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
        const list = filteredSessions(agent);
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
  } catch { /* WM may not be available yet */ }
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

// ── STM session ───────────────────────────────────────────────────────────────
async function selectSession(agent, sessionId) {
  if (!sessionId) return;
  selectedSession[agent] = sessionId;
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

// ── LTM ───────────────────────────────────────────────────────────────────────
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function relativeTime(ts) {
  const d = Date.now() - ts;
  if (d < 60000)   return `${Math.round(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  return `${Math.round(d / 3600000)}h ago`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let _wmPoll = null;

onMounted(async () => {
  await loadProjects();
  // Auto-select project from URL query param (?projectId=xxx)
  const urlProjId = route.query.projectId;
  if (urlProjId) {
    const found = projects.value.find(p => p.id === urlProjId);
    if (found) selectedProject.value = found;
  }
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
/* ── Base ─────────────────────────────────────────────────────────────────── */
.page-root     { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.page-header   { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title    { font-size: 20px; font-weight: 700; color: #E2E8F0; }
.page-subtitle { font-size: 13px; color: rgba(226,232,240,0.4); margin-top: 2px; }

/* ── Project filter bar ─────────────────────────────────────────────────────── */
.proj-filter-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 8px 12px;
  background: #0F0F1A;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
}
.proj-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 20px;
  font-size: 12px; font-weight: 500;
  border: 1px solid rgba(255,255,255,0.07);
  background: transparent; color: rgba(226,232,240,0.45);
  cursor: pointer; transition: all 0.15s;
  white-space: nowrap;
}
.proj-pill:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.proj-pill--active {
  background: rgba(99,102,241,0.12) !important;
  border-color: rgba(99,102,241,0.3) !important;
  color: #A5B4FC !important;
}

/* ── Project context banner ──────────────────────────────────────────────────── */
.proj-context-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: rgba(167,139,250,0.06);
  border: 1px solid rgba(167,139,250,0.15);
  border-radius: 10px;
  gap: 12px; flex-wrap: wrap;
}
.proj-context-banner__left {
  display: flex; align-items: center; gap: 10px;
}
.proj-context-banner__icon {
  width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
  background: rgba(167,139,250,0.1);
  border: 1px solid rgba(167,139,250,0.2);
  display: flex; align-items: center; justify-content: center;
}
.proj-context-banner__name { font-size: 14px; font-weight: 700; color: #E2E8F0; }
.proj-context-banner__desc { font-size: 12px; color: rgba(226,232,240,0.4); margin-top: 1px; }
.proj-context-banner__stats {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.proj-ctx-stat {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: rgba(226,232,240,0.4);
}
.proj-ctx-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: #A78BFA;
  padding: 3px 9px; border-radius: 5px;
  border: 1px solid rgba(167,139,250,0.2);
  background: rgba(167,139,250,0.08);
  text-decoration: none; transition: background 0.15s;
}
.proj-ctx-link:hover { background: rgba(167,139,250,0.15); }

/* ── Agent tabs ─────────────────────────────────────────────────────────────── */
.agent-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.agent-tab {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  font-size: 13px; font-weight: 500; cursor: pointer;
  color: rgba(226,232,240,0.5); background: transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  text-transform: capitalize;
}
.agent-tab:hover { background: rgba(255,255,255,0.04); color: #E2E8F0; }
.agent-tab--active {
  background: rgba(99,102,241,0.1) !important;
  border-color: rgba(99,102,241,0.25) !important;
  color: #E2E8F0 !important;
}
.agent-tab__dot   { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; opacity: 0.7; }
.agent-tab--active .agent-tab__dot { opacity: 1; }
.agent-tab__count {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.5);
}

/* ── Tier stat row ──────────────────────────────────────────────────────────── */
.tier-stat-row  { display: flex; gap: 10px; flex-wrap: wrap; }
.tier-stat {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 14px; border-radius: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  flex: 1; min-width: 170px;
}
.tier-stat__label { font-size: 12px; color: rgba(226,232,240,0.5); }
.tier-stat__badge {
  margin-left: auto; font-size: 11px; font-weight: 600;
  padding: 2px 8px; border-radius: 20px;
  background: rgba(255,255,255,0.06); color: rgba(226,232,240,0.6);
}
.tier-stat__badge--active {
  background: rgba(245,158,11,0.15) !important;
  color: #FCD34D !important;
}
.tier-stat__dim { opacity: 0.5; }

/* ── 3-column grid ──────────────────────────────────────────────────────────── */
.mem-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  align-items: start;
}
@media (max-width: 1100px) { .mem-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 700px)  { .mem-grid { grid-template-columns: 1fr; } }

/* ── Base panel ─────────────────────────────────────────────────────────────── */
.mem-panel {
  background: #0F0F1A;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column;
}
.mem-panel--stm { border-top: 2px solid rgba(99,102,241,0.5); }
.mem-panel--wm  { border-top: 2px solid rgba(245,158,11,0.5); }
.mem-panel--ltm { border-top: 2px solid rgba(20,184,166,0.5); }

.mem-panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  background: rgba(255,255,255,0.02);
}
.mem-panel__header-left { display: flex; align-items: center; gap: 8px; }
.mem-panel__title { font-size: 13px; font-weight: 600; color: #CBD5E1; }

/* ── Tier pills ─────────────────────────────────────────────────────────────── */
.tier-pill {
  font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
  padding: 2px 7px; border-radius: 5px; flex-shrink: 0;
}
.tier-pill--stm { background: rgba(99,102,241,0.2);  color: #A5B4FC; border: 1px solid rgba(99,102,241,0.3); }
.tier-pill--wm  { background: rgba(245,158,11,0.15); color: #FCD34D; border: 1px solid rgba(245,158,11,0.3); }
.tier-pill--ltm { background: rgba(20,184,166,0.15); color: #5EEAD4; border: 1px solid rgba(20,184,166,0.3); }

/* ── Session list ───────────────────────────────────────────────────────────── */
.session-list {
  display: flex; flex-direction: column; gap: 0;
  max-height: 200px; overflow-y: auto;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.session-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 12px; gap: 8px;
  background: transparent;
  border: none; border-bottom: 1px solid rgba(255,255,255,0.03);
  cursor: pointer; text-align: left;
  transition: background 0.12s;
}
.session-card:last-child { border-bottom: none; }
.session-card:hover { background: rgba(255,255,255,0.03); }
.session-card--active { background: rgba(99,102,241,0.07) !important; }
.session-card__left  { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.session-card__right { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }

.session-card__type-icon {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.session-type--chat     { background: rgba(99,102,241,0.12); color: #A5B4FC; }
.session-type--workflow { background: rgba(34,211,238,0.1);  color: #67E8F9; }
.session-type--legacy   { background: rgba(255,255,255,0.06); color: rgba(226,232,240,0.35); }

.session-card__label {
  font-size: 12px; font-weight: 500; color: #CBD5E1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.session-card__meta  { font-size: 10px; color: rgba(226,232,240,0.3); }

.report-chip {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 5px;
  background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.2);
  color: #22D3EE; text-decoration: none; flex-shrink: 0;
  transition: background 0.15s;
}
.report-chip:hover { background: rgba(34,211,238,0.16); }

.session-card__proj-tag {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 9px; font-weight: 600; color: #A78BFA;
  padding: 1px 5px; border-radius: 4px;
  border: 1px solid rgba(167,139,250,0.15);
  background: rgba(167,139,250,0.07);
  max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ── STM messages ───────────────────────────────────────────────────────────── */
.stm-messages {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
  max-height: 280px; overflow-y: auto; flex: 1;
}
.stm-msg { display: flex; flex-direction: column; gap: 3px; }
.stm-msg__role {
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; opacity: 0.5;
}
.stm-msg--human .stm-msg__role { color: #A5B4FC; }
.stm-msg--ai    .stm-msg__role { color: #86EFAC; }
.stm-msg__bubble {
  padding: 8px 11px; border-radius: 8px;
  font-size: 12px; line-height: 1.5;
  word-break: break-word; white-space: pre-wrap;
}
.stm-msg--human .stm-msg__bubble {
  background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.15); color: #C7D2FE;
}
.stm-msg--ai .stm-msg__bubble {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); color: #94A3B8;
}

.stm-snap-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 14px;
  border-top: 1px solid rgba(255,255,255,0.04);
  background: rgba(255,255,255,0.02);
}
.stm-snap-label { font-size: 11px; color: rgba(226,232,240,0.35); }
.stm-snap-ts    { font-size: 11px; color: rgba(226,232,240,0.25); }
.stm-to-ltm-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 600;
  background: rgba(20,184,166,0.1); border: 1px solid rgba(20,184,166,0.25); color: #14B8A6;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
}
.stm-to-ltm-btn:hover:not(:disabled) { background: rgba(20,184,166,0.2); }
.stm-to-ltm-btn:disabled { opacity: 0.4; cursor: default; }
.stm-to-ltm-btn--loading { opacity: 0.7; pointer-events: none; }

/* ── WM ─────────────────────────────────────────────────────────────────────── */
.wm-live-badge {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  color: #FCD34D; background: rgba(245,158,11,0.12);
  border: 1px solid rgba(245,158,11,0.25);
  padding: 2px 8px; border-radius: 20px;
}
.wm-live-badge__dot {
  width: 5px; height: 5px; border-radius: 50%; background: #FCD34D;
  animation: pulse-dot 1.5s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}
.wm-body {
  padding: 12px 14px; flex: 1;
  display: flex; flex-direction: column; gap: 8px;
}
.wm-row {
  display: flex; gap: 8px; align-items: flex-start;
  padding: 6px 10px; border-radius: 7px;
  background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.1);
}
.wm-row__key {
  font-size: 11px; font-weight: 600; color: #FCD34D;
  min-width: 90px; flex-shrink: 0; opacity: 0.8; padding-top: 1px;
}
.wm-row__val {
  font-size: 12px; color: #CBD5E1; line-height: 1.4;
  word-break: break-word; white-space: pre-wrap;
}
.wm-updated { font-size: 11px; color: rgba(226,232,240,0.2); text-align: right; padding-top: 4px; }
.wm-idle {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px;
  padding: 28px 14px; text-align: center; flex: 1;
}
.wm-idle__text { font-size: 13px; color: rgba(226,232,240,0.35); }
.wm-idle__sub  { font-size: 11px; color: rgba(226,232,240,0.2); }
.wm-schema {
  padding: 8px 14px; border-top: 1px solid rgba(255,255,255,0.04);
  background: rgba(255,255,255,0.02);
}
.wm-schema__title {
  font-size: 10px; color: rgba(226,232,240,0.25);
  margin-bottom: 5px; letter-spacing: 0.04em; text-transform: uppercase;
}
.wm-schema__fields { display: flex; flex-wrap: wrap; gap: 4px; }
.wm-schema__field {
  font-size: 10px; padding: 1px 7px; border-radius: 4px;
  background: rgba(245,158,11,0.08); color: rgba(245,158,11,0.5);
  border: 1px solid rgba(245,158,11,0.12); font-family: monospace;
}

/* ── LTM ─────────────────────────────────────────────────────────────────────── */
.ltm-stats-bar {
  display: flex; gap: 6px; flex-wrap: wrap;
  padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.ltm-stat-chip {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: rgba(226,232,240,0.4);
  padding: 3px 9px; border-radius: 6px;
  background: rgba(20,184,166,0.06); border: 1px solid rgba(20,184,166,0.12);
}
.ltm-stat-chip--ready { color: #4ADE80; border-color: rgba(74,222,128,0.2); background: rgba(74,222,128,0.06); }

.ltm-search-row {
  display: flex; align-items: center;
  padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.ltm-search-input {
  flex: 1; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-right: none; border-radius: 7px 0 0 7px;
  color: #CBD5E1; font-size: 12px; padding: 6px 12px; outline: none;
}
.ltm-search-input::placeholder { color: rgba(226,232,240,0.25); }
.ltm-search-input:focus { border-color: rgba(20,184,166,0.4); }
.ltm-search-btn {
  padding: 6px 12px;
  background: rgba(20,184,166,0.15); border: 1px solid rgba(20,184,166,0.3);
  border-radius: 0 7px 7px 0; cursor: pointer; color: #5EEAD4;
  transition: background 0.15s; display: flex; align-items: center;
}
.ltm-search-btn:hover:not(:disabled) { background: rgba(20,184,166,0.25); }
.ltm-search-btn:disabled { opacity: 0.4; cursor: default; }

.ltm-results {
  padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
  max-height: 340px; overflow-y: auto; flex: 1;
}
.ltm-result {
  padding: 9px 11px; border-radius: 8px;
  background: rgba(20,184,166,0.05); border: 1px solid rgba(20,184,166,0.12);
}
.ltm-result__header { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.ltm-result__idx    { font-size: 10px; color: #5EEAD4; font-weight: 700; flex-shrink: 0; }
.ltm-result__sim-bar { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.08); }
.ltm-result__sim-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #14B8A6, #06B6D4); transition: width 0.3s; }
.ltm-result__score  { font-size: 10px; color: #5EEAD4; font-weight: 600; flex-shrink: 0; }
.ltm-result__ts     { font-size: 10px; color: rgba(226,232,240,0.25); flex-shrink: 0; }
.ltm-result__content {
  font-size: 12px; color: #94A3B8; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
  max-height: 120px; overflow-y: auto;
}

/* ── Shared ──────────────────────────────────────────────────────────────────── */
.empty-state {
  padding: 20px 14px; text-align: center;
  font-size: 13px; color: rgba(226,232,240,0.3);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}

/* ── Scrollbars ──────────────────────────────────────────────────────────────── */
.session-list::-webkit-scrollbar,
.stm-messages::-webkit-scrollbar,
.ltm-results::-webkit-scrollbar { width: 4px; }
.session-list::-webkit-scrollbar-track,
.stm-messages::-webkit-scrollbar-track,
.ltm-results::-webkit-scrollbar-track { background: transparent; }
.session-list::-webkit-scrollbar-thumb  { background: rgba(99,102,241,0.2); border-radius: 2px; }
.stm-messages::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }
.ltm-results::-webkit-scrollbar-thumb  { background: rgba(20,184,166,0.3); border-radius: 2px; }
</style>

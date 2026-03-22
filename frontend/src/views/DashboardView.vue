<template>
  <div class="dash-root">

    <!-- Header -->
    <div class="dash-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">System overview &amp; live activity</div>
      </div>
      <v-btn icon="mdi-refresh" variant="text" size="small" :loading="loading" @click="fetchStats"
        style="color:rgba(226,232,240,0.5)" />
    </div>

    <!-- Active run banner — bottom of header -->
    <div v-if="anyAgentWorking" class="run-banner">
      <span class="run-banner__dot" />
      <span class="run-banner__label">Running</span>
      <v-chip v-for="a in workingAgents" :key="a.agentId"
        size="x-small" :color="agentChipColor(a.agentId)" variant="tonal" class="mx-1">
        {{ a.agentId }}
      </v-chip>
      <span v-if="workingAgents[0]?.currentTask" class="run-banner__task">
        — {{ workingAgents[0].currentTask }}
      </span>
    </div>

    <!-- Stat cards -->
    <div class="stat-grid">
      <div v-for="stat in statCards" :key="stat.label" class="stat-card card-hover">
        <div class="stat-card__icon" :style="`background:${stat.bg}`">
          <v-icon :color="stat.color" size="18">{{ stat.icon }}</v-icon>
        </div>
        <div class="stat-card__body">
          <div class="stat-number">{{ stat.value }}</div>
          <div class="stat-card__label">{{ stat.label }}</div>
        </div>
        <div class="stat-card__accent" :style="`background:${stat.color}`" />
      </div>
    </div>

    <!-- Token Usage — full width -->
    <div class="panel card-hover">
      <div class="panel__header">
        <v-icon size="15" color="#6366F1">mdi-counter</v-icon>
        <span class="section-title">Token Usage</span>
        <span class="token-total-badge">{{ fmtTokens(tokenUsage.total) }} total</span>
      </div>
      <div class="token-grid">
        <div class="token-card">
          <div class="token-card__label">Today</div>
          <div class="token-card__value">{{ fmtTokens(tokenUsage.today) }}</div>
          <div class="token-card__bar"><div class="token-card__fill" :style="`width:${tokenPct(tokenUsage.today)}%;background:#6366F1`" /></div>
        </div>
        <div class="token-card">
          <div class="token-card__label">This Week</div>
          <div class="token-card__value">{{ fmtTokens(tokenUsage.weekly) }}</div>
          <div class="token-card__bar"><div class="token-card__fill" :style="`width:${tokenPct(tokenUsage.weekly)}%;background:#22D3EE`" /></div>
        </div>
        <div class="token-card">
          <div class="token-card__label">This Month</div>
          <div class="token-card__value">{{ fmtTokens(tokenUsage.monthly) }}</div>
          <div class="token-card__bar"><div class="token-card__fill" :style="`width:${tokenPct(tokenUsage.monthly)}%;background:#10B981`" /></div>
        </div>
        <div class="token-card">
          <div class="token-card__label">All Time</div>
          <div class="token-card__value token-card__value--accent">{{ fmtTokens(tokenUsage.total) }}</div>
          <div class="token-card__bar"><div class="token-card__fill" style="width:100%;background:#F59E0B" /></div>
        </div>
        <template v-for="(t, agent) in tokenUsage.byAgent" :key="agent">
          <div class="token-card token-card--agent">
            <div class="token-card__label">{{ agent }}</div>
            <div class="token-card__value token-card__value--sm">{{ fmtTokens(t) }}</div>
            <div class="token-card__bar">
              <div class="token-card__fill" :style="`width:${tokenUsage.total ? Math.round(t/tokenUsage.total*100) : 0}%;background:${agentTokenColor(agent)}`" />
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Agent Status — horizontal bar, full width -->
    <div class="panel card-hover">
      <div class="panel__header">
        <v-icon size="15" color="#6366F1">mdi-robot-outline</v-icon>
        <span class="section-title">Agent Status</span>
      </div>
      <div class="agent-h-list">
        <div v-for="agent in agentStatuses" :key="agent.agentId"
          class="agent-h-card"
          :class="{ 'agent-h-card--working': agentLiveStatus[agent.agentId] === 'working' }">
          <div class="agent-h-card__top">
            <span :class="['status-dot',
              agentLiveStatus[agent.agentId] === 'working' ? 'status-dot--working'
              : agent.available ? 'status-dot--online' : 'status-dot--offline']" />
            <span class="agent-h-card__name">{{ agent.agentId }}</span>
            <v-chip :color="agent.available ? 'success' : 'error'" size="x-small" variant="tonal" class="ml-auto">
              {{ agent.available ? 'Online' : 'Offline' }}
            </v-chip>
          </div>
          <div class="agent-h-card__model">{{ agent.model }}</div>
          <div class="agent-h-card__bottom">
            <div v-if="agentLiveStatus[agent.agentId] === 'working'" class="working-badge">
              <svg class="working-spinner" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6" fill="none" stroke="#F59E0B" stroke-width="2"
                  stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round"/>
              </svg>
              <span>Running</span>
            </div>
            <div v-else class="idle-badge">{{ agentLiveStatus[agent.agentId] || 'idle' }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main 2-column grid -->
    <div class="dash-main-grid">

      <!-- ── Left column ───────────────────────────────────────── -->
      <div class="dash-col">

        <!-- Workflow Graph -->
        <div class="panel card-hover">
          <WorkflowGraph />
        </div>

      </div><!-- /dash-col left -->

      <!-- ── Right column ──────────────────────────────────────── -->
      <div class="dash-col">

        <!-- Job Queue -->
        <div class="panel card-hover">
          <div class="panel__header">
            <v-icon size="15" color="#6366F1">mdi-tray-full</v-icon>
            <span class="section-title">Job Queue</span>
            <span v-if="queue.length" class="queue-depth-badge">{{ queue.length }}</span>
            <span v-if="queueHasPending" class="live-dot" style="margin-left:auto" />
          </div>
          <div class="queue-list">
            <div v-for="job in queue" :key="job.id"
              class="queue-row"
              :class="{ 'queue-row--running': job.status === 'running' }">
              <div class="queue-row__pos">
                <span v-if="job.status === 'running'" class="q-running-dot" />
                <span v-else class="q-pos-badge">{{ job.position }}</span>
              </div>
              <v-chip
                :color="job.type === 'workflow' ? 'primary' : 'info'"
                size="x-small" variant="tonal" class="flex-shrink-0">
                {{ job.type }}
              </v-chip>
              <div class="queue-row__label" :title="job.label">{{ job.label }}</div>
              <span v-if="job.projectId" class="q-proj-tag">
                <v-icon size="10" color="#A78BFA">mdi-folder-outline</v-icon>
                {{ projectMap[job.projectId] || job.projectId.slice(0, 8) }}
              </span>
              <div class="queue-row__status">
                <span v-if="job.status === 'running'" class="q-running-badge">
                  <svg viewBox="0 0 16 16" style="width:11px;height:11px;flex-shrink:0">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="#22D3EE"
                      stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round"
                      style="animation:spin 1s linear infinite"/>
                  </svg>
                  Running
                </span>
                <span v-else class="q-waiting-badge">Waiting</span>
              </div>
              <button v-if="job.status === 'queued'"
                class="q-cancel-btn" title="Cancel job"
                @click="cancelJob(job.id)">
                <v-icon size="11">mdi-close</v-icon>
              </button>
            </div>
            <div v-if="!queue.length" class="empty-state">Queue is empty</div>
          </div>
        </div>

        <!-- Recent Runs -->
        <div class="panel card-hover">
          <div class="panel__header">
            <v-icon size="15" color="#6366F1">mdi-history</v-icon>
            <span class="section-title">Recent Runs</span>
          </div>
          <div class="run-list">
            <div v-for="run in recentRuns" :key="run.id" class="run-row">
              <div class="run-row__id font-mono">{{ run.id.slice(0, 10) }}</div>
              <div class="run-row__time">{{ new Date(run.started_at * 1000).toLocaleString() }}</div>
              <span v-if="run.project_id" class="run-proj-tag">
                <v-icon size="10" color="#A78BFA">mdi-folder-outline</v-icon>
                {{ projectMap[run.project_id] || run.project_id.slice(0, 8) }}
              </span>
              <v-chip :color="statusColor(run.status)" size="x-small" variant="tonal">{{ run.status }}</v-chip>
              <button v-if="run.status === 'running'"
                class="run-stop-btn"
                :class="{ 'run-stop-btn--stopping': stoppingRunId === run.id }"
                :disabled="stoppingRunId === run.id"
                @click="stopRun(run.id)">
                <v-icon size="11">mdi-stop-circle-outline</v-icon>
                {{ stoppingRunId === run.id ? 'Stopping…' : 'Stop' }}
              </button>
              <router-link v-else-if="reportSessions.has(run.session_id)"
                :to="`/report/${run.session_id}`"
                class="report-btn">
                <v-icon size="12">mdi-file-chart-outline</v-icon> Walkthrough
              </router-link>
              <span v-else style="font-size:11px;color:rgba(226,232,240,0.15);width:72px"></span>
              <button v-if="run.status !== 'running'" class="repeat-btn"
                @click="repeatRun(run)" title="Repeat this workflow">
                <v-icon size="11">mdi-repeat</v-icon>
              </button>
            </div>
            <div v-if="!recentRuns.length" class="empty-state">No runs yet</div>
          </div>
        </div>

      </div><!-- /dash-col right -->

    </div><!-- /dash-main-grid -->

    <!-- Live Logs — full width -->
    <div class="panel card-hover">
      <div class="panel__header">
        <div class="d-flex align-center gap-2">
          <span class="live-dot" />
          <v-icon size="15" color="#10B981">mdi-console</v-icon>
          <span class="section-title">Live Logs</span>
        </div>
        <v-btn size="x-small" variant="text" @click="logs = []"
          style="color:rgba(226,232,240,0.4);font-size:11px">Clear</v-btn>
      </div>
      <div ref="logContainer" class="log-feed">
        <div v-for="(log, i) in logs" :key="i" class="log-line">
          <span class="log-line__time">{{ formatTime(log.timestamp) }}</span>
          <span class="log-line__badge" :style="`background:${levelBg(log.level)};color:${levelFg(log.level)}`">
            {{ log.level }}
          </span>
          <span v-if="log.agentId" class="log-line__agent">[{{ log.agentId }}]</span>
          <span class="log-line__msg" :style="`color:${levelFg(log.level)}`">{{ log.message }}</span>
        </div>
        <div v-if="!logs.length" class="empty-state">Waiting for logs…</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';
import WorkflowGraph from '../components/WorkflowGraph.vue';

const router = useRouter();

const socket = useSocket();
const loading = ref(false);
const stats = ref({});
const agentStatuses = ref([]);
const recentRuns = ref([]);
const reportSessions = ref(new Set());
const stoppingRunId = ref(null);
const projects = ref([]);
const projectMap = computed(() => Object.fromEntries(projects.value.map(p => [p.id, p.title])));

async function stopRun(runId) {
  stoppingRunId.value = runId;
  try {
    await axios.post(`/api/workflow/stop/${runId}`);
  } catch { /* best-effort */ }
  finally { stoppingRunId.value = null; }
}

function repeatRun(run) {
  const params = new URLSearchParams();
  try {
    const state = JSON.parse(run.graph_state_json || '{}');
    const goalText = state.goal || state.userGoal || '';
    if (goalText) params.set('goal', goalText);
  } catch {}
  if (run.project_id) params.set('projectId', run.project_id);
  router.push(`/workflow?${params.toString()}`);
}

async function cancelJob(jobId) {
  try { await axios.delete(`/api/queue/${jobId}`); } catch { /* best-effort */ }
}

async function fetchQueue() {
  try {
    const { data } = await axios.get('/api/queue');
    queue.value = data.queue || [];
  } catch { /* keep empty */ }
}

async function fetchRecentRuns() {
  try {
    const { data } = await axios.get('/api/workflow/runs');
    recentRuns.value = data.slice(0, 10);
  } catch { /* keep existing */ }
}
const logs = ref([]);
const queue = ref([]);
const queueHasPending = computed(() => queue.value.some(j => j.status === 'queued'));
const tokenUsage = ref({ today: 0, weekly: 0, monthly: 0, total: 0, byAgent: {} });
const agentLiveStatus = ref({});
const agentCurrentTask = ref({});
const logContainer = ref(null);

const statCards = computed(() => [
  { label: 'Total Runs',    value: stats.value.totalRuns    || 0, icon: 'mdi-run',        color: '#6366F1', bg: 'rgba(99,102,241,0.12)'  },
  { label: 'Active Runs',   value: stats.value.activeRuns   || 0, icon: 'mdi-play-circle', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  { label: 'Messages',      value: stats.value.totalMessages || 0, icon: 'mdi-message',    color: '#22D3EE', bg: 'rgba(34,211,238,0.12)'  },
  { label: 'Log Entries',   value: stats.value.totalLogs    || 0, icon: 'mdi-text-box',   color: '#38BDF8', bg: 'rgba(56,189,248,0.12)'  },
]);

const anyAgentWorking = computed(() => Object.values(agentLiveStatus.value).some(s => s === 'working'));
const workingAgents = computed(() =>
  agentStatuses.value.filter(a => agentLiveStatus.value[a.agentId] === 'working')
    .map(a => ({ ...a, currentTask: agentCurrentTask.value[a.agentId] }))
);

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}
function tokenPct(n) {
  const max = tokenUsage.value.total || 1;
  return Math.min(100, Math.round(n / max * 100));
}
function agentTokenColor(id) {
  return { researcher: '#22D3EE', planner: '#6366F1', worker: '#10B981', reviewer: '#F59E0B' }[id] || '#A78BFA';
}

async function fetchTokenUsage() {
  try {
    const { data } = await axios.get('/api/dashboard/tokens');
    tokenUsage.value = data;
  } catch { /* keep zeros */ }
}

async function fetchStats() {
  loading.value = true;
  try {
    const [{ data }, { data: runs }, { data: rpt }, { data: projs }] = await Promise.all([
      axios.get('/api/dashboard/stats'),
      axios.get('/api/workflow/runs'),
      axios.get('/api/reports/sessions'),
      axios.get('/api/projects'),
    ]);
    projects.value = projs || [];
    stats.value = data;
    const order = ['planner', 'researcher', 'worker', 'reviewer'];
    agentStatuses.value = (data.agents || []).sort((a, b) => {
      const ai = order.indexOf(a.agentId), bi = order.indexOf(b.agentId);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    recentRuns.value = runs.slice(0, 10);
    reportSessions.value = new Set(rpt.sessions || []);
    await fetchTokenUsage();
  } finally { loading.value = false; }
}

function statusColor(s) {
  return { complete: 'success', running: 'warning', error: 'error', pending: 'default', stopped: 'default' }[s] || 'default';
}
function agentChipColor(id) {
  return { researcher: 'info', planner: 'primary', worker: 'success', reviewer: 'warning' }[id] || 'default';
}
function levelBg(l) {
  return { error: 'rgba(239,68,68,0.12)', warn: 'rgba(245,158,11,0.12)', info: 'rgba(56,189,248,0.1)', debug: 'rgba(255,255,255,0.06)' }[l] || 'rgba(255,255,255,0.06)';
}
function levelFg(l) {
  return { error: '#EF4444', warn: '#F59E0B', info: '#38BDF8', debug: 'rgba(226,232,240,0.4)' }[l] || '#E2E8F0';
}
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : ''; }

async function scrollLogs() {
  await nextTick();
  if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
}

onMounted(() => {
  fetchStats();
  fetchQueue();
  socket.on('queue:updated', (data) => {
    const hadRunning = queue.value.some(j => j.status === 'running');
    queue.value = data.queue || [];
    const hasRunning = queue.value.some(j => j.status === 'running');
    // A job just finished — refresh Recent Runs immediately
    if (hadRunning && !hasRunning) fetchRecentRuns();
  });

  socket.on('log:entry', (entry) => {
    logs.value.push(entry);
    if (logs.value.length > 200) logs.value.shift();
    scrollLogs();
  });

  socket.on('agent:status', (data) => {
    agentLiveStatus.value = { ...agentLiveStatus.value, [data.agentId]: data.status };
    if (data.status === 'working' && data.currentTask) {
      agentCurrentTask.value = { ...agentCurrentTask.value, [data.agentId]: data.currentTask };
    } else if (data.status === 'idle') {
      agentCurrentTask.value = { ...agentCurrentTask.value, [data.agentId]: null };
    }
  });

  socket.on('dashboard:stats', (data) => { stats.value = { ...stats.value, ...data }; });

  socket.on('workflow:started', () => {
    stats.value = { ...stats.value, activeRuns: (stats.value.activeRuns || 0) + 1 };
    fetchRecentRuns();
  });

  socket.on('workflow:complete', (data) => {
    fetchTokenUsage();
    stats.value = { ...stats.value, activeRuns: Math.max(0, (stats.value.activeRuns || 1) - 1) };
    const run = recentRuns.value.find(r => r.id === data.runId);
    if (run) run.status = 'complete';
    else fetchRecentRuns();
  });

  socket.on('workflow:stopped', (data) => {
    stats.value = { ...stats.value, activeRuns: Math.max(0, (stats.value.activeRuns || 1) - 1) };
    const run = recentRuns.value.find(r => r.id === data.runId);
    if (run) run.status = 'stopped';
    else fetchRecentRuns();
  });

  socket.on('workflow:error', (data) => {
    stats.value = { ...stats.value, activeRuns: Math.max(0, (stats.value.activeRuns || 1) - 1) };
    const run = recentRuns.value.find(r => r.id === data.runId);
    if (run) run.status = 'error';
    else fetchRecentRuns();
  });

  const interval = setInterval(fetchStats, 30000);
  onUnmounted(() => {
    clearInterval(interval);
    socket.off('queue:updated');
    socket.off('log:entry');
    socket.off('agent:status');
    socket.off('dashboard:stats');
    socket.off('workflow:started');
    socket.off('workflow:complete');
    socket.off('workflow:stopped');
    socket.off('workflow:error');
  });
});
</script>

<style scoped>
.dash-root { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

/* Header */
.dash-header { display: flex; align-items: flex-start; justify-content: space-between; }

/* Run banner */
.run-banner {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(245,158,11,0.07);
  border: 1px solid rgba(245,158,11,0.2);
  font-size: 13px;
  min-width: 0;
}
.run-banner__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #F59E0B;
  animation: pulse-dot 1.2s ease-in-out infinite;
}
.run-banner__label { font-weight: 600; color: #F59E0B !important; }
.run-banner__task  { font-size: 12px; color: rgba(226,232,240,0.5) !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; max-width: 90%; }

/* Stat grid */
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .stat-grid { grid-template-columns: 1fr; } }

.stat-card {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 16px;
  display: flex; align-items: center; gap: 14px;
  position: relative;
  overflow: hidden;
}
.stat-card__icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.stat-card__label { font-size: 11px; color: rgba(226,232,240,0.4) !important; margin-top: 3px; letter-spacing: 0.2px; }
.stat-card__accent {
  position: absolute; bottom: 0; left: 0; right: 0; height: 2px; opacity: 0.25;
}

/* Main 2-column grid */
.dash-main-grid {
  display: grid;
  grid-template-columns: 55fr 45fr;
  gap: 12px;
  align-items: stretch;
}
.dash-col { display: flex; flex-direction: column; gap: 12px; }
.dash-col:first-child { height: 100%; }
.dash-col:first-child > .panel { flex: 1; display: flex; flex-direction: column; }
.dash-col:first-child > .panel .graph-body { flex: 1; display: flex; align-items: center; }
@media (max-width: 900px) { .dash-main-grid { grid-template-columns: 1fr; } }

/* Panel */
.panel {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 7px; padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.panel__header > div { display: flex; align-items: center; gap: 7px; }

/* Agent Status — horizontal cards */
.agent-h-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  border-top: 1px solid rgba(255,255,255,0.04);
}
@media (max-width: 700px) { .agent-h-list { grid-template-columns: repeat(2, 1fr); } }

.agent-h-card {
  padding: 12px 16px;
  display: flex; flex-direction: column; gap: 4px;
  border-right: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}
.agent-h-card:last-child { border-right: none; }
.agent-h-card:hover { background: rgba(255,255,255,0.02); }
.agent-h-card--working {
  background: rgba(245,158,11,0.04) !important;
  border-top: 2px solid #F59E0B;
  padding-top: 10px;
}

.agent-h-card__top {
  display: flex; align-items: center; gap: 7px;
}
.agent-h-card__name {
  font-size: 13px; font-weight: 600; text-transform: capitalize;
  color: rgba(226,232,240,0.9);
}
.agent-h-card__model {
  font-size: 11px; color: rgba(226,232,240,0.32);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agent-h-card__bottom {
  display: flex; align-items: center; gap: 6px; margin-top: 2px;
}

/* Working badge */
.working-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 6px;
  background: rgba(245,158,11,0.12);
  border: 1px solid rgba(245,158,11,0.3);
  font-size: 11px; font-weight: 600; color: #F59E0B !important;
}
.working-spinner {
  width: 13px; height: 13px; flex-shrink: 0;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.idle-badge {
  font-size: 11px; color: rgba(226,232,240,0.3) !important;
  text-transform: capitalize;
}

/* Status dots */
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.status-dot--online  { background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.5); }
.status-dot--offline { background: #EF4444; }
.status-dot--working { background: #F59E0B; animation: pulse-dot 1.2s ease-in-out infinite; }

/* Run list */
.run-list { padding: 6px 0; }
.run-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px;
  transition: background 0.15s;
}
.run-row:hover { background: rgba(255,255,255,0.025); }
.run-row__id   { font-size: 12px; font-weight: 500; flex: 1; }
.run-row__time { font-size: 11px; color: rgba(226,232,240,0.35) !important; flex-shrink: 0; }

.report-btn {
  display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
  font-size: 11px; font-weight: 600;
  color: #22D3EE; text-decoration: none;
  padding: 2px 7px; border-radius: 4px;
  border: 1px solid rgba(34,211,238,0.25);
  background: rgba(34,211,238,0.07);
  transition: background 0.15s;
}
.report-btn:hover { background: rgba(34,211,238,0.15); }

.run-stop-btn {
  display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
  font-size: 11px; font-weight: 600;
  color: #EF4444;
  padding: 2px 7px; border-radius: 4px;
  border: 1px solid rgba(239,68,68,0.25);
  background: rgba(239,68,68,0.07);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}
.run-stop-btn:hover:not(:disabled) { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.45); }
.run-stop-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.run-stop-btn--stopping { color: #F59E0B; border-color: rgba(245,158,11,0.25); background: rgba(245,158,11,0.07); }

.run-proj-tag, .q-proj-tag {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600; color: #A78BFA;
  padding: 1px 6px; border-radius: 4px;
  border: 1px solid rgba(167,139,250,0.2);
  background: rgba(167,139,250,0.07);
  max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}

/* Log feed */
.log-feed {
  height: 220px; overflow-y: auto;
  padding: 8px 0; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px;
}
.log-line {
  display: flex; align-items: baseline; gap: 8px;
  padding: 3px 14px;
}
.log-line__time  { color: rgba(226,232,240,0.3) !important; flex-shrink: 0; font-size: 11px; }
.log-line__badge { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; flex-shrink: 0; text-transform: uppercase; }
.log-line__agent { color: #22D3EE !important; flex-shrink: 0; }
.log-line__msg   { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Live dot */
.live-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.6);
  animation: pulse-dot 2s ease-in-out infinite;
}

/* Empty state */
.empty-state { padding: 16px 14px; font-size: 13px; color: rgba(226,232,240,0.3) !important; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

.gap-2 { gap: 8px; }

/* Token Usage */
.token-total-badge {
  font-size: 11px; color: rgba(226,232,240,0.35);
  background: rgba(255,255,255,0.04); padding: 2px 8px; border-radius: 4px;
  margin-left: auto;
}
.token-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 1px;
  border-top: 1px solid rgba(255,255,255,0.04);
}
@media (max-width: 1100px) { .token-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 600px)  { .token-grid { grid-template-columns: repeat(2, 1fr); } }

.token-card {
  padding: 14px 16px;
  border-right: 1px solid rgba(255,255,255,0.04);
}
.token-card:last-child { border-right: none; }
.token-card--agent .token-card__label { text-transform: capitalize; color: rgba(226,232,240,0.5); }
.token-card__label { font-size: 11px; color: rgba(226,232,240,0.4); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.token-card__value { font-size: 22px; font-weight: 700; color: rgba(226,232,240,0.9); margin-bottom: 8px; font-family: 'JetBrains Mono','Fira Code',monospace; }
.token-card__value--accent { color: #F59E0B; }
.token-card__value--sm { font-size: 18px; }
.token-card__bar  { height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.token-card__fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; }

/* ── Job Queue panel ── */
.queue-list { padding: 4px 0; }

.queue-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.queue-row:last-child { border-bottom: none; }
.queue-row:hover { background: rgba(255,255,255,0.02); }
.queue-row--running {
  background: rgba(34,211,238,0.04) !important;
  border-left: 2px solid #22D3EE;
  padding-left: 12px;
}

.queue-row__pos {
  width: 20px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.queue-row__label {
  flex: 1; min-width: 0;
  font-size: 12px; color: rgba(226,232,240,0.75);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.queue-row__status { flex-shrink: 0; }

.q-pos-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  font-size: 10px; font-weight: 700;
  background: rgba(255,255,255,0.07);
  color: rgba(226,232,240,0.45);
}
.q-running-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #22D3EE; box-shadow: 0 0 6px #22D3EE;
  animation: pulse-dot 1.2s ease-in-out infinite;
}
.q-running-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: #22D3EE;
}
.q-waiting-badge {
  font-size: 11px; color: rgba(226,232,240,0.28);
}
.q-cancel-btn {
  width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  color: #EF4444; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}
.q-cancel-btn:hover { background: rgba(239,68,68,0.18); border-color: rgba(239,68,68,0.4); }

.queue-depth-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px;
  font-size: 10px; font-weight: 700;
  background: rgba(99,102,241,0.18);
  border: 1px solid rgba(99,102,241,0.3);
  color: #818CF8;
}

.repeat-btn {
  width: 24px; height: 24px; border-radius: 4px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.22);
  color: #F59E0B; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}
.repeat-btn:hover { background: rgba(245,158,11,0.18); border-color: rgba(245,158,11,0.45); }
</style>

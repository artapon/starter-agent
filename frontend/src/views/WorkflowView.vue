<template>
  <div class="page-root">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title">Workflow</div>
        <div class="page-subtitle">Run and monitor multi-agent pipelines</div>
      </div>
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh"
        @click="fetchRuns" style="color:rgba(226,232,240,0.45);font-size:12px">
        Refresh
      </v-btn>
    </div>

    <!-- Top row -->
    <div class="wf-top-grid">

      <!-- Start workflow -->
      <div class="panel card-hover">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#6366F1">mdi-play-circle-outline</v-icon>
            <span class="section-title">New Workflow</span>
          </div>
          <span v-if="isRunning" class="running-pill">
            <span class="running-pill__dot" />
            Running
          </span>
        </div>
        <div class="panel__body">
          <v-select
            v-model="projectId"
            :items="projects"
            item-title="title"
            item-value="id"
            label="Project"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
            style="font-size:13px"
          >
            <template #prepend-inner>
              <v-icon size="14" color="#A78BFA">mdi-folder-outline</v-icon>
            </template>
          </v-select>
          <v-textarea
            v-model="goal"
            label="Goal"
            placeholder="e.g. Build a REST API with JWT authentication and CRUD endpoints..."
            rows="4" variant="outlined" hide-details
            style="font-size:14px"
          />
          <div class="wf-action-row mt-3">
            <v-btn color="primary" :loading="starting"
              :disabled="!goal.trim() || isRunning || !projectId"
              prepend-icon="mdi-play-circle-outline" @click="startWorkflow"
              style="box-shadow:0 2px 12px rgba(99,102,241,0.2)">
              Run Workflow
            </v-btn>
            <v-btn v-if="isRunning && activeRun?.runId"
              color="error" variant="tonal" :loading="stopping"
              prepend-icon="mdi-stop-circle-outline" @click="stopWorkflow">
              Stop
            </v-btn>
            <span v-if="!projectId" class="wf-tip" style="color:rgba(167,139,250,0.7)">Select a project to run</span>
            <span v-else class="wf-tip">Researcher → Planner → Worker → Reviewer</span>
          </div>
        </div>
      </div>

      <!-- Active run -->
      <div class="panel card-hover" v-if="activeRun">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <div class="run-status-dot" :class="`run-status-dot--${activeRun.status}`" />
            <span class="section-title">Active Run</span>
            <button v-if="isRunning" class="inline-stop-btn" :class="{ 'inline-stop-btn--stopping': stopping }"
              @click="stopWorkflow" :disabled="stopping">
              <v-icon size="11">mdi-stop-circle-outline</v-icon>
              {{ stopping ? 'Stopping…' : 'Stop' }}
            </button>
            <span class="run-id font-mono">{{ activeRun.runId?.slice(0, 8) }}</span>
          </div>
          <v-chip :color="runStatusColor(activeRun.status)" size="x-small" variant="tonal">
            {{ activeRun.status }}
          </v-chip>
        </div>
        <div class="timeline-wrap">
          <div v-for="(event, idx) in nodeEvents" :key="event.ts" class="timeline-item">
            <div class="timeline-line" v-if="idx < nodeEvents.length - 1" />
            <div class="timeline-dot-wrap">
              <div class="timeline-dot" :style="`background:${nodeColorHex(event.status)}`" />
            </div>
            <div class="timeline-content">
              <div class="timeline-node">
                <span class="timeline-node-icon">{{ nodeEmoji(event.node) }}</span>
                {{ event.node }}
                <span class="timeline-badge" :style="`background:${nodeColorBg(event.status)};color:${nodeColorHex(event.status)}`">
                  {{ event.status }}
                </span>
              </div>
              <div class="timeline-time">{{ formatTime(event.ts) }}</div>
            </div>
          </div>
          <div v-if="!nodeEvents.length" class="empty-state">
            <v-icon size="28" style="color:rgba(226,232,240,0.15);display:block;margin-bottom:6px">mdi-timer-sand</v-icon>
            Waiting to start…
          </div>
        </div>
      </div>
      <div v-else class="panel panel--placeholder">
        <v-icon size="36" style="color:rgba(226,232,240,0.1)">mdi-graph-outline</v-icon>
        <div style="font-size:13px;color:rgba(226,232,240,0.2);margin-top:8px;font-weight:500">No active run</div>
        <div style="font-size:11px;color:rgba(226,232,240,0.12);margin-top:3px">Start a workflow to see live progress</div>
      </div>
    </div>

    <!-- Run history -->
    <div class="panel card-hover">
      <div class="panel__header">
        <v-icon size="15" color="#6366F1">mdi-history</v-icon>
        <span class="section-title">Run History</span>
      </div>
      <v-data-table
        :headers="headers"
        :items="runs"
        density="compact"
        :items-per-page="10"
        class="bg-transparent history-table"
      >
        <template #item.id="{ item }">
          <span class="font-mono" style="font-size:12px">{{ item.id.slice(0, 12) }}…</span>
        </template>
        <template #item.project_id="{ item }">
          <span v-if="item.project_id" class="proj-tag">
            <v-icon size="11" color="#A78BFA">mdi-folder-outline</v-icon>
            {{ projectMap[item.project_id] || item.project_id.slice(0, 8) }}
          </span>
          <span v-else style="font-size:11px;color:rgba(226,232,240,0.2)">—</span>
        </template>
        <template #item.session_id="{ item }">
          <span class="font-mono" style="font-size:12px;color:rgba(226,232,240,0.45)">{{ item.session_id.slice(0, 12) }}…</span>
        </template>
        <template #item.status="{ item }">
          <v-chip :color="runStatusColor(item.status)" size="x-small" variant="tonal">
            {{ item.status }}
          </v-chip>
        </template>
        <template #item.started_at="{ item }">
          <span style="font-size:12px;color:rgba(226,232,240,0.55)">
            {{ new Date(item.started_at * 1000).toLocaleString() }}
          </span>
        </template>
        <template #item.report="{ item }">
          <router-link v-if="reportSessions.has(item.session_id)"
            :to="`/report/${item.session_id}`"
            class="report-btn">
            <v-icon size="13">mdi-file-chart-outline</v-icon> Walkthrough
          </router-link>
          <span v-else style="font-size:11px;color:rgba(226,232,240,0.2)">—</span>
        </template>
      </v-data-table>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();
const goal = ref('');
const projectId = ref(null);
const projects = ref([]);
const starting = ref(false);
const stopping = ref(false);
const runs = ref([]);
const activeRun = ref(null);
const nodeEvents = ref([]);

const projectMap = computed(() => Object.fromEntries(projects.value.map(p => [p.id, p.title])));

const isRunning = computed(() => activeRun.value?.status === 'running');

async function loadProjects() {
  try { projects.value = await axios.get('/api/projects').then(r => r.data); }
  catch { projects.value = []; }
}

const headers = [
  { title: 'Run ID',   key: 'id' },
  { title: 'Project',  key: 'project_id', sortable: false },
  { title: 'Session',  key: 'session_id' },
  { title: 'Status',   key: 'status' },
  { title: 'Started',  key: 'started_at' },
  { title: 'Report',   key: 'report',     sortable: false },
];
const reportSessions = ref(new Set());

function runStatusColor(s) {
  return { complete: 'success', running: 'warning', error: 'error', pending: 'grey', stopped: 'default' }[s] || 'grey';
}
function nodeColorHex(s) {
  return { complete: '#10B981', running: '#F59E0B', error: '#EF4444' }[s] || 'rgba(226,232,240,0.3)';
}
function nodeColorBg(s) {
  return { complete: 'rgba(16,185,129,0.1)', running: 'rgba(245,158,11,0.1)', error: 'rgba(239,68,68,0.1)' }[s] || 'rgba(255,255,255,0.05)';
}
function nodeEmoji(node) {
  return { researcher: '🔬', planner: '📋', worker: '💻', reviewer: '🔍', loop_reset: '🔄', assembler: '✅', analyze: '🧠' }[node] || '⚙️';
}
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : ''; }

async function startWorkflow() {
  starting.value = true;
  nodeEvents.value = [];
  try {
    const { data } = await axios.post('/api/workflow/start', {
      goal: goal.value,
      projectId: projectId.value || null,
    });
    activeRun.value = { runId: data.runId, status: 'running' };
    goal.value = '';
    fetchRuns();
  } finally { starting.value = false; }
}

async function stopWorkflow() {
  if (!activeRun.value?.runId) return;
  stopping.value = true;
  try {
    await axios.post(`/api/workflow/stop/${activeRun.value.runId}`);
    socket.emit('workflow:stop', { runId: activeRun.value.runId });
  } catch { /* best-effort */ }
  finally { stopping.value = false; }
}

async function fetchRuns() {
  const [{ data }, { data: rpt }] = await Promise.all([
    axios.get('/api/workflow/runs'),
    axios.get('/api/reports/sessions'),
  ]);
  runs.value = data;
  reportSessions.value = new Set(rpt.sessions || []);
}

onMounted(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlProjectId = urlParams.get('projectId');
  if (urlProjectId) projectId.value = urlProjectId;

  fetchRuns();
  loadProjects();

  socket.on('workflow:node_complete', (data) => {
    nodeEvents.value.push({ ...data.state, node: data.node, ts: data.ts, status: 'complete' });
  });
  socket.on('workflow:complete', (data) => {
    if (activeRun.value?.runId === data.runId) activeRun.value.status = 'complete';
    fetchRuns();
  });
  socket.on('workflow:error', (data) => {
    if (activeRun.value?.runId === data.runId) activeRun.value.status = 'error';
    fetchRuns();
  });
  socket.on('workflow:started', (data) => {
    nodeEvents.value = [];
    activeRun.value = { runId: data.runId, status: 'running' };
  });
  socket.on('workflow:stopped', (data) => {
    if (activeRun.value?.runId === data.runId || !data.runId)
      activeRun.value = activeRun.value ? { ...activeRun.value, status: 'stopped' } : null;
    fetchRuns();
  });

  onUnmounted(() => {
    socket.off('workflow:node_complete');
    socket.off('workflow:complete');
    socket.off('workflow:error');
    socket.off('workflow:started');
    socket.off('workflow:stopped');
  });
});
</script>

<style scoped>
.page-root  { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }

.wf-top-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
}
@media (max-width: 760px) { .wf-top-grid { grid-template-columns: 1fr; } }

.panel {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  justify-content: space-between;
}
.panel__header > div { display: flex; align-items: center; gap: 7px; }
.panel__body { padding: 14px; }

.panel--placeholder {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  min-height: 160px;
  background: rgba(255,255,255,0.01);
}

.run-id {
  font-size: 11px; color: rgba(226,232,240,0.3) !important; padding: 1px 6px;
  background: rgba(255,255,255,0.04); border-radius: 4px;
}

.inline-stop-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 4px;
  border: 1px solid rgba(239,68,68,0.3);
  background: rgba(239,68,68,0.08);
  color: #EF4444;
  font-size: 11px; font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}
.inline-stop-btn:hover:not(:disabled) { background: rgba(239,68,68,0.16); border-color: rgba(239,68,68,0.5); }
.inline-stop-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.inline-stop-btn--stopping { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); color: #F59E0B; }

/* Run status dot */
.run-status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.run-status-dot--running  { background: #F59E0B; animation: pulse-wf 1.2s ease-in-out infinite; }
.run-status-dot--complete { background: #10B981; }
.run-status-dot--error    { background: #EF4444; }
.run-status-dot--stopped  { background: rgba(226,232,240,0.3); }
@keyframes pulse-wf {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
  50%       { opacity: 0.7; box-shadow: 0 0 0 4px rgba(245,158,11,0); }
}

/* Timeline */
.timeline-wrap { padding: 12px 14px; display: flex; flex-direction: column; gap: 0; }
.timeline-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 8px 0;
  position: relative;
}
.timeline-dot-wrap {
  display: flex; flex-direction: column; align-items: center;
  flex-shrink: 0; width: 20px;
}
.timeline-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid #08080F;
  margin-top: 4px;
}
.timeline-line {
  position: absolute; left: 9px; top: 22px; bottom: -8px;
  width: 1px; background: rgba(255,255,255,0.07);
}
.timeline-content { flex: 1; }
.timeline-node {
  font-size: 13px; font-weight: 500; text-transform: capitalize;
  display: flex; align-items: center; gap: 8px;
}
.timeline-node-icon { font-size: 14px; }
.timeline-badge {
  font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 20px;
  text-transform: uppercase; letter-spacing: 0.3px;
}
.timeline-time { font-size: 11px; color: rgba(226,232,240,0.3) !important; margin-top: 2px; }

/* History table */
.history-table :deep(.v-data-table__td) { border-bottom: 1px solid rgba(255,255,255,0.04) !important; }
.history-table :deep(.v-data-table__th) {
  border-bottom: 1px solid rgba(255,255,255,0.06) !important;
  font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.5px;
  color: rgba(226,232,240,0.4) !important;
}

.empty-state { font-size: 13px; color: rgba(226,232,240,0.3) !important; padding: 12px 0; text-align: center; }
.gap-2 { gap: 8px; }

.running-pill {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600; color: #F59E0B !important;
  background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2);
  padding: 2px 8px; border-radius: 20px;
}
.running-pill__dot {
  width: 6px; height: 6px; border-radius: 50%; background: #F59E0B;
  animation: pulse-wf 1.2s ease-in-out infinite;
}

.wf-action-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wf-tip {
  font-size: 11px; color: rgba(226,232,240,0.25) !important;
  margin-left: auto;
}

.report-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600;
  color: #22D3EE; text-decoration: none;
  padding: 2px 8px; border-radius: 4px;
  border: 1px solid rgba(34,211,238,0.25);
  background: rgba(34,211,238,0.07);
  transition: background 0.15s;
}
.report-btn:hover { background: rgba(34,211,238,0.15); }

.proj-tag {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; color: #A78BFA;
  padding: 2px 7px; border-radius: 4px;
  border: 1px solid rgba(167,139,250,0.2);
  background: rgba(167,139,250,0.07);
  max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>

<template>
  <div class="page-root">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title">Workflow</div>
        <div class="page-subtitle">Run and monitor multi-agent pipelines</div>
      </div>
    </div>

    <!-- Top row -->
    <div class="wf-top-grid">

      <!-- Start workflow -->
      <div class="panel card-hover">
        <div class="panel__header">
          <v-icon size="15" color="#6366F1">mdi-play-circle-outline</v-icon>
          <span class="section-title">New Workflow</span>
        </div>
        <div class="panel__body">
          <v-textarea
            v-model="goal"
            label="Goal"
            placeholder="e.g. Build a REST API with authentication..."
            rows="3" variant="outlined" hide-details
          />
          <div class="d-flex gap-2 mt-3">
            <v-btn color="primary" :loading="starting"
              :disabled="!goal.trim() || isRunning"
              prepend-icon="mdi-play" @click="startWorkflow">
              Run Workflow
            </v-btn>
            <v-btn v-if="isRunning && activeRun?.runId"
              color="error" variant="tonal" :loading="stopping"
              prepend-icon="mdi-stop" @click="stopWorkflow">
              Stop
            </v-btn>
          </div>
        </div>
      </div>

      <!-- Active run -->
      <div class="panel card-hover" v-if="activeRun">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#6366F1">mdi-run-fast</v-icon>
            <span class="section-title">Active Run</span>
            <span class="run-id font-mono">{{ activeRun.runId?.slice(0, 8) }}</span>
          </div>
          <v-chip :color="runStatusColor(activeRun.status)" size="x-small" variant="tonal">
            {{ activeRun.status }}
          </v-chip>
        </div>
        <div class="timeline-wrap">
          <div v-for="event in nodeEvents" :key="event.ts" class="timeline-item">
            <div class="timeline-dot" :style="`background:${nodeColorHex(event.status)}`" />
            <div class="timeline-content">
              <div class="timeline-node">{{ event.node }}
                <span class="timeline-badge" :style="`background:${nodeColorBg(event.status)};color:${nodeColorHex(event.status)}`">
                  {{ event.status }}
                </span>
              </div>
              <div class="timeline-time">{{ formatTime(event.ts) }}</div>
            </div>
          </div>
          <div v-if="!nodeEvents.length" class="empty-state">Waiting to start…</div>
        </div>
      </div>
      <div v-else class="panel panel--placeholder">
        <v-icon size="40" style="color:rgba(226,232,240,0.1)">mdi-graph-outline</v-icon>
        <div style="font-size:13px;color:rgba(226,232,240,0.25);margin-top:10px">No active run</div>
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
            :to="`/debug?session=${item.session_id}`"
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
const starting = ref(false);
const stopping = ref(false);
const runs = ref([]);
const activeRun = ref(null);
const nodeEvents = ref([]);

const isRunning = computed(() => activeRun.value?.status === 'running');

const headers = [
  { title: 'Run ID',   key: 'id' },
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
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : ''; }

async function startWorkflow() {
  starting.value = true;
  nodeEvents.value = [];
  try {
    const { data } = await axios.post('/api/workflow/start', { goal: goal.value });
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
  fetchRuns();

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

/* Timeline */
.timeline-wrap { padding: 12px 14px; display: flex; flex-direction: column; gap: 0; }
.timeline-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 0;
  border-left: 1px solid rgba(255,255,255,0.06);
  padding-left: 14px;
  position: relative;
  margin-left: 6px;
}
.timeline-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  position: absolute; left: -5px; top: 12px;
  border: 2px solid #08080F;
}
.timeline-content { flex: 1; }
.timeline-node {
  font-size: 13px; font-weight: 500; text-transform: capitalize;
  display: flex; align-items: center; gap: 8px;
}
.timeline-badge {
  font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px;
  text-transform: uppercase;
}
.timeline-time { font-size: 11px; color: rgba(226,232,240,0.35) !important; margin-top: 2px; }

/* History table */
.history-table :deep(.v-data-table__td) { border-bottom: 1px solid rgba(255,255,255,0.04) !important; }
.history-table :deep(.v-data-table__th) {
  border-bottom: 1px solid rgba(255,255,255,0.06) !important;
  font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.5px;
  color: rgba(226,232,240,0.4) !important;
}

.empty-state { font-size: 13px; color: rgba(226,232,240,0.3) !important; padding: 8px 0; }
.gap-2 { gap: 8px; }

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
</style>

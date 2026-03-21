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
      <div class="panel card-hover panel--form">
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
        <div class="panel__body panel__body--grow">
          <v-select
            v-model="projectId"
            :items="projects"
            item-title="title"
            item-value="id"
            label="Project"
            variant="outlined"
            density="compact"
            hide-details
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
            variant="outlined" hide-details no-resize
            style="font-size:14px"
            class="goal-textarea"
          />
          <div class="wf-action-row">
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
            <span v-else class="wf-tip">Planner → Researcher → Worker → Reviewer</span>
          </div>
        </div>
      </div>

      <!-- Workflow Graph -->
      <div class="panel card-hover">
        <WorkflowGraph>
          <template #actions>
            <button v-if="isRunning && activeRun?.runId" class="inline-stop-btn" :class="{ 'inline-stop-btn--stopping': stopping }"
              @click="stopWorkflow" :disabled="stopping">
              <v-icon size="11">mdi-stop-circle-outline</v-icon>
              {{ stopping ? 'Stopping…' : 'Stop' }}
            </button>
          </template>
        </WorkflowGraph>
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
        <template #item.repeat="{ item }">
          <button v-if="item.status !== 'running'" class="repeat-btn"
            @click="repeatRun(item)" title="Repeat this workflow">
            <v-icon size="12">mdi-repeat</v-icon> Repeat
          </button>
        </template>
      </v-data-table>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';
import { useRouter } from 'vue-router';
import WorkflowGraph from '../components/WorkflowGraph.vue';

const router = useRouter();

const socket = useSocket();
const goal = ref('');
const projectId = ref(null);
const projects = ref([]);
const starting = ref(false);
const stopping = ref(false);
const runs = ref([]);
const activeRun = ref(null);

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
  { title: '',         key: 'repeat',     sortable: false },
];

function repeatRun(item) {
  try {
    const state = JSON.parse(item.graph_state_json || '{}');
    goal.value = state.goal || state.userGoal || '';
  } catch { goal.value = ''; }
  if (item.project_id) projectId.value = item.project_id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const reportSessions = ref(new Set());

function runStatusColor(s) {
  return { complete: 'success', running: 'warning', error: 'error', pending: 'grey', stopped: 'default' }[s] || 'grey';
}
async function startWorkflow() {
  starting.value = true;
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
  const urlGoal = urlParams.get('goal');
  if (urlGoal) goal.value = urlGoal;

  fetchRuns();
  loadProjects();

  function patchRunStatus(runId, status) {
    const run = runs.value.find(r => r.id === runId);
    if (run) run.status = status;
  }

  socket.on('workflow:started', (data) => {
    activeRun.value = { runId: data.runId, status: 'running' };
  });

  socket.on('workflow:complete', (data) => {
    if (activeRun.value?.runId === data.runId) activeRun.value.status = 'complete';
    patchRunStatus(data.runId, 'complete');
    setTimeout(fetchRuns, 800);
  });

  socket.on('workflow:stopped', (data) => {
    if (activeRun.value?.runId === data.runId || !data.runId)
      activeRun.value = activeRun.value ? { ...activeRun.value, status: 'stopped' } : null;
    patchRunStatus(data.runId, 'stopped');
    setTimeout(fetchRuns, 800);
  });

  socket.on('workflow:error', (data) => {
    if (activeRun.value?.runId === data.runId) activeRun.value.status = 'error';
    patchRunStatus(data.runId, 'error');
    setTimeout(fetchRuns, 800);
  });

  socket.on('queue:updated', (data) => {
    const hadRunning = (data.queue || []).some(j => j.status === 'running');
    if (!hadRunning) setTimeout(fetchRuns, 500);
  });
});

onUnmounted(() => {
  socket.off('workflow:started');
  socket.off('workflow:complete');
  socket.off('workflow:stopped');
  socket.off('workflow:error');
  socket.off('queue:updated');
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
.panel--form { display: flex; flex-direction: column; }
.panel__body--grow {
  flex: 1;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 12px;
}
.panel__body--grow :deep(.goal-textarea) { min-height: 0; }
.panel__body--grow :deep(.goal-textarea .v-field) { height: 100%; }
.panel__body--grow :deep(.goal-textarea .v-field__field) { height: 100%; }
.panel__body--grow :deep(.goal-textarea textarea) { height: 100% !important; resize: none; }

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

.repeat-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600;
  color: #F59E0B;
  padding: 2px 8px; border-radius: 4px;
  border: 1px solid rgba(245,158,11,0.25);
  background: rgba(245,158,11,0.07);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
  white-space: nowrap;
}
.repeat-btn:hover { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.45); }
</style>

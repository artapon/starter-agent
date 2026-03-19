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
            <span v-else class="wf-tip">Researcher → Planner → Worker → Reviewer</span>
          </div>
        </div>
      </div>

      <!-- Workflow Graph -->
      <div class="panel card-hover">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#6366F1">mdi-graph-outline</v-icon>
            <span class="section-title">Workflow Graph</span>
            <span v-if="graphRunId" class="run-id-badge font-mono">{{ graphRunId.slice(0,8) }}…</span>
            <span v-if="graphLoopCount > 0" class="loop-count-badge">🔄 Loop {{ graphLoopCount }}/{{ graphMaxLoops }}</span>
            <span :class="['graph-status-dot', `graph-status-dot--${graphOverallStatus}`]" />
            <span class="graph-overall-label">{{ graphOverallStatus }}</span>
          </div>
          <button v-if="isRunning && activeRun?.runId" class="inline-stop-btn" :class="{ 'inline-stop-btn--stopping': stopping }"
            @click="stopWorkflow" :disabled="stopping">
            <v-icon size="11">mdi-stop-circle-outline</v-icon>
            {{ stopping ? 'Stopping…' : 'Stop' }}
          </button>
        </div>
        <div class="graph-active-bar" v-if="graphCurrentNode">
          <span class="graph-active-bar__dot" />
          <span class="graph-active-bar__label">Processing</span>
          <span class="graph-active-bar__node">{{ graphCurrentNode.replace('_', ' ') }}</span>
          <span v-if="graphDevStep && graphCurrentNode === 'worker'" class="graph-active-bar__step">
            — Step {{ graphDevStep }}{{ graphTotalSteps ? ' of ' + graphTotalSteps : '' }}
          </span>
        </div>
        <div class="graph-body">
          <svg viewBox="0 0 640 235" class="graph-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <marker v-for="m in markerIds" :key="m.id"
                :id="m.id" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" :fill="m.color"/>
              </marker>
            </defs>
            <!-- researcher → planner -->
            <path d="M120,42 L153,42" :stroke="edgeColor('researcher','planner')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('researcher','planner')})`"/>
            <!-- planner → worker -->
            <path d="M263,42 L297,42" :stroke="edgeColor('planner','worker')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('planner','worker')})`"/>
            <!-- worker → reviewer -->
            <path d="M407,42 L441,42" :stroke="edgeColor('worker','reviewer')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('worker','reviewer')})`"/>
            <!-- reviewer → assembler -->
            <path d="M501,64 L501,148" :stroke="edgeColor('reviewer','assembler')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('reviewer','assembler')})`"/>
            <!-- reviewer → loop_reset -->
            <path d="M551,42 L615,42 L615,218 L353,218 L353,192" stroke-dasharray="5,3" :stroke-dashoffset="edgeStatus('reviewer','loop_reset')==='loop' ? loopDashOffset : 0" :stroke="edgeColor('reviewer','loop_reset')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('reviewer','loop_reset')})`"/>
            <!-- loop_reset → worker -->
            <path d="M353,148 L352,64" stroke-dasharray="5,3" :stroke-dashoffset="edgeStatus('loop_reset','worker')==='loop' ? loopDashOffset : 0" :stroke="edgeColor('loop_reset','worker')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('loop_reset','worker')})`"/>
            <!-- assembler → done -->
            <path d="M551,170 L582,170" :stroke="edgeColor('assembler','done')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('assembler','done')})`"/>
            <!-- Edge labels -->
            <text x="615" y="120" class="edge-label" text-anchor="middle" transform="rotate(-90,615,120)">score &lt; 10</text>
            <text x="510" y="108" class="edge-label">10/10 ✓</text>
            <!-- researcher -->
            <g :class="['graph-node-g', nodeClass('researcher')]">
              <rect x="10" y="20" width="110" height="44" rx="8" :fill="nodeFill('researcher')" :stroke="nodeStroke('researcher')" stroke-width="1.5"/>
              <text x="65" y="38" class="node-icon" text-anchor="middle">🔬</text>
              <text x="65" y="56" class="node-label" text-anchor="middle">Researcher</text>
            </g>
            <!-- planner -->
            <g :class="['graph-node-g', nodeClass('planner')]">
              <rect x="155" y="20" width="108" height="44" rx="8" :fill="nodeFill('planner')" :stroke="nodeStroke('planner')" stroke-width="1.5"/>
              <text x="209" y="38" class="node-icon" text-anchor="middle">📋</text>
              <text x="209" y="56" class="node-label" text-anchor="middle">Planner</text>
            </g>
            <!-- worker -->
            <g :class="['graph-node-g', nodeClass('worker')]">
              <rect x="297" y="20" width="110" height="44" rx="8" :fill="nodeFill('worker')" :stroke="nodeStroke('worker')" stroke-width="1.5"/>
              <text x="352" y="36" class="node-icon" text-anchor="middle">💻</text>
              <text x="352" y="51" class="node-label" text-anchor="middle">Worker</text>
              <text v-if="graphNodeStatus['worker']==='running' && graphDevStep" x="352" y="62" class="node-step-label" text-anchor="middle">Step {{ graphDevStep }}{{ graphTotalSteps ? '/'+graphTotalSteps : '' }}</text>
            </g>
            <!-- reviewer -->
            <g :class="['graph-node-g', nodeClass('reviewer')]">
              <rect x="441" y="20" width="110" height="44" rx="8" :fill="nodeFill('reviewer')" :stroke="nodeStroke('reviewer')" stroke-width="1.5"/>
              <text x="496" y="38" class="node-icon" text-anchor="middle">🔍</text>
              <text x="496" y="56" class="node-label" text-anchor="middle">Reviewer</text>
            </g>
            <!-- loop_reset -->
            <g :class="['graph-node-g', nodeClass('loop_reset')]" :opacity="nodeClass('loop_reset') === 'node-loop-active' ? loopNodeOpacity : 1">
              <rect x="297" y="148" width="112" height="44" rx="8" :fill="nodeFill('loop_reset')" :stroke="nodeStroke('loop_reset')" stroke-width="1.5"/>
              <text x="353" y="166" class="node-icon" text-anchor="middle">🔄</text>
              <text x="353" y="184" class="node-label" text-anchor="middle">Loop Reset</text>
            </g>
            <!-- assembler -->
            <g :class="['graph-node-g', nodeClass('assembler')]">
              <rect x="441" y="148" width="110" height="44" rx="8" :fill="nodeFill('assembler')" :stroke="nodeStroke('assembler')" stroke-width="1.5"/>
              <text x="496" y="166" class="node-icon" text-anchor="middle">✅</text>
              <text x="496" y="184" class="node-label" text-anchor="middle">Assembler</text>
            </g>
            <!-- done -->
            <g :class="['graph-node-g', nodeClass('done')]">
              <circle cx="596" cy="172" r="14" :fill="nodeFill('done')" :stroke="nodeStroke('done')" stroke-width="1.5"/>
              <text x="596" y="177" class="node-done-label" text-anchor="middle">✓</text>
            </g>
          </svg>
        </div>
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
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
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

const projectMap = computed(() => Object.fromEntries(projects.value.map(p => [p.id, p.title])));

const isRunning = computed(() => activeRun.value?.status === 'running');

// ── Workflow graph state ───────────────────────────────────────────────────
const GRAPH_NODES = ['researcher','planner','worker','reviewer','loop_reset','assembler','done'];
const graphNodeStatus    = reactive(Object.fromEntries(GRAPH_NODES.map(n => [n, 'idle'])));
const graphRunId         = ref(null);
const graphOverallStatus = ref('idle');
const graphLoopCount     = ref(0);
const graphMaxLoops      = ref(3);
const graphCurrentNode   = ref(null);
const graphDevStep       = ref(null);
const graphTotalSteps    = ref(null);
const isLoopResetting    = ref(false);
const loopDashOffset     = ref(0);
const loopNodeOpacity    = ref(1);
let   _loopAnimInterval  = null;

watch([graphLoopCount, graphOverallStatus], ([count, status]) => {
  if (count > 0 && status === 'running') {
    if (_loopAnimInterval) return;
    let offset = 0, tick = 0;
    _loopAnimInterval = setInterval(() => {
      offset -= 1;
      if (offset < -16) offset = 0;
      loopDashOffset.value = offset;
      tick++;
      loopNodeOpacity.value = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(tick / 26.7 * 2 * Math.PI));
    }, 30);
  } else {
    clearInterval(_loopAnimInterval);
    _loopAnimInterval = null;
    loopDashOffset.value = 0;
    loopNodeOpacity.value = 1;
  }
});

const NODE_COLORS = {
  idle:     { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.08)' },
  pending:  { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.15)' },
  running:  { fill: 'rgba(255,255,255,0.10)',  stroke: '#22D3EE'               },
  complete: { fill: 'rgba(16,185,129,0.22)',  stroke: '#10B981'                },
  error:    { fill: 'rgba(239,68,68,0.22)',   stroke: '#EF4444'                },
};
const EDGE_COLORS = {
  idle: 'rgba(255,255,255,0.1)', active: '#6366F1', complete: '#10B981', loop: '#F59E0B',
};
const markerIds = computed(() => [
  { id: 'arr-idle',     color: 'rgba(255,255,255,0.2)' },
  { id: 'arr-active',   color: '#6366F1' },
  { id: 'arr-complete', color: '#10B981' },
  { id: 'arr-loop',     color: '#F59E0B' },
  { id: 'arr-done',     color: '#10B981' },
]);

function nodeFill(n) {
  if (n === 'loop_reset' && graphLoopCount.value > 0 && graphNodeStatus[n] !== 'idle' && graphNodeStatus[n] !== 'pending')
    return 'rgba(245,158,11,0.15)';
  return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).fill;
}
function nodeStroke(n) {
  if (n === 'loop_reset' && graphLoopCount.value > 0 && graphNodeStatus[n] !== 'idle' && graphNodeStatus[n] !== 'pending')
    return '#F59E0B';
  return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).stroke;
}
function nodeClass(n)  {
  if (n === 'loop_reset' && graphLoopCount.value > 0 && graphOverallStatus.value === 'running')
    return 'node-loop-active';
  if (graphNodeStatus[n] !== 'running') return '';
  return 'node-running';
}
function edgeClass(from, to) {
  return edgeStatus(from, to) === 'loop' ? 'edge-loop-active' : '';
}

function edgeStatus(from, to) {
  const loopEdges = new Set(['reviewer->loop_reset','loop_reset->worker']);
  const key = `${from}->${to}`;
  const fs = graphNodeStatus[from];
  const ts2 = graphNodeStatus[to];
  if (fs === 'idle' && ts2 === 'idle') return 'idle';
  if (loopEdges.has(key)) {
    if (graphLoopCount.value > 0 && graphOverallStatus.value === 'running') return 'loop';
    return 'idle';
  }
  if (from === 'assembler' && to === 'done') return fs === 'complete' ? 'done' : 'idle';
  if (fs === 'complete') return 'complete';
  if (fs === 'running')  return 'active';
  return 'idle';
}
function edgeColor(from, to) {
  return EDGE_COLORS[edgeStatus(from, to)] || EDGE_COLORS.idle;
}

function resetGraph() {
  GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'pending'; });
  graphNodeStatus['done']       = 'idle';
  graphNodeStatus['loop_reset'] = 'idle';
  graphLoopCount.value   = 0;
  graphCurrentNode.value = null;
  graphDevStep.value     = null;
  graphTotalSteps.value  = null;
}

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

  fetchRuns();
  loadProjects();

  function acceptRun(data) {
    if (!graphRunId.value) {
      graphRunId.value = data.runId;
      graphOverallStatus.value = 'running';
      resetGraph();
    }
    return data.runId === graphRunId.value;
  }

  socket.on('workflow:started', (data) => {
    activeRun.value = { runId: data.runId, status: 'running' };
    graphRunId.value = data.runId;
    graphOverallStatus.value = 'running';
    resetGraph();
  });

  socket.on('workflow:node_complete', (data) => {
    if (!acceptRun(data)) return;
    const node = data.node;
    const st   = data.state?.status;
    const phase = data.state?.phase;

    // ── analyze node → maps to researcher + planner ──────────────────────
    if (node === 'analyze') {
      if (st === 'running') {
        if (phase === 'research') {
          graphNodeStatus['researcher'] = 'running';
          graphCurrentNode.value = 'researcher';
        } else if (phase === 'plan') {
          graphNodeStatus['researcher'] = 'complete';
          graphNodeStatus['planner'] = 'running';
          graphCurrentNode.value = 'planner';
        }
      } else if (st === 'complete') {
        graphNodeStatus['researcher'] = 'complete';
        graphNodeStatus['planner'] = 'complete';
        if (data.state?.plan?.steps)
          graphTotalSteps.value = data.state.plan.steps.length;
        if (graphCurrentNode.value === 'researcher' || graphCurrentNode.value === 'planner')
          graphCurrentNode.value = null;
      }
      return;
    }

    // ── worker node ───────────────────────────────────────────────────────
    if (node === 'worker') {
      if (st === 'running') {
        graphNodeStatus['worker'] = 'running';
        graphCurrentNode.value = 'worker';
        graphDevStep.value = (data.state.stepIdx ?? 0) + 1;
      } else if (st === 'complete') {
        graphNodeStatus['worker'] = 'complete';
        graphDevStep.value = null;
        if (graphCurrentNode.value === 'worker') graphCurrentNode.value = null;
      }
      return;
    }

    // ── reviewer node (handles review + loop_reset + assembler) ──────────
    if (node === 'reviewer') {
      if (st === 'running') {
        graphNodeStatus['reviewer'] = 'running';
        graphCurrentNode.value = 'reviewer';
      } else if (st === 'complete') {
        graphNodeStatus['reviewer'] = 'complete';
        if (graphCurrentNode.value === 'reviewer') graphCurrentNode.value = null;
      } else if (st === 'loop') {
        graphNodeStatus['reviewer'] = 'complete';
        graphLoopCount.value = data.state?.loop ?? (graphLoopCount.value + 1);
        graphNodeStatus['loop_reset'] = 'running';
        graphCurrentNode.value = 'loop_reset';
        isLoopResetting.value = true;
        setTimeout(() => {
          isLoopResetting.value = false;
          graphNodeStatus['loop_reset'] = 'complete';
          if (graphNodeStatus['worker'] !== 'running' && graphNodeStatus['worker'] !== 'complete')
            graphNodeStatus['worker'] = 'pending';
          if (graphNodeStatus['reviewer'] !== 'running' && graphNodeStatus['reviewer'] !== 'complete')
            graphNodeStatus['reviewer'] = 'pending';
          if (graphNodeStatus['worker'] !== 'running') graphDevStep.value = null;
          if (graphCurrentNode.value === 'loop_reset') graphCurrentNode.value = null;
        }, 800);
      } else if (st === 'assembled') {
        graphNodeStatus['assembler'] = 'complete';
        graphNodeStatus['done']      = 'complete';
        graphCurrentNode.value = null;
      }
    }
  });

  function patchRunStatus(runId, status) {
    const run = runs.value.find(r => r.id === runId);
    if (run) run.status = status;
  }

  socket.on('workflow:complete', (data) => {
    if (acceptRun(data)) {
      if (activeRun.value?.runId === data.runId) activeRun.value.status = 'complete';
      graphOverallStatus.value = 'complete';
      GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'complete'; });
      graphCurrentNode.value = null;
    }
    patchRunStatus(data.runId, 'complete');
    setTimeout(fetchRuns, 800);
  });

  socket.on('workflow:stopped', (data) => {
    if (acceptRun(data)) {
      if (activeRun.value?.runId === data.runId || !data.runId)
        activeRun.value = activeRun.value ? { ...activeRun.value, status: 'stopped' } : null;
      graphOverallStatus.value = 'stopped';
      GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'idle'; });
      graphCurrentNode.value = null;
    }
    patchRunStatus(data.runId, 'stopped');
    setTimeout(fetchRuns, 800);
  });

  socket.on('workflow:error', (data) => {
    if (acceptRun(data)) {
      if (activeRun.value?.runId === data.runId) activeRun.value.status = 'error';
      graphOverallStatus.value = 'error';
      GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'error'; });
      graphCurrentNode.value = null;
    }
    patchRunStatus(data.runId, 'error');
    setTimeout(fetchRuns, 800);
  });

  socket.on('queue:updated', (data) => {
    const hadRunning = (data.queue || []).some(j => j.status === 'running');
    if (!hadRunning) setTimeout(fetchRuns, 500);
  });

  socket.on('agent:status', (data) => {
    const AGENT_NODE = { researcher: 'researcher', planner: 'planner', worker: 'worker', reviewer: 'reviewer' };
    const gNode = AGENT_NODE[data.agentId];
    if (!gNode) return;
    if (data.status === 'working') {
      if (isLoopResetting.value) return; // keep loop_reset display until timeout
      if (graphOverallStatus.value === 'idle') {
        graphOverallStatus.value = 'running';
        if (!graphRunId.value) resetGraph();
      }
      if (graphOverallStatus.value !== 'running') return;
      graphNodeStatus[gNode] = 'running';
      graphCurrentNode.value = gNode;
    } else if (data.status === 'idle') {
      if (graphOverallStatus.value !== 'running') return;
      if (graphNodeStatus[gNode] === 'running') {
        graphNodeStatus[gNode] = 'complete';
        if (graphCurrentNode.value === gNode) graphCurrentNode.value = null;
      }
    }
  });

  const AGENT_LOG_NODES = new Set(['researcher', 'planner', 'worker', 'reviewer']);

  socket.on('log:entry', (entry) => {
    const agentId = entry.agentId;
    const message = entry.message || '';

    // Workflow start signal
    if (agentId === 'workflow' && /Starting workflow run/i.test(message)) {
      if (graphOverallStatus.value !== 'running') {
        graphOverallStatus.value = 'running';
        resetGraph();
      }
      return;
    }

    // Agent node active → mark as running
    if (AGENT_LOG_NODES.has(agentId)) {
      if (graphOverallStatus.value === 'complete' || graphOverallStatus.value === 'stopped') return;
      if (isLoopResetting.value) return; // keep loop_reset display until timeout
      if (graphOverallStatus.value !== 'running') graphOverallStatus.value = 'running';
      graphNodeStatus[agentId] = 'running';
      graphCurrentNode.value = agentId;
      if (agentId === 'worker') {
        const stepMatch = message.match(/Executing task.*?Step\s+(\d+)/i);
        if (stepMatch) graphDevStep.value = parseInt(stepMatch[1]);
      }
      return;
    }

    // Tool call → keep current active node lit
    if (agentId === 'tool') {
      const active = graphCurrentNode.value;
      if (active && AGENT_LOG_NODES.has(active) && graphOverallStatus.value === 'running') {
        graphNodeStatus[active] = 'running';
      }
      return;
    }

    // Workflow orchestration messages
    if (agentId === 'workflow') {
      const nodeMatch = message.match(/Workflow node complete:\s*(\w+)/i);
      if (nodeMatch) {
        const node = nodeMatch[1];
        if (node in graphNodeStatus) {
          graphNodeStatus[node] = 'complete';
          if (graphCurrentNode.value === node) graphCurrentNode.value = null;
        }
      }
      if (/Workflow .+ complete$/i.test(message)) {
        graphOverallStatus.value = 'complete';
        GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'complete'; });
        graphCurrentNode.value = null;
      }
      if (/Workflow .+ (stopped|aborted)/i.test(message)) {
        graphOverallStatus.value = 'stopped';
        GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'idle'; });
        graphCurrentNode.value = null;
      }
    }
  });

  onUnmounted(() => {
    clearInterval(_loopAnimInterval);
    socket.off('log:entry');
    socket.off('workflow:started');
    socket.off('workflow:node_complete');
    socket.off('workflow:complete');
    socket.off('workflow:stopped');
    socket.off('workflow:error');
    socket.off('agent:status');
    socket.off('queue:updated');
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

/* Graph panel */
.graph-body { padding: 4px 16px 12px; }
.graph-svg  { width: 100%; height: auto; display: block; }

.node-label      { font-size: 11px; font-weight: 600; fill: rgba(226,232,240,0.8); font-family: 'Segoe UI', sans-serif; }
.node-step-label { font-size: 9px;  font-weight: 500; fill: #22D3EE; font-family: 'Segoe UI', sans-serif; }
.node-icon       { font-size: 13px; font-family: 'Segoe UI Emoji', sans-serif; }
.node-done-label { font-size: 12px; font-weight: 700; fill: rgba(226,232,240,0.9); font-family: 'Segoe UI', sans-serif; }
.edge-label      { font-size: 9px; fill: rgba(226,232,240,0.3); font-family: 'Segoe UI', sans-serif; }

.node-running rect,
.node-running circle { animation: node-breathe 1.2s ease-in-out infinite; }
@keyframes node-breathe {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}




.graph-active-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 16px 2px; font-size: 12px;
}
.graph-active-bar__dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #22D3EE; box-shadow: 0 0 8px #22D3EE;
  animation: pulse-dot 1s ease-in-out infinite;
}
.graph-active-bar__label { color: rgba(226,232,240,0.4); }
.graph-active-bar__node  { color: #22D3EE; font-weight: 600; text-transform: capitalize; }
.graph-active-bar__step  { color: rgba(226,232,240,0.35); }

.run-id-badge     { font-size:10px; color:rgba(226,232,240,0.35); background:rgba(255,255,255,0.04); padding:2px 7px; border-radius:4px; }
.loop-count-badge { font-size:11px; font-weight:600; padding:2px 8px; background:rgba(245,158,11,.15); border:1px solid rgba(245,158,11,.3); color:#FCD34D; border-radius:20px; }
.graph-status-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.graph-status-dot--idle     { background:rgba(255,255,255,0.2); }
.graph-status-dot--running  { background:#22D3EE; box-shadow:0 0 8px #22D3EE; animation:pulse-dot 1.2s infinite; }
.graph-status-dot--complete { background:#10B981; }
.graph-status-dot--stopped  { background:#6B7280; }
.graph-status-dot--error    { background:#EF4444; }
.graph-overall-label { font-size:11px; color:rgba(226,232,240,0.4); text-transform:capitalize; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

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

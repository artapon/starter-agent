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

    <!-- Active run banner -->
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
          <v-icon :color="stat.color" size="20">{{ stat.icon }}</v-icon>
        </div>
        <div class="stat-card__body">
          <div class="stat-number">{{ stat.value }}</div>
          <div class="stat-card__label">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <!-- Workflow Graph — full width -->
    <div class="panel card-hover" style="margin-bottom:12px">
      <div class="panel__header">
        <v-icon size="15" color="#6366F1">mdi-graph-outline</v-icon>
        <span class="section-title">Workflow Graph</span>
        <span v-if="graphRunId" class="run-id-badge font-mono">{{ graphRunId.slice(0,8) }}…</span>
        <span v-if="graphLoopCount > 0" class="loop-count-badge">🔄 Loop {{ graphLoopCount }}/{{ graphMaxLoops }}</span>
        <span :class="['graph-status-dot', `graph-status-dot--${graphOverallStatus}`]" />
        <span class="graph-overall-label">{{ graphOverallStatus }}</span>
      </div>
      <!-- Active node status bar -->
      <div class="graph-active-bar" v-if="graphCurrentNode">
        <span class="graph-active-bar__dot" />
        <span class="graph-active-bar__label">Processing</span>
        <span class="graph-active-bar__node">{{ graphCurrentNode.replace('_', ' ') }}</span>
        <span v-if="graphDevStep && graphCurrentNode === 'developer'" class="graph-active-bar__step">
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

          <!-- ── Edges ─────────────────────────────────────── -->
          <!-- researcher → planner -->
          <path d="M120,42 L153,42" :stroke="edgeColor('researcher','planner')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('researcher','planner')})`"/>
          <!-- planner → developer -->
          <path d="M263,42 L297,42" :stroke="edgeColor('planner','developer')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('planner','developer')})`"/>
          <!-- developer → reviewer -->
          <path d="M407,42 L441,42" :stroke="edgeColor('developer','reviewer')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('developer','reviewer')})`"/>
          <!-- reviewer → assembler (straight down, score=10) -->
          <path d="M501,64 L501,148" :stroke="edgeColor('reviewer','assembler')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('reviewer','assembler')})`"/>
          <!-- reviewer → loop_reset: routes RIGHT then DOWN below all boxes then LEFT to loop_reset bottom -->
          <path d="M551,42 L615,42 L615,218 L353,218 L353,192" stroke-dasharray="5,3" :stroke="edgeColor('reviewer','loop_reset')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('reviewer','loop_reset')})`"/>
          <!-- loop_reset → developer (direct vertical) -->
          <path d="M353,148 L352,64" stroke-dasharray="5,3" :stroke="edgeColor('loop_reset','developer')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('loop_reset','developer')})`"/>
          <!-- assembler → done -->
          <path d="M551,170 L582,170" :stroke="edgeColor('assembler','done')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('assembler','done')})`"/>

          <!-- Edge labels -->
          <text x="615" y="120" class="edge-label" text-anchor="middle" transform="rotate(-90,615,120)">score &lt; 10</text>
          <text x="510" y="108" class="edge-label">10/10 ✓</text>

          <!-- ── Nodes ─────────────────────────────────────── -->
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
          <!-- developer -->
          <g :class="['graph-node-g', nodeClass('developer')]">
            <rect x="297" y="20" width="110" height="44" rx="8" :fill="nodeFill('developer')" :stroke="nodeStroke('developer')" stroke-width="1.5"/>
            <text x="352" y="36" class="node-icon" text-anchor="middle">💻</text>
            <text x="352" y="51" class="node-label" text-anchor="middle">Developer</text>
            <text v-if="graphNodeStatus['developer']==='running' && graphDevStep" x="352" y="62" class="node-step-label" text-anchor="middle">Step {{ graphDevStep }}{{ graphTotalSteps ? '/'+graphTotalSteps : '' }}</text>
          </g>
          <!-- reviewer -->
          <g :class="['graph-node-g', nodeClass('reviewer')]">
            <rect x="441" y="20" width="110" height="44" rx="8" :fill="nodeFill('reviewer')" :stroke="nodeStroke('reviewer')" stroke-width="1.5"/>
            <text x="496" y="38" class="node-icon" text-anchor="middle">🔍</text>
            <text x="496" y="56" class="node-label" text-anchor="middle">Reviewer</text>
          </g>
          <!-- loop_reset -->
          <g :class="['graph-node-g', nodeClass('loop_reset')]">
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
          <!-- done circle -->
          <g :class="['graph-node-g', nodeClass('done')]">
            <circle cx="596" cy="172" r="14" :fill="nodeFill('done')" :stroke="nodeStroke('done')" stroke-width="1.5"/>
            <text x="596" y="177" class="node-done-label" text-anchor="middle">✓</text>
          </g>
        </svg>
      </div>
    </div>

    <!-- Middle row -->
    <div class="mid-grid">

      <!-- Agent Status -->
      <div class="panel card-hover">
        <div class="panel__header">
          <v-icon size="15" color="#6366F1">mdi-robot-outline</v-icon>
          <span class="section-title">Agent Status</span>
        </div>
        <div class="agent-list">
          <div v-for="agent in agentStatuses" :key="agent.agentId"
            class="agent-row"
            :class="{ 'agent-row--working': agentLiveStatus[agent.agentId] === 'working' }">

            <!-- Left: dot + name + model -->
            <div class="agent-row__left">
              <span :class="['status-dot',
                agentLiveStatus[agent.agentId] === 'working' ? 'status-dot--working'
                : agent.available ? 'status-dot--online' : 'status-dot--offline']" />
              <div class="agent-row__info">
                <div class="agent-row__name">{{ agent.agentId }}</div>
                <div class="agent-row__model">{{ agent.model }}</div>
              </div>
            </div>

            <!-- Right: status badge + online chip -->
            <div class="agent-row__right">
              <!-- Working badge with spinner -->
              <div v-if="agentLiveStatus[agent.agentId] === 'working'" class="working-badge">
                <svg class="working-spinner" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="#F59E0B" stroke-width="2"
                    stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round"/>
                </svg>
                <span>Running</span>
              </div>
              <div v-else class="idle-badge">
                {{ agentLiveStatus[agent.agentId] || 'idle' }}
              </div>
              <v-chip :color="agent.available ? 'success' : 'error'" size="x-small" variant="tonal">
                {{ agent.available ? 'Online' : 'Offline' }}
              </v-chip>
            </div>

            <!-- Current task — spans full width when working -->
            <div v-if="agentCurrentTask[agent.agentId]" class="agent-row__task">
              <v-icon size="11" color="#F59E0B" class="mr-1">mdi-chevron-right</v-icon>
              {{ agentCurrentTask[agent.agentId] }}
            </div>
          </div>
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
            <v-chip :color="statusColor(run.status)" size="x-small" variant="tonal">{{ run.status }}</v-chip>
          </div>
          <div v-if="!recentRuns.length" class="empty-state">No runs yet</div>
        </div>
      </div>
    </div>

    <!-- Live logs -->
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
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();
const loading = ref(false);
const stats = ref({});
const agentStatuses = ref([]);
const recentRuns = ref([]);
const logs = ref([]);
const agentLiveStatus = ref({});
const agentCurrentTask = ref({});
const logContainer = ref(null);

// ── Workflow graph state ───────────────────────────────────────────────────
const GRAPH_NODES = ['researcher','planner','developer','reviewer','loop_reset','assembler','done'];
const graphNodeStatus  = reactive(Object.fromEntries(GRAPH_NODES.map(n => [n, 'idle'])));
const graphRunId       = ref(null);
const graphOverallStatus = ref('idle');
const graphLoopCount   = ref(0);
const graphMaxLoops    = ref(3);
const graphCurrentNode = ref(null);
const graphDevStep     = ref(null);
const graphTotalSteps  = ref(null);

const NODE_COLORS = {
  idle:     { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.08)' },
  pending:  { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.15)' },
  running:  { fill: 'rgba(255,255,255,0.10)',  stroke: '#22D3EE'               },
  complete: { fill: 'rgba(16,185,129,0.22)',  stroke: '#10B981'                },
  error:    { fill: 'rgba(239,68,68,0.22)',   stroke: '#EF4444'                },
};
const EDGE_COLORS = {
  idle:     'rgba(255,255,255,0.1)',
  active:   '#6366F1',
  complete: '#10B981',
  loop:     '#F59E0B',
};
// marker ids referenced in SVG defs
const markerIds = computed(() => [
  { id: 'arr-idle',     color: 'rgba(255,255,255,0.2)' },
  { id: 'arr-active',   color: '#6366F1' },
  { id: 'arr-complete', color: '#10B981' },
  { id: 'arr-loop',     color: '#F59E0B' },
  { id: 'arr-done',     color: '#10B981' },
]);

function nodeFill(n)   { return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).fill; }
function nodeStroke(n) { return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).stroke; }
function nodeClass(n)  { return graphNodeStatus[n] === 'running' ? 'node-running' : ''; }

function edgeStatus(from, to) {
  const loopEdges = new Set(['reviewer->loop_reset','loop_reset->developer']);
  const key = `${from}->${to}`;
  const fs = graphNodeStatus[from];
  const ts2 = graphNodeStatus[to];
  if (fs === 'idle' && ts2 === 'idle') return 'idle';
  if (loopEdges.has(key)) {
    if (fs === 'complete' && (ts2 === 'running' || ts2 === 'complete')) return 'loop';
    return 'idle';
  }
  if (from === 'assembler' && to === 'done') {
    return fs === 'complete' ? 'done' : 'idle';
  }
  if (fs === 'complete') return 'complete';
  if (fs === 'running')  return 'active';
  return 'idle';
}
function edgeColor(from, to) {
  const s = edgeStatus(from, to);
  return EDGE_COLORS[s] || EDGE_COLORS.idle;
}

function resetGraph() {
  GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'pending'; });
  graphNodeStatus['done']       = 'idle';
  graphNodeStatus['loop_reset'] = 'idle';
  graphLoopCount.value  = 0;
  graphCurrentNode.value = null;
  graphDevStep.value     = null;
  graphTotalSteps.value  = null;
}

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

async function fetchStats() {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/dashboard/stats');
    stats.value = data;
    const order = ['researcher', 'planner', 'developer', 'reviewer'];
    agentStatuses.value = (data.agents || []).sort((a, b) => {
      const ai = order.indexOf(a.agentId), bi = order.indexOf(b.agentId);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    const { data: runs } = await axios.get('/api/workflow/runs');
    recentRuns.value = runs.slice(0, 10);
  } finally { loading.value = false; }
}

function statusColor(s) {
  return { complete: 'success', running: 'warning', error: 'error', pending: 'default', stopped: 'default' }[s] || 'default';
}
function agentChipColor(id) {
  return { researcher: 'info', planner: 'primary', developer: 'success', reviewer: 'warning' }[id] || 'default';
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
  const AGENT_NODES = new Set(['researcher', 'planner', 'developer', 'reviewer']);

  socket.on('log:entry', (entry) => {
    logs.value.push(entry);
    if (logs.value.length > 200) logs.value.shift();
    scrollLogs();

    const agentId = entry.agentId;
    const message = entry.message || '';

    // ── Workflow start ──────────────────────────────────────────────────────
    if (agentId === 'workflow' && /Starting workflow run/i.test(message)) {
      if (graphOverallStatus.value !== 'running') {
        graphOverallStatus.value = 'running';
        resetGraph();
      }
      return;
    }

    // ── Agent node active ───────────────────────────────────────────────────
    if (AGENT_NODES.has(agentId)) {
      // Auto-start tracking even if workflow:started event was missed
      if (graphOverallStatus.value === 'complete' || graphOverallStatus.value === 'stopped') return;
      if (graphOverallStatus.value !== 'running') graphOverallStatus.value = 'running';

      graphNodeStatus[agentId] = 'running';
      graphCurrentNode.value = agentId;

      if (agentId === 'developer') {
        const stepMatch = message.match(/Executing task.*?Step\s+(\d+)/i);
        if (stepMatch) graphDevStep.value = parseInt(stepMatch[1]);
      }
      return;
    }

    // ── Tool call (belongs to current active agent) ─────────────────────────
    if (agentId === 'tool') {
      const active = graphCurrentNode.value;
      if (active && AGENT_NODES.has(active) && graphOverallStatus.value === 'running') {
        graphNodeStatus[active] = 'running';
      }
      return;
    }

    // ── Workflow orchestration logs ─────────────────────────────────────────
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
        graphNodeStatus['assembler'] = 'complete';
        graphNodeStatus['done'] = 'complete';
        graphCurrentNode.value = null;
      }
      if (/Workflow .+ stopped/i.test(message) || /Workflow .+ aborted/i.test(message)) {
        graphOverallStatus.value = 'stopped';
        GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'idle'; });
        graphCurrentNode.value = null;
      }
    }
  });
  // agent → graph node mapping (agent:status is proven reliable — drives graph animation)
  const AGENT_NODE = { researcher: 'researcher', planner: 'planner', developer: 'developer', reviewer: 'reviewer' };
  socket.on('agent:status', (data) => {
    agentLiveStatus.value = { ...agentLiveStatus.value, [data.agentId]: data.status };
    if (data.status === 'working' && data.currentTask) {
      agentCurrentTask.value = { ...agentCurrentTask.value, [data.agentId]: data.currentTask };
    } else if (data.status === 'idle') {
      agentCurrentTask.value = { ...agentCurrentTask.value, [data.agentId]: null };
    }
    // Drive graph animation from agent status events
    const gNode = AGENT_NODE[data.agentId];
    if (!gNode || graphOverallStatus.value !== 'running') return;
    if (data.status === 'working') {
      graphNodeStatus[gNode] = 'running';
      graphCurrentNode.value = gNode;
    } else if (data.status === 'idle' && graphNodeStatus[gNode] === 'running') {
      graphNodeStatus[gNode] = 'complete';
      if (graphCurrentNode.value === gNode) graphCurrentNode.value = null;
    }
  });
  socket.on('dashboard:stats', (data) => { stats.value = { ...stats.value, ...data }; });

  socket.on('workflow:started', (data) => {
    graphRunId.value = data.runId;
    graphOverallStatus.value = 'running';
    resetGraph();
  });

  function acceptRun(data) {
    if (!graphRunId.value) {
      graphRunId.value = data.runId;
      graphOverallStatus.value = 'running';
      resetGraph();
    }
    return data.runId === graphRunId.value;
  }

  socket.on('workflow:node_complete', (data) => {
    if (!acceptRun(data)) return;
    const node = data.node;
    const st   = data.state?.status;

    if (st === 'running') {
      graphCurrentNode.value = node;
      if (node in graphNodeStatus) graphNodeStatus[node] = 'running';
      if (node === 'developer') graphDevStep.value = (data.state.stepIdx ?? 0) + 1;
    } else {
      if (node === 'loop_reset') {
        graphLoopCount.value = data.state?.loop ?? (graphLoopCount.value + 1);
        graphNodeStatus['loop_reset'] = 'complete';
        graphNodeStatus['developer']  = 'pending';
        graphNodeStatus['reviewer']   = 'pending';
        graphDevStep.value = null;
      } else if (node in graphNodeStatus) {
        graphNodeStatus[node] = 'complete';
        if (node === 'planner' && data.state?.plan?.steps) {
          graphTotalSteps.value = data.state.plan.steps.length;
        }
        if (node === 'developer') graphDevStep.value = null;
      }
      if (graphCurrentNode.value === node) graphCurrentNode.value = null;
    }
  });

  socket.on('workflow:complete', (data) => {
    if (!acceptRun(data)) return;
    graphOverallStatus.value     = 'complete';
    graphNodeStatus['assembler'] = 'complete';
    graphNodeStatus['done']      = 'complete';
    graphCurrentNode.value = null;
  });

  socket.on('workflow:stopped', (data) => {
    if (!acceptRun(data)) return;
    graphOverallStatus.value = 'stopped';
    GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'idle'; });
    graphCurrentNode.value = null;
  });

  socket.on('workflow:error', (data) => {
    if (!acceptRun(data)) return;
    graphOverallStatus.value = 'error';
    GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'error'; });
    graphCurrentNode.value = null;
  });

  const interval = setInterval(fetchStats, 30000);
  onUnmounted(() => {
    clearInterval(interval);
    socket.off('log:entry');
    socket.off('agent:status');
    socket.off('dashboard:stats');
  });
});
</script>

<style scoped>
.dash-root { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

/* Header */
.dash-header { display: flex; align-items: flex-start; justify-content: space-between; }

/* Run banner */
.run-banner {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(245,158,11,0.07);
  border: 1px solid rgba(245,158,11,0.2);
  font-size: 13px;
}
.run-banner__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #F59E0B;
  animation: pulse-dot 1.2s ease-in-out infinite;
}
.run-banner__label { font-weight: 600; color: #F59E0B !important; }
.run-banner__task  { font-size: 12px; color: rgba(226,232,240,0.5) !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; }

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
}
.stat-card__icon {
  width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.stat-card__label { font-size: 12px; color: rgba(226,232,240,0.45) !important; margin-top: 3px; }

/* Mid grid */
.mid-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 760px) { .mid-grid { grid-template-columns: 1fr; } }

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

/* Agent list */
.agent-list { padding: 6px 0; }

.agent-row {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.agent-row:last-child { border-bottom: none; }
.agent-row:hover { background: rgba(255,255,255,0.02); }
.agent-row--working {
  background: rgba(245,158,11,0.04) !important;
  border-left: 2px solid #F59E0B;
  padding-left: 12px;
}

.agent-row__left  { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.agent-row__right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.agent-row__info  { min-width: 0; }
.agent-row__name  { font-size: 13px; font-weight: 600; text-transform: capitalize; }
.agent-row__model { font-size: 11px; color: rgba(226,232,240,0.35) !important; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Full-width task row */
.agent-row__task {
  width: 100%; padding-left: 20px;
  font-size: 12px; color: #F59E0B !important;
  font-style: italic;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center;
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

/* Graph panel */
.graph-body { padding: 4px 16px 12px; }
.graph-svg  { width: 100%; height: auto; display: block; }

.node-label      { font-size: 11px; font-weight: 600; fill: rgba(226,232,240,0.8); font-family: 'Segoe UI', sans-serif; }
.node-step-label { font-size: 9px;  font-weight: 500; fill: #22D3EE; font-family: 'Segoe UI', sans-serif; }
.node-icon       { font-size: 13px; font-family: 'Segoe UI Emoji', sans-serif; }
.node-done-label { font-size: 12px; font-weight: 700; fill: rgba(226,232,240,0.9); font-family: 'Segoe UI', sans-serif; }
.edge-label      { font-size: 9px; fill: rgba(226,232,240,0.3); font-family: 'Segoe UI', sans-serif; }

/* Running node: background color change + gentle breathe */
.node-running rect,
.node-running circle {
  animation: node-breathe 1.2s ease-in-out infinite;
}
@keyframes node-breathe {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* ── Active node status bar ── */
.graph-active-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 16px 2px;
  font-size: 12px;
}
.graph-active-bar__dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #22D3EE;
  box-shadow: 0 0 8px #22D3EE;
  animation: pulse-dot 1s ease-in-out infinite;
}
.graph-active-bar__label { color: rgba(226,232,240,0.4); }
.graph-active-bar__node  { color: #22D3EE; font-weight: 600; text-transform: capitalize; }
.graph-active-bar__step  { color: rgba(226,232,240,0.35); }

.run-id-badge    { font-size:10px; color:rgba(226,232,240,0.35); background:rgba(255,255,255,0.04); padding:2px 7px; border-radius:4px; }
.loop-count-badge { font-size:11px; font-weight:600; padding:2px 8px; background:rgba(245,158,11,.15); border:1px solid rgba(245,158,11,.3); color:#FCD34D; border-radius:20px; }
.graph-status-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.graph-status-dot--idle     { background:rgba(255,255,255,0.2); }
.graph-status-dot--running  { background:#22D3EE; box-shadow:0 0 8px #22D3EE; animation:pulse-dot 1.2s infinite; }
.graph-status-dot--complete { background:#10B981; }
.graph-status-dot--stopped  { background:#6B7280; }
.graph-status-dot--error    { background:#EF4444; }
.graph-overall-label { font-size:11px; color:rgba(226,232,240,0.4); text-transform:capitalize; }
</style>

<template>
  <div class="wf-graph-wrap">
    <!-- Header row (slot for stop button from parent) -->
    <div class="panel__header">
      <div class="d-flex align-center gap-2">
        <v-icon size="15" color="#6366F1">mdi-graph-outline</v-icon>
        <span class="section-title">Workflow Graph</span>
        <span v-if="graphRunId" class="run-id-badge font-mono">{{ graphRunId.slice(0,8) }}…</span>
        <span v-if="graphLoopCount > 0" class="loop-count-badge">🔄 Loop {{ graphLoopCount }}/{{ graphMaxLoops }}</span>
        <span :class="['graph-status-dot', `graph-status-dot--${graphOverallStatus}`]" />
        <span class="graph-overall-label">{{ graphOverallStatus }}</span>
      </div>
      <slot name="actions" />
    </div>

    <!-- Active node bar -->
    <div class="graph-active-bar" v-if="graphCurrentNode">
      <span class="graph-active-bar__dot" />
      <span class="graph-active-bar__label">Processing</span>
      <span class="graph-active-bar__node">{{ graphCurrentNode.replace('_', ' ') }}</span>
      <span v-if="graphDevStep && graphCurrentNode === 'worker'" class="graph-active-bar__step">
        — Step {{ graphDevStep }}{{ graphTotalSteps ? ' of ' + graphTotalSteps : '' }}
      </span>
    </div>

    <!-- SVG graph -->
    <div class="graph-body">
      <svg viewBox="0 0 640 235" class="graph-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker v-for="m in markerIds" :key="m.id"
            :id="m.id" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" :fill="m.color"/>
          </marker>
        </defs>
        <!-- planner → researcher -->
        <path d="M120,42 L153,42" :stroke-dasharray="edgeDash('planner','researcher')" :stroke-dashoffset="edgeOffset('planner','researcher')" :stroke="edgeColor('planner','researcher')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('planner','researcher')})`"/>
        <!-- researcher → worker -->
        <path d="M263,42 L297,42" :stroke-dasharray="edgeDash('researcher','worker')" :stroke-dashoffset="edgeOffset('researcher','worker')" :stroke="edgeColor('researcher','worker')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('researcher','worker')})`"/>
        <!-- worker → reviewer -->
        <path d="M407,42 L441,42" :stroke-dasharray="edgeDash('worker','reviewer')" :stroke-dashoffset="edgeOffset('worker','reviewer')" :stroke="edgeColor('worker','reviewer')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('worker','reviewer')})`"/>
        <!-- reviewer → assembler -->
        <path d="M501,64 L501,148" :stroke="edgeColor('reviewer','assembler')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('reviewer','assembler')})`"/>
        <!-- reviewer → loop_reset -->
        <path d="M551,42 L615,42 L615,218 L353,218 L353,192" stroke-dasharray="5,3" :stroke-dashoffset="edgeStatus('reviewer','loop_reset')==='loop' ? loopDashOffset : 0" :stroke="edgeColor('reviewer','loop_reset')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('reviewer','loop_reset')})`"/>
        <!-- loop_reset → researcher -->
        <path d="M353,148 L352,64" stroke-dasharray="5,3" :stroke-dashoffset="edgeStatus('loop_reset','researcher')==='loop' ? loopDashOffset : 0" :stroke="edgeColor('loop_reset','researcher')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('loop_reset','researcher')})`"/>
        <!-- assembler → done -->
        <path d="M551,170 L582,170" :stroke="edgeColor('assembler','done')" stroke-width="1.5" fill="none" :marker-end="`url(#arr-${edgeStatus('assembler','done')})`"/>
        <!-- Edge labels -->
        <text x="615" y="120" class="edge-label" text-anchor="middle" transform="rotate(-90,615,120)">score &lt; 10</text>
        <text x="510" y="108" class="edge-label">10/10 ✓</text>
        <!-- planner -->
        <g :class="['graph-node-g', nodeClass('planner')]">
          <rect x="10" y="20" width="110" height="44" rx="8" :fill="nodeFill('planner')" :stroke="nodeStroke('planner')" stroke-width="1.5"/>
          <text x="65" y="38" class="node-icon" text-anchor="middle">📋</text>
          <text x="65" y="56" class="node-label" text-anchor="middle">Planner</text>
        </g>
        <!-- researcher -->
        <g :class="['graph-node-g', nodeClass('researcher')]">
          <rect x="155" y="20" width="108" height="44" rx="8" :fill="nodeFill('researcher')" :stroke="nodeStroke('researcher')" stroke-width="1.5"/>
          <text x="209" y="38" class="node-icon" text-anchor="middle">🔬</text>
          <text x="209" y="56" class="node-label" text-anchor="middle">Researcher</text>
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
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';

const socket = useSocket();

// ── Graph state ──────────────────────────────────────────────────────────────
const GRAPH_NODES    = ['planner','researcher','worker','reviewer','loop_reset','assembler','done'];
const AGENT_NODES    = new Set(['planner','researcher','worker','reviewer']);
const graphNodeStatus  = reactive(Object.fromEntries(GRAPH_NODES.map(n => [n, 'idle'])));
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
const fwdDashOffset      = ref(0);
let   _rafId             = null;
let   _rafFwdOffset      = 0;
let   _rafLoopOffset     = 0;
let   _rafTick           = 0;
let   _rafLastTs         = 0;

// Single RAF loop for all animation
function _rafLoop(ts) {
  _rafId = requestAnimationFrame(_rafLoop);
  const dt = ts - _rafLastTs;
  if (dt < 16) return;
  _rafLastTs = ts;

  const running = graphOverallStatus.value === 'running';
  const looping = graphLoopCount.value > 0 && running;

  if (running) {
    _rafFwdOffset -= 0.65;
    if (_rafFwdOffset < -24) _rafFwdOffset = 0;
    fwdDashOffset.value = _rafFwdOffset;
  }
  if (looping) {
    _rafLoopOffset -= 0.55;
    if (_rafLoopOffset < -16) _rafLoopOffset = 0;
    loopDashOffset.value = _rafLoopOffset;
    _rafTick++;
    loopNodeOpacity.value = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(_rafTick / 26.7 * 2 * Math.PI));
  }
  if (!running) {
    if (fwdDashOffset.value  !== 0) fwdDashOffset.value  = 0;
    if (loopDashOffset.value !== 0) loopDashOffset.value = 0;
    if (loopNodeOpacity.value !== 1) loopNodeOpacity.value = 1;
  }
}

watch(graphOverallStatus, (status) => {
  if (status === 'running' && !_rafId) {
    _rafLastTs = 0;
    _rafId = requestAnimationFrame(_rafLoop);
  } else if (status !== 'running' && _rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
    _rafFwdOffset = _rafLoopOffset = _rafTick = 0;
    fwdDashOffset.value = loopDashOffset.value = 0;
    loopNodeOpacity.value = 1;
  }
});

// ── Colors ───────────────────────────────────────────────────────────────────
const NODE_COLORS = {
  idle:     { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.08)' },
  pending:  { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.15)' },
  running:  { fill: 'rgba(255,255,255,0.10)', stroke: '#22D3EE'                },
  complete: { fill: 'rgba(16,185,129,0.22)',  stroke: '#10B981'                },
  error:    { fill: 'rgba(239,68,68,0.22)',   stroke: '#EF4444'                },
};
const EDGE_COLORS = {
  idle:        'rgba(255,255,255,0.1)',
  'loop-idle': 'rgba(99,102,241,0.25)',
  active:      '#6366F1',
  complete:    '#10B981',
  loop:        '#6366F1',
};
const markerIds = computed(() => [
  { id: 'arr-idle',      color: 'rgba(255,255,255,0.2)' },
  { id: 'arr-loop-idle', color: 'rgba(99,102,241,0.4)'  },
  { id: 'arr-active',    color: '#6366F1' },
  { id: 'arr-complete',  color: '#10B981' },
  { id: 'arr-loop',      color: '#6366F1' },
  { id: 'arr-done',      color: '#10B981' },
]);

// ── Node/edge helpers ────────────────────────────────────────────────────────
function nodeFill(n) {
  if (n === 'loop_reset' && graphLoopCount.value > 0 && graphOverallStatus.value === 'running')
    return NODE_COLORS.running.fill;
  return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).fill;
}
function nodeStroke(n) {
  if (n === 'loop_reset' && graphLoopCount.value > 0 && graphOverallStatus.value === 'running')
    return NODE_COLORS.running.stroke;
  return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).stroke;
}
function nodeClass(n) {
  if (n === 'loop_reset' && graphLoopCount.value > 0 && graphOverallStatus.value === 'running')
    return 'node-running';
  return graphNodeStatus[n] === 'running' ? 'node-running' : '';
}
function edgeDash(from, to)   { return edgeStatus(from, to) === 'active' ? '8 4' : 'none'; }
function edgeOffset(from, to) { return edgeStatus(from, to) === 'active' ? fwdDashOffset.value : 0; }
function edgeStatus(from, to) {
  const loopEdges = new Set(['reviewer->loop_reset', 'loop_reset->researcher']);
  const key = `${from}->${to}`;
  const fs  = graphNodeStatus[from];
  const ts  = graphNodeStatus[to];
  if (fs === 'idle' && ts === 'idle') return 'idle';
  if (loopEdges.has(key)) {
    return (graphLoopCount.value > 0 && graphOverallStatus.value === 'running') ? 'loop' : 'loop-idle';
  }
  if (from === 'assembler' && to === 'done')      return fs === 'complete' ? 'done' : 'idle';
  if (from === 'reviewer'  && to === 'assembler') return ts === 'complete' ? 'complete' : 'idle';
  if (fs === 'complete') return 'complete';
  if (fs === 'running')  return 'active';
  return 'idle';
}
function edgeColor(from, to) { return EDGE_COLORS[edgeStatus(from, to)] || EDGE_COLORS.idle; }

// ── Graph reset ──────────────────────────────────────────────────────────────
function resetGraph() {
  GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'pending'; });
  graphNodeStatus['done']       = 'idle';
  graphNodeStatus['loop_reset'] = 'idle';
  graphLoopCount.value   = 0;
  graphCurrentNode.value = null;
  graphDevStep.value     = null;
  graphTotalSteps.value  = null;
}

// ── Socket event helpers ─────────────────────────────────────────────────────
function acceptRun(data) {
  if (!graphRunId.value) {
    graphRunId.value = data.runId;
    graphOverallStatus.value = 'running';
    resetGraph();
  }
  return data.runId === graphRunId.value;
}

// ── Socket listeners ─────────────────────────────────────────────────────────
onMounted(() => {
  socket.on('workflow:started', (data) => {
    graphRunId.value = data.runId;
    graphOverallStatus.value = 'running';
    graphMaxLoops.value = data.maxLoops ?? 3;
    resetGraph();
  });

  socket.on('workflow:node_complete', (data) => {
    if (!acceptRun(data)) return;
    const node = data.node;
    const st   = data.state?.status;

    if (node === 'planner') {
      if (st === 'running') {
        graphNodeStatus['planner'] = 'running';
        graphCurrentNode.value = 'planner';
      } else if (st === 'complete') {
        graphNodeStatus['planner'] = 'complete';
        if (data.state?.plan?.steps) graphTotalSteps.value = data.state.plan.steps.length;
        if (graphCurrentNode.value === 'planner') graphCurrentNode.value = null;
      }
      return;
    }

    if (node === 'researcher') {
      if (st === 'running') {
        graphNodeStatus['researcher'] = 'running';
        graphCurrentNode.value = 'researcher';
      } else if (st === 'complete') {
        graphNodeStatus['researcher'] = 'complete';
        if (graphCurrentNode.value === 'researcher') graphCurrentNode.value = null;
      }
      return;
    }

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
          if (graphNodeStatus['researcher'] !== 'running' && graphNodeStatus['researcher'] !== 'complete')
            graphNodeStatus['researcher'] = 'pending';
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
      return;
    }
  });

  socket.on('workflow:complete', (data) => {
    if (!acceptRun(data)) return;
    graphOverallStatus.value = 'complete';
    GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'complete'; });
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

  socket.on('agent:status', (data) => {
    const gNode = AGENT_NODES.has(data.agentId) ? data.agentId : null;
    if (!gNode || graphOverallStatus.value !== 'running') return;
    if (data.status === 'working') {
      if (isLoopResetting.value) return;
      graphNodeStatus[gNode] = 'running';
      graphCurrentNode.value = gNode;
    } else if (data.status === 'idle' && graphNodeStatus[gNode] === 'running') {
      graphNodeStatus[gNode] = 'complete';
      if (graphCurrentNode.value === gNode) graphCurrentNode.value = null;
    }
  });

  socket.on('log:entry', (entry) => {
    const agentId = entry.agentId;
    const message = entry.message || '';

    if (agentId === 'workflow' && /Starting workflow run/i.test(message)) {
      if (graphOverallStatus.value !== 'running') { graphOverallStatus.value = 'running'; resetGraph(); }
      return;
    }
    if ((agentId === 'worker' || agentId === 'reviewer') && graphOverallStatus.value === 'running') {
      const loopMatch = message.match(/Improvement pass \(loop (\d+)\)/i);
      if (loopMatch) {
        const loopNum = parseInt(loopMatch[1]);
        if (loopNum > graphLoopCount.value) {
          graphLoopCount.value = loopNum;
          graphNodeStatus['loop_reset'] = 'complete';
          if (graphNodeStatus['reviewer'] !== 'running') graphNodeStatus['reviewer'] = 'complete';
        }
      }
    }
    if (AGENT_NODES.has(agentId)) {
      if (graphOverallStatus.value === 'complete' || graphOverallStatus.value === 'stopped') return;
      if (isLoopResetting.value) return;
      if (graphOverallStatus.value !== 'running') graphOverallStatus.value = 'running';
      graphNodeStatus[agentId] = 'running';
      graphCurrentNode.value = agentId;
      if (agentId === 'worker') {
        const stepMatch = message.match(/Executing task.*?Step\s+(\d+)/i);
        if (stepMatch) graphDevStep.value = parseInt(stepMatch[1]);
      }
      return;
    }
    if (agentId === 'tool') {
      const active = graphCurrentNode.value;
      if (active && AGENT_NODES.has(active) && graphOverallStatus.value === 'running')
        graphNodeStatus[active] = 'running';
      return;
    }
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
});

onUnmounted(() => {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  socket.off('workflow:started');
  socket.off('workflow:node_complete');
  socket.off('workflow:complete');
  socket.off('workflow:stopped');
  socket.off('workflow:error');
  socket.off('agent:status');
  socket.off('log:entry');
});
</script>

<style scoped>
.wf-graph-wrap { display: flex; flex-direction: column; }

/* Graph panel */
.graph-body { padding: 4px 16px 12px; }
.graph-svg  { width: 100%; height: auto; display: block; }

.node-label      { font-size: 11px; font-weight: 600; fill: rgba(226,232,240,0.8); font-family: 'Segoe UI', sans-serif; }
.node-step-label { font-size: 9px;  font-weight: 500; fill: #22D3EE; font-family: 'Segoe UI', sans-serif; }
.node-icon       { font-size: 13px; font-family: 'Segoe UI Emoji', sans-serif; }
.node-done-label { font-size: 12px; font-weight: 700; fill: rgba(226,232,240,0.9); font-family: 'Segoe UI', sans-serif; }
.edge-label      { font-size: 9px;  fill: rgba(226,232,240,0.3); font-family: 'Segoe UI', sans-serif; }

.node-running rect,
.node-running circle { animation: node-breathe 1.2s ease-in-out infinite; }
@keyframes node-breathe {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}

/* Active node status bar */
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
</style>

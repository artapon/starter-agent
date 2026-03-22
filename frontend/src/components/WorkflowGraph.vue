<template>
  <div class="wf-graph-wrap">

    <!-- Header -->
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

    <!-- Active bar — visible while any node is running -->
    <div class="graph-active-bar" v-if="graphCurrentNode">
      <span class="graph-active-bar__dot" />
      <span class="graph-active-bar__node">{{ activeBarText }}</span>
      <span v-if="graphCurrentNode === 'worker' && graphCurrentStep"
            class="graph-active-bar__task">{{ graphCurrentStep }}</span>
      <span v-if="graphCurrentNode === 'worker' && graphFinishedSteps > 0"
            class="graph-active-bar__done">· ✓ {{ graphFinishedSteps }} done</span>
    </div>

    <!-- SVG graph -->
    <div class="graph-body">
      <svg viewBox="0 0 640 210" class="graph-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <!-- Static markers — never change, no reactive overhead -->
          <marker v-for="m in MARKERS" :key="m.id"
            :id="m.id" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" :fill="m.color"/>
          </marker>
        </defs>

        <!-- ── Edges ─────────────────────────────────────────────────────── -->
        <!-- planner → researcher -->
        <path d="M120,42 L153,42" v-bind="fwdEdge('planner','researcher')"/>
        <!-- researcher → worker -->
        <path d="M263,42 L297,42" v-bind="fwdEdge('researcher','worker')"/>
        <!-- worker → reviewer -->
        <path d="M407,42 L441,42" v-bind="fwdEdge('worker','reviewer')"/>
        <!-- reviewer → assembler (straight down) -->
        <path d="M496,64 L496,148" v-bind="fwdEdge('reviewer','assembler')"/>
        <!-- reviewer → loop_reset (loop feedback path) -->
        <path d="M441,64 L441,97 L352,97 L352,148" v-bind="loopEdge('reviewer','loop_reset')"/>
        <!-- loop_reset → researcher (loop feedback return) -->
        <path d="M296,170 L209,170 L209,64" v-bind="loopEdge('loop_reset','researcher')"/>
        <!-- assembler → done -->
        <path d="M551,170 L582,170" v-bind="fwdEdge('assembler','done')"/>

        <!-- Edge labels -->
        <text x="397" y="93" class="edge-label" text-anchor="middle">score &lt; 10</text>
        <text x="504" y="108" class="edge-label">10/10 ✓</text>

        <!-- ── Nodes ─────────────────────────────────────────────────────── -->

        <!-- Planner -->
        <g :class="['graph-node-g', nodeClass('planner')]">
          <rect x="10" y="20" width="110" height="44" rx="8"
            :fill="nodeFill('planner')" :stroke="nodeStroke('planner')" stroke-width="1.5"/>
          <text x="65" y="37" class="node-icon" text-anchor="middle">📋</text>
          <text x="65" y="53" class="node-label" text-anchor="middle">Planner</text>
        </g>

        <!-- Researcher -->
        <g :class="['graph-node-g', nodeClass('researcher')]">
          <rect x="155" y="20" width="108" height="44" rx="8"
            :fill="nodeFill('researcher')" :stroke="nodeStroke('researcher')" stroke-width="1.5"/>
          <text x="209" y="37" class="node-icon" text-anchor="middle">🔬</text>
          <text x="209" y="53" class="node-label" text-anchor="middle">Researcher</text>
        </g>

        <!-- Worker -->
        <g :class="['graph-node-g', nodeClass('worker')]">
          <rect x="297" y="20" width="110" height="44" rx="8"
            :fill="nodeFill('worker')" :stroke="nodeStroke('worker')" stroke-width="1.5"/>
          <text x="352" y="37" class="node-icon" text-anchor="middle">💻</text>
          <text x="352" y="53" class="node-label" text-anchor="middle">Worker</text>
        </g>
        <!-- Worker step info — placed in the inter-row gap below the node -->
        <text v-if="graphDevStep" x="352" y="74"
              class="node-sub-label node-sub-label--step" text-anchor="middle">
          Step {{ graphDevStep }}{{ graphTotalSteps ? ' / ' + graphTotalSteps : '' }}
        </text>
        <!-- Step progress bar -->
        <rect v-if="graphTotalSteps" x="305" y="80" width="94" height="3" rx="1.5" fill="rgba(255,255,255,0.08)"/>
        <rect v-if="graphTotalSteps && graphFinishedSteps > 0"
              x="305" y="80" :width="progressBarWidth" height="3" rx="1.5" fill="#10B981"/>

        <!-- Reviewer -->
        <g :class="['graph-node-g', nodeClass('reviewer')]">
          <rect x="441" y="20" width="110" height="44" rx="8"
            :fill="nodeFill('reviewer')" :stroke="nodeStroke('reviewer')" stroke-width="1.5"/>
          <text x="496" y="34" class="node-icon" text-anchor="middle">🔍</text>
          <text x="496" y="48" class="node-label" text-anchor="middle">Reviewer</text>
          <!-- Score inside node — only when a score is available -->
          <text v-if="graphReviewerScore !== null"
                x="496" y="60" class="node-sub-label" text-anchor="middle"
                :style="{ fill: reviewerScoreColor }">
            {{ graphReviewerScore }}/10
          </text>
        </g>

        <!-- Loop Reset (bottom row, under Worker) -->
        <g :class="['graph-node-g', nodeClass('loop_reset')]">
          <rect x="296" y="148" width="112" height="44" rx="8"
            :fill="nodeFill('loop_reset')" :stroke="nodeStroke('loop_reset')" stroke-width="1.5"/>
          <text x="352" y="163" class="node-icon" text-anchor="middle">🔄</text>
          <text x="352" y="178" class="node-label" text-anchor="middle">Loop Reset</text>
          <text v-if="graphLoopCount > 0" x="352" y="190"
                class="node-sub-label" text-anchor="middle" style="fill:#F59E0B">
            Pass {{ graphLoopCount }}/{{ graphMaxLoops }}
          </text>
        </g>

        <!-- Assembler (bottom row, under Reviewer) -->
        <g :class="['graph-node-g', nodeClass('assembler')]">
          <rect x="441" y="148" width="110" height="44" rx="8"
            :fill="nodeFill('assembler')" :stroke="nodeStroke('assembler')" stroke-width="1.5"/>
          <text x="496" y="166" class="node-icon" text-anchor="middle">✅</text>
          <text x="496" y="184" class="node-label" text-anchor="middle">Assembler</text>
        </g>

        <!-- Done (circle terminal) -->
        <g :class="['graph-node-g', nodeClass('done')]">
          <circle cx="596" cy="172" r="14"
            :fill="nodeFill('done')" :stroke="nodeStroke('done')" stroke-width="1.5"/>
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

// ── Constant definitions ──────────────────────────────────────────────────────
const GRAPH_NODES = ['planner','researcher','worker','reviewer','loop_reset','assembler','done'];
const AGENT_NODES = new Set(['planner','researcher','worker','reviewer']);

// Static SVG arrow markers — never change, so plain const (no reactive overhead)
const MARKERS = [
  { id: 'arr-idle',      color: 'rgba(255,255,255,0.2)' },
  { id: 'arr-loop-idle', color: 'rgba(99,102,241,0.4)'  },
  { id: 'arr-active',    color: '#6366F1'               },
  { id: 'arr-complete',  color: '#10B981'               },
  { id: 'arr-loop',      color: '#6366F1'               },
  { id: 'arr-done',      color: '#10B981'               },
];

const NODE_COLORS = {
  idle:     { fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(255,255,255,0.08)' },
  pending:  { fill: 'rgba(255,255,255,0.04)', stroke: 'rgba(255,255,255,0.12)' },
  running:  { fill: 'rgba(255,255,255,0.10)', stroke: '#22D3EE'                },
  complete: { fill: 'rgba(16,185,129,0.18)',  stroke: '#10B981'                },
  error:    { fill: 'rgba(239,68,68,0.18)',   stroke: '#EF4444'                },
};

const EDGE_COLORS = {
  idle:        'rgba(255,255,255,0.1)',
  'loop-idle': 'rgba(99,102,241,0.25)',
  active:      '#6366F1',
  complete:    '#10B981',
  done:        '#10B981',   // assembler→done when complete
  loop:        '#6366F1',
};

// ── Graph state ───────────────────────────────────────────────────────────────
const graphNodeStatus    = reactive(Object.fromEntries(GRAPH_NODES.map(n => [n, 'idle'])));
const graphRunId         = ref(null);
const graphOverallStatus = ref('idle');
const graphLoopCount     = ref(0);
const graphMaxLoops      = ref(3);
const graphDevStep       = ref(null);
const graphTotalSteps    = ref(null);
const graphFinishedSteps = ref(0);
const graphCurrentStep   = ref(null);
const graphPlanSteps     = ref([]);   // cached from planner complete — used as fallback for step descriptions
const graphReviewerScore = ref(null); // populated from reviewer:complete / reviewer:loop events

// Derived — which node is actively running (computed, always in sync)
const ACTIVE_ORDER     = ['planner','researcher','worker','reviewer','loop_reset'];
const graphCurrentNode = computed(() => ACTIVE_ORDER.find(n => graphNodeStatus[n] === 'running') || null);

// Reviewer score color: green ≥9, amber ≥7, red below
const reviewerScoreColor = computed(() => {
  const s = graphReviewerScore.value;
  if (s === null) return '#22D3EE';
  return s >= 9 ? '#10B981' : s >= 7 ? '#F59E0B' : '#EF4444';
});

// Active bar label — descriptive text for what is currently running
const activeBarText = computed(() => {
  const node = graphCurrentNode.value;
  if (!node) return '';
  if (node === 'worker') {
    if (graphDevStep.value && graphTotalSteps.value)
      return `Worker — Step ${graphDevStep.value} / ${graphTotalSteps.value}`;
    if (graphDevStep.value)
      return `Worker — Step ${graphDevStep.value}`;
    return 'Worker';
  }
  if (node === 'loop_reset')
    return `Loop Reset — Pass ${graphLoopCount.value} / ${graphMaxLoops.value}`;
  return node.charAt(0).toUpperCase() + node.slice(1);
});

// Step progress bar width (pixels in SVG units, track = 94 wide)
const progressBarWidth = computed(() => {
  if (!graphTotalSteps.value) return 0;
  return 94 * Math.min(graphFinishedSteps.value / graphTotalSteps.value, 1);
});

// ── RAF animation ─────────────────────────────────────────────────────────────
const fwdDashOffset  = ref(0);
const loopDashOffset = ref(0);
let _rafId       = null;
let _rafFwd      = 0;
let _rafLoop     = 0;
let _rafLastTs   = 0;

function _rafLoop_(ts) {
  _rafId = requestAnimationFrame(_rafLoop_);
  const dt = ts - _rafLastTs;
  if (dt < 16) return;
  _rafLastTs = ts;
  if (graphOverallStatus.value === 'running') {
    _rafFwd -= 0.65;
    if (_rafFwd < -24) _rafFwd = 0;
    fwdDashOffset.value = _rafFwd;
    if (graphLoopCount.value > 0) {
      _rafLoop -= 0.55;
      if (_rafLoop < -16) _rafLoop = 0;
      loopDashOffset.value = _rafLoop;
    }
  } else {
    if (fwdDashOffset.value  !== 0) fwdDashOffset.value  = 0;
    if (loopDashOffset.value !== 0) loopDashOffset.value = 0;
  }
}

watch(graphOverallStatus, (s) => {
  if (s === 'running' && !_rafId) {
    _rafLastTs = 0;
    _rafId = requestAnimationFrame(_rafLoop_);
  } else if (s !== 'running' && _rafId) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
    _rafFwd = _rafLoop = 0;
    fwdDashOffset.value = loopDashOffset.value = 0;
  }
});

// ── Node helpers ──────────────────────────────────────────────────────────────
function nodeFill(n)   { return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).fill;   }
function nodeStroke(n) { return (NODE_COLORS[graphNodeStatus[n]] || NODE_COLORS.idle).stroke; }
function nodeClass(n)  { return graphNodeStatus[n] === 'running' ? 'node-running' : '';       }

// ── Edge helpers ──────────────────────────────────────────────────────────────
function _edgeStatus(from, to) {
  const fs = graphNodeStatus[from];
  const ts = graphNodeStatus[to];
  if (fs === 'idle' && (ts === 'idle' || ts === 'pending')) return 'idle';
  if (from === 'reviewer'  && to === 'assembler') return ts === 'complete' ? 'complete' : 'idle';
  if (from === 'assembler' && to === 'done')      return fs === 'complete' ? 'done'     : 'idle';
  if (fs === 'complete') return 'complete';
  if (fs === 'running')  return 'active';
  return 'idle';
}

function fwdEdge(from, to) {
  const st = _edgeStatus(from, to);
  return {
    stroke:               EDGE_COLORS[st] || EDGE_COLORS.idle,
    'stroke-width':       '1.5',
    fill:                 'none',
    'stroke-dasharray':   st === 'active' ? '8 4' : 'none',
    'stroke-dashoffset':  st === 'active' ? fwdDashOffset.value : 0,
    'marker-end':         `url(#arr-${st})`,
  };
}

function loopEdge(from, to) {
  const isActive = graphLoopCount.value > 0 && graphOverallStatus.value === 'running';
  const st       = isActive ? 'loop' : 'loop-idle';
  return {
    stroke:              EDGE_COLORS[st],
    'stroke-width':      '1.5',
    fill:                'none',
    'stroke-dasharray':  '5,3',
    'stroke-dashoffset': isActive ? loopDashOffset.value : 0,
    'marker-end':        `url(#arr-${st})`,
  };
}

// ── Graph reset ───────────────────────────────────────────────────────────────
function resetGraph() {
  GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'pending'; });
  graphNodeStatus['done']       = 'idle';
  graphNodeStatus['loop_reset'] = 'idle';
  graphLoopCount.value     = 0;
  graphDevStep.value       = null;
  graphTotalSteps.value    = null;
  graphFinishedSteps.value = 0;
  graphCurrentStep.value   = null;
  graphPlanSteps.value     = [];
  graphReviewerScore.value = null;
}

// acceptRun: returns true if this event belongs to the tracked run.
// Also starts tracking if we see a run event before workflow:started.
function acceptRun(data) {
  if (!graphRunId.value) {
    graphRunId.value = data.runId;
    graphOverallStatus.value = 'running';
    resetGraph();
  }
  return data.runId === graphRunId.value;
}

// ── Named socket handlers (so off() only removes this component's listeners) ──

function onWorkflowStarted(data) {
  // Don't re-reset if we are already tracking this same run
  // (handles reconnect scenarios where node events arrived first)
  if (data.runId === graphRunId.value) return;
  graphRunId.value         = data.runId;
  graphOverallStatus.value = 'running';
  graphMaxLoops.value      = data.maxLoops ?? 3;
  resetGraph();
}

// PRIMARY source of truth — all node state transitions happen here.
// No guards — nodes legitimately cycle back to running in multi-step workflows.
function onWorkflowNodeComplete(data) {
  if (!acceptRun(data)) return;
  const node = data.node;
  const st   = data.state?.status;

  if (node === 'planner') {
    if (st === 'running') {
      graphNodeStatus['planner'] = 'running';
    } else if (st === 'complete') {
      graphNodeStatus['planner'] = 'complete';
      if (data.state?.plan?.steps) {
        graphTotalSteps.value = data.state.plan.steps.length;
        graphPlanSteps.value  = data.state.plan.steps;
      }
    }
    return;
  }

  if (node === 'researcher') {
    if (st === 'running') {
      // Loop pass starting: loop_reset can now be marked complete
      if (graphNodeStatus['loop_reset'] === 'running')
        graphNodeStatus['loop_reset'] = 'complete';
      graphNodeStatus['researcher'] = 'running';
    } else if (st === 'complete') {
      graphNodeStatus['researcher'] = 'complete';
    }
    return;
  }

  if (node === 'worker') {
    if (st === 'running') {
      graphNodeStatus['worker'] = 'running';
      const stepIdx = data.state?.stepIdx ?? 0;
      graphDevStep.value    = stepIdx + 1;
      if (data.state?.totalSteps) graphTotalSteps.value = data.state.totalSteps;
      graphCurrentStep.value = data.state?.step
        || graphPlanSteps.value[stepIdx]?.description
        || null;
    } else if (st === 'complete') {
      graphNodeStatus['worker'] = 'complete';
      graphFinishedSteps.value++;
      graphDevStep.value     = null;
      graphCurrentStep.value = null;
    }
    return;
  }

  if (node === 'reviewer') {
    if (st === 'running') {
      graphNodeStatus['reviewer'] = 'running';
      graphReviewerScore.value    = null; // clear previous score while reviewing
    } else if (st === 'complete') {
      graphNodeStatus['reviewer'] = 'complete';
      if (data.state?.score != null) graphReviewerScore.value = data.state.score;
    } else if (st === 'loop') {
      graphNodeStatus['reviewer'] = 'complete';
      if (data.state?.score != null) graphReviewerScore.value = data.state.score;
      graphLoopCount.value = data.state?.loop ?? (graphLoopCount.value + 1);
      // Begin loop: reset downstream nodes, activate loop_reset node
      graphNodeStatus['loop_reset'] = 'running';
      graphNodeStatus['researcher'] = 'pending';
      graphNodeStatus['worker']     = 'pending';
      graphDevStep.value            = null;
      graphCurrentStep.value        = null;
      // Note: loop_reset transitions to 'complete' when researcher:running arrives next
    } else if (st === 'assembled') {
      graphNodeStatus['assembler'] = 'complete';
      graphNodeStatus['done']      = 'complete';
    }
    return;
  }
}

function onWorkflowComplete(data) {
  if (!acceptRun(data)) return;
  graphOverallStatus.value = 'complete';
  GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'complete'; });
}

function onWorkflowStopped(data) {
  if (!acceptRun(data)) return;
  graphOverallStatus.value = 'stopped';
  GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'idle'; });
  graphDevStep.value     = null;
  graphCurrentStep.value = null;
}

function onWorkflowError(data) {
  if (!acceptRun(data)) return;
  graphOverallStatus.value = 'error';
  GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'error'; });
}

// Secondary fallback — only nudges a pending/idle node to running.
// Never completes nodes (that is workflow:node_complete's job).
function onAgentStatus(data) {
  if (graphOverallStatus.value !== 'running') return;
  const gNode = AGENT_NODES.has(data.agentId) ? data.agentId : null;
  if (!gNode) return;
  if (data.status === 'working') {
    const cur = graphNodeStatus[gNode];
    if (cur === 'pending' || cur === 'idle') {
      graphNodeStatus[gNode] = 'running';
    }
  }
  // 'idle' events intentionally ignored — let workflow:node_complete handle completion
}

// Fallback for overall workflow lifecycle only.
// No per-agent state mutations — those are workflow:node_complete's responsibility.
function onLogEntry(entry) {
  if (entry.agentId !== 'workflow') return;
  const msg = entry.message || '';

  if (/Starting workflow run/i.test(msg)) {
    if (graphOverallStatus.value !== 'running') {
      graphOverallStatus.value = 'running';
      resetGraph();
    }
    return;
  }
  if (/Workflow .+ complete$/i.test(msg)) {
    if (graphOverallStatus.value !== 'complete') {
      graphOverallStatus.value = 'complete';
      GRAPH_NODES.forEach(n => { graphNodeStatus[n] = 'complete'; });
    }
    return;
  }
  if (/Workflow .+ (stopped|aborted)/i.test(msg)) {
    if (graphOverallStatus.value !== 'stopped') {
      graphOverallStatus.value = 'stopped';
      GRAPH_NODES.forEach(n => { if (graphNodeStatus[n] === 'running') graphNodeStatus[n] = 'idle'; });
    }
  }
}

// ── Socket listeners ──────────────────────────────────────────────────────────
onMounted(() => {
  socket.on('workflow:started',      onWorkflowStarted);
  socket.on('workflow:node_complete', onWorkflowNodeComplete);
  socket.on('workflow:complete',     onWorkflowComplete);
  socket.on('workflow:stopped',      onWorkflowStopped);
  socket.on('workflow:error',        onWorkflowError);
  socket.on('agent:status',          onAgentStatus);
  socket.on('log:entry',             onLogEntry);
});

onUnmounted(() => {
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
  socket.off('workflow:started',      onWorkflowStarted);
  socket.off('workflow:node_complete', onWorkflowNodeComplete);
  socket.off('workflow:complete',     onWorkflowComplete);
  socket.off('workflow:stopped',      onWorkflowStopped);
  socket.off('workflow:error',        onWorkflowError);
  socket.off('agent:status',          onAgentStatus);
  socket.off('log:entry',             onLogEntry);
});
</script>

<style scoped>
.wf-graph-wrap { display: flex; flex-direction: column; }

/* Header */
.panel__header {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  justify-content: space-between;
}
.panel__header > div { display: flex; align-items: center; gap: 7px; }
.section-title { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.85); }

.run-id-badge {
  font-size: 10px; color: rgba(226,232,240,0.35);
  background: rgba(255,255,255,0.04); padding: 2px 7px; border-radius: 4px;
}
.loop-count-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  background: rgba(245,158,11,.15); border: 1px solid rgba(245,158,11,.3);
  color: #FCD34D; border-radius: 20px;
}
.graph-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.graph-status-dot--idle     { background: rgba(255,255,255,0.2); }
.graph-status-dot--running  { background: #22D3EE; box-shadow: 0 0 8px #22D3EE; animation: pulse-dot 1.2s infinite; }
.graph-status-dot--complete { background: #10B981; }
.graph-status-dot--stopped  { background: #6B7280; }
.graph-status-dot--error    { background: #EF4444; }
.graph-overall-label { font-size: 11px; color: rgba(226,232,240,0.4); text-transform: capitalize; }

/* Active bar */
.graph-active-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 16px 2px; font-size: 12px; min-height: 26px;
}
.graph-active-bar__dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #22D3EE; box-shadow: 0 0 8px #22D3EE;
  animation: pulse-dot 1s ease-in-out infinite;
}
.graph-active-bar__node { color: #22D3EE; font-weight: 600; }
.graph-active-bar__task {
  color: rgba(226,232,240,0.65); font-style: italic;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 280px; display: inline-block; vertical-align: bottom;
}
.graph-active-bar__done { color: #10B981; font-weight: 600; }

/* SVG graph */
.graph-body { padding: 4px 16px 12px; }
.graph-svg  { width: 100%; height: auto; display: block; }

/* SVG text classes */
.node-label      { font-size: 11px; font-weight: 600; fill: rgba(226,232,240,0.8); font-family: 'Segoe UI', sans-serif; }
.node-sub-label  { font-size: 9px;  font-weight: 500; fill: #22D3EE; font-family: 'Segoe UI', sans-serif; }
.node-sub-label--step { font-size: 11px; font-weight: 700; }
.node-icon       { font-size: 13px; font-family: 'Segoe UI Emoji', sans-serif; }
.node-done-label { font-size: 12px; font-weight: 700; fill: rgba(226,232,240,0.9); font-family: 'Segoe UI', sans-serif; }
.edge-label      { font-size: 9px;  fill: rgba(226,232,240,0.3); font-family: 'Segoe UI', sans-serif; }

/* Running node animation — CSS-driven, no JS involvement */
.node-running rect,
.node-running circle { animation: node-breathe 1.2s ease-in-out infinite; }
@keyframes node-breathe {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1;   transform: scale(1);    }
  50%       { opacity: 0.4; transform: scale(0.75); }
}
</style>

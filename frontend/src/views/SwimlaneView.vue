<template>
  <div class="swimlane-root">

    <!-- Top bar -->
    <div class="swimlane-topbar">
      <router-link to="/workflow" class="back-link">
        <v-icon size="16">mdi-arrow-left</v-icon>
        <span>Workflow</span>
      </router-link>

      <div class="topbar-center">
        <span class="topbar-title">Swimlane</span>
        <span v-if="runId" class="run-badge">run: {{ runId.slice(0, 8) }}…</span>
      </div>

      <div class="topbar-right">
        <span v-if="loopCount > 0" class="loop-pill">
          <v-icon size="13" color="#F59E0B">mdi-refresh</v-icon>
          Loop {{ loopCount }}
        </span>
        <span class="status-pill" :class="`status-pill--${globalStatus}`">
          <span class="status-dot" :class="`dot--${globalStatus}`" />
          {{ globalStatusLabel }}
        </span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!runId && !hasAnyCards" class="empty-state">
      <v-icon size="52" color="rgba(226,232,240,0.12)">mdi-view-week-outline</v-icon>
      <div class="empty-state__title">No active workflow</div>
      <div class="empty-state__sub">Start a run to see tasks here</div>
      <router-link to="/workflow">
        <v-btn variant="tonal" color="primary" size="small" prepend-icon="mdi-play-circle-outline" class="mt-4">
          Go to Workflow
        </v-btn>
      </router-link>
    </div>

    <!-- Lanes -->
    <div v-else class="lanes-grid">

      <!-- PLANNER lane -->
      <div class="lane">
        <div class="lane-header lane-header--planner">
          <div class="lane-header__left">
            <v-icon size="16" color="#818CF8">mdi-clipboard-text-outline</v-icon>
            <span class="lane-name">Planner</span>
          </div>
          <span class="lane-status-dot" :class="`dot--${laneStatus('planner')}`" />
        </div>
        <div class="lane-body">
          <div v-if="lanes.planner.length === 0" class="lane-empty">No task</div>
          <div
            v-for="card in lanes.planner"
            :key="card.id"
            class="task-card"
            :class="cardClass(card)"
          >
            <div class="card-header">
              <span class="card-label">{{ card.label }}</span>
              <span v-if="card.duration != null" class="duration-badge">{{ card.duration }}</span>
            </div>
            <div v-if="card.task" class="card-task">{{ card.task }}</div>

            <!-- Planner complete details -->
            <template v-if="card.status === 'complete'">
              <template v-if="card.skills">
                <div class="card-section-label">Agent Skills</div>
                <div class="skill-chips">
                  <span
                    v-for="(skill, agent) in card.skills"
                    :key="agent"
                    class="skill-chip"
                    :class="`skill-chip--${agent}`"
                  >{{ agent }}: {{ skill }}</span>
                </div>
              </template>
              <template v-if="card.steps && card.steps.length">
                <div class="card-section-label" style="margin-top:8px">Steps</div>
                <ol class="plan-steps">
                  <li v-for="(s, i) in card.steps" :key="i">{{ s }}</li>
                </ol>
              </template>
              <div v-else-if="card.stepCount" class="card-meta">
                <v-icon size="11" color="rgba(226,232,240,0.4)">mdi-format-list-numbered</v-icon>
                {{ card.stepCount }} steps
              </div>
            </template>

            <!-- Running pulse -->
            <div v-if="card.status === 'running'" class="card-pulse-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </div>

      <!-- RESEARCHER lane -->
      <div class="lane">
        <div class="lane-header lane-header--researcher">
          <div class="lane-header__left">
            <v-icon size="16" color="#34D399">mdi-magnify</v-icon>
            <span class="lane-name">Researcher</span>
          </div>
          <span class="lane-status-dot" :class="`dot--${laneStatus('researcher')}`" />
        </div>
        <div class="lane-body">
          <div v-if="lanes.researcher.length === 0" class="lane-empty">No task</div>
          <div
            v-for="card in lanes.researcher"
            :key="card.id"
            class="task-card"
            :class="cardClass(card)"
          >
            <div class="card-header">
              <span class="card-label">{{ card.label }}</span>
              <span v-if="card.duration != null" class="duration-badge">{{ card.duration }}</span>
            </div>
            <div v-if="card.task" class="card-task">{{ card.task }}</div>

            <!-- Researcher complete details -->
            <template v-if="card.status === 'complete' && card.summary">
              <div class="card-summary">{{ card.summary }}</div>
              <div v-if="card.approach" class="card-approach">
                <v-icon size="11" color="#34D399">mdi-arrow-right</v-icon>
                {{ card.approach }}
              </div>
            </template>

            <div v-if="card.status === 'running'" class="card-pulse-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </div>

      <!-- WORKER DOING lane -->
      <div class="lane">
        <div class="lane-header lane-header--worker-doing">
          <div class="lane-header__left">
            <v-icon size="16" color="#22D3EE">mdi-progress-wrench</v-icon>
            <span class="lane-name">Worker Doing</span>
          </div>
          <span class="lane-status-dot" :class="`dot--${laneStatus('worker')}`" />
        </div>
        <div class="lane-body">
          <div v-if="workerDoing.length === 0" class="lane-empty">No task</div>
          <div
            v-for="card in workerDoing"
            :key="card.id"
            class="task-card task-card--running"
          >
            <div class="card-header">
              <span class="card-label">{{ card.label }}</span>
            </div>
            <div v-if="card.task" class="card-task">{{ card.task }}</div>

            <template v-if="card.totalSteps > 0">
              <div class="step-label">
                Step {{ (card.stepIdx ?? 0) + 1 }} / {{ card.totalSteps }}
              </div>
              <div class="progress-bar-track">
                <div
                  class="progress-bar-fill progress-bar-fill--indigo"
                  :style="`width:${Math.round(((card.stepIdx ?? 0) + 1) / card.totalSteps * 100)}%`"
                />
              </div>
            </template>

            <template v-if="card.writtenFiles && card.writtenFiles.length">
              <div class="card-section-label" style="margin-top:8px">Written files</div>
              <div class="written-files">
                <span v-for="f in card.writtenFiles" :key="f" class="file-chip">
                  <v-icon size="10" color="#10B981">mdi-check</v-icon>
                  {{ f }}
                </span>
              </div>
            </template>

            <div class="card-pulse-dots"><span /><span /><span /></div>
          </div>
        </div>
      </div>

      <!-- WORKER DONE lane -->
      <div class="lane">
        <div class="lane-header lane-header--worker-done">
          <div class="lane-header__left">
            <v-icon size="16" color="#10B981">mdi-check-all</v-icon>
            <span class="lane-name">Worker Done</span>
          </div>
          <span class="lane-count-badge" v-if="workerDone.length > 0">{{ workerDone.length }}</span>
        </div>
        <div class="lane-body">
          <div v-if="workerDone.length === 0" class="lane-empty">No task</div>
          <div
            v-for="card in workerDone"
            :key="card.id"
            class="task-card task-card--complete"
          >
            <div class="card-header">
              <span class="card-label">{{ card.label }}</span>
              <span v-if="card.duration != null" class="duration-badge">{{ card.duration }}</span>
            </div>
            <div v-if="card.task" class="card-task">{{ card.task }}</div>

            <template v-if="card.writtenFiles && card.writtenFiles.length">
              <div class="card-section-label" style="margin-top:8px">Written files</div>
              <div class="written-files">
                <span v-for="f in card.writtenFiles" :key="f" class="file-chip">
                  <v-icon size="10" color="#10B981">mdi-check</v-icon>
                  {{ f }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- REVIEWER lane -->
      <div class="lane">
        <div class="lane-header lane-header--reviewer">
          <div class="lane-header__left">
            <v-icon size="16" color="#F472B6">mdi-check-decagram-outline</v-icon>
            <span class="lane-name">Reviewer</span>
          </div>
          <span class="lane-status-dot" :class="`dot--${laneStatus('reviewer')}`" />
        </div>
        <div class="lane-body">
          <div v-if="lanes.reviewer.length === 0" class="lane-empty">No task</div>
          <div
            v-for="card in lanes.reviewer"
            :key="card.id"
            class="task-card"
            :class="cardClass(card)"
          >
            <div class="card-header">
              <span class="card-label">{{ card.label }}</span>
              <span v-if="card.duration != null" class="duration-badge">{{ card.duration }}</span>
            </div>
            <div v-if="card.task" class="card-task">{{ card.task }}</div>

            <!-- Score bar -->
            <template v-if="card.score != null">
              <div class="score-row">
                <span class="score-value" :class="scoreClass(card.score)">{{ card.score }}/10</span>
                <span v-if="card.approved != null" class="approved-badge" :class="card.approved ? 'approved-badge--yes' : 'approved-badge--no'">
                  {{ card.approved ? 'Approved' : 'Rejected' }}
                </span>
              </div>
              <div class="score-bar-track">
                <div
                  class="score-bar-fill"
                  :class="scoreBarClass(card.score)"
                  :style="`width:${card.score * 10}%`"
                />
              </div>
              <div v-if="card.feedback" class="review-feedback">{{ card.feedback }}</div>
              <template v-if="card.suggestions && card.suggestions.length">
                <div class="card-section-label" style="margin-top:8px">Suggestions</div>
                <ul class="review-suggestions">
                  <li v-for="(s, i) in card.suggestions" :key="i">{{ s }}</li>
                </ul>
              </template>
            </template>

            <!-- Loop badge -->
            <div v-if="card.status === 'loop'" class="loop-badge">
              <v-icon size="11" color="#F59E0B">mdi-refresh</v-icon>
              Loop {{ card.loop }}
            </div>

            <!-- Assembled badge -->
            <div v-if="card.status === 'assembled'" class="assembled-badge">
              <v-icon size="11" color="#34D399">mdi-package-variant-closed-check</v-icon>
              Assembled
            </div>

            <div v-if="card.status === 'running'" class="card-pulse-dots">
              <span /><span /><span />
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useSocket } from '../plugins/socket.js';

const route = useRoute();
const socket = useSocket();

// ─── State ───────────────────────────────────────────────────────────────────

const runId = ref(route.query.runId || null);
const globalStatus = ref('idle'); // idle | running | complete | error | stopped
const loopCount = ref(0);

const lanes = reactive({
  planner:    [],
  researcher: [],
  worker:     [],
  reviewer:   [],
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const globalStatusLabel = computed(() => {
  const map = { idle: 'Idle', running: 'Running', complete: 'Complete', error: 'Error', stopped: 'Stopped' };
  return map[globalStatus.value] ?? globalStatus.value;
});

const hasAnyCards = computed(() =>
  lanes.planner.length || lanes.researcher.length ||
  lanes.worker.length  || lanes.reviewer.length
);

const workerDoing = computed(() => lanes.worker.filter(c => c.status === 'running'));
const workerDone  = computed(() => lanes.worker.filter(c => c.status !== 'running'));

function laneStatus(name) {
  const cards = lanes[name];
  if (!cards.length) return 'idle';
  const last = cards[cards.length - 1];
  if (last.status === 'running') return 'running';
  if (last.status === 'complete' || last.status === 'assembled') return 'complete';
  if (last.status === 'error') return 'error';
  return 'complete';
}

function cardClass(card) {
  return {
    'task-card--running':  card.status === 'running',
    'task-card--complete': card.status === 'complete' || card.status === 'assembled',
    'task-card--error':    card.status === 'error',
    'task-card--loop':     card.status === 'loop',
  };
}

function scoreClass(score) {
  if (score >= 9) return 'score-value--green';
  if (score >= 7) return 'score-value--amber';
  return 'score-value--red';
}

function scoreBarClass(score) {
  if (score >= 9) return 'score-bar-fill--green';
  if (score >= 7) return 'score-bar-fill--amber';
  return 'score-bar-fill--red';
}

function fmtDuration(ms) {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function makeCardId(node, index) {
  return `${node}-${index}`;
}

// ─── Card management ─────────────────────────────────────────────────────────

function getOrCreateCard(node, index = 0) {
  const list = lanes[node];
  if (!list) return null;
  const id = makeCardId(node, index);
  let card = list.find(c => c.id === id);
  if (!card) {
    card = {
      id,
      status: 'running',
      label: nodeLabelMap[node] ?? node,
      task: null,
      startedAt: Date.now(),
      endedAt: null,
      duration: null,
      // planner
      skills: null,
      stepCount: null,
      steps: [],
      // researcher
      summary: null,
      approach: null,
      // worker
      stepIdx: 0,
      totalSteps: 0,
      writtenFiles: [],
      // reviewer
      score: null,
      approved: null,
      feedback: null,
      suggestions: [],
      loop: null,
    };
    list.push(card);
  }
  return card;
}

const nodeLabelMap = {
  planner:    'Planning',
  researcher: 'Research',
  worker:     'Worker',
  reviewer:   'Review',
};

// Track how many times each node has run (for loops)
const nodeRunCount = reactive({ planner: 0, researcher: 0, worker: 0, reviewer: 0 });

function resetLanes() {
  lanes.planner    = [];
  lanes.researcher = [];
  lanes.worker     = [];
  lanes.reviewer   = [];
  nodeRunCount.planner    = 0;
  nodeRunCount.researcher = 0;
  nodeRunCount.worker     = 0;
  nodeRunCount.reviewer   = 0;
  loopCount.value  = 0;
  globalStatus.value = 'running';
}

// ─── Socket event handlers ────────────────────────────────────────────────────

function onWorkflowStarted(data) {
  const id   = data?.runId ?? data?.run_id ?? null;
  const goal = data?.goal ?? null;
  if (runId.value && id && runId.value !== id) return; // wrong run
  if (!runId.value) runId.value = id;
  resetLanes();
  // Pre-populate planner card with goal immediately — avoids blank card during planning
  if (goal) {
    const card = getOrCreateCard('planner', 0);
    card.task = goal;
  }
}

function onNodeComplete(data) {
  // Filter by runId if we have one
  const eventRunId = data?.runId ?? data?.run_id ?? null;
  if (runId.value && eventRunId && runId.value !== eventRunId) return;
  if (!runId.value && eventRunId) runId.value = eventRunId;

  const node   = data?.node;
  const state  = data?.state ?? data ?? {};
  const status = state?.status ?? 'complete';

  if (!node || !lanes[node]) return;

  const runIdx = nodeRunCount[node] ?? 0;

  if (status === 'running') {
    // Start a new card for this node run
    const card = getOrCreateCard(node, runIdx);
    card.status = 'running';
    card.startedAt = Date.now();
    if (node === 'planner') {
      if (state.goal) card.task = state.goal;
    }
    if (node === 'researcher') {
      if (state.query) card.task = state.query;
    }
    if (node === 'reviewer') {
      if (state.step) card.task = state.step;
    }
    // worker running: update step info
    if (node === 'worker') {
      if (state.step)      card.task      = state.step;
      if (state.stepIdx != null) card.stepIdx  = state.stepIdx;
      if (state.totalSteps != null) card.totalSteps = state.totalSteps;
    }
  } else {
    // Complete / other terminal state
    const card = getOrCreateCard(node, runIdx);
    card.endedAt = Date.now();
    card.duration = fmtDuration(card.endedAt - card.startedAt);

    if (status === 'complete') {
      card.status = 'complete';

      if (node === 'planner' && state.plan) {
        const plan = state.plan;
        if (plan.goal) card.task = plan.goal;   // don't overwrite if already set from running event
        card.skills    = plan.agentSkills ?? null;
        const planSteps = Array.isArray(plan.steps) ? plan.steps : [];
        card.stepCount = planSteps.length || null;
        card.steps     = planSteps.map(s => s.description ?? s).filter(Boolean);
      }
      if (node === 'researcher' && state.findings) {
        card.summary  = state.findings.summary ?? null;
        card.approach = state.findings.recommendedApproach ?? null;
      }
      if (node === 'worker') {
        card.status = 'complete';
      }
      if (node === 'reviewer') {
        card.approved     = state.approved     ?? null;
        card.score        = state.score        ?? null;
        card.feedback     = state.feedback     ?? null;
        card.suggestions  = state.suggestions  ?? [];
        // Fallback: set task from step field if it arrived with complete (or was missed on running)
        if (!card.task && state.step) card.task = state.step;
      }

    } else if (status === 'loop') {
      card.status = 'loop';
      card.score  = state.score ?? null;
      card.loop   = state.loop  ?? null;
      if (state.loop) loopCount.value = state.loop;

    } else if (status === 'assembled') {
      card.status = 'assembled';

    } else {
      card.status = 'complete';
    }

    // Increment run count for this node so next run gets a new card
    nodeRunCount[node] = runIdx + 1;
  }
}

function onWorkerAction(data) {
  if (data?.type !== 'written') return;
  const path = data?.path ?? data?.filePath ?? null;
  if (!path) return;

  const runIdx = (nodeRunCount.worker ?? 1) - 1;
  const idx = runIdx < 0 ? 0 : runIdx;
  // Find active worker card
  const id = makeCardId('worker', idx);
  const card = lanes.worker.find(c => c.id === id);
  if (card && !card.writtenFiles.includes(path)) {
    card.writtenFiles.push(path);
  }
}

function onWorkflowComplete() {
  globalStatus.value = 'complete';
  // Mark any still-running cards as complete
  finalizeAllRunning('complete');
}

function onWorkflowStopped() {
  globalStatus.value = 'stopped';
  finalizeAllRunning('complete');
}

function onWorkflowError() {
  globalStatus.value = 'error';
  finalizeAllRunning('error');
}

function finalizeAllRunning(finalStatus) {
  for (const list of Object.values(lanes)) {
    for (const card of list) {
      if (card.status === 'running') {
        card.status   = finalStatus;
        card.endedAt  = Date.now();
        card.duration = fmtDuration(card.endedAt - card.startedAt);
      }
    }
  }
}

// ─── Snapshot loader (recover state when page opens mid-run or after run) ────

async function loadRunSnapshot() {
  if (!runId.value) return;
  try {
    const res = await fetch(`/api/workflow/runs/${runId.value}`);
    if (!res.ok) return;
    const run = await res.json();
    const state = run.graph_state_json ? JSON.parse(run.graph_state_json) : {};
    const goal = state.goal || state.userGoal || null;

    // Always pre-populate planner card with goal so it never shows blank
    if (goal) {
      const pCard = getOrCreateCard('planner', 0);
      if (!pCard.task) pCard.task = goal;
    }

    // If the run is finished, reconstruct all lanes from final state
    if (run.status === 'complete' || run.status === 'stopped') {
      globalStatus.value = run.status === 'complete' ? 'complete' : 'stopped';

      // Planner
      if (state.plan) {
        const pCard = getOrCreateCard('planner', 0);
        pCard.status    = 'complete';
        pCard.task      = goal;
        pCard.skills    = state.plan.agentSkills ?? null;
        const snapSteps = Array.isArray(state.plan.steps) ? state.plan.steps : [];
        pCard.stepCount = snapSteps.length || null;
        pCard.steps     = snapSteps.map(s => s.description ?? s).filter(Boolean);
        nodeRunCount.planner = 1;
      }

      // Researcher
      if (state.researchFindings) {
        const rCard = getOrCreateCard('researcher', 0);
        rCard.status  = 'complete';
        rCard.task    = state.researchFindings.topic ?? null;
        rCard.summary = state.researchFindings.summary ?? null;
        rCard.approach = state.researchFindings.recommendedApproach ?? null;
        nodeRunCount.researcher = 1;
      }

      // Worker: one card per completed step
      const steps = state.plan?.steps || [];
      const results = Array.isArray(state.subtaskResults) ? state.subtaskResults : [];
      results.forEach((r, i) => {
        const wCard = getOrCreateCard('worker', i);
        wCard.status     = 'complete';
        wCard.task       = steps[i]?.description ?? null;
        wCard.stepIdx    = i;
        wCard.totalSteps = steps.length;
        nodeRunCount.worker = i + 1;
      });

      // Reviewer: reconstruct from final reviewFeedback if available
      const rf = state.reviewFeedback;
      if (rf) {
        const lastStep = steps[Math.max(0, steps.length - 1)];
        const rvCard = getOrCreateCard('reviewer', 0);
        rvCard.status      = 'complete';
        rvCard.task        = lastStep?.description ?? null;
        rvCard.approved    = rf.approved    ?? null;
        rvCard.score       = rf.score       ?? null;
        rvCard.feedback    = rf.feedback    ?? null;
        rvCard.suggestions = rf.suggestions ?? [];
        nodeRunCount.reviewer = 1;
      }
    }
  } catch { /* ignore */ }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  socket.on('workflow:started',      onWorkflowStarted);
  socket.on('workflow:node_complete', onNodeComplete);
  socket.on('workflow:complete',     onWorkflowComplete);
  socket.on('workflow:stopped',      onWorkflowStopped);
  socket.on('workflow:error',        onWorkflowError);
  socket.on('worker:action',         onWorkerAction);

  if (runId.value) {
    globalStatus.value = 'running';
    await loadRunSnapshot();
  }
});

onUnmounted(() => {
  socket.off('workflow:started',      onWorkflowStarted);
  socket.off('workflow:node_complete', onNodeComplete);
  socket.off('workflow:complete',     onWorkflowComplete);
  socket.off('workflow:stopped',      onWorkflowStopped);
  socket.off('workflow:error',        onWorkflowError);
  socket.off('worker:action',         onWorkerAction);
});
</script>

<style scoped>
/* ── Root ────────────────────────────────────────────────────────────────── */
.swimlane-root {
  min-height: 100vh;
  background: #0A0A14;
  display: flex;
  flex-direction: column;
  padding: 0;
  color: #E2E8F0;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
}

/* ── Top bar ─────────────────────────────────────────────────────────────── */
.swimlane-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  gap: 12px;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(226,232,240,0.5);
  text-decoration: none;
  transition: color 0.15s;
  flex-shrink: 0;
}
.back-link:hover { color: #E2E8F0; }

.topbar-center {
  display: flex;
  align-items: center;
  gap: 10px;
}
.topbar-title {
  font-size: 14px;
  font-weight: 600;
  color: #E2E8F0;
  letter-spacing: 0.02em;
}
.run-badge {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 11px;
  color: rgba(226,232,240,0.4);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 4px;
  padding: 2px 7px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.loop-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #F59E0B;
  background: rgba(245,158,11,0.1);
  border: 1px solid rgba(245,158,11,0.2);
  border-radius: 20px;
  padding: 3px 9px;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  border-radius: 20px;
  padding: 3px 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
}
.status-pill--running  { color: #22D3EE; border-color: rgba(34,211,238,0.2); background: rgba(34,211,238,0.07); }
.status-pill--complete { color: #10B981; border-color: rgba(16,185,129,0.2); background: rgba(16,185,129,0.07); }
.status-pill--error    { color: #EF4444; border-color: rgba(239,68,68,0.2);  background: rgba(239,68,68,0.07); }
.status-pill--stopped  { color: rgba(226,232,240,0.45); }
.status-pill--idle     { color: rgba(226,232,240,0.35); }

/* ── Status dots ─────────────────────────────────────────────────────────── */
.status-dot,
.lane-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4B5563;
  flex-shrink: 0;
}
.dot--idle     { background: #4B5563; }
.dot--running  { background: #22D3EE; animation: blink 1.2s ease-in-out infinite; }
.dot--complete { background: #10B981; }
.dot--error    { background: #EF4444; }
.dot--stopped  { background: #6B7280; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 24px;
  text-align: center;
}
.empty-state__title {
  font-size: 16px;
  font-weight: 600;
  color: rgba(226,232,240,0.4);
  margin-top: 12px;
}
.empty-state__sub {
  font-size: 13px;
  color: rgba(226,232,240,0.22);
}

/* ── Lanes grid ──────────────────────────────────────────────────────────── */
.lanes-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0;
  min-height: 0;
  overflow: hidden;
}

/* ── Lane ────────────────────────────────────────────────────────────────── */
.lane {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.05);
  min-height: calc(100vh - 55px);
}
.lane:last-child { border-right: none; }

.lane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255,255,255,0.03);
  border-bottom: 2px solid transparent;
  flex-shrink: 0;
}
.lane-header--planner      { border-bottom-color: rgba(129,140,248,0.35); }
.lane-header--researcher   { border-bottom-color: rgba(52,211,153,0.35); }
.lane-header--worker-doing { border-bottom-color: rgba(34,211,238,0.35); }
.lane-header--worker-done  { border-bottom-color: rgba(16,185,129,0.35); }
.lane-header--reviewer     { border-bottom-color: rgba(244,114,182,0.35); }

.lane-count-badge {
  font-size: 10px;
  font-weight: 700;
  color: #10B981;
  background: rgba(16,185,129,0.12);
  border: 1px solid rgba(16,185,129,0.25);
  border-radius: 10px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.lane-header__left {
  display: flex;
  align-items: center;
  gap: 7px;
}
.lane-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(226,232,240,0.85);
  letter-spacing: 0.02em;
}

.lane-body {
  flex: 1;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.lane-body::-webkit-scrollbar { width: 4px; }
.lane-body::-webkit-scrollbar-track { background: transparent; }
.lane-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }

.lane-empty {
  font-size: 12px;
  color: rgba(226,232,240,0.18);
  text-align: center;
  padding: 20px 0;
}

/* ── Task cards ──────────────────────────────────────────────────────────── */
.task-card {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 11px 12px;
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.task-card--running {
  border-color: #22D3EE;
  box-shadow: 0 0 0 1px rgba(34,211,238,0.15), 0 0 14px rgba(34,211,238,0.08);
  animation: card-pulse 2s ease-in-out infinite;
}
@keyframes card-pulse {
  0%, 100% { box-shadow: 0 0 0 1px rgba(34,211,238,0.15), 0 0 14px rgba(34,211,238,0.08); }
  50%       { box-shadow: 0 0 0 1px rgba(34,211,238,0.3),  0 0 22px rgba(34,211,238,0.15); }
}

.task-card--complete {
  border-left: 3px solid #10B981;
  border-color: rgba(255,255,255,0.06);
  border-left-color: #10B981;
}
.task-card--error {
  border-left: 3px solid #EF4444;
  border-left-color: #EF4444;
}
.task-card--loop {
  border-left: 3px solid #F59E0B;
  border-left-color: #F59E0B;
}

/* ── Card header ─────────────────────────────────────────────────────────── */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
  gap: 6px;
}
.card-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(226,232,240,0.75);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.duration-badge {
  font-size: 10px;
  color: rgba(226,232,240,0.35);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.card-task {
  font-size: 12px;
  color: rgba(226,232,240,0.55);
  line-height: 1.5;
  margin-bottom: 6px;
  word-break: break-word;
}

/* ── Card pulse dots ─────────────────────────────────────────────────────── */
.card-pulse-dots {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 8px;
}
.card-pulse-dots span {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #22D3EE;
  animation: dot-bounce 1.2s ease-in-out infinite;
}
.card-pulse-dots span:nth-child(2) { animation-delay: 0.2s; }
.card-pulse-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot-bounce {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40%           { opacity: 1;    transform: scale(1.1); }
}

/* ── Section label ───────────────────────────────────────────────────────── */
.card-section-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(226,232,240,0.28);
  margin-bottom: 5px;
  margin-top: 8px;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(226,232,240,0.35);
  margin-top: 6px;
}

/* ── Skill chips (planner) ───────────────────────────────────────────────── */
.skill-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.skill-chip {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(129,140,248,0.1);
  border: 1px solid rgba(129,140,248,0.2);
  color: #A5B4FC;
  white-space: nowrap;
}
/* ── Plan steps list (planner) ───────────────────────────────────────────── */
.plan-steps {
  margin: 4px 0 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.plan-steps li {
  font-size: 11px;
  color: rgba(226,232,240,0.5);
  line-height: 1.4;
}

.skill-chip--researcher {
  background: rgba(52,211,153,0.1);
  border-color: rgba(52,211,153,0.2);
  color: #6EE7B7;
}
.skill-chip--worker {
  background: rgba(96,165,250,0.1);
  border-color: rgba(96,165,250,0.2);
  color: #93C5FD;
}
.skill-chip--reviewer {
  background: rgba(244,114,182,0.1);
  border-color: rgba(244,114,182,0.2);
  color: #F9A8D4;
}

/* ── Researcher card ─────────────────────────────────────────────────────── */
.card-summary {
  font-size: 12px;
  color: rgba(226,232,240,0.5);
  line-height: 1.5;
  margin-top: 4px;
  word-break: break-word;
}
.card-approach {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  color: rgba(52,211,153,0.75);
  margin-top: 6px;
  word-break: break-word;
  line-height: 1.4;
}

/* ── Worker card ─────────────────────────────────────────────────────────── */
.step-label {
  font-size: 11px;
  color: rgba(226,232,240,0.4);
  margin-top: 6px;
  margin-bottom: 4px;
}

.progress-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.progress-bar-fill--indigo {
  background: #6366F1;
}

.written-files {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 2px;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 10px;
  color: rgba(16,185,129,0.85);
  background: rgba(16,185,129,0.06);
  border: 1px solid rgba(16,185,129,0.12);
  border-radius: 4px;
  padding: 2px 7px;
  word-break: break-all;
}

/* ── Reviewer card ───────────────────────────────────────────────────────── */
.score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  margin-bottom: 5px;
}
.score-value {
  font-size: 13px;
  font-weight: 700;
}
.score-value--green { color: #10B981; }
.score-value--amber { color: #F59E0B; }
.score-value--red   { color: #EF4444; }

.approved-badge {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.approved-badge--yes {
  background: rgba(16,185,129,0.12);
  border: 1px solid rgba(16,185,129,0.25);
  color: #6EE7B7;
}
.approved-badge--no {
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.22);
  color: #FCA5A5;
}

.score-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
}
.score-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}
.score-bar-fill--green { background: #10B981; }
.score-bar-fill--amber { background: #F59E0B; }
.score-bar-fill--red   { background: #EF4444; }

/* ── Reviewer feedback ───────────────────────────────────────────────────── */
.review-feedback {
  font-size: 11px;
  color: rgba(226,232,240,0.5);
  line-height: 1.5;
  margin-top: 7px;
  padding: 5px 8px;
  background: rgba(255,255,255,0.03);
  border-left: 2px solid rgba(244,114,182,0.35);
  border-radius: 0 4px 4px 0;
  word-break: break-word;
}
.review-suggestions {
  margin: 4px 0 0 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.review-suggestions li {
  font-size: 11px;
  color: rgba(226,232,240,0.45);
  line-height: 1.4;
}

.loop-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #F59E0B;
  margin-top: 8px;
}
.assembled-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #34D399;
  margin-top: 8px;
}
</style>

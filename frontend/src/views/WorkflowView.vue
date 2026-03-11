<template>
  <v-container fluid class="pa-4">
    <v-row class="mb-2">
      <v-col>
        <h1 class="text-h5 font-weight-bold">
          <v-icon color="primary" class="mr-2">mdi-graph</v-icon>Workflow
        </h1>
      </v-col>
    </v-row>

    <!-- Start Workflow -->
    <v-row>
      <v-col cols="12" md="6">
        <v-card color="surface-variant" rounded="lg">
          <v-card-title class="text-subtitle-1">Start New Workflow</v-card-title>
          <v-card-text>
            <v-textarea
              v-model="goal"
              label="Goal"
              placeholder="e.g. Build a REST API with authentication..."
              rows="3"
              variant="outlined"
              hide-details
            />
          </v-card-text>
          <v-card-actions class="px-4 pb-4">
            <v-btn color="primary" :loading="starting" @click="startWorkflow" :disabled="!goal.trim() || isRunning">
              <v-icon left>mdi-play</v-icon> Run Workflow
            </v-btn>
            <v-btn
              v-if="isRunning && activeRun?.runId"
              color="error"
              variant="tonal"
              class="ml-2"
              :loading="stopping"
              @click="stopWorkflow"
            >
              <v-icon left>mdi-stop</v-icon> Stop
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <!-- Active Run -->
      <v-col cols="12" md="6">
        <v-card color="surface-variant" rounded="lg" v-if="activeRun">
          <v-card-title class="text-subtitle-1 d-flex align-center">
            <v-icon class="mr-2">mdi-run</v-icon>
            Run: {{ activeRun.runId?.slice(0, 8) }}...
            <v-spacer />
            <v-chip :color="runStatusColor(activeRun.status)" size="small" variant="tonal">
              {{ activeRun.status }}
            </v-chip>
          </v-card-title>
          <v-card-text>
            <!-- Node timeline -->
            <v-timeline side="end" density="compact">
              <v-timeline-item
                v-for="event in nodeEvents"
                :key="event.ts"
                :dot-color="nodeColor(event.status)"
                size="small"
              >
                <div class="text-caption font-weight-medium text-capitalize">
                  {{ event.node }}
                  <v-chip size="x-small" :color="nodeColor(event.status)" class="ml-1" variant="tonal">
                    {{ event.status }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis">{{ formatTime(event.ts) }}</div>
              </v-timeline-item>
              <v-timeline-item v-if="!nodeEvents.length" dot-color="grey" size="small">
                <span class="text-caption text-medium-emphasis">Waiting to start...</span>
              </v-timeline-item>
            </v-timeline>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Run history -->
    <v-row class="mt-2">
      <v-col>
        <v-card color="surface-variant" rounded="lg">
          <v-card-title class="text-subtitle-1">
            <v-icon class="mr-2">mdi-history</v-icon>Run History
          </v-card-title>
          <v-data-table
            :headers="headers"
            :items="runs"
            density="compact"
            :items-per-page="10"
            class="bg-transparent"
          >
            <template #item.status="{ item }">
              <v-chip :color="runStatusColor(item.status)" size="x-small" variant="tonal">
                {{ item.status }}
              </v-chip>
            </template>
            <template #item.started_at="{ item }">
              {{ new Date(item.started_at * 1000).toLocaleString() }}
            </template>
            <template #item.id="{ item }">
              {{ item.id.slice(0, 12) }}...
            </template>
          </v-data-table>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
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
  { title: 'Run ID', key: 'id' },
  { title: 'Session', key: 'session_id' },
  { title: 'Status', key: 'status' },
  { title: 'Started', key: 'started_at' },
];

function runStatusColor(s) {
  return { complete: 'success', running: 'warning', error: 'error', pending: 'grey', stopped: 'default' }[s] || 'grey';
}
function nodeColor(s) {
  return { complete: 'success', running: 'warning', error: 'error' }[s] || 'grey';
}
function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : ''; }

async function startWorkflow() {
  starting.value = true;
  nodeEvents.value = [];
  try {
    const { data } = await axios.post('/api/workflow/start', { goal: goal.value });
    // runId is pre-generated by the server so we can stop it immediately
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
    // Also emit via socket for immediate effect
    socket.emit('workflow:stop', { runId: activeRun.value.runId });
  } catch { /* best-effort */ }
  finally { stopping.value = false; }
}

async function fetchRuns() {
  const { data } = await axios.get('/api/workflow/runs');
  runs.value = data;
}

onMounted(() => {
  fetchRuns();

  socket.on('workflow:node_complete', (data) => {
    nodeEvents.value.push({ ...data.state, node: data.node, ts: data.ts, status: 'complete' });
  });

  socket.on('workflow:complete', (data) => {
    if (activeRun.value?.runId === data.runId) {
      activeRun.value.status = 'complete';
    }
    fetchRuns();
  });

  socket.on('workflow:error', (data) => {
    if (activeRun.value?.runId === data.runId) {
      activeRun.value.status = 'error';
    }
    fetchRuns();
  });

  socket.on('workflow:started', (data) => {
    nodeEvents.value = [];
    activeRun.value = { runId: data.runId, status: 'running' };
  });

  socket.on('workflow:stopped', (data) => {
    if (activeRun.value?.runId === data.runId || !data.runId) {
      activeRun.value = activeRun.value ? { ...activeRun.value, status: 'stopped' } : null;
    }
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

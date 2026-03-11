<template>
  <v-container fluid class="pa-4">
    <v-row class="mb-2">
      <v-col>
        <h1 class="text-h5 font-weight-bold">
          <v-icon color="primary" class="mr-2">mdi-view-dashboard</v-icon>Dashboard
        </h1>
      </v-col>
      <v-col cols="auto">
        <v-btn icon="mdi-refresh" variant="text" @click="fetchStats" :loading="loading" />
      </v-col>
    </v-row>

    <!-- Active run banner -->
    <v-row v-if="anyAgentWorking" class="mb-2">
      <v-col>
        <v-alert color="warning" variant="tonal" density="compact" rounded="lg" class="d-flex align-center">
          <template #prepend>
            <span class="pulse-dot mr-3" />
          </template>
          <div class="d-flex align-center flex-wrap gap-2">
            <span class="font-weight-bold text-body-2">Running</span>
            <v-chip
              v-for="a in workingAgents" :key="a.agentId"
              size="x-small" :color="agentChipColor(a.agentId)" variant="tonal"
            >
              {{ a.agentId }}
            </v-chip>
            <span v-if="workingAgents[0]?.currentTask" class="text-caption text-medium-emphasis text-truncate" style="max-width:420px">
              — {{ workingAgents[0].currentTask }}
            </span>
          </div>
        </v-alert>
      </v-col>
    </v-row>

    <!-- Stat cards -->
    <v-row>
      <v-col v-for="stat in statCards" :key="stat.label" cols="12" sm="6" md="3">
        <v-card color="surface-variant" rounded="lg">
          <v-card-text class="d-flex align-center">
            <v-icon :color="stat.color" size="40" class="mr-4">{{ stat.icon }}</v-icon>
            <div>
              <div class="text-h4 font-weight-bold">{{ stat.value }}</div>
              <div class="text-caption text-medium-emphasis">{{ stat.label }}</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Agent status + Recent runs -->
    <v-row class="mt-2">
      <v-col cols="12" md="6">
        <v-card color="surface-variant" rounded="lg" height="100%">
          <v-card-title class="text-subtitle-1">
            <v-icon class="mr-2">mdi-robot</v-icon>Agent Status
          </v-card-title>
          <v-card-text>
            <v-list bg-color="transparent" density="compact">
              <v-list-item
                v-for="agent in agentStatuses"
                :key="agent.agentId"
                :subtitle="agent.model"
                class="mb-1"
              >
                <template #prepend>
                  <span
                    :class="['status-dot mr-3', agentLiveStatus[agent.agentId] === 'working' ? 'status-dot--working' : (agent.available ? 'status-dot--online' : 'status-dot--offline')]"
                  />
                </template>
                <template #title>
                  <span class="text-capitalize font-weight-medium">{{ agent.agentId }}</span>
                  <v-chip
                    :color="agentLiveStatus[agent.agentId] === 'working' ? 'warning' : 'default'"
                    size="x-small"
                    :variant="agentLiveStatus[agent.agentId] === 'working' ? 'tonal' : 'text'"
                    class="ml-2"
                  >
                    {{ agentLiveStatus[agent.agentId] || 'idle' }}
                  </v-chip>
                </template>
                <template #append>
                  <v-chip size="x-small" :color="agent.available ? 'success' : 'error'" variant="tonal">
                    {{ agent.available ? 'Online' : 'Offline' }}
                  </v-chip>
                </template>

                <!-- Current task indicator -->
                <div
                  v-if="agentCurrentTask[agent.agentId]"
                  class="text-caption text-medium-emphasis mt-1 task-label"
                  style="font-style:italic;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                >
                  <v-icon size="11" class="mr-1">mdi-chevron-right</v-icon>{{ agentCurrentTask[agent.agentId] }}
                </div>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Recent runs -->
      <v-col cols="12" md="6">
        <v-card color="surface-variant" rounded="lg" height="100%">
          <v-card-title class="text-subtitle-1">
            <v-icon class="mr-2">mdi-history</v-icon>Recent Runs
          </v-card-title>
          <v-card-text>
            <v-list bg-color="transparent" density="compact" max-height="200" style="overflow-y:auto">
              <v-list-item
                v-for="run in recentRuns"
                :key="run.id"
                :subtitle="new Date(run.started_at * 1000).toLocaleString()"
              >
                <template #title>
                  <span class="text-caption font-mono">{{ run.id.slice(0, 8) }}...</span>
                </template>
                <template #append>
                  <v-chip
                    :color="statusColor(run.status)"
                    size="x-small"
                    variant="tonal"
                  >{{ run.status }}</v-chip>
                </template>
              </v-list-item>
              <v-list-item v-if="!recentRuns.length" subtitle="No runs yet" />
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Live log feed -->
    <v-row class="mt-2">
      <v-col>
        <v-card color="surface-variant" rounded="lg">
          <v-card-title class="text-subtitle-1 d-flex align-center">
            <v-icon class="mr-2" color="success">mdi-console</v-icon>Live Logs
            <v-spacer />
            <v-btn size="x-small" variant="text" @click="logs = []">Clear</v-btn>
          </v-card-title>
          <v-card-text>
            <div
              ref="logContainer"
              style="height:200px;overflow-y:auto;font-family:monospace;font-size:12px;"
              class="bg-background pa-2 rounded"
            >
              <div
                v-for="(log, i) in logs"
                :key="i"
                :class="logColor(log.level)"
              >
                <span class="text-medium-emphasis">{{ formatTime(log.timestamp) }}</span>
                <v-chip size="x-small" :color="levelColor(log.level)" class="mx-1">{{ log.level }}</v-chip>
                <span v-if="log.agentId" class="text-secondary">[{{ log.agentId }}] </span>
                {{ log.message }}
              </div>
              <div v-if="!logs.length" class="text-medium-emphasis">Waiting for logs...</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
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

const statCards = computed(() => [
  { label: 'Total Runs', value: stats.value.totalRuns || 0, icon: 'mdi-run', color: 'primary' },
  { label: 'Active Runs', value: stats.value.activeRuns || 0, icon: 'mdi-play-circle', color: 'warning' },
  { label: 'Messages', value: stats.value.totalMessages || 0, icon: 'mdi-message', color: 'secondary' },
  { label: 'Log Entries', value: stats.value.totalLogs || 0, icon: 'mdi-text-box', color: 'info' },
]);

const anyAgentWorking = computed(() =>
  Object.values(agentLiveStatus.value).some(s => s === 'working')
);

const workingAgents = computed(() =>
  agentStatuses.value
    .filter(a => agentLiveStatus.value[a.agentId] === 'working')
    .map(a => ({ ...a, currentTask: agentCurrentTask.value[a.agentId] }))
);

async function fetchStats() {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/dashboard/stats');
    stats.value = data;
    agentStatuses.value = data.agents || [];
    const { data: runs } = await axios.get('/api/workflow/runs');
    recentRuns.value = runs.slice(0, 10);
  } finally { loading.value = false; }
}

function statusColor(s) {
  return { complete: 'success', running: 'warning', error: 'error', pending: 'default', stopped: 'default' }[s] || 'default';
}
function levelColor(l) {
  return { error: 'error', warn: 'warning', info: 'info', debug: 'default' }[l] || 'default';
}
function logColor(l) {
  return { error: 'text-error', warn: 'text-warning', info: '', debug: 'text-medium-emphasis' }[l] || '';
}
function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}
function agentChipColor(id) {
  return { planner: 'blue', developer: 'green', reviewer: 'orange' }[id] || 'default';
}

async function scrollLogs() {
  await nextTick();
  if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
}

onMounted(() => {
  fetchStats();

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
  socket.on('dashboard:stats', (data) => {
    stats.value = { ...stats.value, ...data };
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
.task-label {
  padding-left: 2px;
  color: rgba(255,255,255,0.5);
}

/* Status dots */
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot--online  { background: #4CAF50; }
.status-dot--offline { background: #f44336; }
.status-dot--working {
  background: #FF9800;
  animation: pulse-dot 1.2s ease-in-out infinite;
}

/* Pulse banner dot */
.pulse-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #FF9800;
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}
</style>

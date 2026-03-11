<template>
  <v-container fluid class="pa-4">
    <v-row class="mb-2 align-center">
      <v-col>
        <h1 class="text-h5 font-weight-bold">
          <v-icon color="primary" class="mr-2">mdi-text-box-multiple</v-icon>Logs
        </h1>
      </v-col>
      <v-col cols="auto" class="d-flex gap-2">
        <v-select
          v-model="filters.level"
          :items="['', 'info', 'warn', 'error', 'debug']"
          label="Level"
          density="compact"
          hide-details
          style="width:120px"
          clearable
        />
        <v-select
          v-model="filters.agentId"
          :items="['', 'planner', 'developer', 'reviewer', 'chat', 'workflow', 'http']"
          label="Agent"
          density="compact"
          hide-details
          style="width:140px"
          clearable
        />
        <v-btn icon="mdi-refresh" variant="text" @click="fetchLogs" :loading="loading" />
        <v-btn icon="mdi-delete" variant="text" color="error" @click="clearLogs" />
      </v-col>
    </v-row>

    <!-- Live toggle -->
    <v-row class="mb-2">
      <v-col>
        <v-switch
          v-model="liveMode"
          label="Live Mode"
          color="success"
          hide-details
          density="compact"
          inset
        />
      </v-col>
    </v-row>

    <!-- Log table -->
    <v-card color="surface-variant" rounded="lg">
      <v-card-text class="pa-0">
        <v-data-table
          :headers="headers"
          :items="displayLogs"
          density="compact"
          class="bg-transparent"
          :items-per-page="50"
        >
          <template #item.level="{ item }">
            <v-chip :color="levelColor(item.level)" size="x-small" variant="tonal">
              {{ item.level }}
            </v-chip>
          </template>
          <template #item.ts="{ item }">
            <span class="text-caption">{{ formatTime(item.ts) }}</span>
          </template>
          <template #item.message="{ item }">
            <span style="font-family:monospace;font-size:12px">{{ item.message }}</span>
          </template>
          <template #item.meta_json="{ item }">
            <v-btn
              v-if="item.meta_json"
              size="x-small"
              variant="text"
              @click="showMeta(item)"
            >View</v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>

    <!-- Meta dialog -->
    <v-dialog v-model="metaDialog" max-width="600">
      <v-card color="surface-variant" rounded="lg">
        <v-card-title>Log Metadata</v-card-title>
        <v-card-text>
          <pre style="font-size:12px;white-space:pre-wrap">{{ selectedMeta }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="metaDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();
const loading = ref(false);
const logs = ref([]);
const liveLogs = ref([]);
const liveMode = ref(true);
const filters = ref({ level: '', agentId: '' });
const metaDialog = ref(false);
const selectedMeta = ref('');

const headers = [
  { title: 'Time', key: 'ts', width: 120 },
  { title: 'Level', key: 'level', width: 80 },
  { title: 'Agent', key: 'agent_id', width: 100 },
  { title: 'Message', key: 'message' },
  { title: 'Meta', key: 'meta_json', width: 60 },
];

const displayLogs = computed(() => liveMode.value ? liveLogs.value : logs.value);

function levelColor(l) {
  return { error: 'error', warn: 'warning', info: 'info', debug: 'grey' }[l] || 'grey';
}
function formatTime(ts) {
  return ts ? new Date(Number(ts)).toLocaleTimeString() : '';
}
function showMeta(item) {
  try { selectedMeta.value = JSON.stringify(JSON.parse(item.meta_json), null, 2); }
  catch { selectedMeta.value = item.meta_json; }
  metaDialog.value = true;
}

async function fetchLogs() {
  loading.value = true;
  try {
    const params = {};
    if (filters.value.level) params.level = filters.value.level;
    if (filters.value.agentId) params.agentId = filters.value.agentId;
    const { data } = await axios.get('/api/logs', { params });
    logs.value = data.logs;
  } finally { loading.value = false; }
}

async function clearLogs() {
  await axios.delete('/api/logs');
  logs.value = [];
  liveLogs.value = [];
}

watch(filters, fetchLogs, { deep: true });

onMounted(() => {
  fetchLogs();
  socket.on('log:entry', (entry) => {
    liveLogs.value.unshift({ ...entry, ts: entry.timestamp || Date.now() });
    if (liveLogs.value.length > 500) liveLogs.value.pop();
  });
  onUnmounted(() => socket.off('log:entry'));
});
</script>

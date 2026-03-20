<template>
  <div class="page-root">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title">Logs</div>
        <div class="page-subtitle">System and agent activity log</div>
      </div>
      <div class="d-flex align-center gap-2">
        <v-switch v-model="liveMode" label="Live" color="success" hide-details density="compact" inset
          style="font-size:12px" />
        <v-select
          v-model="filters.level"
          :items="['', 'info', 'warn', 'error', 'debug']"
          label="Level" density="compact" hide-details variant="outlined"
          style="width:110px" clearable
        />
        <v-select
          v-model="filters.agentId"
          :items="['', 'planner', 'worker', 'reviewer', 'chat', 'workflow', 'http']"
          label="Agent" density="compact" hide-details variant="outlined"
          style="width:130px" clearable
        />
        <v-btn icon="mdi-refresh" variant="text" size="small" :loading="loading" @click="fetchLogs"
          style="color:rgba(226,232,240,0.5)" />
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" title="Clear DB logs" @click="clearLogs" />
        <v-btn prepend-icon="mdi-file-remove-outline" variant="tonal" size="small" color="error"
          :loading="clearingFiles" title="Empty agent-info.log and agent-error.log" @click="clearLogFiles">
          Empty Log Files
        </v-btn>
      </div>
    </div>

    <!-- Log table -->
    <div class="panel card-hover">
      <v-data-table
        :headers="headers"
        :items="displayLogs"
        density="compact"
        class="bg-transparent log-table"
        :items-per-page="50"
      >
        <template #item.level="{ item }">
          <span class="level-badge"
            :style="`background:${levelBg(item.level)};color:${levelFg(item.level)}`">
            {{ item.level }}
          </span>
        </template>
        <template #item.ts="{ item }">
          <span class="log-time">{{ formatTime(item.ts) }}</span>
        </template>
        <template #item.agent_id="{ item }">
          <v-chip v-if="item.agent_id" size="x-small" color="secondary" variant="tonal">
            {{ item.agent_id }}
          </v-chip>
        </template>
        <template #item.message="{ item }">
          <span class="log-msg">{{ item.message }}</span>
        </template>
        <template #item.meta_json="{ item }">
          <v-btn v-if="item.meta_json" size="x-small" variant="text" @click="showMeta(item)"
            style="color:#6366F1;font-size:11px">
            View
          </v-btn>
        </template>
      </v-data-table>
    </div>

    <!-- Meta dialog -->
    <v-dialog v-model="metaDialog" max-width="580">
      <v-card rounded="lg">
        <div class="dialog-header">
          <span style="font-size:13px;font-weight:600">Log Metadata</span>
          <v-btn icon="mdi-close" variant="text" size="small" @click="metaDialog = false" />
        </div>
        <pre class="dialog-body">{{ selectedMeta }}</pre>
      </v-card>
    </v-dialog>
  </div>
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
  { title: 'Time',    key: 'ts',       width: 110 },
  { title: 'Level',   key: 'level',    width: 80 },
  { title: 'Agent',   key: 'agent_id', width: 110 },
  { title: 'Message', key: 'message' },
  { title: 'Meta',    key: 'meta_json', width: 60 },
];

const displayLogs = computed(() => liveMode.value ? liveLogs.value : logs.value);

function levelBg(l) {
  return { error: 'rgba(239,68,68,0.12)', warn: 'rgba(245,158,11,0.12)', info: 'rgba(56,189,248,0.1)', debug: 'rgba(255,255,255,0.06)' }[l] || 'rgba(255,255,255,0.06)';
}
function levelFg(l) {
  return { error: '#EF4444', warn: '#F59E0B', info: '#38BDF8', debug: 'rgba(226,232,240,0.45)' }[l] || '#E2E8F0';
}
function formatTime(ts) { return ts ? new Date(Number(ts)).toLocaleTimeString() : ''; }
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

const clearingFiles = ref(false);
async function clearLogFiles() {
  clearingFiles.value = true;
  try { await axios.delete('/api/logs/files'); }
  catch { /* ignore */ }
  finally { clearingFiles.value = false; }
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

<style scoped>
.page-root { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

.panel {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; overflow: hidden;
}

.level-badge {
  font-size: 10px; font-weight: 700; padding: 2px 6px;
  border-radius: 4px; text-transform: uppercase; letter-spacing: 0.4px;
}

.log-time { font-size: 11px; color: rgba(226,232,240,0.4) !important; font-family: monospace; }
.log-msg  { font-size: 12px; font-family: 'JetBrains Mono', monospace; }

.log-table :deep(.v-data-table__td) { border-bottom: 1px solid rgba(255,255,255,0.03) !important; }
.log-table :deep(.v-data-table__th) {
  border-bottom: 1px solid rgba(255,255,255,0.06) !important;
  font-size: 11px !important; text-transform: uppercase; letter-spacing: 0.5px;
  color: rgba(226,232,240,0.35) !important;
}

.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.dialog-body {
  padding: 14px 16px; font-size: 12px; font-family: monospace;
  white-space: pre-wrap; max-height: 60vh; overflow-y: auto;
  background: #08080F !important; margin: 0;
  color: #CBD5E1 !important;
}

.gap-2 { gap: 8px; }
</style>

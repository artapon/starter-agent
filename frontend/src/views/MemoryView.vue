<template>
  <div class="page-root">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title">Memory</div>
        <div class="page-subtitle">Agent conversation history &amp; snapshots</div>
      </div>
      <v-btn icon="mdi-refresh" variant="text" size="small" :loading="loading" @click="fetchMemory"
        style="color:rgba(226,232,240,0.5)" />
    </div>

    <!-- Agent tabs -->
    <div class="agent-tabs">
      <button
        v-for="agent in agents" :key="agent"
        class="agent-tab"
        :class="{ 'agent-tab--active': activeAgent === agent }"
        @click="activeAgent = agent"
      >
        <v-icon size="14" class="mr-1">mdi-robot-outline</v-icon>
        {{ agent }}
      </button>
    </div>

    <!-- Content -->
    <div v-for="agent in agents" :key="agent" v-show="activeAgent === agent" class="mem-grid">

      <!-- Session list -->
      <div class="panel card-hover">
        <div class="panel__header">
          <v-icon size="14" color="#6366F1">mdi-card-account-details-outline</v-icon>
          <span class="section-title">Sessions</span>
        </div>
        <div class="session-list">
          <div
            v-for="snap in agentMemory[agent] || []"
            :key="snap.session_id"
            class="session-item"
            :class="{ 'session-item--active': selectedSession === snap.session_id }"
            @click="selectSession(agent, snap.session_id)"
          >
            <div class="session-item__id font-mono">{{ snap.session_id?.slice(0, 14) }}…</div>
            <div class="session-item__count">{{ snap.snapshot_count }} snapshots</div>
            <a v-if="reportSessions.has(snap.session_id)"
              :href="`/reports/${snap.session_id}/walkthrough.html`"
              target="_blank" rel="noopener"
              class="report-link"
              title="Open walkthrough report"
              @click.stop>
              <v-icon size="14">mdi-file-chart-outline</v-icon>
            </a>
            <v-btn size="x-small" icon="mdi-delete-outline" variant="text" color="error"
              class="session-item__del"
              @click.stop="clearMemory(agent, snap.session_id)" />
          </div>
          <div v-if="!(agentMemory[agent] || []).length" class="empty-state">No memory yet</div>
        </div>
      </div>

      <!-- Snapshots -->
      <div class="panel card-hover">
        <div class="panel__header">
          <v-icon size="14" color="#6366F1">mdi-database-outline</v-icon>
          <span class="section-title">Memory Snapshots</span>
          <span v-if="selectedSession" class="session-id-tag font-mono">
            {{ selectedSession.slice(0, 16) }}…
          </span>
          <a v-if="selectedSession && reportSessions.has(selectedSession)"
            :href="`/reports/${selectedSession}/walkthrough.html`"
            target="_blank" rel="noopener"
            class="report-link report-link--pill"
            title="Open walkthrough report">
            <v-icon size="13" class="mr-1">mdi-file-chart-outline</v-icon>
            Walkthrough
          </a>
        </div>
        <div class="snapshot-list">
          <div v-for="snap in sessionSnapshots" :key="snap.id" class="snapshot-item">
            <div class="snapshot-item__ts">
              {{ new Date(snap.created_at * 1000).toLocaleString() }}
            </div>
            <v-expansion-panels variant="accordion" class="snapshot-panels">
              <v-expansion-panel>
                <v-expansion-panel-title class="snapshot-title">View snapshot</v-expansion-panel-title>
                <v-expansion-panel-text>
                  <pre class="snapshot-pre">{{ formatJson(snap.snapshot_json) }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
          <div v-if="!sessionSnapshots.length" class="empty-state">
            {{ selectedSession ? 'No snapshots' : 'Select a session to view snapshots' }}
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();
const agents = ['researcher', 'planner', 'developer', 'reviewer'];
const activeAgent = ref('researcher');
const loading = ref(false);
const agentMemory = ref({});
const selectedSession = ref(null);
const sessionSnapshots = ref([]);
const reportSessions = ref(new Set());

async function fetchMemory() {
  loading.value = true;
  try {
    const [{ data }, { data: rpt }] = await Promise.all([
      axios.get('/api/memory/'),
      axios.get('/api/reports/sessions'),
    ]);
    const grouped = {};
    for (const item of data) {
      if (!grouped[item.agent_id]) grouped[item.agent_id] = [];
      grouped[item.agent_id].push(item);
    }
    agentMemory.value = grouped;
    reportSessions.value = new Set(rpt.sessions || []);
  } finally { loading.value = false; }
}

async function selectSession(agentId, sessionId) {
  selectedSession.value = sessionId;
  const { data } = await axios.get(`/api/memory/${agentId}?sessionId=${sessionId}`);
  sessionSnapshots.value = data;
}

async function clearMemory(agentId, sessionId) {
  await axios.delete(`/api/memory/${agentId}`, { data: { sessionId } });
  fetchMemory();
  if (selectedSession.value === sessionId) {
    selectedSession.value = null;
    sessionSnapshots.value = [];
  }
}

function formatJson(str) {
  try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
}

onMounted(() => {
  fetchMemory();
  socket.on('memory:updated', () => fetchMemory());
  onUnmounted(() => socket.off('memory:updated'));
});
</script>

<style scoped>
.page-root { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }

/* Agent tabs */
.agent-tabs { display: flex; gap: 4px; }
.agent-tab {
  padding: 6px 16px;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);
  font-size: 13px; font-weight: 500; cursor: pointer;
  color: rgba(226,232,240,0.5); background: transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  text-transform: capitalize;
}
.agent-tab:hover { background: rgba(255,255,255,0.04); color: #E2E8F0; }
.agent-tab--active {
  background: rgba(99,102,241,0.12) !important;
  border-color: rgba(99,102,241,0.3) !important;
  color: #A78BFA !important;
}

/* Grid */
.mem-grid { display: grid; grid-template-columns: 300px 1fr; gap: 14px; }
@media (max-width: 700px) { .mem-grid { grid-template-columns: 1fr; } }

/* Panel */
.panel {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; gap: 7px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.session-id-tag {
  font-size: 11px; color: rgba(226,232,240,0.3) !important;
  background: rgba(255,255,255,0.04); padding: 2px 6px; border-radius: 4px;
}

/* Session list */
.session-list { padding: 6px 0; }
.session-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; cursor: pointer;
  transition: background 0.15s; position: relative;
}
.session-item:hover { background: rgba(255,255,255,0.03); }
.session-item--active {
  background: rgba(99,102,241,0.08) !important;
  border-right: 2px solid #6366F1;
}
.session-item__id    { font-size: 12px; font-weight: 500; flex: 1; }
.session-item__count { font-size: 11px; color: rgba(226,232,240,0.35) !important; }
.session-item__del   { opacity: 0; transition: opacity 0.15s; }
.session-item:hover .session-item__del { opacity: 1; }

/* Snapshot list */
.snapshot-list { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; max-height: 560px; overflow-y: auto; }
.snapshot-item__ts { font-size: 11px; color: rgba(226,232,240,0.35) !important; margin-bottom: 4px; }

.snapshot-panels :deep(.v-expansion-panel) {
  background: rgba(255,255,255,0.02) !important;
  border: 1px solid rgba(255,255,255,0.05) !important;
  border-radius: 8px !important;
}
.snapshot-title { font-size: 12px !important; padding: 10px 14px !important; min-height: 36px !important; }
.snapshot-pre {
  font-size: 11px; white-space: pre-wrap; word-break: break-all;
  color: #94A3B8 !important; line-height: 1.5;
  max-height: 300px; overflow-y: auto;
}

.empty-state { padding: 16px 14px; font-size: 13px; color: rgba(226,232,240,0.3) !important; }

/* Report link */
.report-link {
  display: inline-flex; align-items: center;
  color: #22D3EE; opacity: 0.7; transition: opacity .15s;
  flex-shrink: 0;
}
.report-link:hover { opacity: 1; }
.report-link--pill {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.25);
  border-radius: 20px; margin-left: auto; text-decoration: none;
  color: #22D3EE; opacity: 1;
}
.report-link--pill:hover { background: rgba(34,211,238,.18); }
</style>

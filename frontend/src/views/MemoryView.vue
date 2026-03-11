<template>
  <v-container fluid class="pa-4">
    <v-row class="mb-2">
      <v-col>
        <h1 class="text-h5 font-weight-bold">
          <v-icon color="primary" class="mr-2">mdi-brain</v-icon>Memory
        </h1>
      </v-col>
      <v-col cols="auto">
        <v-btn icon="mdi-refresh" variant="text" @click="fetchMemory" :loading="loading" />
      </v-col>
    </v-row>

    <!-- Agent tabs -->
    <v-tabs v-model="activeAgent" color="primary" class="mb-4">
      <v-tab v-for="agent in agents" :key="agent" :value="agent" class="text-capitalize">
        <v-icon class="mr-2">mdi-robot</v-icon>{{ agent }}
      </v-tab>
    </v-tabs>

    <v-window v-model="activeAgent">
      <v-window-item v-for="agent in agents" :key="agent" :value="agent">
        <!-- Session list -->
        <v-row>
          <v-col cols="12" md="4">
            <v-card color="surface-variant" rounded="lg">
              <v-card-title class="text-subtitle-2">Sessions</v-card-title>
              <v-list bg-color="transparent" density="compact" nav>
                <v-list-item
                  v-for="snap in agentMemory[agent] || []"
                  :key="snap.session_id"
                  :value="snap.session_id"
                  :active="selectedSession === snap.session_id"
                  @click="selectSession(agent, snap.session_id)"
                  rounded="lg"
                  active-color="primary"
                >
                  <template #title>
                    <span class="text-caption font-mono">{{ snap.session_id?.slice(0, 12) }}...</span>
                  </template>
                  <template #subtitle>
                    {{ snap.snapshot_count }} snapshots
                  </template>
                  <template #append>
                    <v-btn
                      size="x-small"
                      icon="mdi-delete"
                      variant="text"
                      color="error"
                      @click.stop="clearMemory(agent, snap.session_id)"
                    />
                  </template>
                </v-list-item>
                <v-list-item v-if="!(agentMemory[agent] || []).length" subtitle="No memory yet" />
              </v-list>
            </v-card>
          </v-col>

          <!-- Snapshots -->
          <v-col cols="12" md="8">
            <v-card color="surface-variant" rounded="lg">
              <v-card-title class="text-subtitle-2">
                Memory Snapshots
                <span v-if="selectedSession" class="text-caption text-medium-emphasis ml-2">
                  {{ selectedSession.slice(0, 16) }}...
                </span>
              </v-card-title>
              <v-card-text style="max-height: 500px; overflow-y: auto;">
                <div v-for="snap in sessionSnapshots" :key="snap.id" class="mb-3">
                  <div class="text-caption text-medium-emphasis mb-1">
                    {{ new Date(snap.created_at * 1000).toLocaleString() }}
                  </div>
                  <v-expansion-panels variant="accordion">
                    <v-expansion-panel>
                      <v-expansion-panel-title class="text-caption">View snapshot</v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <pre style="font-size:11px;white-space:pre-wrap;word-break:break-all">{{ formatJson(snap.snapshot_json) }}</pre>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </div>
                <div v-if="!sessionSnapshots.length" class="text-medium-emphasis text-caption">
                  Select a session to view snapshots
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();
const agents = ['planner', 'developer', 'reviewer'];
const activeAgent = ref('planner');
const loading = ref(false);
const agentMemory = ref({});
const selectedSession = ref(null);
const sessionSnapshots = ref([]);

async function fetchMemory() {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/memory/');
    const grouped = {};
    for (const item of data) {
      if (!grouped[item.agent_id]) grouped[item.agent_id] = [];
      grouped[item.agent_id].push(item);
    }
    agentMemory.value = grouped;
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

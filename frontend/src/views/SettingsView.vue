<template>
  <v-container fluid class="pa-4">
    <v-row class="mb-2">
      <v-col>
        <h1 class="text-h5 font-weight-bold">
          <v-icon color="primary" class="mr-2">mdi-cog</v-icon>Settings
        </h1>
        <p class="text-medium-emphasis text-body-2">Configure LLM model and tools for each agent</p>
      </v-col>
    </v-row>

    <!-- Workspace card -->
    <v-card color="surface-variant" rounded="lg" class="mb-4">
      <v-card-title class="d-flex align-center pb-1">
        <v-icon class="mr-2" size="18">mdi-folder-cog</v-icon>
        Workspace
      </v-card-title>
      <v-card-subtitle class="pb-2">Directory where agents read and write files</v-card-subtitle>
      <v-card-text class="pb-2">
        <v-text-field
          v-model="workspacePath"
          label="Workspace Path"
          density="compact"
          variant="outlined"
          placeholder="./workspace"
          hide-details
          prepend-inner-icon="mdi-folder"
        />
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <span class="text-caption text-medium-emphasis">
          Relative to backend directory, or use an absolute path.
        </span>
        <v-spacer />
        <v-btn
          color="primary"
          size="small"
          prepend-icon="mdi-content-save"
          :loading="savingWorkspace"
          @click="saveWorkspace"
        >Save</v-btn>
      </v-card-actions>
    </v-card>

    <!-- Agent tabs -->
    <v-tabs v-model="activeAgent" color="primary" class="mb-4">
      <v-tab v-for="s in agentSettings" :key="s.agent_id" :value="s.agent_id">
        <v-icon class="mr-2" :color="agentColor(s.agent_id)">mdi-robot</v-icon>
        <span class="text-capitalize">{{ s.agent_id }}</span>
      </v-tab>
    </v-tabs>

    <v-window v-model="activeAgent">
      <v-window-item v-for="agent in agentSettings" :key="agent.agent_id" :value="agent.agent_id">
        <v-row>

          <!-- ── LLM Config card ──────────────────────────────────────────── -->
          <v-col cols="12" md="5">
            <v-card color="surface-variant" rounded="lg" height="100%">
              <v-card-title class="d-flex align-center pb-1">
                <v-icon class="mr-2" size="18">mdi-brain</v-icon>
                LLM Configuration
                <v-spacer />
                <v-chip
                  :color="connStatus(agent.agent_id)"
                  size="x-small"
                  variant="tonal"
                >
                  {{ connLabel(agent.agent_id) }}
                </v-chip>
              </v-card-title>

              <v-card-text>
                <!-- Model selector with live LM Studio model list -->
                <v-combobox
                  v-model="forms[agent.agent_id].model_name"
                  :items="availableModels[agent.agent_id] || []"
                  label="Model Name"
                  density="compact"
                  variant="outlined"
                  placeholder="Loading models from LM Studio..."
                  :class="modelMismatch(agent.agent_id) ? 'mb-1' : 'mb-3'"
                  prepend-inner-icon="mdi-chip"
                  :loading="loadingModels[agent.agent_id]"
                  clearable
                  hide-details
                >
                  <template #append-inner>
                    <v-btn
                      icon="mdi-refresh"
                      size="x-small"
                      variant="text"
                      :loading="loadingModels[agent.agent_id]"
                      @click.stop="fetchModels(agent.agent_id)"
                      title="Reload models from LM Studio"
                    />
                  </template>
                  <template #no-data>
                    <v-list-item>
                      <v-list-item-title class="text-caption text-medium-emphasis">
                        {{ modelLoadError[agent.agent_id] || 'Connecting to LM Studio...' }}
                      </v-list-item-title>
                    </v-list-item>
                  </template>
                </v-combobox>

                <!-- Mismatch warning -->
                <v-alert
                  v-if="modelMismatch(agent.agent_id)"
                  type="warning"
                  density="compact"
                  variant="tonal"
                  class="mb-3"
                  icon="mdi-alert"
                  closable
                >
                  <div class="text-caption">
                    <strong>{{ forms[agent.agent_id].model_name }}</strong> is not in your LM Studio.
                  </div>
                  <div v-if="suggestModel(agent.agent_id)" class="mt-2 d-flex align-center gap-2 flex-wrap">
                    <span class="text-caption text-medium-emphasis">Suggested:</span>
                    <v-chip
                      size="small"
                      color="warning"
                      variant="tonal"
                      class="font-mono"
                      prepend-icon="mdi-auto-fix"
                      @click="applyModel(agent.agent_id, suggestModel(agent.agent_id))"
                      style="cursor:pointer"
                    >
                      {{ suggestModel(agent.agent_id) }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">— click to apply &amp; save</span>
                  </div>
                </v-alert>
                <v-text-field
                  v-model="forms[agent.agent_id].base_url"
                  label="LM Studio Base URL"
                  density="compact"
                  variant="outlined"
                  placeholder="http://localhost:1234/v1"
                  hide-details
                  class="mb-3"
                  prepend-inner-icon="mdi-server"
                />
                <v-text-field
                  v-model="forms[agent.agent_id].api_key"
                  label="API Key"
                  density="compact"
                  variant="outlined"
                  placeholder="lm-studio"
                  hide-details
                  class="mb-3"
                  prepend-inner-icon="mdi-key"
                  :type="showKey[agent.agent_id] ? 'text' : 'password'"
                  :append-inner-icon="showKey[agent.agent_id] ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showKey[agent.agent_id] = !showKey[agent.agent_id]"
                />
                <div class="text-caption text-medium-emphasis mb-1">
                  Temperature: {{ forms[agent.agent_id].temperature }}
                </div>
                <v-slider
                  v-model="forms[agent.agent_id].temperature"
                  min="0"
                  max="2"
                  step="0.05"
                  thumb-label
                  color="primary"
                  class="mb-3"
                  hide-details
                />
                <v-text-field
                  v-model.number="forms[agent.agent_id].max_tokens"
                  label="Max Tokens"
                  density="compact"
                  variant="outlined"
                  type="number"
                  hide-details
                  class="mb-3"
                  prepend-inner-icon="mdi-counter"
                />
                <v-textarea
                  v-model="forms[agent.agent_id].system_prompt"
                  label="System Prompt Override"
                  density="compact"
                  variant="outlined"
                  rows="2"
                  hide-details
                  class="mb-3"
                  placeholder="Leave empty to use default"
                />
                <v-switch
                  v-model="forms[agent.agent_id].compression_enabled"
                  label="Prompt Compression"
                  color="primary"
                  hide-details
                  density="compact"
                  inset
                />
              </v-card-text>

              <v-card-actions class="px-4 pb-4">
                <v-btn
                  color="secondary"
                  variant="tonal"
                  size="small"
                  @click="testConnection(agent.agent_id)"
                  :loading="testing[agent.agent_id]"
                  prepend-icon="mdi-connection"
                >Test</v-btn>
                <v-spacer />
                <v-btn
                  color="primary"
                  size="small"
                  @click="saveSettings(agent.agent_id)"
                  :loading="saving[agent.agent_id]"
                  prepend-icon="mdi-content-save"
                >Save</v-btn>
              </v-card-actions>
            </v-card>
          </v-col>

          <!-- ── Tools card ──────────────────────────────────────────────── -->
          <v-col cols="12" md="7">
            <v-card color="surface-variant" rounded="lg">
              <v-card-title class="d-flex align-center pb-1">
                <v-icon class="mr-2" size="18">mdi-tools</v-icon>
                Allowed Tools
                <v-spacer />
                <v-chip size="x-small" color="primary" variant="tonal">
                  {{ enabledCount(agent.agent_id) }} / {{ totalTools }} enabled
                </v-chip>
              </v-card-title>
              <v-card-subtitle class="pb-2">
                Control which tools this agent can invoke during execution
              </v-card-subtitle>

              <!-- Quick presets -->
              <div class="px-4 pb-2 d-flex gap-2 flex-wrap">
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="success"
                  @click="applyPreset(agent.agent_id, 'all')"
                  prepend-icon="mdi-check-all"
                >All</v-btn>
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="info"
                  @click="applyPreset(agent.agent_id, 'safe')"
                  prepend-icon="mdi-shield-check"
                >Safe Only</v-btn>
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  @click="applyPreset(agent.agent_id, 'readonly')"
                  prepend-icon="mdi-eye"
                >Read Only</v-btn>
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="error"
                  @click="applyPreset(agent.agent_id, 'none')"
                  prepend-icon="mdi-cancel"
                >None</v-btn>
              </div>

              <v-divider />

              <!-- Tool list grouped by category -->
              <v-card-text class="pa-0">
                <div
                  v-for="(group, category) in groupedTools"
                  :key="category"
                >
                  <div class="px-4 py-2 text-caption text-medium-emphasis text-uppercase font-weight-bold d-flex align-center">
                    <v-icon size="14" class="mr-1">{{ categoryIcon(category) }}</v-icon>
                    {{ category }}
                  </div>
                  <v-list density="compact" bg-color="transparent" class="pt-0">
                    <v-list-item
                      v-for="tool in group"
                      :key="tool.name"
                      class="py-1"
                    >
                      <template #prepend>
                        <v-switch
                          :model-value="isToolEnabled(agent.agent_id, tool.name)"
                          @update:model-value="toggleTool(agent.agent_id, tool.name, $event)"
                          :color="tool.safe ? 'success' : 'warning'"
                          hide-details
                          density="compact"
                          inset
                          class="mr-2"
                        />
                      </template>
                      <template #title>
                        <div class="d-flex align-center gap-2">
                          <v-icon size="16" :color="tool.safe ? 'success' : 'warning'" class="mr-1">
                            {{ tool.icon }}
                          </v-icon>
                          <span class="font-mono text-body-2 font-weight-medium">{{ tool.name }}</span>
                          <v-chip
                            :color="tool.safe ? 'success' : 'warning'"
                            size="x-small"
                            variant="tonal"
                          >
                            {{ tool.safe ? 'read' : 'write' }}
                          </v-chip>
                        </div>
                      </template>
                      <template #subtitle>
                        <div class="text-caption text-medium-emphasis">
                          {{ tool.description }}
                          <span class="font-mono ml-1" style="color:#7c8cf8">{{ tool.params }}</span>
                        </div>
                      </template>
                    </v-list-item>
                  </v-list>
                  <v-divider />
                </div>
              </v-card-text>

              <v-card-actions class="px-4 pb-4">
                <span class="text-caption text-medium-emphasis">
                  <v-icon size="14" color="success">mdi-shield-check</v-icon> read = read-only
                  &nbsp;&nbsp;
                  <v-icon size="14" color="warning">mdi-pencil</v-icon> write = modifies files
                </span>
                <v-spacer />
                <v-btn
                  color="primary"
                  size="small"
                  @click="saveTools(agent.agent_id)"
                  :loading="savingTools[agent.agent_id]"
                  prepend-icon="mdi-content-save"
                >Save Tools</v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
    </v-window>

    <!-- Snackbar -->
    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000" location="bottom right">
      {{ snack.message }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import axios from 'axios';

const agentSettings = ref([]);
const activeAgent = ref('developer');
const workspacePath = ref('./workspace');
const savingWorkspace = ref(false);
const forms = reactive({});
const saving = reactive({});
const savingTools = reactive({});
const testing = reactive({});
const connectionStatus = reactive({});
const showKey = reactive({});
const snack = reactive({ show: false, message: '', color: 'success' });

// Model loader
const availableModels = reactive({});   // agentId -> string[]
const loadingModels = reactive({});     // agentId -> bool
const modelLoadError = reactive({});    // agentId -> string

// toolState[agentId][toolName] = boolean
const toolState = reactive({});
// allTools = array from server (with meta)
const allToolsMeta = ref([]);

const totalTools = computed(() => allToolsMeta.value.length);

const groupedTools = computed(() => {
  const groups = {};
  for (const t of allToolsMeta.value) {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  }
  return groups;
});

function modelMismatch(agentId) {
  const models = availableModels[agentId];
  const current = forms[agentId]?.model_name;
  return models && models.length > 0 && current && !models.includes(current);
}

function suggestModel(agentId) {
  const models = availableModels[agentId] || [];
  if (!models.length) return null;
  const current = (forms[agentId]?.model_name || '').toLowerCase();
  // Score each available model by how many keywords from the current name it shares
  const keywords = current.split(/[-\/.:@]/).filter(k => k.length > 2);
  let best = null;
  let bestScore = -1;
  for (const m of models) {
    const ml = m.toLowerCase();
    const score = keywords.reduce((acc, k) => acc + (ml.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best || models[0];
}

async function applyModel(agentId, modelName) {
  forms[agentId].model_name = modelName;
  await saveSettings(agentId);
}

function categoryIcon(cat) {
  return { filesystem: 'mdi-folder', scaffold: 'mdi-rocket-launch', workflow: 'mdi-sitemap' }[cat] || 'mdi-wrench';
}
function agentColor(id) {
  return { planner: 'blue', developer: 'green', reviewer: 'orange' }[id] || 'primary';
}
function connStatus(id) {
  return connectionStatus[id] === true ? 'success' : connectionStatus[id] === false ? 'error' : 'grey';
}
function connLabel(id) {
  return connectionStatus[id] === true ? 'Online' : connectionStatus[id] === false ? 'Offline' : '...';
}

function enabledCount(agentId) {
  if (!toolState[agentId]) return 0;
  return Object.values(toolState[agentId]).filter(Boolean).length;
}

function isToolEnabled(agentId, toolName) {
  return Boolean(toolState[agentId]?.[toolName]);
}

function toggleTool(agentId, toolName, value) {
  if (!toolState[agentId]) toolState[agentId] = {};
  toolState[agentId][toolName] = value;
}

function applyPreset(agentId, preset) {
  if (!toolState[agentId]) toolState[agentId] = {};
  for (const tool of allToolsMeta.value) {
    if (preset === 'all') toolState[agentId][tool.name] = true;
    else if (preset === 'none') toolState[agentId][tool.name] = false;
    else if (preset === 'safe') toolState[agentId][tool.name] = tool.safe;
    else if (preset === 'readonly') toolState[agentId][tool.name] = ['read_file', 'list_files', 'bulk_read'].includes(tool.name);
  }
}

function showSnack(message, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

async function fetchModels(agentId) {
  loadingModels[agentId] = true;
  modelLoadError[agentId] = '';
  try {
    const baseUrl = forms[agentId]?.base_url || 'http://localhost:1234/v1';
    const apiKey  = forms[agentId]?.api_key  || 'lm-studio';
    const { data } = await axios.get('/api/agents/models/list', {
      params: { baseUrl, apiKey },
    });
    availableModels[agentId] = data.models.map(m => m.id);
    if (!availableModels[agentId].length) {
      modelLoadError[agentId] = 'No models found — make sure LM Studio is running';
    }
    showSnack(`Loaded ${availableModels[agentId].length} model(s) for ${agentId}`);
  } catch (e) {
    modelLoadError[agentId] = e.response?.data?.error || e.message;
    showSnack(`Cannot reach LM Studio: ${modelLoadError[agentId]}`, 'error');
  } finally {
    loadingModels[agentId] = false;
  }
}

async function fetchGlobal() {
  try {
    const { data } = await axios.get('/api/settings/global');
    workspacePath.value = data.workspace_path || './workspace';
  } catch { /* use default */ }
}

async function saveWorkspace() {
  savingWorkspace.value = true;
  try {
    await axios.put('/api/settings/global', { workspace_path: workspacePath.value });
    showSnack('Workspace path saved');
  } catch (e) {
    showSnack(`Error: ${e.message}`, 'error');
  } finally { savingWorkspace.value = false; }
}

async function fetchSettings() {
  const { data } = await axios.get('/api/settings');
  // Populate all forms synchronously before any awaits so the template
  // never sees forms[agentId] === undefined when agentSettings is non-empty
  for (const s of data) {
    forms[s.agent_id] = {
      model_name: s.model_name,
      base_url: s.base_url,
      api_key: s.api_key,
      temperature: s.temperature,
      max_tokens: s.max_tokens,
      system_prompt: s.system_prompt || '',
      compression_enabled: Boolean(s.compression_enabled),
    };
    showKey[s.agent_id] = false;
  }
  agentSettings.value = data;
  for (const s of data) {
    await fetchAgentTools(s.agent_id);
  }
}

async function fetchAgentTools(agentId) {
  try {
    const { data } = await axios.get(`/api/settings/${agentId}/tools`);
    if (allToolsMeta.value.length === 0) {
      allToolsMeta.value = data.map(({ name, params, safe, category, description, icon }) => ({
        name, params, safe, category, description, icon,
      }));
    }
    if (!toolState[agentId]) toolState[agentId] = {};
    for (const t of data) {
      toolState[agentId][t.name] = Boolean(t.enabled);
    }
  } catch { /* ignore */ }
}

async function saveSettings(agentId) {
  saving[agentId] = true;
  try {
    await axios.put(`/api/settings/${agentId}`, forms[agentId]);
    showSnack(`${agentId} settings saved`);
  } catch (e) {
    showSnack(`Error: ${e.message}`, 'error');
  } finally { saving[agentId] = false; }
}

async function saveTools(agentId) {
  savingTools[agentId] = true;
  try {
    const enabledTools = Object.entries(toolState[agentId] || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    await axios.put(`/api/settings/${agentId}/tools`, { enabledTools });
    showSnack(`${agentId} tools saved (${enabledTools.length} enabled)`);
  } catch (e) {
    showSnack(`Error: ${e.message}`, 'error');
  } finally { savingTools[agentId] = false; }
}

async function testConnection(agentId) {
  testing[agentId] = true;
  connectionStatus[agentId] = null;
  try {
    const { data } = await axios.get(`/api/agents/${agentId}/status`);
    connectionStatus[agentId] = data.available;
    showSnack(
      data.available ? `${agentId}: LM Studio online (${data.model})` : `${agentId}: LM Studio offline`,
      data.available ? 'success' : 'warning'
    );
  } catch {
    connectionStatus[agentId] = false;
    showSnack(`${agentId}: Connection failed`, 'error');
  } finally { testing[agentId] = false; }
}

onMounted(async () => {
  await Promise.all([fetchGlobal(), fetchSettings()]);
  // Auto-load models for all agents after settings are loaded
  for (const s of agentSettings.value) {
    fetchModels(s.agent_id);   // fire-and-forget, non-blocking
  }
});
</script>

<style scoped>
.font-mono { font-family: monospace; }
.gap-2 { gap: 8px; }
</style>

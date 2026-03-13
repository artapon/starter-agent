<template>
  <div class="page-root">

    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title">Settings</div>
        <div class="page-subtitle">Configure LLM models, tools and workspace for each agent</div>
      </div>
    </div>

    <!-- Skill Profile -->
    <div class="panel card-hover">
      <div class="panel__header">
        <div class="d-flex align-center gap-2">
          <v-icon size="15" color="#6366F1">mdi-book-cog-outline</v-icon>
          <span class="section-title">Skill Profile</span>
        </div>
        <v-chip size="x-small" color="primary" variant="tonal">{{ activeSubskill }}</v-chip>
      </div>
      <div class="panel__body">
        <div class="subskill-grid">
          <button
            v-for="sk in subskillProfiles" :key="sk"
            class="subskill-card"
            :class="{ 'subskill-card--active': selectedSubskill === sk }"
            @click="selectedSubskill = sk"
          >
            <v-icon size="20" class="subskill-card__icon">{{ subskillIcon(sk) }}</v-icon>
            <div class="subskill-card__name">{{ subskillLabel(sk) }}</div>
            <div class="subskill-card__desc">{{ subskillDesc(sk) }}</div>
          </button>
        </div>
      </div>
      <div class="panel__footer">
        <span class="hint">Skill profiles define how each agent behaves. Changes take effect on the next workflow run.</span>
        <v-btn color="primary" size="small" prepend-icon="mdi-content-save"
          :loading="savingSubskill" :disabled="selectedSubskill === activeSubskill"
          @click="saveSubskill">Apply Profile</v-btn>
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="panel card-hover">
      <div class="panel__header">
        <div class="d-flex align-center gap-2">
          <v-icon size="15" color="#EF4444">mdi-alert-circle-outline</v-icon>
          <span class="section-title">Danger Zone</span>
        </div>
      </div>
      <div class="panel__body">
        <div class="danger-row">
          <div>
            <div class="danger-label">Clear All Logs</div>
            <div class="danger-hint">Permanently delete all log entries from the database. This cannot be undone.</div>
          </div>
          <v-btn color="error" variant="tonal" size="small" prepend-icon="mdi-delete-sweep"
            :loading="clearingLogs" @click="confirmClearLogs = true">
            Clear Logs
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Workspace -->
    <div class="panel card-hover">
      <div class="panel__header">
        <v-icon size="15" color="#6366F1">mdi-folder-cog-outline</v-icon>
        <span class="section-title">Workspace</span>
      </div>
      <div class="panel__body row-layout">
        <v-text-field
          v-model="workspacePath"
          label="Workspace Path"
          density="compact" variant="outlined" hide-details
          prepend-inner-icon="mdi-folder-outline"
          placeholder="./workspace"
          style="max-width:480px"
        />
        <v-btn color="primary" size="small" prepend-icon="mdi-content-save"
          :loading="savingWorkspace" @click="saveWorkspace">
          Save
        </v-btn>
        <span class="hint">Relative to project root, or use an absolute path</span>
      </div>
    </div>

    <!-- Workflow Loop -->
    <div class="panel card-hover">
      <div class="panel__header">
        <v-icon size="15" color="#6366F1">mdi-repeat</v-icon>
        <span class="section-title">Workflow Loop</span>
      </div>
      <div class="panel__body">
        <div class="loop-grid">
          <div class="loop-toggle-row">
            <div class="loop-toggle-info">
              <div class="loop-toggle-label">Auto-repeat workflow if review score &lt; 10/10</div>
              <div class="loop-toggle-hint">When enabled the full pipeline (Research → Plan → Develop → Review) restarts automatically until the reviewer scores 10/10 or the loop limit is reached.</div>
            </div>
            <v-switch v-model="loopEnabled" color="primary" hide-details density="compact" inset />
          </div>

          <div class="loop-max-row" :class="{ 'loop-max-row--disabled': !loopEnabled }">
            <div class="field-label">
              Max loops: <strong>{{ maxLoops }}</strong>
              <span class="muted-label">&nbsp;({{ maxLoops }} extra run{{ maxLoops !== 1 ? 's' : '' }} allowed)</span>
            </div>
            <v-slider v-model="maxLoops" :min="1" :max="10" :step="1"
              thumb-label color="primary" class="mt-1" hide-details :disabled="!loopEnabled" />
          </div>

          <div class="loop-divider" />

          <div class="loop-toggle-row">
            <div class="loop-toggle-info">
              <div class="loop-toggle-label">Recursion limit</div>
              <div class="loop-toggle-hint">Max number of agent node executions per run. Set to 0 for unlimited. Increase if your workflow has many steps or loops.</div>
            </div>
            <div class="recursion-input-wrap">
              <v-text-field
                v-model.number="recursionLimit"
                type="number" min="0" step="50"
                density="compact" variant="outlined" hide-details
                style="width:110px"
                :placeholder="'200'"
              />
              <span class="muted-label" style="font-size:11px;margin-left:6px">0 = unlimited</span>
            </div>
          </div>
        </div>
      </div>
      <div class="panel__footer">
        <v-btn color="primary" size="small" prepend-icon="mdi-content-save"
          :loading="savingLoop" @click="saveLoopSettings">Save</v-btn>
      </div>
    </div>

    <!-- Agent tabs -->
    <div class="agent-tabs">
      <button
        v-for="s in agentSettings" :key="s.agent_id"
        class="agent-tab"
        :class="{ 'agent-tab--active': activeAgent === s.agent_id }"
        @click="activeAgent = s.agent_id"
      >
        <v-icon size="13" class="mr-1" :color="activeAgent === s.agent_id ? agentAccent(s.agent_id) : undefined">mdi-robot-outline</v-icon>
        {{ s.agent_id }}
      </button>
    </div>

    <!-- Agent panels -->
    <div v-for="agent in agentSettings" :key="agent.agent_id"
      v-show="activeAgent === agent.agent_id" class="agent-grid">

      <!-- LLM config -->
      <div class="panel card-hover">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#6366F1">mdi-brain</v-icon>
            <span class="section-title">LLM Configuration</span>
          </div>
          <v-chip :color="connStatus(agent.agent_id)" size="x-small" variant="tonal">
            {{ connLabel(agent.agent_id) }}
          </v-chip>
        </div>
        <div class="panel__body">

          <!-- Model picker -->
          <v-combobox
            v-model="forms[agent.agent_id].model_name"
            :items="availableModels[agent.agent_id] || []"
            label="Model Name" density="compact" variant="outlined"
            placeholder="Loading models…"
            :class="modelMismatch(agent.agent_id) ? 'mb-1' : 'mb-3'"
            prepend-inner-icon="mdi-chip"
            :loading="loadingModels[agent.agent_id]"
            clearable hide-details
          >
            <template #append-inner>
              <v-btn icon="mdi-refresh" size="x-small" variant="text"
                :loading="loadingModels[agent.agent_id]"
                @click.stop="fetchModels(agent.agent_id)" />
            </template>
            <template #no-data>
              <v-list-item>
                <v-list-item-title style="font-size:12px;color:rgba(226,232,240,0.4)">
                  {{ modelLoadError[agent.agent_id] || 'Connecting to LM Studio…' }}
                </v-list-item-title>
              </v-list-item>
            </template>
          </v-combobox>

          <!-- Mismatch -->
          <v-alert v-if="modelMismatch(agent.agent_id)" type="warning" density="compact"
            variant="tonal" class="mb-3" icon="mdi-alert" closable>
            <div style="font-size:12px">
              <strong>{{ forms[agent.agent_id].model_name }}</strong> not found in LM Studio.
            </div>
            <div v-if="suggestModel(agent.agent_id)" class="mt-2 d-flex align-center gap-2 flex-wrap">
              <span style="font-size:11px;color:rgba(226,232,240,0.5)">Suggested:</span>
              <v-chip size="small" color="warning" variant="tonal" class="font-mono"
                prepend-icon="mdi-auto-fix" style="cursor:pointer"
                @click="applyModel(agent.agent_id, suggestModel(agent.agent_id))">
                {{ suggestModel(agent.agent_id) }}
              </v-chip>
              <span style="font-size:11px;color:rgba(226,232,240,0.4)">— click to apply</span>
            </div>
          </v-alert>

          <v-text-field v-model="forms[agent.agent_id].base_url" label="LM Studio Base URL"
            density="compact" variant="outlined" placeholder="http://localhost:1234/v1"
            hide-details class="mb-3" prepend-inner-icon="mdi-server-outline" />

          <v-text-field v-model="forms[agent.agent_id].api_key" label="API Key"
            density="compact" variant="outlined" placeholder="lm-studio"
            hide-details class="mb-3" prepend-inner-icon="mdi-key-outline"
            :type="showKey[agent.agent_id] ? 'text' : 'password'"
            :append-inner-icon="showKey[agent.agent_id] ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showKey[agent.agent_id] = !showKey[agent.agent_id]" />

          <div class="field-label">Temperature: {{ forms[agent.agent_id].temperature }}</div>
          <v-slider v-model="forms[agent.agent_id].temperature" min="0" max="2" step="0.05"
            thumb-label color="primary" class="mb-2" hide-details />

          <v-text-field v-model.number="forms[agent.agent_id].max_tokens" label="Max Tokens"
            density="compact" variant="outlined" type="number"
            hide-details class="mb-3" prepend-inner-icon="mdi-counter" />

          <v-textarea v-model="forms[agent.agent_id].system_prompt" label="System Prompt Override"
            density="compact" variant="outlined" rows="2" hide-details class="mb-3"
            placeholder="Leave empty to use default" />

          <v-switch v-model="forms[agent.agent_id].compression_enabled"
            label="Prompt Compression" color="primary" hide-details density="compact" inset />
        </div>
        <div class="panel__footer">
          <v-btn color="secondary" variant="tonal" size="small"
            prepend-icon="mdi-connection" :loading="testing[agent.agent_id]"
            @click="testConnection(agent.agent_id)">Test</v-btn>
          <v-btn color="primary" size="small"
            prepend-icon="mdi-content-save" :loading="saving[agent.agent_id]"
            @click="saveSettings(agent.agent_id)">Save</v-btn>
        </div>
      </div>

      <!-- MCP — researcher only -->
      <div v-if="agent.agent_id === 'researcher'" class="panel card-hover mcp-panel">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#22D3EE">mdi-web</v-icon>
            <span class="section-title">MCP — Web Browser</span>
          </div>
          <v-chip size="x-small" :color="researcherMCPEnabled ? 'cyan' : 'default'" variant="tonal">
            {{ researcherMCPEnabled ? 'Enabled' : 'Disabled' }}
          </v-chip>
        </div>
        <div class="panel__body">
          <div class="loop-toggle-row">
            <div class="loop-toggle-info">
              <div class="loop-toggle-label">Enable Puppeteer MCP</div>
              <div class="loop-toggle-hint">
                When enabled, the Researcher agent launches a Puppeteer browser (via <code class="font-mono" style="font-size:10px;color:#A78BFA">@modelcontextprotocol/server-puppeteer</code>) to browse the web for up-to-date information before analyzing the goal. Falls back to plain research if MCP fails.
              </div>
            </div>
            <v-switch v-model="researcherMCPEnabled" color="cyan" hide-details density="compact" inset />
          </div>
        </div>
        <div class="panel__footer">
          <span class="hint">Requires npx access to <code class="font-mono" style="font-size:10px">@modelcontextprotocol/server-puppeteer</code></span>
          <v-btn color="primary" size="small" prepend-icon="mdi-content-save"
            :loading="savingMCP" @click="saveMCPSettings">Save</v-btn>
        </div>
      </div>

      <!-- Tools -->
      <div class="panel card-hover">
        <div class="panel__header">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#6366F1">mdi-tools</v-icon>
            <span class="section-title">Allowed Tools</span>
          </div>
          <v-chip size="x-small" color="primary" variant="tonal">
            {{ enabledCount(agent.agent_id) }} / {{ totalTools }} enabled
          </v-chip>
        </div>

        <!-- Presets -->
        <div class="preset-bar">
          <button class="preset-btn preset-btn--green"  @click="applyPreset(agent.agent_id, 'all')">All</button>
          <button class="preset-btn preset-btn--blue"   @click="applyPreset(agent.agent_id, 'safe')">Safe Only</button>
          <button class="preset-btn preset-btn--yellow" @click="applyPreset(agent.agent_id, 'readonly')">Read Only</button>
          <button class="preset-btn preset-btn--red"    @click="applyPreset(agent.agent_id, 'none')">None</button>
        </div>

        <div class="tool-groups">
          <div v-for="(group, category) in groupedTools" :key="category">
            <div class="tool-category-header">
              <v-icon size="12" class="mr-1" color="rgba(226,232,240,0.3)">{{ categoryIcon(category) }}</v-icon>
              {{ category }}
            </div>
            <div v-for="tool in group" :key="tool.name" class="tool-row">
              <v-switch
                :model-value="isToolEnabled(agent.agent_id, tool.name)"
                @update:model-value="toggleTool(agent.agent_id, tool.name, $event)"
                :color="tool.safe ? 'success' : 'warning'"
                hide-details density="compact" inset class="tool-switch"
              />
              <div class="tool-info">
                <div class="tool-name">
                  <v-icon size="13" :color="tool.safe ? '#10B981' : '#F59E0B'" class="mr-1">{{ tool.icon }}</v-icon>
                  <span class="font-mono">{{ tool.name }}</span>
                  <span class="tool-badge" :style="tool.safe ? 'background:rgba(16,185,129,0.1);color:#10B981' : 'background:rgba(245,158,11,0.1);color:#F59E0B'">
                    {{ tool.safe ? 'read' : 'write' }}
                  </span>
                </div>
                <div class="tool-desc">{{ tool.description }}
                  <span class="tool-params font-mono">{{ tool.params }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel__footer">
          <div style="font-size:11px;color:rgba(226,232,240,0.35)">
            <v-icon size="12" color="#10B981">mdi-shield-check</v-icon> read = read-only &nbsp;
            <v-icon size="12" color="#F59E0B">mdi-pencil</v-icon> write = modifies files
          </div>
          <v-btn color="primary" size="small" prepend-icon="mdi-content-save"
            :loading="savingTools[agent.agent_id]" @click="saveTools(agent.agent_id)">
            Save Tools
          </v-btn>
        </div>
      </div>

    </div>

    <!-- Confirm clear logs dialog -->
    <v-dialog v-model="confirmClearLogs" max-width="400" persistent>
      <v-card style="background:#12121E;border:1px solid rgba(255,255,255,0.08);border-radius:14px">
        <v-card-title class="d-flex align-center gap-2 pt-5 px-5">
          <v-icon color="error" size="20">mdi-alert-circle-outline</v-icon>
          Clear All Logs
        </v-card-title>
        <v-card-text class="px-5 pb-2" style="font-size:13px;color:rgba(226,232,240,0.6)">
          This will permanently delete <strong style="color:#E2E8F0">all log entries</strong> from the database. This action cannot be undone.
        </v-card-text>
        <v-card-actions class="px-5 pb-5 pt-3 d-flex gap-2 justify-end">
          <v-btn variant="tonal" size="small" @click="confirmClearLogs = false">Cancel</v-btn>
          <v-btn color="error" size="small" prepend-icon="mdi-delete-sweep"
            :loading="clearingLogs" @click="clearLogs">
            Yes, Clear Logs
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar -->
    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000" location="bottom right" rounded="lg">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import axios from 'axios';

const agentSettings = ref([]);
const AGENT_ORDER = ['researcher', 'planner', 'worker', 'reviewer'];
const activeAgent = ref('researcher');
const workspacePath = ref('./workspace');
const savingWorkspace = ref(false);

// Subskill
const subskillProfiles = ref([]);
const activeSubskill   = ref('default');
const selectedSubskill = ref('default');
const savingSubskill   = ref(false);
const clearingLogs     = ref(false);
const confirmClearLogs = ref(false);
const loopEnabled = ref(false);
const maxLoops = ref(3);
const recursionLimit = ref(200);
const savingLoop = ref(false);
const researcherMCPEnabled = ref(false);
const savingMCP = ref(false);
const forms = reactive({});
const saving = reactive({});
const savingTools = reactive({});
const testing = reactive({});
const connectionStatus = reactive({});
const showKey = reactive({});
const snack = reactive({ show: false, message: '', color: 'success' });

const availableModels = reactive({});
const loadingModels = reactive({});
const modelLoadError = reactive({});
const toolState = reactive({});
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
  const keywords = current.split(/[-\/.:@]/).filter(k => k.length > 2);
  let best = null, bestScore = -1;
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
const SUBSKILL_META = {
  default:         { label: 'Default',         icon: 'mdi-cog-outline',          desc: 'Balanced general-purpose agents for everyday development tasks.' },
  software_house:  { label: 'Software House',  icon: 'mdi-office-building-outline', desc: 'Enterprise-grade delivery: JSDoc, error handling, README, client handoff standards.' },
};
function subskillLabel(sk)  { return SUBSKILL_META[sk]?.label || sk.replace(/_/g, ' '); }
function subskillIcon(sk)   { return SUBSKILL_META[sk]?.icon  || 'mdi-book-outline'; }
function subskillDesc(sk)   { return SUBSKILL_META[sk]?.desc  || ''; }

async function fetchSubskills() {
  try {
    const { data } = await axios.get('/api/settings/subskills');
    subskillProfiles.value = data.available || [];
    activeSubskill.value   = data.active || 'default';
    selectedSubskill.value = data.active || 'default';
  } catch { /* use defaults */ }
}
async function saveSubskill() {
  savingSubskill.value = true;
  try {
    const { data } = await axios.put('/api/settings/subskill', { name: selectedSubskill.value });
    activeSubskill.value = data.active;
    showSnack(`Skill profile switched to "${subskillLabel(data.active)}"`);
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingSubskill.value = false; }
}

async function clearLogs() {
  clearingLogs.value = true;
  try {
    await axios.delete('/api/logs');
    confirmClearLogs.value = false;
    showSnack('All logs cleared');
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { clearingLogs.value = false; }
}

function categoryIcon(cat) {
  return { filesystem: 'mdi-folder-outline', scaffold: 'mdi-rocket-launch-outline', workflow: 'mdi-sitemap' }[cat] || 'mdi-wrench';
}
function agentAccent(id) {
  return { researcher: '#22D3EE', planner: '#6366F1', worker: '#10B981', reviewer: '#F59E0B' }[id] || '#6366F1';
}
function connStatus(id) {
  return connectionStatus[id] === true ? 'success' : connectionStatus[id] === false ? 'error' : 'grey';
}
function connLabel(id) {
  return connectionStatus[id] === true ? 'Online' : connectionStatus[id] === false ? 'Offline' : '…';
}
function enabledCount(agentId) {
  if (!toolState[agentId]) return 0;
  return Object.values(toolState[agentId]).filter(Boolean).length;
}
function isToolEnabled(agentId, toolName) { return Boolean(toolState[agentId]?.[toolName]); }
function toggleTool(agentId, toolName, value) {
  if (!toolState[agentId]) toolState[agentId] = {};
  toolState[agentId][toolName] = value;
}
function applyPreset(agentId, preset) {
  if (!toolState[agentId]) toolState[agentId] = {};
  for (const tool of allToolsMeta.value) {
    if (preset === 'all')      toolState[agentId][tool.name] = true;
    else if (preset === 'none')     toolState[agentId][tool.name] = false;
    else if (preset === 'safe')     toolState[agentId][tool.name] = tool.safe;
    else if (preset === 'readonly') toolState[agentId][tool.name] = ['read_file', 'list_files', 'bulk_read'].includes(tool.name);
  }
}
function showSnack(message, color = 'success') { Object.assign(snack, { show: true, message, color }); }

async function fetchModels(agentId) {
  loadingModels[agentId] = true;
  modelLoadError[agentId] = '';
  try {
    const baseUrl = forms[agentId]?.base_url || 'http://localhost:1234/v1';
    const apiKey  = forms[agentId]?.api_key  || 'lm-studio';
    const { data } = await axios.get('/api/agents/models/list', { params: { baseUrl, apiKey } });
    availableModels[agentId] = data.models.map(m => m.id);
    if (!availableModels[agentId].length) modelLoadError[agentId] = 'No models found — is LM Studio running?';
    showSnack(`Loaded ${availableModels[agentId].length} model(s) for ${agentId}`);
  } catch (e) {
    modelLoadError[agentId] = e.response?.data?.error || e.message;
    showSnack(`Cannot reach LM Studio: ${modelLoadError[agentId]}`, 'error');
  } finally { loadingModels[agentId] = false; }
}
async function fetchGlobal() {
  try {
    const { data } = await axios.get('/api/settings/global');
    workspacePath.value = data.workspace_path || './workspace';
    loopEnabled.value = data.workflow_loop_enabled === '1';
    maxLoops.value = parseInt(data.workflow_max_loops || '3', 10);
    recursionLimit.value = parseInt(data.workflow_recursion_limit || '200', 10);
    researcherMCPEnabled.value = data.researcher_mcp_enabled === '1';
  } catch { /* use default */ }
}
async function saveWorkspace() {
  savingWorkspace.value = true;
  try {
    await axios.put('/api/settings/global', { workspace_path: workspacePath.value });
    showSnack('Workspace path saved');
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingWorkspace.value = false; }
}
async function saveLoopSettings() {
  savingLoop.value = true;
  try {
    await axios.put('/api/settings/global', {
      workflow_loop_enabled:    loopEnabled.value ? '1' : '0',
      workflow_max_loops:       String(maxLoops.value),
      workflow_recursion_limit: String(recursionLimit.value ?? 0),
    });
    showSnack('Workflow loop settings saved');
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingLoop.value = false; }
}
async function fetchSettings() {
  const { data } = await axios.get('/api/settings');
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
  agentSettings.value = [...data]
    .filter(a => AGENT_ORDER.includes(a.agent_id))
    .sort((a, b) => AGENT_ORDER.indexOf(a.agent_id) - AGENT_ORDER.indexOf(b.agent_id));
  for (const s of data) await fetchAgentTools(s.agent_id);
}
async function fetchAgentTools(agentId) {
  try {
    const { data } = await axios.get(`/api/settings/${agentId}/tools`);
    if (allToolsMeta.value.length === 0) {
      allToolsMeta.value = data.map(({ name, params, safe, category, description, icon }) => ({ name, params, safe, category, description, icon }));
    }
    if (!toolState[agentId]) toolState[agentId] = {};
    for (const t of data) toolState[agentId][t.name] = Boolean(t.enabled);
  } catch { /* ignore */ }
}
async function saveSettings(agentId) {
  saving[agentId] = true;
  try {
    await axios.put(`/api/settings/${agentId}`, forms[agentId]);
    showSnack(`${agentId} settings saved`);
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { saving[agentId] = false; }
}
async function saveTools(agentId) {
  savingTools[agentId] = true;
  try {
    const enabledTools = Object.entries(toolState[agentId] || {}).filter(([, v]) => v).map(([k]) => k);
    await axios.put(`/api/settings/${agentId}/tools`, { enabledTools });
    showSnack(`${agentId} tools saved (${enabledTools.length} enabled)`);
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingTools[agentId] = false; }
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

async function saveMCPSettings() {
  savingMCP.value = true;
  try {
    await axios.put('/api/settings/global', { researcher_mcp_enabled: researcherMCPEnabled.value ? '1' : '0' });
    showSnack(`Researcher MCP ${researcherMCPEnabled.value ? 'enabled' : 'disabled'}`);
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingMCP.value = false; }
}

onMounted(async () => {
  await Promise.all([fetchGlobal(), fetchSettings(), fetchSubskills()]);
  for (const s of agentSettings.value) fetchModels(s.agent_id);
});
</script>

<style scoped>
.page-root { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }

/* Agent tabs */
.agent-tabs { display: flex; gap: 4px; }
.agent-tab {
  padding: 6px 18px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  font-size: 13px; font-weight: 500; cursor: pointer;
  color: rgba(226,232,240,0.5); background: transparent;
  transition: all 0.15s; text-transform: capitalize;
}
.agent-tab:hover { background: rgba(255,255,255,0.04); color: #E2E8F0; }
.agent-tab--active {
  background: rgba(99,102,241,0.1) !important;
  border-color: rgba(99,102,241,0.3) !important;
  color: #A78BFA !important;
}

/* Panel */
.panel {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.panel__body { padding: 14px; }
.panel__footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* Workspace row */
.row-layout { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint { font-size: 11px; color: rgba(226,232,240,0.3) !important; }

/* Workflow loop panel */
.loop-grid { display: flex; flex-direction: column; gap: 16px; }
.loop-toggle-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.loop-toggle-info { flex: 1; }
.loop-toggle-label { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.9); margin-bottom: 4px; }
.loop-toggle-hint  { font-size: 11px; color: rgba(226,232,240,0.35); line-height: 1.5; }
.loop-max-row { transition: opacity .2s; }
.loop-max-row--disabled { opacity: .35; pointer-events: none; }
.loop-divider { border-top: 1px solid rgba(255,255,255,0.06); margin: 4px 0; }
.muted-label { font-weight: 400; color: rgba(226,232,240,0.35); }
.recursion-input-wrap { display: flex; align-items: center; flex-shrink: 0; }

/* Agent grid */
.agent-grid { display: grid; grid-template-columns: 400px 1fr; gap: 14px; }
@media (max-width: 900px) { .agent-grid { grid-template-columns: 1fr; } }
.mcp-panel { grid-column: 1 / -1; }

.field-label { font-size: 12px; color: rgba(226,232,240,0.45) !important; margin-bottom: 2px; }

/* Preset bar */
.preset-bar { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.preset-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
  cursor: pointer; border: 1px solid transparent; transition: opacity 0.15s;
}
.preset-btn:hover { opacity: 0.8; }
.preset-btn--green  { background: rgba(16,185,129,0.1);  color: #10B981 !important; border-color: rgba(16,185,129,0.2); }
.preset-btn--blue   { background: rgba(56,189,248,0.1);  color: #38BDF8 !important; border-color: rgba(56,189,248,0.2); }
.preset-btn--yellow { background: rgba(245,158,11,0.1);  color: #F59E0B !important; border-color: rgba(245,158,11,0.2); }
.preset-btn--red    { background: rgba(239,68,68,0.1);   color: #EF4444 !important; border-color: rgba(239,68,68,0.2); }

/* Tool groups */
.tool-groups { max-height: 480px; overflow-y: auto; }
.tool-category-header {
  padding: 8px 14px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
  color: rgba(226,232,240,0.3) !important;
  background: rgba(255,255,255,0.015);
  border-top: 1px solid rgba(255,255,255,0.04);
  display: flex; align-items: center;
}
.tool-row {
  display: flex; align-items: flex-start; gap: 6px;
  padding: 7px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  transition: background 0.15s;
}
.tool-row:hover { background: rgba(255,255,255,0.02); }
.tool-switch { flex-shrink: 0; margin-top: 2px; }
.tool-info { flex: 1; min-width: 0; }
.tool-name {
  font-size: 13px; font-weight: 500;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.tool-badge {
  font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px;
}
.tool-desc {
  font-size: 11px; color: rgba(226,232,240,0.4) !important; margin-top: 2px;
}
.tool-params { color: #A78BFA !important; margin-left: 4px; }

.font-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }
.gap-2 { gap: 8px; }

/* Danger zone */
.danger-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.danger-label { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.85); margin-bottom: 3px; }
.danger-hint  { font-size: 11px; color: rgba(226,232,240,0.35); }

/* Subskill profile cards */
.subskill-grid {
  display: flex; gap: 12px; flex-wrap: wrap;
}
.subskill-card {
  flex: 1; min-width: 180px; max-width: 280px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.02);
  cursor: pointer; text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.subskill-card:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.12);
}
.subskill-card--active {
  border-color: rgba(99,102,241,0.5) !important;
  background: rgba(99,102,241,0.08) !important;
}
.subskill-card__icon { color: rgba(226,232,240,0.4); }
.subskill-card--active .subskill-card__icon { color: #A78BFA; }
.subskill-card__name {
  font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.85);
}
.subskill-card--active .subskill-card__name { color: #A78BFA; }
.subskill-card__desc {
  font-size: 11px; color: rgba(226,232,240,0.35); line-height: 1.5;
}
</style>

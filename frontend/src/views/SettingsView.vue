<template>
  <div class="settings-root">

    <!-- ── Sidebar nav ───────────────────────────────────────────────── -->
    <nav class="settings-nav">
      <div class="nav-group-label">General</div>
      <button class="nav-item" :class="{ 'nav-item--active': section === 'global' }" @click="section = 'global'">
        <v-icon size="15">mdi-cog-outline</v-icon>
        Global
      </button>

      <div class="nav-group-label" style="margin-top:18px">Agents</div>
      <button
        v-for="s in agentSettings" :key="s.agent_id"
        class="nav-item"
        :class="{ 'nav-item--active': section === s.agent_id }"
        @click="section = s.agent_id"
      >
        <span class="nav-dot" :style="{ background: agentAccent(s.agent_id) }"></span>
        <span style="text-transform:capitalize">{{ s.agent_id }}</span>
        <v-chip
          v-if="connectionStatus[s.agent_id] !== undefined && connectionStatus[s.agent_id] !== null"
          size="x-small"
          :color="connectionStatus[s.agent_id] ? 'success' : 'error'"
          variant="tonal"
          class="ml-auto"
          style="height:16px;font-size:9px"
        >{{ connectionStatus[s.agent_id] ? 'on' : 'off' }}</v-chip>
      </button>

      <div class="nav-divider"></div>
      <button class="nav-item nav-item--danger" @click="confirmReset = true">
        <v-icon size="15" color="#EF4444">mdi-restore-alert</v-icon>
        Reset Application
      </button>
    </nav>

    <!-- ── Content ───────────────────────────────────────────────────── -->
    <main class="settings-content">

      <!-- Scrollable panels area -->
      <div class="panels-scroll">

        <!-- ── GLOBAL SECTION ──────────────────────────────────────── -->
        <template v-if="section === 'global'">
          <div class="section-heading">
            <div class="page-title">Global Settings</div>
            <div class="page-subtitle">Workspace, workflow loop and skill profiles</div>
          </div>

          <div class="global-grid">


            <!-- Debug Mode -->
            <div class="panel span-full">
              <div class="panel__header">
                <div class="d-flex align-center gap-2">
                  <v-icon size="15" color="#F59E0B">mdi-bug-outline</v-icon>
                  <span class="section-title">Debug Mode</span>
                </div>
                <v-chip size="x-small" :color="debugMode ? 'warning' : 'default'" variant="tonal">
                  {{ debugMode ? 'Enabled' : 'Disabled' }}
                </v-chip>
              </div>
              <div class="panel__body">
                <div class="loop-toggle-row">
                  <div class="loop-toggle-info">
                    <div class="loop-toggle-label">Log all LLM responses</div>
                    <div class="loop-toggle-hint">When enabled, every LLM response is written to <code class="src-code">agent-info.log</code> at debug level. Useful for diagnosing agent output. Disable in production to keep logs clean.</div>
                  </div>
                  <v-switch v-model="debugMode" color="warning" hide-details density="compact" inset />
                </div>
              </div>
            </div>

            <!-- Workspace -->
            <div class="panel">
              <div class="panel__header">
                <div class="d-flex align-center gap-2">
                  <v-icon size="15" color="#6366F1">mdi-folder-cog-outline</v-icon>
                  <span class="section-title">Workspace</span>
                </div>
              </div>
              <div class="panel__body">
                <p class="panel-desc">Directory where agents read and write files. Relative to the project root, or use an absolute path.</p>
                <v-text-field
                  v-model="workspacePath"
                  label="Workspace Path"
                  density="compact" variant="outlined" hide-details
                  prepend-inner-icon="mdi-folder-outline"
                  placeholder="./workspace"
                />
              </div>
            </div>

            <!-- Workflow Loop -->
            <div class="panel">
              <div class="panel__header">
                <div class="d-flex align-center gap-2">
                  <v-icon size="15" color="#6366F1">mdi-repeat</v-icon>
                  <span class="section-title">Workflow Loop</span>
                </div>
                <v-chip size="x-small" :color="loopEnabled ? 'primary' : 'default'" variant="tonal">
                  {{ loopEnabled ? 'Enabled' : 'Disabled' }}
                </v-chip>
              </div>
              <div class="panel__body">
                <div class="loop-grid">
                  <div class="loop-toggle-row">
                    <div class="loop-toggle-info">
                      <div class="loop-toggle-label">Auto-repeat if review score &lt; 10/10</div>
                      <div class="loop-toggle-hint">Restarts the full pipeline until the reviewer scores 10/10 or the limit is reached.</div>
                    </div>
                    <v-switch v-model="loopEnabled" color="primary" hide-details density="compact" inset />
                  </div>
                  <div class="loop-max-row" :class="{ 'loop-max-row--disabled': !loopEnabled }">
                    <div class="field-label">Max loops: <strong>{{ maxLoops }}</strong>
                      <span class="muted-label">&nbsp;({{ maxLoops }} extra run{{ maxLoops !== 1 ? 's' : '' }})</span>
                    </div>
                    <v-slider v-model="maxLoops" :min="1" :max="10" :step="1"
                      thumb-label color="primary" class="mt-1" hide-details :disabled="!loopEnabled" />
                  </div>
                  <div class="loop-divider" />
                  <div class="loop-toggle-row">
                    <div class="loop-toggle-info">
                      <div class="loop-toggle-label">Recursion limit</div>
                      <div class="loop-toggle-hint">Max node executions per run. Set to 0 for unlimited.</div>
                    </div>
                    <div class="recursion-input-wrap">
                      <v-text-field
                        v-model.number="recursionLimit"
                        type="number" min="0" step="50"
                        density="compact" variant="outlined" hide-details
                        style="width:110px" placeholder="200"
                      />
                      <span class="muted-label" style="font-size:11px;margin-left:6px">0 = ∞</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </template>

        <!-- ── AGENT SECTION ───────────────────────────────────────── -->
        <template v-for="agent in agentSettings" :key="agent.agent_id">
          <div v-if="section === agent.agent_id">
            <div class="section-heading">
              <div class="page-title">
                <span :style="{ color: agentAccent(agent.agent_id) }" style="text-transform:capitalize">{{ agent.agent_id }}</span>
                &nbsp;Agent
              </div>
              <div class="page-subtitle">LLM model, tools and capabilities</div>
            </div>

            <div class="agent-layout">

              <!-- Left: LLM config -->
              <div class="agent-left">
                <div class="panel">
                  <div class="panel__header">
                    <div class="d-flex align-center gap-2">
                      <v-icon size="15" :color="agentAccent(agent.agent_id)">mdi-brain</v-icon>
                      <span class="section-title">LLM Configuration</span>
                    </div>
                    <v-chip :color="connStatus(agent.agent_id)" size="x-small" variant="tonal">
                      {{ connLabel(agent.agent_id) }}
                    </v-chip>
                  </div>
                  <div class="panel__body">

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
                      thumb-label :color="agentAccent(agent.agent_id)" class="mb-2" hide-details />

                    <div class="d-flex align-center gap-2 mb-3">
                      <v-text-field v-model.number="forms[agent.agent_id].max_tokens" label="Max Tokens"
                        density="compact" variant="outlined" type="number"
                        hide-details prepend-inner-icon="mdi-counter"
                        :disabled="forms[agent.agent_id].unlimited_tokens"
                        style="flex:1" />
                      <v-tooltip text="Remove max_tokens limit — let the model use its full context window" location="top">
                        <template #activator="{ props: tip }">
                          <v-btn v-bind="tip" :variant="forms[agent.agent_id].unlimited_tokens ? 'flat' : 'outlined'"
                            :color="forms[agent.agent_id].unlimited_tokens ? agentAccent(agent.agent_id) : 'grey'"
                            size="small" density="compact" style="height:40px;white-space:nowrap"
                            @click="forms[agent.agent_id].unlimited_tokens = !forms[agent.agent_id].unlimited_tokens">
                            <v-icon start size="16">mdi-infinity</v-icon>
                            Unlimited
                          </v-btn>
                        </template>
                      </v-tooltip>
                    </div>

                    <v-textarea v-model="forms[agent.agent_id].system_prompt" label="System Prompt Override"
                      density="compact" variant="outlined" rows="3" hide-details class="mb-3"
                      placeholder="Leave empty to use default" />

                    <v-switch v-model="forms[agent.agent_id].thinking_model"
                      label="Thinking Model" color="warning" hide-details density="compact" inset class="mb-1" />
                    <div class="text-caption text-medium-emphasis mb-2" style="padding-left:52px">
                      Enable for models that use &lt;think&gt; blocks (Qwen3, DeepSeek-R1, QwQ).
                      Disables JSON schema constraint; uses prompt + fallback parser instead.
                    </div>

                    <v-switch v-model="forms[agent.agent_id].compression_enabled"
                      label="Prompt Compression" color="primary" hide-details density="compact" inset />
                  </div>
                </div>

              </div><!-- /agent-left -->

              <!-- Right: Tools + MCP Browser (researcher) -->
              <div class="agent-right">

                <!-- Allowed Tools -->
                <div class="panel">
                  <div class="panel__header">
                    <div class="d-flex align-center gap-2">
                      <v-icon size="15" :color="agentAccent(agent.agent_id)">mdi-tools</v-icon>
                      <span class="section-title">Allowed Tools</span>
                    </div>
                    <v-chip size="x-small" :color="agentAccent(agent.agent_id)" variant="tonal">
                      {{ enabledCount(agent.agent_id) }} / {{ totalTools }} enabled
                    </v-chip>
                  </div>

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

                  <div class="tools-legend">
                    <v-icon size="12" color="#10B981">mdi-shield-check</v-icon> read-only &nbsp;
                    <v-icon size="12" color="#F59E0B">mdi-pencil</v-icon> modifies files
                  </div>
                </div>

                <!-- MCP Browser — researcher only, below Allowed Tools -->
                <div v-if="agent.agent_id === 'researcher'" class="panel">

                  <!-- Header -->
                  <div class="panel__header">
                    <div class="d-flex align-center gap-2">
                      <v-icon size="15" color="#22D3EE">mdi-web</v-icon>
                      <span class="section-title">MCP Browser</span>
                    </div>
                    <div class="d-flex align-center gap-2">
                      <span v-if="browserTools.length" class="brow-on-badge">
                        {{ enabledBrowserCount }}/{{ browserTools.length }}
                      </span>
                      <v-chip size="x-small" :color="researcherMCPEnabled ? 'cyan' : 'default'" variant="tonal">
                        {{ researcherMCPEnabled ? 'Enabled' : 'Disabled' }}
                      </v-chip>
                    </div>
                  </div>

                  <!-- Master toggle -->
                  <div class="brow-master">
                    <div class="brow-master-info">
                      <div class="brow-master-label">Live Web Search</div>
                      <div class="brow-master-hint">Search multiple sources before analysis. Falls back to knowledge-only if off.</div>
                    </div>
                    <v-switch v-model="researcherMCPEnabled" color="cyan" hide-details density="compact" inset />
                  </div>

                  <!-- Source list -->
                  <div class="brow-list" :class="{ 'brow-list--off': !researcherMCPEnabled }">

                    <div class="brow-list-head">
                      <span class="brow-col-src">Source</span>
                      <span class="brow-col-depth">Depth</span>
                      <span class="brow-col-on">On</span>
                      <span class="brow-col-act"></span>
                    </div>

                    <div
                      v-for="src in browserTools"
                      :key="src.source_name"
                      class="brow-row"
                      :class="{ 'brow-row--off': !src.enabled }"
                    >
                      <div class="brow-col-src brow-src-cell">
                        <span class="brow-src-dot" :style="{ background: sourceColor(src) }"></span>
                        <div class="brow-src-text">
                          <div class="brow-src-name">
                            {{ src.label }}
                            <span v-if="src.is_custom" class="brow-custom-badge">custom</span>
                          </div>
                          <div class="brow-src-desc">{{ src.is_custom ? (src.url_template || src.description) : src.description }}</div>
                        </div>
                      </div>

                      <div class="brow-col-depth brow-depth-cell">
                        <button class="depth-btn" :disabled="!src.enabled"
                          @click="src.browse_count = Math.max(1, src.browse_count - 1)">−</button>
                        <span class="depth-val">{{ src.browse_count }}</span>
                        <button class="depth-btn" :disabled="!src.enabled"
                          @click="src.browse_count = Math.min(5, src.browse_count + 1)">+</button>
                      </div>

                      <div class="brow-col-on">
                        <v-switch v-model="src.enabled" color="cyan" hide-details density="compact" inset />
                      </div>

                      <div class="brow-col-act">
                        <template v-if="src.is_custom">
                          <button class="brow-act-btn" title="Edit" @click="openEditSource(src)">
                            <v-icon size="13">mdi-pencil-outline</v-icon>
                          </button>
                          <button class="brow-act-btn brow-act-btn--danger" title="Delete" @click="deleteSource(src.source_name)">
                            <v-icon size="13">mdi-delete-outline</v-icon>
                          </button>
                        </template>
                      </div>
                    </div>

                    <!-- Add Source row -->
                    <div class="brow-add-row">
                      <button class="brow-add-btn" @click="openAddSource">
                        <v-icon size="14" class="mr-1">mdi-plus</v-icon>
                        Add Source
                      </button>
                    </div>

                  </div>
                </div><!-- /MCP Browser -->

              </div><!-- /agent-right -->

            </div>
          </div>
        </template>

      </div><!-- /panels-scroll -->

      <!-- ── Sticky action bar ────────────────────────────────────── -->
      <div class="action-bar">
        <!-- Global actions -->
        <template v-if="section === 'global'">
          <div class="action-bar__info">
            <v-icon size="14" color="rgba(226,232,240,0.3)">mdi-information-outline</v-icon>
            <span>Changes take effect on the next workflow run.</span>
          </div>
          <v-btn
            color="primary"
            size="small"
            prepend-icon="mdi-content-save-all"
            :loading="savingGlobal"
            @click="saveAllGlobal"
          >Save</v-btn>
        </template>

        <!-- Agent actions -->
        <template v-else>
          <div class="action-bar__info">
            <v-icon size="14" color="rgba(226,232,240,0.3)">mdi-information-outline</v-icon>
            <span>Saves LLM config{{ section === 'researcher' ? ', Browser' : '' }} and tools together.</span>
          </div>
          <div class="action-bar__btns">
            <v-btn
              variant="tonal"
              size="small"
              prepend-icon="mdi-connection"
              :loading="testing[section]"
              @click="testConnection(section)"
            >Test Connection</v-btn>
            <v-btn
              :color="agentAccent(section)"
              size="small"
              prepend-icon="mdi-content-save-all"
              :loading="savingAgent[section]"
              @click="saveAllAgent(section)"
            >Save</v-btn>
          </div>
        </template>
      </div>

    </main>

    <!-- ── Confirm clear logs ──────────────────────────────────────── -->
    <!-- Reset Application confirm dialog -->
    <v-dialog v-model="confirmReset" max-width="460" persistent>
      <v-card style="background:#12121E;border:1px solid rgba(239,68,68,0.2);border-radius:14px">
        <v-card-title class="d-flex align-center gap-2 pt-5 px-5" style="color:#EF4444">
          <v-icon color="error" size="20">mdi-restore-alert</v-icon>
          Reset Application
        </v-card-title>
        <v-card-text class="px-5 pb-2" style="font-size:13px;color:rgba(226,232,240,0.65)">
          This will permanently delete:
          <ul style="margin-top:10px;margin-bottom:4px;padding-left:18px;line-height:2">
            <li>All <strong style="color:#E2E8F0">agent memory</strong> (STM snapshots + LTM vector indexes)</li>
            <li>All <strong style="color:#E2E8F0">run history</strong> and workflow runs</li>
            <li>All <strong style="color:#E2E8F0">reports</strong> (walkthrough HTML files)</li>
            <li>All <strong style="color:#E2E8F0">logs</strong> and token usage stats</li>
            <li>All <strong style="color:#E2E8F0">RL outcomes</strong> and learning history</li>
            <li>All <strong style="color:#E2E8F0">chat messages</strong></li>
          </ul>
          <div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#FCA5A5;font-size:12px">
            ⚠️ This cannot be undone. Agent settings and projects are preserved.
          </div>
        </v-card-text>
        <v-card-actions class="px-5 pb-5 pt-3 d-flex gap-2 justify-end">
          <v-btn variant="tonal" size="small" @click="confirmReset = false">Cancel</v-btn>
          <v-btn color="error" size="small" prepend-icon="mdi-restore-alert"
            :loading="resetting" @click="doReset">Reset Everything</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add / Edit Source dialog -->
    <v-dialog v-model="showSourceDialog" max-width="460" persistent>
      <v-card class="src-dialog-card">
        <div class="src-dialog-header">
          <v-icon size="16" color="#22D3EE" class="mr-2">{{ editingSource ? 'mdi-pencil-outline' : 'mdi-plus-circle-outline' }}</v-icon>
          <span>{{ editingSource ? 'Edit Source' : 'Add Search Source' }}</span>
        </div>
        <div class="src-dialog-body">

          <v-text-field
            v-model="sourceForm.label"
            label="Label" density="compact" variant="outlined" hide-details class="mb-3"
            placeholder="e.g. Reddit, DevDocs, MDN"
          />

          <v-text-field
            v-model="sourceForm.url_template"
            label="Search URL" density="compact" variant="outlined" class="mb-1"
            placeholder="https://site.com/search?q={query}"
            :error="urlTemplateError"
            :error-messages="urlTemplateError ? 'Must contain {query} placeholder' : ''"
          />
          <div class="src-hint mb-3">Use <code class="src-code">{query}</code> where the search term goes.</div>

          <v-textarea
            v-model="sourceForm.description"
            label="Description (optional)" density="compact" variant="outlined"
            rows="2" hide-details class="mb-3"
            placeholder="What this source is good for"
          />

          <div class="src-dialog-row">
            <v-select
              v-model="sourceForm.query_type"
              :items="[{ title: 'Full sentence', value: 'full' }, { title: 'Keywords only', value: 'keywords' }]"
              label="Query mode" density="compact" variant="outlined" hide-details
              style="flex:1"
            />
            <div class="src-depth-wrap">
              <div class="src-depth-label">Depth</div>
              <div class="src-depth-ctrl">
                <button class="depth-btn" @click="sourceForm.browse_count = Math.max(1, sourceForm.browse_count - 1)">−</button>
                <span class="depth-val">{{ sourceForm.browse_count }}</span>
                <button class="depth-btn" @click="sourceForm.browse_count = Math.min(5, sourceForm.browse_count + 1)">+</button>
              </div>
            </div>
          </div>

        </div>
        <div class="src-dialog-actions">
          <v-btn variant="text" size="small" @click="closeSourceDialog">Cancel</v-btn>
          <v-btn color="cyan" size="small" :loading="savingSource" @click="saveSource">
            {{ editingSource ? 'Update' : 'Add Source' }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Alert message -->
    <transition name="alert-slide">
      <div v-if="snack.show" class="alert-message bottom" :class="`alert-message--${snack.color}`">
        <span class="alert-message__dot" />
        <span class="section-heading">{{ snack.message }}</span>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';

// source_type → display color. Add an entry when a new sourceType is introduced.
const SOURCE_TYPE_DISPLAY = {
  google:        { color: '#4285F4' },  // Google blue
  duckduckgo:    { color: '#38BDF8' },  // sky blue (was 'google' before)
  github:        { color: '#A78BFA' },
  npm:           { color: '#EF4444' },
  stackoverflow: { color: '#F59E0B' },
  hackernews:    { color: '#F97316' },
};
import axios from 'axios';

const agentSettings = ref([]);
const AGENT_ORDER   = ['planner', 'researcher', 'worker', 'reviewer'];
const section       = ref('global');
const workspacePath = ref('./workspace');

const confirmReset     = ref(false);
const resetting        = ref(false);
const loopEnabled      = ref(false);
const maxLoops         = ref(3);
const recursionLimit   = ref(200);
const debugMode        = ref(false);
const researcherMCPEnabled = ref(false);
const browserTools         = ref([]);

// Add/Edit source dialog
const showSourceDialog = ref(false);
const editingSource    = ref(null);  // null = add mode, object = edit mode
const savingSource     = ref(false);
const sourceForm       = reactive({ label: '', url_template: '', description: '', query_type: 'full', browse_count: 1 });
const urlTemplateError = computed(() => sourceForm.url_template.length > 0 && !sourceForm.url_template.includes('{query}'));

const forms         = reactive({});
const testing       = reactive({});
const connectionStatus = reactive({});
const showKey       = reactive({});
const snack         = reactive({ show: false, message: '', color: 'success' });
const availableModels = reactive({});
const loadingModels = reactive({});
const modelLoadError = reactive({});
const toolState     = reactive({});
const allToolsMeta  = ref([]);

// Unified save loading states
const savingGlobal  = ref(false);
const savingAgent   = reactive({});

const totalTools          = computed(() => allToolsMeta.value.length);
const enabledBrowserCount = computed(() => browserTools.value.filter(t => t.enabled).length);
const groupedTools = computed(() => {
  const groups = {};
  for (const t of allToolsMeta.value) {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  }
  return groups;
});

// ── Unified save handlers ─────────────────────────────────────────────

async function saveAllGlobal() {
  savingGlobal.value = true;
  try {
    const calls = [
      axios.put('/api/settings/global', {
        workspace_path:           workspacePath.value,
        workflow_loop_enabled:    loopEnabled.value ? '1' : '0',
        workflow_max_loops:       String(maxLoops.value),
        workflow_recursion_limit: String(recursionLimit.value ?? 0),
        debug_mode:               String(debugMode.value),
      }),
    ];

    await Promise.all(calls);
    showSnack('Global settings saved');
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingGlobal.value = false; }
}

async function saveAllAgent(agentId) {
  savingAgent[agentId] = true;
  try {
    const calls = [
      axios.put(`/api/settings/${agentId}`, forms[agentId]),
      axios.put(`/api/settings/${agentId}/tools`, {
        enabledTools: Object.entries(toolState[agentId] || {}).filter(([, v]) => v).map(([k]) => k),
      }),
    ];
    if (agentId === 'researcher') {
      calls.push(
        axios.put('/api/settings/global', { researcher_mcp_enabled: researcherMCPEnabled.value ? '1' : '0' }),
        axios.put('/api/settings/browser/tools', {
          tools: browserTools.value.map(t => ({
            source_name:  t.source_name,
            enabled:      t.enabled ? 1 : 0,
            browse_count: t.browse_count,
          })),
        }),
      );
    }
    await Promise.all(calls);
    showSnack(`${agentId} settings saved`);
  } catch (e) { showSnack(`Error: ${e.message}`, 'error'); }
  finally { savingAgent[agentId] = false; }
}

// ── Helpers ───────────────────────────────────────────────────────────

function modelMismatch(agentId) {
  const models  = availableModels[agentId];
  const current = forms[agentId]?.model_name;
  return models && models.length > 0 && current && !models.includes(current);
}
function suggestModel(agentId) {
  const models   = availableModels[agentId] || [];
  if (!models.length) return null;
  const current  = (forms[agentId]?.model_name || '').toLowerCase();
  const keywords = current.split(/[-\/.:@]/).filter(k => k.length > 2);
  let best = null, bestScore = -1;
  for (const m of models) {
    const score = keywords.reduce((acc, k) => acc + (m.toLowerCase().includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best || models[0];
}
async function applyModel(agentId, modelName) {
  forms[agentId].model_name = modelName;
}


// Label and description come from the API (SEARCH_ADAPTERS metadata).
// Only color needs a local fallback; new source_types get a default colour automatically.
function sourceColor(src) {
  return SOURCE_TYPE_DISPLAY[src.source_type]?.color || '#6366F1';
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
  return Object.values(toolState[agentId] || {}).filter(Boolean).length;
}
function isToolEnabled(agentId, toolName) { return Boolean(toolState[agentId]?.[toolName]); }
function toggleTool(agentId, toolName, value) {
  if (!toolState[agentId]) toolState[agentId] = {};
  toolState[agentId][toolName] = value;
}
function applyPreset(agentId, preset) {
  if (!toolState[agentId]) toolState[agentId] = {};
  for (const tool of allToolsMeta.value) {
    if      (preset === 'all')      toolState[agentId][tool.name] = true;
    else if (preset === 'none')     toolState[agentId][tool.name] = false;
    else if (preset === 'safe')     toolState[agentId][tool.name] = tool.safe;
    else if (preset === 'readonly') toolState[agentId][tool.name] = ['read_file', 'list_files', 'bulk_read'].includes(tool.name);
  }
}
function categoryIcon(cat) {
  return { filesystem: 'mdi-folder-outline', scaffold: 'mdi-rocket-launch-outline', workflow: 'mdi-sitemap' }[cat] || 'mdi-wrench';
}
let _snackTimer = null;
function showSnack(message, color = 'success') {
  if (_snackTimer) clearTimeout(_snackTimer);
  Object.assign(snack, { show: true, message, color });
  _snackTimer = setTimeout(() => { snack.show = false; }, 3000);
}

async function fetchModels(agentId) {
  loadingModels[agentId] = true;
  modelLoadError[agentId] = '';
  try {
    const { data } = await axios.get('/api/agents/models/list', {
      params: { baseUrl: forms[agentId]?.base_url || 'http://localhost:1234/v1', apiKey: forms[agentId]?.api_key || 'lm-studio' },
    });
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
    workspacePath.value        = data.workspace_path || './workspace';
    loopEnabled.value          = data.workflow_loop_enabled === '1';
    maxLoops.value             = parseInt(data.workflow_max_loops || '3', 10);
    recursionLimit.value       = parseInt(data.workflow_recursion_limit || '200', 10);
    researcherMCPEnabled.value = data.researcher_mcp_enabled === '1';
    debugMode.value            = data.debug_mode === 'true';
  } catch { /* use defaults */ }
}
async function fetchBrowserTools() {
  try {
    const { data } = await axios.get('/api/settings/browser/tools');
    browserTools.value = data.map(t => ({ ...t, enabled: Boolean(t.enabled), browse_count: t.browse_count || 1 }));
  } catch { /* use defaults */ }
}

function openAddSource() {
  editingSource.value = null;
  Object.assign(sourceForm, { label: '', url_template: '', description: '', query_type: 'full', browse_count: 1 });
  showSourceDialog.value = true;
}
function openEditSource(src) {
  editingSource.value = src;
  Object.assign(sourceForm, {
    label:        src.label,
    url_template: src.url_template || '',
    description:  src.description  || '',
    query_type:   src.query_type   || 'full',
    browse_count: src.browse_count || 1,
  });
  showSourceDialog.value = true;
}
function closeSourceDialog() {
  showSourceDialog.value = false;
  editingSource.value = null;
}
async function saveSource() {
  if (!sourceForm.label.trim() || !sourceForm.url_template.includes('{query}')) return;
  savingSource.value = true;
  try {
    let data;
    if (editingSource.value) {
      ({ data } = await axios.put(`/api/settings/browser/tools/${editingSource.value.source_name}`, sourceForm));
    } else {
      ({ data } = await axios.post('/api/settings/browser/tools', sourceForm));
    }
    browserTools.value = data.map(t => ({ ...t, enabled: Boolean(t.enabled), browse_count: t.browse_count || 1 }));
    showSnack(editingSource.value ? 'Source updated' : 'Source added');
    closeSourceDialog();
  } catch (e) { showSnack(`Error: ${e.response?.data?.error || e.message}`, 'error'); }
  finally { savingSource.value = false; }
}
async function deleteSource(source_name) {
  try {
    const { data } = await axios.delete(`/api/settings/browser/tools/${source_name}`);
    browserTools.value = data.map(t => ({ ...t, enabled: Boolean(t.enabled), browse_count: t.browse_count || 1 }));
    showSnack('Source removed');
  } catch (e) { showSnack(`Error: ${e.response?.data?.error || e.message}`, 'error'); }
}

async function fetchSettings() {
  const { data } = await axios.get('/api/settings');
  for (const s of data) {
    forms[s.agent_id] = {
      model_name:          s.model_name,
      base_url:            s.base_url,
      api_key:             s.api_key,
      temperature:         s.temperature,
      max_tokens:          s.max_tokens,
      unlimited_tokens:    Boolean(s.unlimited_tokens),
      thinking_model:      s.thinking_model !== undefined ? Boolean(s.thinking_model) : true,
      system_prompt:       s.system_prompt || '',
      compression_enabled: Boolean(s.compression_enabled),
    };
    showKey[s.agent_id]    = false;
    savingAgent[s.agent_id] = false;
  }
  agentSettings.value = [...data]
    .filter(a => AGENT_ORDER.includes(a.agent_id))
    .sort((a, b) => AGENT_ORDER.indexOf(a.agent_id) - AGENT_ORDER.indexOf(b.agent_id));
  for (const s of data) await fetchAgentTools(s.agent_id);
}
async function fetchAgentTools(agentId) {
  try {
    const { data } = await axios.get(`/api/settings/${agentId}/tools`);
    if (!allToolsMeta.value.length) {
      allToolsMeta.value = data.map(({ name, params, safe, category, description, icon }) => ({ name, params, safe, category, description, icon }));
    }
    if (!toolState[agentId]) toolState[agentId] = {};
    for (const t of data) toolState[agentId][t.name] = Boolean(t.enabled);
  } catch { /* ignore */ }
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

async function doReset() {
  resetting.value = true;
  try {
    await axios.post('/api/settings/reset');
    confirmReset.value = false;
    showSnack('Application reset — all data cleared', 'success');
  } catch (e) { showSnack(`Reset failed: ${e.message}`, 'error'); }
  finally { resetting.value = false; }
}

onMounted(async () => {
  await Promise.all([fetchGlobal(), fetchSettings(), fetchBrowserTools()]);
  for (const s of agentSettings.value) fetchModels(s.agent_id);
});
</script>

<style scoped>
/* ── Root ────────────────────────────────────────────────────────────── */
.settings-root {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */
.settings-nav {
  width: 196px;
  flex-shrink: 0;
  padding: 20px 12px;
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-group-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px;
  color: rgba(226,232,240,0.25);
  padding: 0 8px; margin-bottom: 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 8px;
  font-size: 13px; font-weight: 500;
  color: rgba(226,232,240,0.5);
  background: transparent; border: none; cursor: pointer;
  transition: background 0.15s, color 0.15s;
  text-align: left; width: 100%;
}
.nav-item:hover { background: rgba(255,255,255,0.04); color: rgba(226,232,240,0.85); }
.nav-item--active { background: rgba(99,102,241,0.12) !important; color: #A78BFA !important; }
.nav-item--danger { color: rgba(239,68,68,0.6) !important; margin-top: 4px; }
.nav-item--danger:hover { background: rgba(239,68,68,0.06) !important; color: #EF4444 !important; }
.nav-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.nav-divider { border-top: 1px solid rgba(255,255,255,0.06); margin: 8px 0; }

/* ── Content ─────────────────────────────────────────────────────────── */
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panels-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Section heading ─────────────────────────────────────────────────── */
.section-heading { margin-bottom: 4px; }
.page-title    { font-size: 17px; font-weight: 700; color: #E2E8F0; }
.page-subtitle { font-size: 12px; color: rgba(226,232,240,0.35); margin-top: 2px; }

/* ── Sticky action bar ───────────────────────────────────────────────── */
.action-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(10,10,20,0.6);
  backdrop-filter: blur(8px);
  gap: 12px;
}
.action-bar__info {
  display: flex; align-items: center;
  font-size: 11px; color: rgba(226,232,240,0.3);
  gap: 6px;
}
.action-bar__btns { display: flex; align-items: center; gap: 8px; }

/* ── Global grid ─────────────────────────────────────────────────────── */
.global-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.span-full { grid-column: 1 / -1; }
@media (max-width: 860px) { .global-grid { grid-template-columns: 1fr; } }

/* ── Agent layout ────────────────────────────────────────────────────── */
.agent-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 14px;
  align-items: start;
}
@media (max-width: 960px) { .agent-layout { grid-template-columns: 1fr; } }
.agent-left  { display: flex; flex-direction: column; }
.agent-right { display: flex; flex-direction: column; gap: 14px; }
.mt-3        { margin-top: 14px; }

/* ── Panel ───────────────────────────────────────────────────────────── */
.panel {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.panel__body { padding: 14px; }
.panel-desc {
  font-size: 12px; color: rgba(226,232,240,0.35);
  margin-bottom: 12px; line-height: 1.5;
}
.section-title { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.85); }
.hint          { font-size: 11px; color: rgba(226,232,240,0.3) !important; }
.field-label   { font-size: 12px; color: rgba(226,232,240,0.45) !important; margin-bottom: 2px; }
.muted-label   { font-weight: 400; color: rgba(226,232,240,0.35); }
.gap-2         { gap: 8px; }

/* ── Workflow loop ───────────────────────────────────────────────────── */
.loop-grid         { display: flex; flex-direction: column; gap: 16px; }
.loop-toggle-row   { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.loop-toggle-info  { flex: 1; }
.loop-toggle-label { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.9); margin-bottom: 4px; }
.loop-toggle-hint  { font-size: 11px; color: rgba(226,232,240,0.35); line-height: 1.5; }
.loop-max-row { transition: opacity .2s; }
.loop-max-row--disabled { opacity: .35; pointer-events: none; }
.loop-divider { border-top: 1px solid rgba(255,255,255,0.06); margin: 4px 0; }
.recursion-input-wrap { display: flex; align-items: center; flex-shrink: 0; }

/* ── Preset bar ──────────────────────────────────────────────────────── */
.preset-bar { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.preset-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
  cursor: pointer; border: 1px solid transparent; transition: opacity 0.15s;
}
.preset-btn:hover { opacity: 0.8; }
.preset-btn--green  { background: rgba(16,185,129,0.1);  color: #10B981; border-color: rgba(16,185,129,0.2); }
.preset-btn--blue   { background: rgba(56,189,248,0.1);  color: #38BDF8; border-color: rgba(56,189,248,0.2); }
.preset-btn--yellow { background: rgba(245,158,11,0.1);  color: #F59E0B; border-color: rgba(245,158,11,0.2); }
.preset-btn--red    { background: rgba(239,68,68,0.1);   color: #EF4444; border-color: rgba(239,68,68,0.2); }

/* ── Tool list ───────────────────────────────────────────────────────── */
.tool-groups { max-height: 520px; overflow-y: auto; }
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
.tool-row:hover  { background: rgba(255,255,255,0.02); }
.tool-switch     { flex-shrink: 0; margin-top: 2px; }
.tool-info       { flex: 1; min-width: 0; }
.tool-name       { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tool-badge      { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; }
.tool-desc       { font-size: 11px; color: rgba(226,232,240,0.4) !important; margin-top: 2px; }
.tool-params     { color: #A78BFA !important; margin-left: 4px; }
.tools-legend {
  padding: 8px 14px;
  font-size: 11px; color: rgba(226,232,240,0.3);
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* ── MCP Browser panel ───────────────────────────────────────────────── */

/* Master toggle row */
.brow-master {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.brow-master-info  { flex: 1; min-width: 0; }
.brow-master-label { font-size: 13px; font-weight: 600; color: rgba(226,232,240,0.9); margin-bottom: 3px; }
.brow-master-hint  { font-size: 11px; color: rgba(226,232,240,0.35); line-height: 1.45; }
.brow-on-badge {
  font-size: 10px; font-weight: 700;
  color: #22D3EE; background: rgba(34,211,238,.1);
  border: 1px solid rgba(34,211,238,.2);
  border-radius: 20px; padding: 1px 7px; white-space: nowrap;
}

/* Source list */
.brow-list { transition: opacity .2s; }
.brow-list--off { opacity: .3; pointer-events: none; }

/* 4-column grid: source | depth | toggle | actions */
.brow-list-head,
.brow-row {
  display: grid;
  grid-template-columns: 1fr 80px 52px 52px;
  align-items: center;
}
.brow-list-head {
  padding: 5px 14px;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
  color: rgba(226,232,240,0.22);
  background: rgba(255,255,255,0.015);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.brow-col-depth { text-align: center; }
.brow-col-on    { display: flex; justify-content: center; }
.brow-col-act   { display: flex; align-items: center; justify-content: center; gap: 2px; }

.brow-row {
  padding: 7px 14px; min-height: 50px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  transition: background .15s, opacity .15s;
}
.brow-row:last-child  { border-bottom: none; }
.brow-row:hover       { background: rgba(255,255,255,0.02); }
.brow-row--off        { opacity: .45; }
.brow-row--off:hover  { opacity: .65; }

/* Source cell */
.brow-src-cell { display: flex; align-items: flex-start; gap: 8px; padding-right: 6px; min-width: 0; }
.brow-src-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
.brow-src-text { min-width: 0; }
.brow-src-name {
  font-size: 12px; font-weight: 600; color: rgba(226,232,240,0.88);
  display: flex; align-items: center; gap: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.brow-src-desc {
  font-size: 10px; color: rgba(226,232,240,0.3);
  line-height: 1.4; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.brow-custom-badge {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  color: #22D3EE; background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.2);
  border-radius: 3px; padding: 0 4px; flex-shrink: 0;
}

/* Depth stepper */
.brow-depth-cell { display: flex; align-items: center; justify-content: center; gap: 3px; }
.depth-btn {
  width: 20px; height: 20px; border-radius: 5px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.65); font-size: 14px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .12s;
}
.depth-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: #E2E8F0; }
.depth-btn:disabled { opacity: .3; cursor: not-allowed; }
.depth-val {
  width: 16px; text-align: center;
  font-size: 12px; font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(226,232,240,0.75);
}

/* Action buttons */
.brow-act-btn {
  width: 22px; height: 22px; border-radius: 5px;
  background: transparent; border: none; cursor: pointer;
  color: rgba(226,232,240,0.3); display: flex; align-items: center; justify-content: center;
  transition: background .12s, color .12s;
}
.brow-act-btn:hover { background: rgba(255,255,255,0.08); color: rgba(226,232,240,0.8); }
.brow-act-btn--danger:hover { background: rgba(239,68,68,0.1); color: #EF4444; }

/* Add Source row */
.brow-add-row {
  padding: 8px 14px;
  border-top: 1px solid rgba(255,255,255,0.04);
}
.brow-add-btn {
  display: flex; align-items: center;
  padding: 5px 10px; border-radius: 7px;
  font-size: 12px; font-weight: 500; color: rgba(226,232,240,0.45);
  background: transparent; border: 1px dashed rgba(255,255,255,0.1);
  cursor: pointer; width: 100%; justify-content: center;
  transition: background .15s, color .15s, border-color .15s;
}
.brow-add-btn:hover {
  background: rgba(34,211,238,.04);
  color: #22D3EE;
  border-color: rgba(34,211,238,.25);
}

/* ── Add/Edit source dialog ───────────────────────────────────────────── */
.src-dialog-card {
  background: #12121E !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 14px !important;
}
.src-dialog-header {
  display: flex; align-items: center;
  padding: 16px 18px 0;
  font-size: 14px; font-weight: 700; color: #E2E8F0;
}
.src-dialog-body { padding: 16px 18px; }
.src-hint { font-size: 11px; color: rgba(226,232,240,0.35); }
.src-code {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: #22D3EE; background: rgba(34,211,238,.1);
  padding: 1px 4px; border-radius: 3px;
}
.src-dialog-row { display: flex; align-items: flex-end; gap: 12px; }
.src-depth-wrap { flex-shrink: 0; }
.src-depth-label { font-size: 11px; color: rgba(226,232,240,0.4); margin-bottom: 4px; text-align: center; }
.src-depth-ctrl  { display: flex; align-items: center; gap: 4px; }
.src-dialog-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 0 18px 16px;
}

.font-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }

/* ── Alert message (run-banner style) ────────────────────────────────── */
.alert-message {
  position: fixed;
  z-index: 9999;
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid;
  font-size: 13px;
  max-width: 340px;
  pointer-events: none;
}
.alert-message.bottom { top: 24px; right: 24px; }
.alert-message .section-heading { margin-bottom: 0; font-weight: 600; }

.alert-message__dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  animation: pulse-dot 1.2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

.alert-message--success { background: rgba(16,185,129,0.07);  border-color: rgba(16,185,129,0.2); }
.alert-message--success .alert-message__dot   { background: #10B981; }
.alert-message--success .section-heading      { color: #10B981 !important; }

.alert-message--error   { background: rgba(239,68,68,0.07);   border-color: rgba(239,68,68,0.2); }
.alert-message--error   .alert-message__dot   { background: #EF4444; }
.alert-message--error   .section-heading      { color: #EF4444 !important; }

.alert-message--warning { background: rgba(245,158,11,0.07);  border-color: rgba(245,158,11,0.2); }
.alert-message--warning .alert-message__dot   { background: #F59E0B; }
.alert-message--warning .section-heading      { color: #F59E0B !important; }

.alert-message--info    { background: rgba(99,102,241,0.07);  border-color: rgba(99,102,241,0.2); }
.alert-message--info    .alert-message__dot   { background: #818CF8; }
.alert-message--info    .section-heading      { color: #818CF8 !important; }

.alert-slide-enter-active { transition: opacity 0.2s, transform 0.2s; }
.alert-slide-leave-active { transition: opacity 0.25s, transform 0.25s; }
.alert-slide-enter-from   { opacity: 0; transform: translateY(-8px); }
.alert-slide-leave-to     { opacity: 0; transform: translateY(-4px); }
</style>

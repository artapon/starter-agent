<template>
  <v-container fluid class="pa-0" style="height: calc(100vh - 64px); display: flex; flex-direction: column;">
    <!-- Header -->
    <v-toolbar color="surface" density="compact" class="flex-grow-0" border="b">
      <v-toolbar-title class="text-subtitle-1">
        <v-icon class="mr-2">mdi-chat</v-icon>Realtime Chat
      </v-toolbar-title>
      <v-spacer />
      <v-select
        v-model="sessionId"
        :items="sessionItems"
        item-title="label"
        item-value="id"
        density="compact"
        hide-details
        style="max-width:200px"
        label="Session"
        class="mr-2"
      />
      <v-btn size="small" variant="text" icon="mdi-plus" @click="newSession" />
      <v-btn size="small" variant="text" icon="mdi-delete" @click="clearSession" />
      <v-divider vertical class="mx-2" />
      <v-btn
        size="small" variant="text"
        :icon="showWorkspace ? 'mdi-folder-open' : 'mdi-folder'"
        :color="showWorkspace ? 'primary' : undefined"
        @click="showWorkspace = !showWorkspace"
        title="Toggle workspace"
      />
    </v-toolbar>

    <!-- Body -->
    <div class="flex-grow-1 d-flex overflow-hidden">

      <!-- ── Messages ──────────────────────────────────────────────── -->
      <div ref="messagesEl" class="flex-grow-1 overflow-y-auto pa-4" style="background:#0A0A0F;">

        <!-- History messages -->
        <div v-for="msg in messages" :key="msg.id || msg.ts" class="mb-3">
          <div :class="['d-flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
            <div style="max-width:75%">
              <v-chip v-if="msg.role !== 'user'" size="x-small" :color="agentColor(msg.agent_id)"
                variant="tonal" class="mb-1" prepend-icon="mdi-robot">
                {{ msg.agent_id || 'agent' }}
              </v-chip>
              <v-card :color="msg.role === 'user' ? 'primary' : 'surface-variant'"
                rounded="lg" class="pa-3 msg-card">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <span v-html="renderMarkdown(msg.content)" />
              </v-card>
              <div class="text-caption text-medium-emphasis mt-1 px-1">{{ formatTime(msg.ts) }}</div>
            </div>
          </div>
        </div>

        <!-- Live streaming bubble — renders markdown word-by-word as tokens arrive -->
        <div v-if="isStreaming" class="d-flex justify-start mb-3">
          <div style="max-width:75%">
            <v-chip size="x-small" :color="agentColor(streamingAgentId)" variant="tonal"
              class="mb-1" prepend-icon="mdi-robot">
              {{ streamingAgentId || 'agent' }}
            </v-chip>
            <v-card color="surface-variant" rounded="lg" class="pa-3 msg-card streaming-card">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-html="renderMarkdown(streamingContent)" /><span class="cursor">▍</span>
            </v-card>
          </div>
        </div>

        <!-- Thinking indicator (before first token) -->
        <div v-if="(typing || sending) && !isStreaming" class="d-flex justify-start mb-3">
          <v-card color="surface-variant" rounded="lg" class="pa-3 d-flex align-center">
            <v-progress-circular size="16" width="2" indeterminate color="primary" class="flex-shrink-0" />
            <span class="ml-2 text-medium-emphasis text-caption d-flex align-center gap-1">
              <template v-if="activeAgent">
                <v-chip size="x-small" :color="agentColor(activeAgent)" variant="tonal" class="mr-1">{{ activeAgent }}</v-chip>
                thinking…
              </template>
              <template v-else>Agent thinking…</template>
            </span>
          </v-card>
        </div>

        <div ref="bottomAnchor" />
      </div>

      <!-- ── Workspace Panel ───────────────────────────────────────── -->
      <transition name="slide-panel">
        <div v-if="showWorkspace"
          style="width:300px;min-width:260px;border-left:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;background:#0d0d14;">
          <div class="d-flex align-center px-2 py-2" style="border-bottom:1px solid rgba(255,255,255,0.08)">
            <v-icon size="15" color="primary" class="mr-1">mdi-folder-cog</v-icon>
            <span class="text-caption font-weight-bold">Workspace</span>
            <v-tooltip :text="workspacePath" location="bottom">
              <template #activator="{ props }">
                <v-chip v-bind="props" size="x-small" color="primary" variant="tonal" class="ml-1"
                  style="max-width:110px;overflow:hidden;text-overflow:ellipsis">
                  {{ workspacePath }}
                </v-chip>
              </template>
            </v-tooltip>
            <v-spacer />
            <v-btn size="x-small" icon="mdi-refresh" variant="text" @click="loadWorkspace" :loading="loadingWorkspace" />
          </div>

          <div class="overflow-y-auto flex-grow-1 py-1">
            <template v-if="!workspaceTree.length">
              <div class="text-center pa-4 text-medium-emphasis">
                <v-icon size="36" class="mb-2 d-block">mdi-folder-open-outline</v-icon>
                <div class="text-caption">Workspace is empty</div>
              </div>
            </template>
            <workspace-node v-for="node in workspaceTree" :key="node.path"
              :node="node" :depth="0" @open="openFile" />
          </div>
        </div>
      </transition>
    </div>

    <!-- Input -->
    <v-toolbar color="surface" border="t" class="flex-grow-0 pa-2">
      <v-textarea
        v-model="input"
        placeholder="Describe your goal… (Enter to send, Shift+Enter for newline)"
        rows="2" max-rows="5" auto-grow hide-details variant="outlined" density="compact"
        :disabled="sending"
        @keydown.enter.exact.prevent="sendMessage"
        @keydown.shift.enter.exact="insertNewline"
        class="mr-2"
      />
      <!-- Stop button — shown while processing -->
      <v-btn
        v-if="sending || isStreaming || typing"
        color="error"
        variant="tonal"
        icon="mdi-stop"
        class="mr-2"
        title="Stop"
        @click="stopChat"
      />
      <v-btn color="primary" :loading="sending" :disabled="!input.trim() || sending" @click="sendMessage" icon="mdi-send" />
    </v-toolbar>

    <!-- File viewer dialog -->
    <v-dialog v-model="fileDialog.show" max-width="900">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" size="18">mdi-file-code</v-icon>
          {{ fileDialog.path }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="fileDialog.show = false" />
        </v-card-title>
        <v-card-text class="pa-0">
          <pre style="overflow:auto;max-height:70vh;padding:16px;font-size:13px;background:#0a0a0f;margin:0">{{ fileDialog.content }}</pre>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch, defineComponent, h } from 'vue';
import { useSocket } from '../plugins/socket.js';
import { marked } from 'marked';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// ── Workspace tree node ───────────────────────────────────────────────────
const WorkspaceNode = defineComponent({
  name: 'WorkspaceNode',
  props: { node: Object, depth: { type: Number, default: 0 } },
  emits: ['open'],
  setup(props, { emit }) {
    const expanded = ref(false);
    function fileIcon(name) {
      const ext = (name.split('.').pop() || '').toLowerCase();
      return { js: 'mdi-language-javascript', ts: 'mdi-language-typescript', vue: 'mdi-vuejs',
        json: 'mdi-code-json', md: 'mdi-language-markdown', html: 'mdi-language-html5',
        css: 'mdi-language-css3', py: 'mdi-language-python', env: 'mdi-lock',
        sh: 'mdi-bash', bat: 'mdi-console' }[ext] || 'mdi-file-outline';
    }
    function fmtSize(b) {
      return b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}K` : `${(b/1048576).toFixed(1)}M`;
    }
    return () => h('div', { style: `padding-left:${props.depth * 14}px` }, [
      h('div', {
        style: 'display:flex;align-items:center;gap:5px;padding:3px 8px;cursor:pointer;border-radius:4px',
        class: 'ws-row',
        onClick: () => props.node.type === 'dir' ? (expanded.value = !expanded.value) : emit('open', props.node),
      }, [
        h('v-icon', { size: 13, color: props.node.type === 'dir' ? 'primary' : 'grey-lighten-1' },
          () => props.node.type === 'dir' ? (expanded.value ? 'mdi-folder-open' : 'mdi-folder') : fileIcon(props.node.name)),
        h('span', { style: 'flex:1;font-family:monospace;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
          props.node.name),
        props.node.type === 'file'
          ? h('span', { style: 'font-size:11px;color:#666;flex-shrink:0' }, fmtSize(props.node.size))
          : null,
      ]),
      expanded.value && props.node.children?.map(child =>
        h(WorkspaceNode, { node: child, depth: props.depth + 1, onOpen: n => emit('open', n) })
      ),
    ]);
  },
});

// ── State ─────────────────────────────────────────────────────────────────
const socket = useSocket();
const input = ref('');
const sending = ref(false);
const typing = ref(false);
const messages = ref([]);
const sessionId = ref(localStorage.getItem('chatSessionId') || uuidv4());
const sessions = ref([]);
const messagesEl = ref(null);
const bottomAnchor = ref(null);

// Dedicated streaming state — plain refs, always reactive
const isStreaming = ref(false);
const streamingContent = ref('');
const streamingAgentId = ref('developer');

// Per-agent status from agent:status socket events
const activeAgent = ref(null);

// Workspace
const showWorkspace = ref(false);
const workspaceTree = ref([]);
const workspacePath = ref('./workspace');
const loadingWorkspace = ref(false);
const fileDialog = ref({ show: false, path: '', content: '' });

const sessionItems = computed(() =>
  sessions.value.map(s => ({ id: s.id, label: `${s.id.slice(0, 8)} (${s.message_count} msgs)` }))
);

// ── Helpers ───────────────────────────────────────────────────────────────
function agentColor(id) {
  return { planner: 'blue', developer: 'green', reviewer: 'orange', workflow: 'purple', system: 'red' }[id] || 'primary';
}
function renderMarkdown(text) {
  try { return marked.parse(text || ''); } catch { return text || ''; }
}
function formatTime(ts) {
  return ts ? new Date(Number(ts)).toLocaleTimeString() : '';
}
async function scrollBottom() {
  await nextTick();
  bottomAnchor.value?.scrollIntoView({ behavior: 'smooth' });
}

// ── Workspace ─────────────────────────────────────────────────────────────
async function loadWorkspace() {
  loadingWorkspace.value = true;
  try {
    const { data } = await axios.get('/api/workspace/files');
    workspaceTree.value = data.tree || [];
    workspacePath.value = data.workspace || './workspace';
  } catch { workspaceTree.value = []; }
  finally { loadingWorkspace.value = false; }
}
async function openFile(node) {
  try {
    const { data } = await axios.get('/api/workspace/file', { params: { path: node.path } });
    fileDialog.value = { show: true, path: node.path, content: data.content };
  } catch (e) {
    fileDialog.value = { show: true, path: node.path, content: `Error: ${e.message}` };
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const { data } = await axios.get(`/api/chat/history/${sessionId.value}`);
    messages.value = data;
    await scrollBottom();
  } catch { messages.value = []; }
}
async function loadSessions() {
  try {
    const { data } = await axios.get('/api/chat/sessions');
    sessions.value = data;
  } catch { sessions.value = []; }
}
function newSession() {
  sessionId.value = uuidv4();
  messages.value = [];
  isStreaming.value = false;
  streamingContent.value = '';
}
async function clearSession() {
  await axios.delete(`/api/chat/sessions/${sessionId.value}`);
  messages.value = [];
}
function insertNewline() { input.value += '\n'; }

async function stopChat() {
  try {
    await axios.post(`/api/chat/stop/${sessionId.value}`);
  } catch { /* best-effort */ }
  // Reset UI state immediately
  sending.value = false;
  typing.value = false;
  isStreaming.value = false;
  streamingContent.value = '';
}

async function sendMessage() {
  if (!input.value.trim() || sending.value) return;
  const content = input.value.trim();
  input.value = '';
  sending.value = true;
  messages.value.push({ role: 'user', content, ts: Date.now() });
  await scrollBottom();
  try {
    const { data } = await axios.post('/api/chat/message', { content, sessionId: sessionId.value });
    localStorage.setItem('chatSessionId', sessionId.value);
    loadSessions();
    // Commit final message from HTTP response — more reliable than socket event
    if (data?.content) {
      const streamed = streamingContent.value;
      isStreaming.value = false;
      streamingContent.value = '';
      activeAgent.value = null;
      const combined = streamed
        ? `${streamed}\n\n---\n\n${data.content}`
        : data.content;
      messages.value.push({
        role: 'assistant',
        content: combined,
        ts: Date.now(),
        agent_id: data.agentId || 'workflow',
      });
      await scrollBottom();
    }
  } catch (err) {
    messages.value.push({ role: 'assistant', content: `Error: ${err.message}`, ts: Date.now(), agent_id: 'system' });
  } finally {
    sending.value = false;
    isStreaming.value = false;
    streamingContent.value = '';
    await scrollBottom();
  }
}

// ── Watches ───────────────────────────────────────────────────────────────
watch(sessionId, () => {
  messages.value = [];
  isStreaming.value = false;
  streamingContent.value = '';
  loadHistory();
});
watch(showWorkspace, v => { if (v) loadWorkspace(); });

// ── Socket ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadHistory();
  loadSessions();

  // Per-agent status — shows which agent is currently working
  socket.on('agent:status', (data) => {
    if (data.status === 'working') {
      activeAgent.value = data.agentId;
    } else if (data.status === 'idle') {
      if (activeAgent.value === data.agentId) activeAgent.value = null;
    }
  });

  // Token-by-token streaming chunk
  socket.on('chat:response_chunk', (data) => {
    if (data.sessionId !== sessionId.value) return;
    if (!isStreaming.value) {
      isStreaming.value = true;
      streamingContent.value = '';
      streamingAgentId.value = data.agentId || 'agent';
    }
    streamingContent.value += data.chunk;
    streamingAgentId.value = data.agentId || streamingAgentId.value;
    scrollBottom();
  });

  // Final response — clear streaming state only (message committed via HTTP response)
  socket.on('chat:response', (data) => {
    if (data.sessionId !== sessionId.value) return;
    isStreaming.value = false;
    streamingContent.value = '';
    activeAgent.value = null;
  });

  socket.on('chat:typing', (data) => {
    if (!data.sessionId || data.sessionId === sessionId.value) {
      typing.value = data.typing;
      if (data.typing) scrollBottom();
    }
  });

  // Stopped by user
  socket.on('chat:stopped', (data) => {
    if (data.sessionId !== sessionId.value) return;
    isStreaming.value = false;
    streamingContent.value = '';
    typing.value = false;
    sending.value = false;
    activeAgent.value = null;
  });

  socket.on('workspace:changed', () => {
    if (showWorkspace.value) loadWorkspace();
  });

  onUnmounted(() => {
    socket.off('agent:status');
    socket.off('chat:response');
    socket.off('chat:response_chunk');
    socket.off('chat:typing');
    socket.off('chat:stopped');
    socket.off('workspace:changed');
  });
});
</script>

<style scoped>
.msg-card { white-space: pre-wrap; word-break: break-word; font-size: 14px; }

/* Streaming card — let markdown p/pre elements flow naturally */
.streaming-card :deep(p) { margin-bottom: 4px; }
.streaming-card :deep(pre) { white-space: pre-wrap; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; margin: 4px 0; }
.streaming-card :deep(code) { font-family: monospace; font-size: 13px; }
.streaming-card :deep(ul), .streaming-card :deep(ol) { padding-left: 20px; margin: 4px 0; }

/* Blinking cursor */
.cursor {
  display: inline-block;
  color: rgb(var(--v-theme-primary));
  animation: blink 0.6s step-end infinite;
  font-weight: bold;
}
@keyframes blink { 50% { opacity: 0; } }

/* Workspace row hover */
.ws-row:hover { background: rgba(255,255,255,0.06); }

/* Workspace panel slide transition */
.slide-panel-enter-active,
.slide-panel-leave-active { transition: width 0.22s ease, opacity 0.22s ease; overflow: hidden; }
.slide-panel-enter-from,
.slide-panel-leave-to   { width: 0 !important; opacity: 0; }
</style>

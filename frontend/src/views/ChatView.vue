<template>
  <div class="chat-root">

    <!-- Toolbar -->
    <div class="chat-toolbar">
      <div class="d-flex align-center gap-2">
        <div class="toolbar-icon">
          <v-icon size="14" color="#6366F1">mdi-chat-processing-outline</v-icon>
        </div>
        <span class="chat-toolbar__title">Realtime Chat</span>
        <span class="chat-toolbar__sep" />
        <span class="chat-toolbar__hint">Multi-agent pipeline</span>
      </div>
      <div class="d-flex align-center gap-2">
        <v-select
          v-model="projectId"
          :items="projectItems"
          item-title="title"
          item-value="id"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width:160px;font-size:12px"
          label="Project"
          @update:model-value="onProjectChange"
          prepend-inner-icon="mdi-folder-outline"
        />
        <v-select
          v-model="sessionId"
          :items="sessionItems"
          item-title="label"
          item-value="id"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width:160px;font-size:12px"
          label="Session"
        />
        <v-btn size="x-small" variant="text" icon="mdi-plus" @click="newSession"
          style="color:rgba(226,232,240,0.45)" title="New session" />
        <v-btn size="x-small" variant="text" icon="mdi-delete-outline" @click="clearSession"
          style="color:rgba(226,232,240,0.45)" title="Clear session" />
        <div style="width:1px;height:18px;background:rgba(255,255,255,0.08)" />
        <v-btn size="x-small" variant="text"
          :icon="showWorkspace ? 'mdi-folder-open-outline' : 'mdi-folder-outline'"
          :color="showWorkspace ? '#6366F1' : 'rgba(226,232,240,0.45)'"
          @click="showWorkspace = !showWorkspace" title="Toggle workspace"
        />
      </div>
    </div>

    <!-- Body -->
    <div class="chat-body">

      <!-- Messages -->
      <div ref="messagesEl" class="messages-pane">

        <div v-for="msg in messages" :key="msg.id || msg.ts" class="msg-wrap"
          :class="msg.role === 'user' ? 'msg-wrap--user' : 'msg-wrap--agent'">
          <div class="msg-inner">
            <v-chip v-if="msg.role !== 'user'" size="x-small"
              :color="agentColor(msg.agent_id)" variant="tonal" class="mb-1"
              prepend-icon="mdi-robot">
              {{ msg.agent_id || 'agent' }}
            </v-chip>
            <div :class="['msg-bubble', msg.role === 'user' ? 'msg-bubble--user' : 'msg-bubble--agent']">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-html="renderMarkdown(msg.content)" />
            </div>
            <div class="msg-time">{{ formatTime(msg.ts) }}</div>
          </div>
        </div>

        <!-- Live streaming bubble -->
        <div v-if="isStreaming" class="msg-wrap msg-wrap--agent">
          <div class="msg-inner">
            <v-chip size="x-small" :color="agentColor(streamingAgentId)" variant="tonal"
              class="mb-1" prepend-icon="mdi-robot">
              {{ streamingAgentId || 'agent' }}
            </v-chip>
            <div class="msg-bubble msg-bubble--agent msg-bubble--streaming">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-html="renderMarkdown(streamingContent)" /><span class="cursor">▍</span>
            </div>
          </div>
        </div>

        <!-- Thinking indicator -->
        <div v-if="(typing || sending) && !isStreaming" class="msg-wrap msg-wrap--agent">
          <div class="thinking-bubble">
            <span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" />
            <span v-if="activeAgent" class="thinking-agent">
              <v-chip size="x-small" :color="agentColor(activeAgent)" variant="tonal" class="ml-2">{{ activeAgent }}</v-chip>
              thinking…
            </span>
            <span v-else class="thinking-agent ml-2">Agent thinking…</span>
          </div>
        </div>

        <div ref="bottomAnchor" />
      </div>

      <!-- Workspace panel -->
      <transition name="slide-panel">
        <div v-if="showWorkspace" class="workspace-panel">
          <div class="workspace-panel__header">
            <div class="d-flex align-center gap-1">
              <v-icon size="13" color="#6366F1">mdi-folder-cog</v-icon>
              <span style="font-size:12px;font-weight:600">Workspace</span>
              <v-tooltip :text="workspacePath" location="bottom">
                <template #activator="{ props }">
                  <v-chip v-bind="props" size="x-small" color="primary" variant="tonal"
                    style="max-width:100px;overflow:hidden;text-overflow:ellipsis">
                    {{ workspacePath }}
                  </v-chip>
                </template>
              </v-tooltip>
            </div>
            <v-btn size="x-small" icon="mdi-refresh" variant="text" @click="loadWorkspace"
              :loading="loadingWorkspace" />
          </div>
          <div class="workspace-panel__body">
            <template v-if="!workspaceTree.length">
              <div class="workspace-empty">
                <v-icon size="32" style="color:rgba(226,232,240,0.2)">mdi-folder-open-outline</v-icon>
                <div style="font-size:12px;color:rgba(226,232,240,0.3);margin-top:6px">Workspace is empty</div>
              </div>
            </template>
            <workspace-node v-for="node in workspaceTree" :key="node.path"
              :node="node" :depth="0" @open="openFile" />
          </div>
        </div>
      </transition>
    </div>

    <!-- Input bar -->
    <div class="chat-input-bar">
      <div class="chat-input-wrap">
        <v-textarea
          v-model="input"
          placeholder="Describe your goal… (Enter to send, Shift+Enter for newline)"
          rows="2" max-rows="6" auto-grow hide-details variant="outlined" density="compact"
          :disabled="sending"
          @keydown.enter.exact.prevent="sendMessage"
          @keydown.shift.enter.exact="insertNewline"
          style="font-size:14px"
        />
        <div class="chat-input-hint">
          <span>Enter to send</span>
          <span>·</span>
          <span>Shift+Enter for newline</span>
        </div>
      </div>
      <div class="chat-input-actions">
        <v-btn
          color="error" variant="tonal" icon="mdi-stop-circle-outline" size="38"
          :disabled="!sending && !isStreaming && !typing"
          @click="stopChat" title="Stop generation" />
        <v-btn color="primary" :loading="sending" :disabled="!input.trim() || sending"
          @click="sendMessage" icon="mdi-send" size="38"
          style="box-shadow:0 2px 12px rgba(99,102,241,0.25)" />
      </div>
    </div>

    <!-- File viewer dialog -->
    <v-dialog v-model="fileDialog.show" max-width="860">
      <v-card rounded="lg">
        <div class="file-dialog-title">
          <div class="d-flex align-center gap-2">
            <v-icon size="16" color="#6366F1">mdi-file-code-outline</v-icon>
            <span style="font-size:13px;font-weight:600">{{ fileDialog.path }}</span>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="fileDialog.show = false" />
        </div>
        <pre class="file-dialog-content">{{ fileDialog.content }}</pre>
      </v-card>
    </v-dialog>
  </div>
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
    return () => h('div', { style: `padding-left:${props.depth * 12}px` }, [
      h('div', {
        style: 'display:flex;align-items:center;gap:5px;padding:4px 8px;cursor:pointer;border-radius:6px',
        class: 'ws-row',
        onClick: () => props.node.type === 'dir' ? (expanded.value = !expanded.value) : emit('open', props.node),
      }, [
        h('v-icon', { size: 12, color: props.node.type === 'dir' ? '#6366F1' : 'rgba(226,232,240,0.4)' },
          () => props.node.type === 'dir' ? (expanded.value ? 'mdi-folder-open' : 'mdi-folder') : fileIcon(props.node.name)),
        h('span', { style: 'flex:1;font-family:monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#CBD5E1' },
          props.node.name),
        props.node.type === 'file'
          ? h('span', { style: 'font-size:10px;color:rgba(226,232,240,0.3);flex-shrink:0' }, fmtSize(props.node.size))
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
const sessionId  = ref(localStorage.getItem('chatSessionId') || uuidv4());
const projectId  = ref(null);
const projects   = ref([]);
const projectItems = computed(() => [
  { id: null, title: 'No Project (global)' },
  ...projects.value.map(p => ({ id: p.id, title: p.title })),
]);
const sessions = ref([]);
const messagesEl = ref(null);
const bottomAnchor = ref(null);

const isStreaming = ref(false);
const streamingContent = ref('');
const streamingAgentId = ref('worker');
const activeAgent = ref(null);

const showWorkspace = ref(false);
const workspaceTree = ref([]);
const workspacePath = ref('./workspace');
const loadingWorkspace = ref(false);
const fileDialog = ref({ show: false, path: '', content: '' });

const sessionItems = computed(() =>
  sessions.value.map(s => ({ id: s.id, label: `${s.id.slice(0, 8)} (${s.message_count})` }))
);

// ── Helpers ───────────────────────────────────────────────────────────────
function agentColor(id) {
  return { researcher: 'info', planner: 'primary', worker: 'success', reviewer: 'warning', workflow: 'secondary', system: 'error' }[id] || 'primary';
}
function renderMarkdown(text) {
  try { return marked.parse(text || ''); } catch { return text || ''; }
}
function formatTime(ts) { return ts ? new Date(Number(ts)).toLocaleTimeString() : ''; }
async function scrollBottom() {
  await nextTick();
  bottomAnchor.value?.scrollIntoView({ behavior: 'smooth' });
}

// ── Projects ───────────────────────────────────────────────────────────────
async function loadProjects() {
  try { projects.value = await axios.get('/api/projects').then(r => r.data); }
  catch { projects.value = []; }
}

function onProjectChange(id) {
  projectId.value = id;
  // Switch session to a project-scoped session so STM is isolated per project
  const newSession = id ? `proj_${id}` : (localStorage.getItem('chatSessionId') || uuidv4());
  sessionId.value = newSession;
  if (!id) localStorage.setItem('chatSessionId', newSession);
  messages.value = [];
  streamingContent.value = '';
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
  try { await axios.post(`/api/chat/stop/${sessionId.value}`); } catch { /* best-effort */ }
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
    const { data } = await axios.post('/api/chat/message', { content, sessionId: sessionId.value, projectId: projectId.value });
    localStorage.setItem('chatSessionId', sessionId.value);
    loadSessions();
    if (data?.content) {
      isStreaming.value = false;
      streamingContent.value = '';
      activeAgent.value = null;
      // Backend already combines streamBuffer + finalAnswer into data.content
      messages.value.push({ role: 'assistant', content: data.content, ts: Date.now(), agent_id: data.agentId || 'workflow' });
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
  // Auto-select project from URL query param (linked from ProjectsView)
  const urlParams = new URLSearchParams(window.location.search);
  const urlProjectId = urlParams.get('projectId');
  if (urlProjectId) {
    projectId.value = urlProjectId;
    sessionId.value = `proj_${urlProjectId}`;
    messages.value = [];
  }

  loadProjects();
  loadHistory();
  loadSessions();

  socket.on('agent:status', (data) => {
    if (data.status === 'working') activeAgent.value = data.agentId;
    else if (data.status === 'idle' && activeAgent.value === data.agentId) activeAgent.value = null;
  });

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

  // Only hide the streaming bubble — do NOT clear streamingContent here.
  // sendMessage reads it after the HTTP response resolves; clearing it early
  // would cause the socket event (which fires before HTTP) to wipe the content.
  socket.on('chat:response', (data) => {
    if (data.sessionId !== sessionId.value) return;
    isStreaming.value = false;
    activeAgent.value = null;
  });

  socket.on('chat:typing', (data) => {
    if (!data.sessionId || data.sessionId === sessionId.value) {
      typing.value = data.typing;
      if (data.typing) scrollBottom();
    }
  });

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
/* ── Layout ─────────────────────────────────────────────────────────────── */
.chat-root {
  height: calc(100vh - 56px);
  display: flex; flex-direction: column;
  background: #08080F;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.chat-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px;
  height: 46px; flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: #0C0C18;
}
.toolbar-icon {
  width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0;
  background: rgba(99,102,241,0.12);
  display: flex; align-items: center; justify-content: center;
}
.chat-toolbar__title { font-size: 13px; font-weight: 600; letter-spacing: -0.2px; }
.chat-toolbar__sep { width: 1px; height: 14px; background: rgba(255,255,255,0.08); }
.chat-toolbar__hint { font-size: 11px; color: rgba(226,232,240,0.3) !important; }

/* ── Body ─────────────────────────────────────────────────────────────────── */
.chat-body { flex: 1; display: flex; overflow: hidden; }

/* ── Messages pane ───────────────────────────────────────────────────────── */
.messages-pane {
  flex: 1; overflow-y: auto;
  padding: 20px 16px;
  display: flex; flex-direction: column; gap: 4px;
}

/* ── Message wrapper ─────────────────────────────────────────────────────── */
.msg-wrap { display: flex; }
.msg-wrap--user  { justify-content: flex-end; }
.msg-wrap--agent { justify-content: flex-start; }

.msg-inner { max-width: 72%; display: flex; flex-direction: column; }
.msg-wrap--user .msg-inner { align-items: flex-end; }

/* ── Bubbles ─────────────────────────────────────────────────────────────── */
.msg-bubble {
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.65;
  word-break: break-word;
}
.msg-bubble--user {
  background: linear-gradient(135deg, #6366F1 0%, #7C3AED 100%);
  border-bottom-right-radius: 4px;
  color: #fff !important;
  box-shadow: 0 2px 12px rgba(99,102,241,0.2);
}
.msg-bubble--agent {
  background: #13131F;
  border: 1px solid rgba(255,255,255,0.07);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.2);
}
.msg-bubble--streaming {
  border-color: rgba(99,102,241,0.25) !important;
  box-shadow: 0 0 0 1px rgba(99,102,241,0.08) !important;
}

/* Markdown inside bubbles */
.msg-bubble :deep(p)    { margin: 0 0 8px; }
.msg-bubble :deep(p:last-child) { margin-bottom: 0; }
.msg-bubble :deep(pre)  {
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.07);
  padding: 12px 14px; border-radius: 8px; margin: 8px 0; overflow-x: auto;
}
.msg-bubble :deep(code) { font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 12.5px; }
.msg-bubble :deep(:not(pre) > code) {
  background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px;
  font-size: 12.5px;
}
.msg-bubble :deep(h1), .msg-bubble :deep(h2), .msg-bubble :deep(h3) {
  margin: 10px 0 6px; font-weight: 700; line-height: 1.3;
}
.msg-bubble :deep(h1) { font-size: 16px; }
.msg-bubble :deep(h2) { font-size: 14px; }
.msg-bubble :deep(h3) { font-size: 13px; }
.msg-bubble :deep(ul), .msg-bubble :deep(ol) { padding-left: 20px; margin: 6px 0; }
.msg-bubble :deep(li) { margin-bottom: 3px; }
.msg-bubble :deep(hr)   { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0; }
.msg-bubble :deep(blockquote) {
  border-left: 3px solid rgba(99,102,241,0.5); margin: 8px 0;
  padding: 4px 12px; color: rgba(226,232,240,0.7) !important;
}
.msg-bubble :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
.msg-bubble :deep(th), .msg-bubble :deep(td) {
  padding: 6px 10px; border: 1px solid rgba(255,255,255,0.08); text-align: left;
}
.msg-bubble :deep(th) { background: rgba(99,102,241,0.1); font-weight: 600; }

.msg-time {
  font-size: 10px;
  color: rgba(226,232,240,0.3) !important;
  margin-top: 4px;
  padding: 0 2px;
}

/* ── Cursor ──────────────────────────────────────────────────────────────── */
.cursor {
  display: inline-block;
  color: #6366F1 !important;
  animation: blink 0.55s step-end infinite;
  font-weight: bold;
  margin-left: 1px;
}
@keyframes blink { 50% { opacity: 0; } }

/* ── Thinking ────────────────────────────────────────────────────────────── */
.thinking-bubble {
  display: flex; align-items: center;
  padding: 10px 14px;
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px; border-bottom-left-radius: 4px;
}
.thinking-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(226,232,240,0.4);
  margin: 0 2px;
  animation: bounce 1.2s ease-in-out infinite;
}
.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-5px); }
}
.thinking-agent { font-size: 12px; color: rgba(226,232,240,0.45) !important; }

/* ── Input bar ───────────────────────────────────────────────────────────── */
.chat-input-bar {
  display: flex; align-items: flex-end; gap: 10px;
  padding: 10px 14px 12px;
  background: #0C0C18;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.chat-input-wrap { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.chat-input-hint {
  display: flex; gap: 6px; padding: 0 2px;
  font-size: 10px; color: rgba(226,232,240,0.2) !important;
}
.chat-input-actions { display: flex; flex-direction: column; gap: 6px; padding-bottom: 2px; }

/* ── Workspace panel ─────────────────────────────────────────────────────── */
.workspace-panel {
  width: 280px; min-width: 240px; flex-shrink: 0;
  border-left: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column;
  background: #0D0D1A;
}
.workspace-panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.workspace-panel__body { flex: 1; overflow-y: auto; padding: 6px 0; }
.workspace-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 120px; padding: 16px;
}
.ws-row:hover { background: rgba(255,255,255,0.04) !important; }

/* ── File dialog ─────────────────────────────────────────────────────────── */
.file-dialog-title {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.file-dialog-content {
  overflow: auto; max-height: 70vh;
  padding: 16px; font-size: 13px;
  background: #08080F !important;
  margin: 0;
  white-space: pre-wrap;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

/* ── Panel slide transition ─────────────────────────────────────────────── */
.slide-panel-enter-active, .slide-panel-leave-active { transition: width 0.2s ease, opacity 0.2s ease; overflow: hidden; }
.slide-panel-enter-from, .slide-panel-leave-to { width: 0 !important; opacity: 0; }

.gap-2 { gap: 8px; }
</style>

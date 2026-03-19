<template>
  <div class="chat-root">

    <!-- ── Header ───────────────────────────────────────────────────────────── -->
    <div class="chat-header">
      <div class="chat-header__left">
        <div class="chat-header__avatar">
          <v-icon size="16" color="#A78BFA">mdi-robot-outline</v-icon>
        </div>
        <div class="chat-header__info">
          <div class="chat-header__name">
            <span v-if="selectedProject" class="proj-badge">
              <v-icon size="10" color="#A78BFA">mdi-folder-outline</v-icon>
              {{ selectedProject.title }}
            </span>
            <span v-else>AI Assistant</span>
          </div>
          <div class="chat-header__status">
            <span class="status-dot" :class="activeAgent ? 'status-dot--active' : 'status-dot--online'" />
            <span>{{ activeAgent ? `${activeAgent} thinking…` : 'Online' }}</span>
          </div>
        </div>
      </div>

      <div class="chat-header__right">
        <!-- Project selector -->
        <div class="header-select-wrap">
          <v-icon size="13" color="rgba(226,232,240,0.35)">mdi-folder-outline</v-icon>
          <select class="header-select" v-model="projectId" @change="onProjectChange(projectId)">
            <option :value="null" disabled hidden>Select project…</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
        </div>
        <!-- Session selector -->
        <div class="header-select-wrap">
          <v-icon size="13" color="rgba(226,232,240,0.35)">mdi-clock-outline</v-icon>
          <select class="header-select" v-model="sessionId">
            <option v-for="s in sessions" :key="s.id" :value="s.id">
              {{ s.id.slice(0, 10) }}… ({{ s.message_count }})
            </option>
          </select>
        </div>
        <div class="header-divider" />
        <!-- New / Clear / Workspace -->
        <button class="header-icon-btn" title="New session" @click="newSession">
          <v-icon size="16">mdi-plus</v-icon>
        </button>
        <button class="header-icon-btn" title="Clear session" @click="clearSession">
          <v-icon size="16">mdi-delete-outline</v-icon>
        </button>
        <button class="header-icon-btn" :class="{ 'header-icon-btn--active': showWorkspace }"
          title="Workspace files" @click="showWorkspace = !showWorkspace">
          <v-icon size="16">mdi-folder-outline</v-icon>
        </button>
      </div>
    </div>

    <!-- ── Body ─────────────────────────────────────────────────────────────── -->
    <div class="chat-body">

      <!-- Messages -->
      <div ref="messagesEl" class="messages-pane">

        <!-- No project selected gate -->
        <div v-if="!projectId" class="chat-empty">
          <div class="chat-empty__icon">
            <v-icon size="32" color="#6366F1">mdi-folder-open-outline</v-icon>
          </div>
          <div class="chat-empty__title">Select a project to start</div>
          <div class="chat-empty__sub">Choose a project from the dropdown above before chatting.</div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!messages.length && !isStreaming && !typing && !sending" class="chat-empty">
          <div class="chat-empty__icon">
            <v-icon size="32" color="#6366F1">mdi-robot-outline</v-icon>
          </div>
          <div class="chat-empty__title">How can I help you?</div>
          <div class="chat-empty__sub">
            {{ selectedProject ? `Working on: ${selectedProject.title}` : 'Ask me anything or describe a goal to build.' }}
          </div>
          <div class="chat-empty__hints">
            <button class="hint-chip" @click="input = 'Build a REST API with JWT authentication'">Build a REST API</button>
            <button class="hint-chip" @click="input = 'Create a responsive landing page with HTML and CSS'">Landing page</button>
            <button class="hint-chip" @click="input = 'Set up a Node.js Express server with SQLite'">Express + SQLite</button>
          </div>
        </div>

        <!-- Message list -->
        <template v-for="(msg, idx) in messages" :key="msg.id || msg.ts">
          <!-- Date separator -->
          <div v-if="showDateSep(idx)" class="date-sep">
            <span>{{ formatDate(msg.ts) }}</span>
          </div>

          <!-- User message -->
          <div v-if="msg.role === 'user'" class="msg-group msg-group--user">
            <div class="msg-row msg-row--user">
              <div class="user-bubble">
                <span>{{ msg.content }}</span>
              </div>
            </div>
            <div class="msg-time msg-time--user">{{ formatTime(msg.ts) }}</div>
          </div>

          <!-- Agent message -->
          <div v-else class="msg-group msg-group--agent"
            :class="{ 'msg-group--continued': isContinued(idx) }">
            <div class="msg-row msg-row--agent">
              <div v-if="!isContinued(idx)" class="agent-avatar"
                :style="`background:${agentBg(msg.agent_id)};border-color:${agentBorder(msg.agent_id)}`">
                <v-icon size="14" :color="agentAccent(msg.agent_id)">{{ agentIcon(msg.agent_id) }}</v-icon>
              </div>
              <div v-else class="agent-avatar-spacer" />
              <div class="agent-bubble-wrap">
                <div v-if="!isContinued(idx)" class="agent-name" :style="`color:${agentAccent(msg.agent_id)}`">
                  {{ msg.agent_id || 'assistant' }}
                </div>
                <div class="agent-bubble">
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <span v-html="renderMarkdown(msg.content)" />
                </div>
                <div class="msg-time">{{ formatTime(msg.ts) }}</div>
              </div>
            </div>
          </div>
        </template>

        <!-- Live streaming bubble -->
        <div v-if="isStreaming" class="msg-group msg-group--agent">
          <div class="msg-row msg-row--agent">
            <div class="agent-avatar"
              :style="`background:${agentBg(streamingAgentId)};border-color:${agentBorder(streamingAgentId)}`">
              <v-icon size="14" :color="agentAccent(streamingAgentId)">{{ agentIcon(streamingAgentId) }}</v-icon>
            </div>
            <div class="agent-bubble-wrap">
              <div class="agent-name" :style="`color:${agentAccent(streamingAgentId)}`">
                {{ streamingAgentId || 'assistant' }}
              </div>
              <div class="agent-bubble agent-bubble--streaming">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <span v-html="renderMarkdown(displayContent)" /><span class="typing-cursor">|</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Thinking indicator -->
        <div v-if="(typing || sending) && !isStreaming" class="msg-group msg-group--agent">
          <div class="msg-row msg-row--agent">
            <div class="agent-avatar"
              :style="`background:${agentBg(activeAgent || 'worker')};border-color:${agentBorder(activeAgent || 'worker')}`">
              <v-icon size="14" :color="agentAccent(activeAgent || 'worker')">{{ agentIcon(activeAgent || 'worker') }}</v-icon>
            </div>
            <div class="agent-bubble-wrap">
              <div class="agent-name" :style="`color:${agentAccent(activeAgent || 'worker')}`">
                {{ activeAgent || 'assistant' }}
              </div>
              <div class="thinking-bubble">
                <span class="dot" /><span class="dot" /><span class="dot" />
              </div>
            </div>
          </div>
        </div>

        <div ref="bottomAnchor" style="height:4px" />
      </div>

      <!-- Workspace panel -->
      <transition name="slide-panel">
        <div v-if="showWorkspace" class="workspace-panel">
          <div class="workspace-panel__header">
            <div class="d-flex align-center gap-2">
              <v-icon size="13" color="#6366F1">mdi-folder-cog</v-icon>
              <span style="font-size:12px;font-weight:600">Workspace</span>
            </div>
            <button class="header-icon-btn" @click="loadWorkspace" title="Refresh">
              <v-icon size="15" :class="{ 'mdi-spin': loadingWorkspace }">mdi-refresh</v-icon>
            </button>
          </div>
          <div class="workspace-panel__body">
            <div v-if="!workspaceTree.length" class="workspace-empty">
              <v-icon size="32" style="color:rgba(226,232,240,0.15)">mdi-folder-open-outline</v-icon>
              <div style="font-size:12px;color:rgba(226,232,240,0.3);margin-top:6px">Empty workspace</div>
            </div>
            <workspace-node v-for="node in workspaceTree" :key="node.path"
              :node="node" :depth="0" @open="openFile" />
          </div>
        </div>
      </transition>
    </div>

    <!-- ── Input bar ─────────────────────────────────────────────────────────── -->
    <div class="input-bar">
      <div class="input-wrap" :class="{ 'input-wrap--active': inputFocused }">
        <textarea
          ref="inputEl"
          v-model="input"
          class="chat-textarea"
          :placeholder="projectId ? 'Message…' : 'Select a project first…'"
          rows="1"
          :disabled="sending || !projectId"
          @focus="inputFocused = true"
          @blur="inputFocused = false"
          @keydown.enter.exact.prevent="sendMessage"
          @keydown.shift.enter.exact="insertNewline"
          @input="autoResize"
        />
        <div class="input-actions">
          <button v-if="sending || isStreaming || typing"
            class="stop-btn" @click="stopChat" title="Stop">
            <v-icon size="16">mdi-stop-circle-outline</v-icon>
          </button>
          <button v-if="canContinue"
            class="continue-btn" @click="continueChat" title="Force LLM to continue from where it left off">
            <v-icon size="15">mdi-play-circle-outline</v-icon>
            Continue
          </button>
          <button class="send-btn" :class="{ 'send-btn--active': input.trim() && !sending && projectId }"
            :disabled="!input.trim() || sending || !projectId" @click="sendMessage" title="Send (Enter)">
            <v-icon size="18">mdi-send</v-icon>
          </button>
        </div>
      </div>
      <div class="input-hint">
        <span>Enter to send · Shift+Enter for newline</span>
      </div>
    </div>

    <!-- File viewer dialog -->
    <v-dialog v-model="fileDialog.show" max-width="860">
      <v-card rounded="lg" style="background:#0C0C18">
        <div class="file-dialog-title">
          <div class="d-flex align-center gap-2">
            <v-icon size="15" color="#6366F1">mdi-file-code-outline</v-icon>
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

// ── Workspace tree ─────────────────────────────────────────────────────────
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
        h('span', { style: 'flex:1;font-family:monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#CBD5E1' }, props.node.name),
        props.node.type === 'file'
          ? h('span', { style: 'font-size:10px;color:rgba(226,232,240,0.3);flex-shrink:0' }, fmtSize(props.node.size)) : null,
      ]),
      expanded.value && props.node.children?.map(child =>
        h(WorkspaceNode, { node: child, depth: props.depth + 1, onOpen: n => emit('open', n) })
      ),
    ]);
  },
});

// ── State ──────────────────────────────────────────────────────────────────
const socket = useSocket();
const input       = ref('');
const inputFocused = ref(false);
const sending     = ref(false);
const typing      = ref(false);
const messages    = ref([]);
const sessionId   = ref(localStorage.getItem('chatSessionId') || uuidv4());
const projectId   = ref(null);
const projects    = ref([]);
const sessions    = ref([]);
const messagesEl  = ref(null);
const bottomAnchor = ref(null);
const inputEl     = ref(null);
const activeAgent = ref(null);

const isStreaming      = ref(false);
const streamingContent = ref('');   // full accumulated raw text
const displayContent   = ref('');   // char-by-char revealed text
const streamingAgentId = ref('worker');

const showWorkspace    = ref(false);
const workspaceTree    = ref([]);
const workspacePath    = ref('./workspace');
const loadingWorkspace = ref(false);
const fileDialog       = ref({ show: false, path: '', content: '' });

// ── Typing animation queue ─────────────────────────────────────────────────
const _charQueue = [];
let _typingTimer = null;
const CHARS_PER_TICK = 4;   // chars revealed per tick
const TICK_MS        = 10;  // ms between ticks → ~400 chars/sec smooth reveal

function _flushQueue() {
  if (_charQueue.length === 0) { _typingTimer = null; return; }
  const batch = _charQueue.splice(0, CHARS_PER_TICK).join('');
  displayContent.value += batch;
  _typingTimer = setTimeout(_flushQueue, TICK_MS);
  // scroll only every 5 flushes to reduce jank
  if (_charQueue.length % 20 === 0) scrollBottom();
}

function _enqueueChunk(chunk) {
  _charQueue.push(...chunk.split(''));
  if (!_typingTimer) _typingTimer = setTimeout(_flushQueue, 0);
}

function _drainQueue() {
  clearTimeout(_typingTimer);
  _typingTimer = null;
  if (_charQueue.length) {
    displayContent.value += _charQueue.splice(0).join('');
  }
}

// ── Agent styling ──────────────────────────────────────────────────────────
const AGENT_STYLES = {
  researcher: { bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)',  accent: '#A5B4FC', icon: 'mdi-magnify' },
  planner:    { bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.2)',   accent: '#67E8F9', icon: 'mdi-sitemap-outline' },
  worker:     { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)',   accent: '#86EFAC', icon: 'mdi-code-braces' },
  reviewer:   { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)',   accent: '#FDE68A', icon: 'mdi-check-decagram-outline' },
  workflow:   { bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)', accent: '#C4B5FD', icon: 'mdi-graph-outline' },
  system:     { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',    accent: '#FCA5A5', icon: 'mdi-alert-circle-outline' },
};
const DEFAULT_STYLE = { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', accent: '#A5B4FC', icon: 'mdi-robot-outline' };

function agentStyle(id)   { return AGENT_STYLES[id] || DEFAULT_STYLE; }
function agentBg(id)      { return agentStyle(id).bg; }
function agentBorder(id)  { return agentStyle(id).border; }
function agentAccent(id)  { return agentStyle(id).accent; }
function agentIcon(id)    { return agentStyle(id).icon; }

// ── Computed helpers ───────────────────────────────────────────────────────
const selectedProject = computed(() => projects.value.find(p => p.id === projectId.value) || null);

function isContinued(idx) {
  if (idx === 0) return false;
  const cur  = messages.value[idx];
  const prev = messages.value[idx - 1];
  return prev && cur.role === prev.role && cur.agent_id === prev.agent_id &&
    cur.role !== 'user' &&
    (Number(cur.ts) - Number(prev.ts)) < 60000; // same minute
}

function showDateSep(idx) {
  if (idx === 0) return true;
  const cur  = new Date(Number(messages.value[idx].ts)).toDateString();
  const prev = new Date(Number(messages.value[idx - 1].ts)).toDateString();
  return cur !== prev;
}

function formatDate(ts) {
  const d = new Date(Number(ts));
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(Number(ts)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(text) {
  try { return marked.parse(text || ''); } catch { return text || ''; }
}

async function scrollBottom(smooth = true) {
  await nextTick();
  bottomAnchor.value?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
}

function autoResize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function insertNewline() { input.value += '\n'; nextTick(autoResize); }

// ── Projects ───────────────────────────────────────────────────────────────
async function loadProjects() {
  try { projects.value = await axios.get('/api/projects').then(r => r.data); }
  catch { projects.value = []; }
}

function onProjectChange(id) {
  projectId.value = id;
  const newSession = id ? `proj_${id}` : (localStorage.getItem('chatSessionId') || uuidv4());
  sessionId.value = newSession;
  if (!id) localStorage.setItem('chatSessionId', newSession);
  messages.value = [];
  streamingContent.value = '';
  displayContent.value = '';
  _drainQueue();
}

// ── Workspace ──────────────────────────────────────────────────────────────
async function loadWorkspace() {
  loadingWorkspace.value = true;
  try {
    const params = projectId.value ? { projectId: projectId.value } : {};
    const { data } = await axios.get('/api/workspace/files', { params });
    workspaceTree.value = data.tree || [];
    workspacePath.value = data.workspace || './workspace';
  } catch { workspaceTree.value = []; }
  finally { loadingWorkspace.value = false; }
}
async function openFile(node) {
  try {
    const params = { path: node.path, ...(projectId.value ? { projectId: projectId.value } : {}) };
    const { data } = await axios.get('/api/workspace/file', { params });
    fileDialog.value = { show: true, path: node.path, content: data.content };
  } catch (e) { fileDialog.value = { show: true, path: node.path, content: `Error: ${e.message}` }; }
}

// ── Chat ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const { data } = await axios.get(`/api/chat/history/${sessionId.value}`);
    messages.value = data;
    await scrollBottom(false);
  } catch { messages.value = []; }
}
async function loadSessions() {
  try { const { data } = await axios.get('/api/chat/sessions'); sessions.value = data; }
  catch { sessions.value = []; }
}
function newSession() {
  sessionId.value = uuidv4();
  messages.value = [];
  isStreaming.value = false;
  streamingContent.value = '';
  displayContent.value = '';
  _drainQueue();
}
async function clearSession() {
  await axios.delete(`/api/chat/sessions/${sessionId.value}`);
  messages.value = [];
}

async function stopChat() {
  try { await axios.post(`/api/chat/stop/${sessionId.value}`); } catch { /* best-effort */ }
  _drainQueue();
  sending.value = false;
  typing.value = false;
  isStreaming.value = false;
  streamingContent.value = '';
  displayContent.value = '';
}

const canContinue = computed(() =>
  !sending.value && !isStreaming.value && !typing.value &&
  messages.value.length > 0 &&
  messages.value[messages.value.length - 1].role === 'assistant'
);

async function continueChat() {
  if (sending.value || isStreaming.value) return;
  const lastMsg = messages.value[messages.value.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant') return;
  const lastChars = lastMsg.content.slice(-120);
  const continuationPrompt =
    `Continue your previous response from exactly where it left off.\n` +
    `The last characters were: ...${lastChars}\n\n` +
    `Output ONLY the remaining content — do not repeat anything already written.`;
  input.value = continuationPrompt;
  await sendMessage();
}

async function sendMessage() {
  if (!input.value.trim() || sending.value) return;
  const content = input.value.trim();
  input.value = '';
  // Reset textarea height
  if (inputEl.value) inputEl.value.style.height = 'auto';
  sending.value = true;
  messages.value.push({ role: 'user', content, ts: Date.now() });
  await scrollBottom();
  try {
    const { data } = await axios.post('/api/chat/message', {
      content, sessionId: sessionId.value, projectId: projectId.value,
    });
    localStorage.setItem('chatSessionId', sessionId.value);
    loadSessions();
    if (data?.content) {
      // Drain any remaining queued chars immediately so the final bubble is clean
      _drainQueue();
      isStreaming.value = false;
      streamingContent.value = '';
      displayContent.value = '';
      activeAgent.value = null;
      messages.value.push({
        role: 'assistant', content: data.content,
        ts: Date.now(), agent_id: data.agentId || 'workflow',
      });
      await scrollBottom();
    }
  } catch (err) {
    messages.value.push({ role: 'assistant', content: `Error: ${err.message}`, ts: Date.now(), agent_id: 'system' });
  } finally {
    sending.value = false;
    isStreaming.value = false;
    await scrollBottom();
  }
}

// ── Watches ────────────────────────────────────────────────────────────────
watch(sessionId, () => {
  messages.value = [];
  isStreaming.value = false;
  streamingContent.value = '';
  displayContent.value = '';
  _drainQueue();
  loadHistory();
});
watch(showWorkspace, v => { if (v) loadWorkspace(); });

// ── Socket ─────────────────────────────────────────────────────────────────
onMounted(() => {
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
      displayContent.value = '';
      streamingAgentId.value = data.agentId || 'assistant';
      _drainQueue();
    }
    streamingContent.value += data.chunk;
    streamingAgentId.value = data.agentId || streamingAgentId.value;
    _enqueueChunk(data.chunk);
  });

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
    _drainQueue();
    isStreaming.value = false;
    streamingContent.value = '';
    displayContent.value = '';
    typing.value = false;
    sending.value = false;
    activeAgent.value = null;
  });

  socket.on('workspace:changed', () => { if (showWorkspace.value) loadWorkspace(); });

  onUnmounted(() => {
    _drainQueue();
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
/* ── Root ──────────────────────────────────────────────────────────────────── */
.chat-root {
  height: calc(100vh - 56px);
  display: flex; flex-direction: column;
  background: #09090F;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.chat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
  height: 52px; flex-shrink: 0;
  background: #0D0D1C;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.chat-header__left  { display: flex; align-items: center; gap: 10px; }
.chat-header__right { display: flex; align-items: center; gap: 6px; }

.chat-header__avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(99,102,241,0.15);
  border: 1px solid rgba(99,102,241,0.25);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.chat-header__info {}
.chat-header__name { font-size: 13px; font-weight: 700; color: #E2E8F0; }
.chat-header__status {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: rgba(226,232,240,0.4); margin-top: 1px;
}
.status-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.status-dot--online { background: #22C55E; }
.status-dot--active {
  background: #F59E0B;
  animation: pulse-status 1s ease-in-out infinite;
}
@keyframes pulse-status {
  0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
}
.proj-badge {
  display: inline-flex; align-items: center; gap: 4px;
  color: #C4B5FD; font-size: 13px; font-weight: 700;
}

/* Header select */
.header-select-wrap {
  display: flex; align-items: center; gap: 5px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 8px; padding: 4px 8px;
}
.header-select {
  background: transparent; border: none; outline: none;
  color: rgba(226,232,240,0.6); font-size: 11px; cursor: pointer;
  max-width: 120px;
}
.header-select option { background: #1A1A2E; color: #E2E8F0; }

.header-divider { width: 1px; height: 18px; background: rgba(255,255,255,0.07); margin: 0 2px; }

.header-icon-btn {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent;
  color: rgba(226,232,240,0.4); cursor: pointer;
  transition: all 0.15s;
}
.header-icon-btn:hover { background: rgba(255,255,255,0.06); color: #E2E8F0; }
.header-icon-btn--active {
  background: rgba(99,102,241,0.12) !important;
  border-color: rgba(99,102,241,0.25) !important;
  color: #A5B4FC !important;
}

/* ── Body ──────────────────────────────────────────────────────────────────── */
.chat-body { flex: 1; display: flex; overflow: hidden; }

/* ── Messages pane ─────────────────────────────────────────────────────────── */
.messages-pane {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 20px 24px;
  display: flex; flex-direction: column;
  scroll-behavior: smooth;
}
.messages-pane::-webkit-scrollbar { width: 4px; }
.messages-pane::-webkit-scrollbar-track { background: transparent; }
.messages-pane::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

/* ── Empty state ───────────────────────────────────────────────────────────── */
.chat-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 40px 20px; text-align: center;
}
.chat-empty__icon {
  width: 60px; height: 60px; border-radius: 50%;
  background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
}
.chat-empty__title { font-size: 18px; font-weight: 700; color: #E2E8F0; }
.chat-empty__sub   { font-size: 13px; color: rgba(226,232,240,0.4); max-width: 360px; }
.chat-empty__hints { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
.hint-chip {
  padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 500;
  background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2);
  color: #A5B4FC; cursor: pointer; transition: all 0.15s;
}
.hint-chip:hover { background: rgba(99,102,241,0.15); }

/* ── Date separator ────────────────────────────────────────────────────────── */
.date-sep {
  display: flex; align-items: center; justify-content: center;
  padding: 12px 0 6px;
}
.date-sep span {
  font-size: 11px; font-weight: 600; color: rgba(226,232,240,0.25);
  background: rgba(255,255,255,0.03);
  padding: 3px 12px; border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.05);
  letter-spacing: 0.3px;
}

/* ── Message groups ────────────────────────────────────────────────────────── */
.msg-group { display: flex; flex-direction: column; margin-bottom: 2px; }
.msg-group--user  { align-items: flex-end; margin-bottom: 8px; }
.msg-group--agent { align-items: flex-start; margin-bottom: 6px; }
.msg-group--continued { margin-top: -2px; }

.msg-row { display: flex; align-items: flex-end; gap: 8px; max-width: 78%; }
.msg-row--user  { flex-direction: row-reverse; }
.msg-row--agent { flex-direction: row; }

/* ── Agent avatar ──────────────────────────────────────────────────────────── */
.agent-avatar {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 2px;
}
.agent-avatar-spacer { width: 28px; flex-shrink: 0; }

/* ── Agent bubble ──────────────────────────────────────────────────────────── */
.agent-bubble-wrap { display: flex; flex-direction: column; gap: 2px; max-width: calc(100% - 36px); }
.agent-name {
  font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
  text-transform: capitalize; padding-left: 2px;
  margin-bottom: 2px;
}
.agent-bubble {
  background: #13131F;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 4px 18px 18px 18px;
  padding: 10px 14px;
  font-size: 14px; line-height: 1.7; color: #CBD5E1;
  word-break: break-word;
  box-shadow: 0 1px 8px rgba(0,0,0,0.25);
}
.agent-bubble--streaming {
  border-color: rgba(99,102,241,0.2);
  box-shadow: 0 0 0 1px rgba(99,102,241,0.06);
}

/* ── User bubble ───────────────────────────────────────────────────────────── */
.user-bubble {
  background: linear-gradient(135deg, #5B5CF6 0%, #7C3AED 100%);
  border-radius: 18px 4px 18px 18px;
  padding: 10px 16px;
  font-size: 14px; line-height: 1.65; color: #fff;
  word-break: break-word; white-space: pre-wrap;
  box-shadow: 0 2px 12px rgba(99,102,241,0.25);
}

/* Time */
.msg-time {
  font-size: 10px; color: rgba(226,232,240,0.25) !important;
  padding: 0 2px; margin-top: 2px;
}
.msg-time--user { text-align: right; padding-right: 2px; }

/* ── Markdown inside agent bubble ─────────────────────────────────────────── */
.agent-bubble :deep(p)    { margin: 0 0 8px; }
.agent-bubble :deep(p:last-child) { margin-bottom: 0; }
.agent-bubble :deep(pre) {
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.07);
  padding: 12px 14px; border-radius: 8px;
  margin: 8px 0; overflow-x: auto;
}
.agent-bubble :deep(code) {
  font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 12.5px;
}
.agent-bubble :deep(:not(pre) > code) {
  background: rgba(255,255,255,0.09); padding: 1px 5px; border-radius: 4px; font-size: 12.5px;
}
.agent-bubble :deep(h1),
.agent-bubble :deep(h2),
.agent-bubble :deep(h3) { margin: 10px 0 5px; font-weight: 700; }
.agent-bubble :deep(h1) { font-size: 16px; }
.agent-bubble :deep(h2) { font-size: 14px; }
.agent-bubble :deep(h3) { font-size: 13px; }
.agent-bubble :deep(ul),
.agent-bubble :deep(ol) { padding-left: 20px; margin: 6px 0; }
.agent-bubble :deep(li) { margin-bottom: 3px; }
.agent-bubble :deep(blockquote) {
  border-left: 3px solid rgba(99,102,241,0.5);
  margin: 8px 0; padding: 4px 12px;
  color: rgba(226,232,240,0.65) !important;
}
.agent-bubble :deep(table) { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
.agent-bubble :deep(th),
.agent-bubble :deep(td) { padding: 6px 10px; border: 1px solid rgba(255,255,255,0.08); }
.agent-bubble :deep(th) { background: rgba(99,102,241,0.1); font-weight: 600; }
.agent-bubble :deep(hr) { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 10px 0; }

/* ── Typing cursor ─────────────────────────────────────────────────────────── */
.typing-cursor {
  display: inline-block; margin-left: 1px;
  color: #6366F1 !important; font-weight: 300;
  animation: blink-cur 0.6s step-end infinite;
}
@keyframes blink-cur { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* ── Thinking dots ─────────────────────────────────────────────────────────── */
.thinking-bubble {
  display: flex; align-items: center; gap: 4px;
  padding: 12px 16px;
  background: #13131F;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 4px 18px 18px 18px;
}
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(226,232,240,0.35);
  animation: bounce-dot 1.2s ease-in-out infinite;
}
.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.30s; }
@keyframes bounce-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
  30% { transform: translateY(-5px); opacity: 0.9; }
}

/* ── Input bar ─────────────────────────────────────────────────────────────── */
.input-bar {
  flex-shrink: 0;
  padding: 10px 16px 14px;
  background: #0D0D1C;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.input-wrap {
  display: flex; align-items: flex-end; gap: 8px;
  background: #13131F;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 8px 8px 8px 16px;
  transition: border-color 0.2s;
}
.input-wrap--active { border-color: rgba(99,102,241,0.35); }

.chat-textarea {
  flex: 1; background: transparent; border: none; outline: none; resize: none;
  color: #E2E8F0; font-size: 14px; line-height: 1.6;
  min-height: 24px; max-height: 160px;
  font-family: inherit;
  scrollbar-width: thin;
}
.chat-textarea::placeholder { color: rgba(226,232,240,0.25); }

.input-actions { display: flex; align-items: flex-end; gap: 6px; padding-bottom: 1px; }

.send-btn {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; background: rgba(99,102,241,0.15); color: rgba(99,102,241,0.4);
  cursor: not-allowed; transition: all 0.15s;
}
.send-btn--active {
  background: #6366F1; color: #fff !important;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(99,102,241,0.35);
}
.send-btn--active:hover { background: #5558E3; }

.stop-btn {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.1);
  color: #FCA5A5; cursor: pointer; transition: all 0.15s;
}
.stop-btn:hover { background: rgba(239,68,68,0.2); }

.continue-btn {
  height: 36px; padding: 0 10px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500;
  border: 1px solid rgba(99,102,241,0.35); background: rgba(99,102,241,0.12);
  color: #A5B4FC; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.continue-btn:hover { background: rgba(99,102,241,0.22); color: #C7D2FE; }

.input-hint {
  font-size: 10px; color: rgba(226,232,240,0.18) !important;
  padding: 5px 4px 0;
}

/* ── Workspace panel ───────────────────────────────────────────────────────── */
.workspace-panel {
  width: 260px; min-width: 220px; flex-shrink: 0;
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
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; height: 100px; padding: 16px;
}
.ws-row:hover { background: rgba(255,255,255,0.04) !important; }

/* ── Panel slide ───────────────────────────────────────────────────────────── */
.slide-panel-enter-active,
.slide-panel-leave-active { transition: width 0.2s ease, opacity 0.2s ease; overflow: hidden; }
.slide-panel-enter-from,
.slide-panel-leave-to { width: 0 !important; opacity: 0; }

/* ── File dialog ───────────────────────────────────────────────────────────── */
.file-dialog-title {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.file-dialog-content {
  overflow: auto; max-height: 70vh;
  padding: 16px; font-size: 13px;
  background: #08080F !important; margin: 0;
  white-space: pre-wrap;
  font-family: 'JetBrains Mono','Fira Code',monospace;
}

.d-flex { display: flex; }
.align-center { align-items: center; }
.gap-2 { gap: 8px; }
</style>

<template>
  <div class="lm-root">

    <!-- ── Toolbar ────────────────────────────────────────────────────── -->
    <div class="lm-toolbar">

      <!-- File tabs -->
      <div class="file-tabs">
        <button
          v-for="f in FILES" :key="f.key"
          class="file-tab"
          :class="{ 'file-tab--active': activeFile === f.key }"
          @click="switchFile(f.key)"
        >
          <v-icon size="13">mdi-file-document-outline</v-icon>
          {{ f.label }}
          <span class="file-tab__count">{{ fileCounts[f.key] }}</span>
        </button>
      </div>

      <div class="toolbar-sep" />

      <!-- Level filter -->
      <div class="level-filters">
        <button
          v-for="lv in LEVELS" :key="lv.key"
          class="lv-pill"
          :class="{ 'lv-pill--active': levelFilter === lv.key }"
          :style="levelFilter === lv.key ? `--lc:${lv.color}` : ''"
          @click="levelFilter = levelFilter === lv.key ? '' : lv.key"
        >
          <span class="lv-dot" :style="`background:${lv.color}`" />
          {{ lv.label }}
        </button>
      </div>

      <div class="toolbar-sep" />

      <!-- Search -->
      <div class="search-wrap">
        <v-icon size="14" color="rgba(226,232,240,0.3)">mdi-magnify</v-icon>
        <input
          class="search-input"
          v-model="searchQuery"
          placeholder="Filter logs…"
          @keydown.escape="searchQuery = ''"
          autocomplete="off"
          spellcheck="false"
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
          <v-icon size="12">mdi-close</v-icon>
        </button>
      </div>

      <div class="toolbar-sep" />

      <!-- Actions -->
      <div class="toolbar-actions">
        <div class="stat-chip">
          <v-icon size="11" color="rgba(226,232,240,0.3)">mdi-format-list-numbered</v-icon>
          {{ filteredLines.length }} / {{ totalLines }} lines
        </div>
        <div class="stat-chip" v-if="fileSize">
          <v-icon size="11" color="rgba(226,232,240,0.3)">mdi-database-outline</v-icon>
          {{ formatSize(fileSize) }}
        </div>

        <!-- Live toggle -->
        <button class="action-btn" :class="liveMode ? 'action-btn--live' : ''" @click="toggleLive" :title="liveMode ? 'Pause live' : 'Enable live'">
          <span v-if="liveMode" class="live-dot" />
          <v-icon size="13">{{ liveMode ? 'mdi-pause' : 'mdi-play' }}</v-icon>
          {{ liveMode ? 'Live' : 'Paused' }}
        </button>

        <button class="action-btn" :class="{ 'action-btn--spin': loading }" @click="reload" title="Reload">
          <v-icon size="13">mdi-refresh</v-icon>
        </button>

        <button class="action-btn action-btn--danger" @click="confirmClearFiles = true" title="Empty log files">
          <v-icon size="13">mdi-file-remove-outline</v-icon>
        </button>
      </div>
    </div>

    <!-- ── Log terminal ───────────────────────────────────────────────── -->
    <div class="lm-terminal" ref="terminalEl" @scroll="onScroll">

      <div v-if="!filteredLines.length" class="term-empty">
        <v-icon size="32" color="rgba(255,255,255,0.06)">mdi-text-box-outline</v-icon>
        <span>{{ loading ? 'Loading…' : 'No log entries' }}</span>
      </div>

      <div
        v-for="(line, i) in filteredLines" :key="i"
        class="term-row"
        :class="`term-row--${line.level || 'info'}`"
      >
        <span class="term-ln">{{ i + 1 }}</span>
        <span class="term-ts">{{ formatTs(line.timestamp) }}</span>
        <span class="term-lv" :style="`color:${levelColor(line.level)}`">{{ (line.level || 'info').toUpperCase().padEnd(5) }}</span>
        <span v-if="line.agentId" class="term-agent" :style="`color:${agentColor(line.agentId)}`">[{{ line.agentId }}]</span>
        <span v-else class="term-agent term-agent--none">[ — ]</span>
        <span class="term-msg" :class="searchQuery ? '' : ''" v-html="highlight(line.message)" />
      </div>

    </div>

    <!-- ── Footer ─────────────────────────────────────────────────────── -->
    <div class="lm-footer">
      <span class="footer-file">{{ activeFile === 'info' ? 'agent-info.log' : 'agent-error.log' }}</span>
      <span class="footer-status" :class="liveMode ? 'footer-status--live' : ''">
        {{ liveMode ? '● LIVE' : '○ PAUSED' }}
      </span>
      <button v-if="!autoScroll" class="scroll-bottom-btn" @click="scrollToBottom">
        <v-icon size="13">mdi-arrow-down</v-icon>
        Jump to bottom
      </button>
    </div>

    <!-- ── Confirm clear dialog ───────────────────────────────────────── -->
    <v-dialog v-model="confirmClearFiles" max-width="400">
      <v-card rounded="lg" style="background:#12121E">
        <div class="dialog-header">
          <v-icon size="16" color="#EF4444">mdi-file-remove-outline</v-icon>
          <span>Empty Log Files</span>
        </div>
        <div class="dialog-body">
          Permanently clear <strong>agent-info.log</strong> and <strong>agent-error.log</strong>?
          This cannot be undone.
        </div>
        <div class="dialog-footer">
          <button class="dlg-btn dlg-btn--cancel" @click="confirmClearFiles = false">Cancel</button>
          <button class="dlg-btn dlg-btn--danger" :disabled="clearingFiles" @click="clearLogFiles">
            {{ clearingFiles ? 'Clearing…' : 'Empty Files' }}
          </button>
        </div>
      </v-card>
    </v-dialog>

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';
import axios from 'axios';

const socket = useSocket();

const FILES  = [
  { key: 'info',  label: 'agent-info.log'  },
  { key: 'error', label: 'agent-error.log' },
];
const LEVELS = [
  { key: 'error', label: 'Error', color: '#EF4444' },
  { key: 'warn',  label: 'Warn',  color: '#F59E0B' },
  { key: 'info',  label: 'Info',  color: '#38BDF8' },
  { key: 'debug', label: 'Debug', color: '#94A3B8' },
];

const AGENT_COLORS = {
  researcher: '#818CF8', planner: '#22D3EE',
  worker: '#4ADE80', reviewer: '#F59E0B',
  http: '#94A3B8', memory: '#A78BFA', workflow: '#F472B6',
  ltm: '#34D399', stm: '#60A5FA', app: '#94A3B8',
};

// ── State ────────────────────────────────────────────────────────────────────
const activeFile   = ref('info');
const levelFilter  = ref('');
const searchQuery  = ref('');
const loading      = ref(false);
const liveMode     = ref(false);
const autoScroll   = ref(true);
const terminalEl   = ref(null);

const lines        = ref([]);   // raw parsed lines from current file
const totalLines   = ref(0);
const fileSize     = ref(0);
const fileCounts   = ref({ info: 0, error: 0 });

// ── Computed ─────────────────────────────────────────────────────────────────
const filteredLines = computed(() => {
  let list = lines.value;
  if (levelFilter.value) list = list.filter(l => l.level === levelFilter.value);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(l =>
      (l.message || '').toLowerCase().includes(q) ||
      (l.agentId  || '').toLowerCase().includes(q)
    );
  }
  return list;
});

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadFile(file) {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/logs/files', { params: { file, limit: 3000 } });
    lines.value     = data.lines || [];
    totalLines.value = data.total || 0;
    fileSize.value  = data.size  || 0;
    fileCounts.value[file] = data.total || 0;
    await nextTick();
    if (autoScroll.value) scrollToBottom();
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

async function reload() {
  await loadFile(activeFile.value);
}

function switchFile(file) {
  activeFile.value = file;
  lines.value = [];
  loadFile(file);
}

// ── Live mode ─────────────────────────────────────────────────────────────────
function toggleLive() {
  liveMode.value = !liveMode.value;
}

function onLiveEntry(entry) {
  if (!liveMode.value) return;
  const level = entry.level || 'info';

  // Only append to info tab unless it's error/warn
  const targetFile = (level === 'error' || level === 'warn') ? 'error' : 'info';
  fileCounts.value[targetFile] = (fileCounts.value[targetFile] || 0) + 1;

  if (targetFile !== activeFile.value && activeFile.value !== 'info') return;

  const line = {
    level,
    message:   entry.message || '',
    agentId:   entry.agentId || null,
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  lines.value.push(line);
  totalLines.value++;
  if (lines.value.length > 3000) lines.value.splice(0, 500);

  nextTick(() => { if (autoScroll.value) scrollToBottom(); });
}

// ── Scroll ────────────────────────────────────────────────────────────────────
function onScroll() {
  if (!terminalEl.value) return;
  const { scrollTop, scrollHeight, clientHeight } = terminalEl.value;
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 60;
}

function scrollToBottom() {
  if (!terminalEl.value) return;
  terminalEl.value.scrollTop = terminalEl.value.scrollHeight;
  autoScroll.value = true;
}

// ── Clear files ───────────────────────────────────────────────────────────────
const confirmClearFiles = ref(false);
const clearingFiles = ref(false);
async function clearLogFiles() {
  clearingFiles.value = true;
  try {
    await axios.delete('/api/logs/files');
    lines.value = [];
    totalLines.value = 0;
    fileSize.value = 0;
    fileCounts.value = { info: 0, error: 0 };
    confirmClearFiles.value = false;
  } catch { /* ignore */ }
  finally { clearingFiles.value = false; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTs(ts) {
  if (!ts) return '—        ';
  try {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch { return ts.slice(11, 23) || '—'; }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function levelColor(level) {
  return { error: '#EF4444', warn: '#F59E0B', info: '#38BDF8', debug: '#94A3B8' }[level] || '#CBD5E1';
}

function agentColor(agentId) {
  return AGENT_COLORS[agentId] || '#CBD5E1';
}

function highlight(msg) {
  if (!searchQuery.value || !msg) return msg || '';
  const esc = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return msg.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="hl">$1</mark>');
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
// Debounced reload on filter change
let _debounce = null;
watch([levelFilter, searchQuery], () => {
  clearTimeout(_debounce);
  _debounce = setTimeout(() => nextTick(() => {
    if (autoScroll.value) scrollToBottom();
  }), 150);
});

onMounted(() => {
  loadFile('info');
  loadFile('error'); // preload count for error tab
  socket.on('log:entry', onLiveEntry);
});

onUnmounted(() => {
  socket.off('log:entry', onLiveEntry);
});
</script>

<style scoped>
/* ── Root ───────────────────────────────────────────────────────────────── */
.lm-root {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: #06060F;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.lm-toolbar {
  display: flex; align-items: center; gap: 0;
  padding: 0 16px;
  height: 48px; flex-shrink: 0;
  background: #0D0D1A;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  overflow-x: auto;
}
.lm-toolbar::-webkit-scrollbar { display: none; }

.toolbar-sep {
  width: 1px; height: 24px; flex-shrink: 0;
  background: rgba(255,255,255,0.07); margin: 0 12px;
}

/* File tabs */
.file-tabs { display: flex; gap: 4px; flex-shrink: 0; }
.file-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 6px;
  background: transparent; border: 1px solid transparent;
  font-size: 12px; font-family: inherit; font-weight: 500;
  color: rgba(226,232,240,0.4); cursor: pointer;
  transition: all 0.15s;
}
.file-tab:hover { color: rgba(226,232,240,0.7); background: rgba(255,255,255,0.04); }
.file-tab--active {
  background: rgba(99,102,241,0.1) !important;
  border-color: rgba(99,102,241,0.3) !important;
  color: #A5B4FC !important;
}
.file-tab__count {
  font-size: 10px; font-weight: 700;
  padding: 1px 5px; border-radius: 8px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.4);
}
.file-tab--active .file-tab__count {
  background: rgba(99,102,241,0.2); color: #818CF8;
}

/* Level pills */
.level-filters { display: flex; gap: 4px; flex-shrink: 0; }
.lv-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 600; font-family: inherit;
  background: transparent; border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.4); cursor: pointer;
  transition: all 0.15s;
}
.lv-pill:hover { background: rgba(255,255,255,0.04); color: rgba(226,232,240,0.7); }
.lv-pill--active {
  background: rgba(var(--lc, 99,102,241), 0.12) !important;
  border-color: rgba(var(--lc, 99,102,241), 0.3) !important;
  color: #E2E8F0 !important;
}
.lv-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; opacity: 0.8; }

/* Search */
.search-wrap {
  display: flex; align-items: center; gap: 7px;
  padding: 0 10px; flex-shrink: 0;
  height: 30px; min-width: 180px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
  transition: border-color 0.15s;
}
.search-wrap:focus-within { border-color: rgba(99,102,241,0.4); }
.search-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 12px; font-family: inherit; color: #E2E8F0;
}
.search-input::placeholder { color: rgba(226,232,240,0.2); }
.search-clear {
  background: none; border: none; cursor: pointer; padding: 0;
  color: rgba(226,232,240,0.35); display: flex; align-items: center;
  transition: color 0.15s;
}
.search-clear:hover { color: #E2E8F0; }

/* Actions */
.toolbar-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-shrink: 0; }

.stat-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 5px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  font-size: 11px; color: rgba(226,232,240,0.35);
}

.action-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 600; font-family: inherit;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.5); cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover { background: rgba(255,255,255,0.07); color: #E2E8F0; }
.action-btn--live {
  background: rgba(16,185,129,0.1) !important;
  border-color: rgba(16,185,129,0.3) !important;
  color: #10B981 !important;
}
.action-btn--danger { color: rgba(239,68,68,0.6); border-color: rgba(239,68,68,0.2); }
.action-btn--danger:hover { background: rgba(239,68,68,0.08); color: #EF4444; }
.action-btn--spin .v-icon { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.live-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #10B981; flex-shrink: 0;
  animation: pulse-live 1.4s ease-in-out infinite;
}
@keyframes pulse-live {
  0%, 100% { opacity: 1; } 50% { opacity: 0.35; }
}

/* ── Terminal ─────────────────────────────────────────────────────────────── */
.lm-terminal {
  flex: 1; overflow-y: auto;
  background: #06060F;
  padding: 8px 0;
}
.lm-terminal::-webkit-scrollbar { width: 6px; }
.lm-terminal::-webkit-scrollbar-track { background: transparent; }
.lm-terminal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

.term-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px;
  height: 100%; padding: 60px 20px;
  font-size: 13px; color: rgba(226,232,240,0.2);
}

.term-row {
  display: flex; align-items: baseline; gap: 0;
  padding: 1px 0;
  font-size: 12px; line-height: 1.7;
  border-left: 2px solid transparent;
  transition: background 0.1s;
}
.term-row:hover { background: rgba(255,255,255,0.02); }
.term-row--error { border-left-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.03); }
.term-row--warn  { border-left-color: rgba(245,158,11,0.4); background: rgba(245,158,11,0.02); }

.term-ln {
  flex-shrink: 0; width: 52px;
  text-align: right; padding-right: 16px;
  color: rgba(255,255,255,0.12); user-select: none;
  font-size: 11px;
}
.term-ts {
  flex-shrink: 0; width: 116px;
  color: rgba(226,232,240,0.25);
  font-size: 11px;
}
.term-lv {
  flex-shrink: 0; width: 52px;
  font-weight: 700; font-size: 10px; letter-spacing: 0.5px;
}
.term-agent {
  flex-shrink: 0; width: 110px;
  font-size: 11px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.term-agent--none { color: rgba(226,232,240,0.15) !important; }
.term-msg {
  flex: 1; color: #CBD5E1;
  white-space: pre-wrap; word-break: break-word;
  padding-right: 20px;
}
.term-row--error .term-msg { color: #FCA5A5; }
.term-row--warn  .term-msg { color: #FCD34D; }

/* Highlight */
:deep(.hl) {
  background: rgba(99,102,241,0.3); color: #C7D2FE;
  border-radius: 2px; padding: 0 1px;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.lm-footer {
  display: flex; align-items: center; gap: 12px;
  height: 28px; flex-shrink: 0;
  padding: 0 16px;
  background: #0D0D1A;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
}
.footer-file { color: rgba(226,232,240,0.3); font-family: inherit; }
.footer-status { color: rgba(226,232,240,0.25); margin-left: auto; }
.footer-status--live { color: #10B981; }

.scroll-bottom-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 2px 10px; border-radius: 4px;
  font-size: 11px; font-family: inherit; font-weight: 600;
  background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3);
  color: #818CF8; cursor: pointer;
  transition: background 0.15s;
}
.scroll-bottom-btn:hover { background: rgba(99,102,241,0.25); }

/* ── Dialog ──────────────────────────────────────────────────────────────── */
.dialog-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px 0;
  font-size: 13px; font-weight: 700; color: #E2E8F0;
}
.dialog-body {
  padding: 12px 18px 16px;
  font-size: 13px; color: rgba(226,232,240,0.65); line-height: 1.6;
  font-family: sans-serif;
}
.dialog-body strong { color: #E2E8F0; }
.dialog-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 0 18px 16px;
}
.dlg-btn {
  padding: 6px 16px; border-radius: 7px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; transition: all 0.15s;
}
.dlg-btn--cancel {
  background: transparent; border-color: rgba(255,255,255,0.1);
  color: rgba(226,232,240,0.45);
}
.dlg-btn--cancel:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.dlg-btn--danger {
  background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3);
  color: #F87171;
}
.dlg-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
.dlg-btn--danger:disabled { opacity: 0.5; cursor: default; }
</style>

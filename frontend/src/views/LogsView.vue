<template>
  <div class="lm-root">

    <!-- ── Toolbar ────────────────────────────────────────────────────── -->
    <div class="lm-toolbar">

      <!-- File tabs -->
      <div class="file-tabs">
        <button v-for="f in FILES" :key="f.key"
          class="file-tab" :class="{ 'file-tab--active': activeFile === f.key }"
          @click="switchFile(f.key)">
          <v-icon size="13">mdi-file-document-outline</v-icon>
          {{ f.label }}
          <span class="file-tab__count">{{ fileCounts[f.key] ?? '—' }}</span>
        </button>
      </div>

      <div class="toolbar-sep" />

      <!-- Level filter -->
      <div class="level-filters">
        <button v-for="lv in LEVELS" :key="lv.key"
          class="lv-pill" :class="{ 'lv-pill--active': levelFilter === lv.key }"
          :style="levelFilter === lv.key ? `--lc:${lv.color}` : ''"
          @click="setLevel(lv.key)">
          <span class="lv-dot" :style="`background:${lv.color}`" />
          {{ lv.label }}
        </button>
      </div>

      <div class="toolbar-sep" />

      <!-- Search -->
      <div class="search-wrap" :class="{ 'search-wrap--active': searchQuery }">
        <v-icon size="14" :color="searchQuery ? '#818CF8' : 'rgba(226,232,240,0.3)'">mdi-magnify</v-icon>
        <input class="search-input" v-model="searchQuery" placeholder="Search logs…"
          @keydown.escape="searchQuery = ''" @keydown.enter="reload"
          autocomplete="off" spellcheck="false" />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
          <v-icon size="12">mdi-close</v-icon>
        </button>
      </div>

      <!-- Right actions -->
      <div class="toolbar-actions">
        <span class="stat-chip">
          <v-icon size="11">mdi-format-list-numbered</v-icon>
          {{ total }} lines
        </span>
        <span class="stat-chip" v-if="fileSize">
          <v-icon size="11">mdi-database-outline</v-icon>
          {{ formatSize(fileSize) }}
        </span>
        <button class="action-btn" :class="{ 'action-btn--spin': loading }" @click="reload" title="Reload">
          <v-icon size="13">mdi-refresh</v-icon>
        </button>
        <button class="action-btn action-btn--danger" @click="confirmClearFiles = true" title="Empty log files">
          <v-icon size="13">mdi-file-remove-outline</v-icon>
        </button>
      </div>
    </div>

    <!-- ── Table ──────────────────────────────────────────────────────── -->
    <div class="lm-table-wrap">
      <table class="lm-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-time">Time</th>
            <th class="col-level">Level</th>
            <th class="col-agent">Agent</th>
            <th class="col-msg">Message</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="td-empty">
              <v-progress-circular indeterminate size="24" color="#6366F1" />
            </td>
          </tr>
          <tr v-else-if="!lines.length">
            <td colspan="5" class="td-empty">
              <v-icon size="28" color="rgba(255,255,255,0.07)">mdi-text-box-outline</v-icon>
              <span>No log entries</span>
            </td>
          </tr>
          <tr v-else v-for="(line, i) in lines" :key="i"
            class="log-row" :class="`log-row--${line.level || 'info'}`">
            <td class="col-num">{{ rowNumber(i) }}</td>
            <td class="col-time">{{ formatTs(line.timestamp) }}</td>
            <td class="col-level">
              <span class="lv-badge" :style="`color:${levelColor(line.level)};background:${levelBg(line.level)}`">
                {{ (line.level || 'info').toUpperCase() }}
              </span>
            </td>
            <td class="col-agent">
              <span v-if="line.agentId" class="agent-chip" :style="`color:${agentColor(line.agentId)};border-color:${agentColor(line.agentId)}33`">
                {{ line.agentId }}
              </span>
              <span v-else class="agent-none">—</span>
            </td>
            <td class="col-msg">
              <span v-html="highlight(line.message)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Pagination + footer ────────────────────────────────────────── -->
    <div class="lm-footer">
      <span class="footer-file">{{ activeFile === 'info' ? 'agent-info.log' : 'agent-error.log' }}</span>

      <div class="pager">
        <button class="pg-btn" :disabled="currentPage >= totalPages" @click="goPage(totalPages)" title="Oldest">
          <v-icon size="14">mdi-page-first</v-icon>
        </button>
        <button class="pg-btn" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">
          <v-icon size="14">mdi-chevron-left</v-icon>
        </button>

        <div class="pg-pages">
          <button v-for="p in visiblePages" :key="p"
            class="pg-num" :class="{ 'pg-num--active': p === currentPage }"
            @click="goPage(p)">{{ p }}</button>
        </div>

        <button class="pg-btn" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">
          <v-icon size="14">mdi-chevron-right</v-icon>
        </button>
        <button class="pg-btn" :disabled="currentPage <= 1" @click="goPage(1)" title="Newest">
          <v-icon size="14">mdi-page-last</v-icon>
        </button>

        <span class="pg-info">{{ currentPage }} / {{ totalPages }}</span>
      </div>
    </div>

    <!-- ── Confirm clear dialog ───────────────────────────────────────── -->
    <v-dialog v-model="confirmClearFiles" max-width="400">
      <v-card rounded="lg" style="background:#12121E">
        <div class="dialog-header">
          <v-icon size="16" color="#EF4444">mdi-file-remove-outline</v-icon>
          <span>Empty Log Files</span>
        </div>
        <div class="dialog-body">
          Permanently clear <strong>agent-info.log</strong> and
          <strong>agent-error.log</strong>? This cannot be undone.
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
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';

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
  researcher: '#818CF8', planner: '#22D3EE', worker: '#4ADE80',
  reviewer: '#F59E0B', http: '#94A3B8', memory: '#A78BFA',
  workflow: '#F472B6', ltm: '#34D399', stm: '#60A5FA', app: '#94A3B8',
};
const PER_PAGE = 30;

// ── State ────────────────────────────────────────────────────────────────────
const activeFile   = ref('info');
const levelFilter  = ref('');
const searchQuery  = ref('');
const loading      = ref(false);
const lines        = ref([]);
const total        = ref(0);
const currentPage  = ref(1);   // 1 = newest/last page
const totalPages   = ref(1);
const fileSize     = ref(0);
const fileCounts   = ref({});

// ── Pagination helpers ────────────────────────────────────────────────────────
// Row number: page 1 = last entries, so row 1 of page 1 = entry (total - 0)
function rowNumber(i) {
  return total.value - (currentPage.value - 1) * PER_PAGE - i;
}

const visiblePages = computed(() => {
  const tp = totalPages.value;
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1);
  const cur = currentPage.value;
  const pages = new Set([1, tp, cur]);
  for (let d = 1; d <= 2; d++) { pages.add(cur - d); pages.add(cur + d); }
  return [...pages].filter(p => p >= 1 && p <= tp).sort((a, b) => a - b);
});

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadPage(file, page) {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/logs/files', {
      params: { file, page, perPage: PER_PAGE, level: levelFilter.value, search: searchQuery.value },
    });
    lines.value      = data.lines || [];
    total.value      = data.total || 0;
    currentPage.value = data.page  || 1;
    totalPages.value  = data.totalPages || 1;
    fileSize.value   = data.size  || 0;
    fileCounts.value[file] = data.total || 0;
  } catch { lines.value = []; }
  finally { loading.value = false; }
}

async function reload() { await loadPage(activeFile.value, 1); }

function switchFile(file) {
  activeFile.value = file;
  currentPage.value = 1;
  levelFilter.value = '';
  searchQuery.value = '';
  loadPage(file, 1);
}

function goPage(p) {
  const clamped = Math.min(Math.max(1, p), totalPages.value);
  loadPage(activeFile.value, clamped);
}

function setLevel(key) {
  levelFilter.value = levelFilter.value === key ? '' : key;
  currentPage.value = 1;
}

// Reload when filters change (debounced for search)
let _debounce = null;
watch(levelFilter, () => loadPage(activeFile.value, 1));
watch(searchQuery, () => {
  clearTimeout(_debounce);
  _debounce = setTimeout(() => loadPage(activeFile.value, 1), 350);
});

// ── Clear files ───────────────────────────────────────────────────────────────
const confirmClearFiles = ref(false);
const clearingFiles = ref(false);
async function clearLogFiles() {
  clearingFiles.value = true;
  try {
    await axios.delete('/api/logs/files');
    lines.value = []; total.value = 0; fileSize.value = 0;
    fileCounts.value = {}; currentPage.value = 1; totalPages.value = 1;
    confirmClearFiles.value = false;
  } catch { /* ignore */ }
  finally { clearingFiles.value = false; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTs(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
           d.toTimeString().slice(0, 8);
  } catch { return String(ts).slice(0, 19); }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function levelColor(l) {
  return { error: '#EF4444', warn: '#F59E0B', info: '#38BDF8', debug: '#94A3B8' }[l] || '#CBD5E1';
}
function levelBg(l) {
  return { error: 'rgba(239,68,68,0.1)', warn: 'rgba(245,158,11,0.1)', info: 'rgba(56,189,248,0.08)', debug: 'rgba(148,163,184,0.08)' }[l] || 'rgba(255,255,255,0.05)';
}
function agentColor(id) { return AGENT_COLORS[id] || '#CBD5E1'; }

function highlight(msg) {
  if (!searchQuery.value || !msg) return msg || '';
  const esc = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return msg.replace(new RegExp(`(${esc})`, 'gi'), '<mark class="hl">$1</mark>');
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  loadPage('info', 1);
  // Preload error count
  axios.get('/api/logs/files', { params: { file: 'error', page: 1, perPage: 1 } })
    .then(r => { fileCounts.value.error = r.data.total || 0; }).catch(() => {});
});
</script>

<style scoped>
/* ── Root ───────────────────────────────────────────────────────────────── */
.lm-root {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: #08080F;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.lm-toolbar {
  display: flex; align-items: center; gap: 0;
  padding: 0 20px;
  height: 50px; flex-shrink: 0;
  background: #0D0D1A;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  overflow-x: auto;
}
.lm-toolbar::-webkit-scrollbar { display: none; }

.toolbar-sep {
  width: 1px; height: 22px; flex-shrink: 0;
  background: rgba(255,255,255,0.07); margin: 0 14px;
}

/* File tabs */
.file-tabs { display: flex; gap: 4px; flex-shrink: 0; }
.file-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 14px; border-radius: 7px;
  background: transparent; border: 1px solid transparent;
  font-size: 12px; font-weight: 500;
  color: rgba(226,232,240,0.4); cursor: pointer; transition: all 0.15s;
}
.file-tab:hover { color: rgba(226,232,240,0.7); background: rgba(255,255,255,0.04); }
.file-tab--active {
  background: rgba(99,102,241,0.1) !important;
  border-color: rgba(99,102,241,0.3) !important;
  color: #A5B4FC !important;
}
.file-tab__count {
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 8px;
  background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.4);
}
.file-tab--active .file-tab__count { background: rgba(99,102,241,0.2); color: #818CF8; }

/* Level pills */
.level-filters { display: flex; gap: 4px; flex-shrink: 0; }
.lv-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 600;
  background: transparent; border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.4); cursor: pointer; transition: all 0.15s;
}
.lv-pill:hover { background: rgba(255,255,255,0.04); color: rgba(226,232,240,0.7); }
.lv-pill--active {
  background: rgba(var(--lc), 0.12) !important;
  border-color: rgba(var(--lc), 0.3) !important;
  color: #E2E8F0 !important;
}
.lv-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

/* Search */
.search-wrap {
  display: flex; align-items: center; gap: 7px; padding: 0 10px;
  height: 32px; min-width: 200px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 7px;
  transition: border-color 0.15s;
}
.search-wrap--active,
.search-wrap:focus-within { border-color: rgba(99,102,241,0.4); }
.search-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 13px; color: #E2E8F0;
}
.search-input::placeholder { color: rgba(226,232,240,0.2); }
.search-clear {
  background: none; border: none; cursor: pointer; padding: 0;
  color: rgba(226,232,240,0.35); display: flex; align-items: center;
}
.search-clear:hover { color: #E2E8F0; }

/* Actions */
.toolbar-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-shrink: 0; }

.stat-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 6px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  font-size: 11px; color: rgba(226,232,240,0.35);
}
.action-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 7px;
  font-size: 11px; font-weight: 600;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.5); cursor: pointer; transition: all 0.15s;
}
.action-btn:hover { background: rgba(255,255,255,0.08); color: #E2E8F0; }
.action-btn--danger { color: rgba(239,68,68,0.6); border-color: rgba(239,68,68,0.2); }
.action-btn--danger:hover { background: rgba(239,68,68,0.08); color: #EF4444; }
.action-btn--spin .v-icon { animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Table ───────────────────────────────────────────────────────────────── */
.lm-table-wrap { flex: 1; overflow-y: auto; }
.lm-table-wrap::-webkit-scrollbar { width: 5px; }
.lm-table-wrap::-webkit-scrollbar-track { background: transparent; }
.lm-table-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

.lm-table {
  width: 100%; border-collapse: collapse;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.lm-table thead th {
  position: sticky; top: 0; z-index: 2;
  padding: 10px 12px;
  background: #0D0D1A;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: rgba(226,232,240,0.3);
  text-align: left; white-space: nowrap;
}

.log-row td { padding: 5px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); vertical-align: middle; }
.log-row:hover td { background: rgba(255,255,255,0.02); }
.log-row--error td { background: rgba(239,68,68,0.03); border-left: 2px solid rgba(239,68,68,0.4); }
.log-row--warn  td { background: rgba(245,158,11,0.025); border-left: 2px solid rgba(245,158,11,0.35); }
.log-row--error:hover td { background: rgba(239,68,68,0.05); }
.log-row--warn:hover  td { background: rgba(245,158,11,0.04); }

.col-num   { width: 52px; text-align: right; color: rgba(255,255,255,0.15); user-select: none; font-size: 11px; }
.col-time  { width: 136px; color: rgba(226,232,240,0.35); white-space: nowrap; }
.col-level { width: 72px; }
.col-agent { width: 110px; }
.col-msg   { color: #CBD5E1; word-break: break-word; }
.log-row--error .col-msg { color: #FCA5A5; }
.log-row--warn  .col-msg { color: #FDE68A; }

.lv-badge {
  display: inline-block; padding: 2px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
}

.agent-chip {
  display: inline-block; padding: 1px 7px; border-radius: 10px;
  font-size: 10px; font-weight: 700; border: 1px solid; white-space: nowrap;
}
.agent-none { color: rgba(226,232,240,0.2); }

.td-empty {
  text-align: center; padding: 60px 20px;
  color: rgba(226,232,240,0.25); font-size: 13px;
}
.td-empty > * { display: block; margin: 0 auto 8px; }

:deep(.hl) {
  background: rgba(99,102,241,0.3); color: #C7D2FE;
  border-radius: 2px; padding: 0 1px;
}

/* ── Footer / Pager ──────────────────────────────────────────────────────── */
.lm-footer {
  display: flex; align-items: center; justify-content: space-between;
  height: 42px; flex-shrink: 0; padding: 0 20px;
  background: #0D0D1A;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
}
.footer-file { color: rgba(226,232,240,0.25); font-family: monospace; }

.pager { display: flex; align-items: center; gap: 4px; }

.pg-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.5); cursor: pointer; transition: all 0.15s;
}
.pg-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #E2E8F0; }
.pg-btn:disabled { opacity: 0.25; cursor: default; }

.pg-pages { display: flex; align-items: center; gap: 2px; }
.pg-num {
  min-width: 28px; height: 28px; padding: 0 4px; border-radius: 6px;
  background: transparent; border: 1px solid transparent;
  font-size: 12px; font-weight: 500; color: rgba(226,232,240,0.45); cursor: pointer;
  transition: all 0.15s;
}
.pg-num:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.pg-num--active {
  background: rgba(99,102,241,0.15) !important;
  border-color: rgba(99,102,241,0.35) !important;
  color: #A5B4FC !important; font-weight: 700;
}

.pg-info {
  margin-left: 8px; font-size: 11px;
  color: rgba(226,232,240,0.3); white-space: nowrap;
}

/* ── Dialog ──────────────────────────────────────────────────────────────── */
.dialog-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px 0;
  font-size: 13px; font-weight: 700; color: #E2E8F0;
}
.dialog-body {
  padding: 12px 18px 16px;
  font-size: 13px; color: rgba(226,232,240,0.65); line-height: 1.6; font-family: sans-serif;
}
.dialog-body strong { color: #E2E8F0; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 18px 16px; }
.dlg-btn {
  padding: 6px 16px; border-radius: 7px;
  font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.15s;
}
.dlg-btn--cancel { background: transparent; border-color: rgba(255,255,255,0.1); color: rgba(226,232,240,0.45); }
.dlg-btn--cancel:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.dlg-btn--danger { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #F87171; }
.dlg-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
.dlg-btn--danger:disabled { opacity: 0.5; cursor: default; }
</style>

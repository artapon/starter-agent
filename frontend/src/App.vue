<template>
  <v-app theme="dark">
    <AppNavDrawer v-model="drawer" />

    <v-app-bar color="surface" elevation="0" height="52" style="border-bottom:1px solid rgba(255,255,255,0.06)">
      <v-app-bar-nav-icon @click="drawer = !drawer" class="ml-1" size="small" />
      <div class="d-flex align-center ml-1 gap-2">
        <div class="brand-icon">
          <v-icon size="16" color="white">mdi-robot-excited</v-icon>
        </div>
        <div class="brand-text-wrap">
          <span class="brand-text">Starter<span class="brand-text--accent">Agent</span></span>
          <span class="brand-tag">AI Framework</span>
        </div>
      </div>
      <v-spacer />
      <div class="appbar-right mr-3">
        <!-- Global stop button — visible on every page while a workflow runs -->
        <transition name="stop-fade">
          <button v-if="activeRunId" class="global-stop-btn" :class="{ 'global-stop-btn--stopping': stopping }"
            @click="stopWorkflow" :disabled="stopping" title="Stop running workflow">
            <span class="global-stop-btn__dot" />
            <span class="global-stop-btn__label">{{ stopping ? 'Stopping…' : 'Stop' }}</span>
          </button>
        </transition>

        <div class="conn-pill" :class="connected ? 'conn-pill--on' : 'conn-pill--off'">
          <span class="conn-dot" />
          <span class="conn-label">{{ connected ? 'Live' : 'Offline' }}</span>
        </div>
      </div>
    </v-app-bar>

    <v-main style="background:#08080F">
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import AppNavDrawer from './components/common/AppNavDrawer.vue';
import { useSocket } from './plugins/socket.js';
import axios from 'axios';

const drawer    = ref(true);
const connected = ref(false);
const socket    = useSocket();

// ── Global workflow run state ─────────────────────────────────────────────
const activeRunId  = ref(null);
const stopping     = ref(false);

async function stopWorkflow() {
  if (!activeRunId.value || stopping.value) return;
  stopping.value = true;
  try {
    await axios.post(`/api/workflow/stop/${activeRunId.value}`);
  } catch { /* best-effort */ }
  finally { stopping.value = false; }
}

function onConnect()    { connected.value = true; }
function onDisconnect() { connected.value = false; }
function onWorkflowStarted(d)  { activeRunId.value = d.runId; stopping.value = false; }
function onWorkflowComplete(d) { if (d.runId === activeRunId.value) activeRunId.value = null; }
function onWorkflowStopped(d)  { if (!d.runId || d.runId === activeRunId.value) activeRunId.value = null; }
function onWorkflowError(d)    { if (d.runId === activeRunId.value) activeRunId.value = null; }

onMounted(() => {
  socket.on('connect',           onConnect);
  socket.on('disconnect',        onDisconnect);
  if (socket.connected) connected.value = true;

  socket.on('workflow:started',  onWorkflowStarted);
  socket.on('workflow:complete', onWorkflowComplete);
  socket.on('workflow:stopped',  onWorkflowStopped);
  socket.on('workflow:error',    onWorkflowError);
});
onUnmounted(() => {
  socket.off('connect',          onConnect);
  socket.off('disconnect',       onDisconnect);
  socket.off('workflow:started', onWorkflowStarted);
  socket.off('workflow:complete', onWorkflowComplete);
  socket.off('workflow:stopped', onWorkflowStopped);
  socket.off('workflow:error',   onWorkflowError);
});
</script>

<style>
/* ── Base ──────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

:root {
  /* ── Semantic colors ───────────────────────────────────────────── */
  --c-primary:   #6366F1;
  --c-secondary: #22D3EE;
  --c-success:   #10B981;
  --c-warning:   #F59E0B;
  --c-error:     #EF4444;
  --c-info:      #38BDF8;
  --c-accent:    #A78BFA;

  /* ── Backgrounds ───────────────────────────────────────────────── */
  --c-bg:      #08080F;
  --c-surface: #0D0D1A;
  --c-card:    #12121E;
  --c-card-2:  #161624;

  /* ── Borders ───────────────────────────────────────────────────── */
  --c-border:       rgba(255,255,255,0.06);
  --c-border-light: rgba(255,255,255,0.04);
  --c-border-med:   rgba(255,255,255,0.09);

  /* ── Text ──────────────────────────────────────────────────────── */
  --c-text:  #E2E8F0;
  --c-muted: rgba(226,232,240,0.5);
  --c-dim:   rgba(226,232,240,0.3);
  --c-faint: rgba(226,232,240,0.15);

  /* ── Agent colors (single source of truth) ─────────────────────── */
  --a-researcher: #22D3EE;
  --a-planner:    #818CF8;
  --a-worker:     #34D399;
  --a-reviewer:   #F59E0B;

  /* ── Spacing ───────────────────────────────────────────────────── */
  --page-px: 24px;
  --page-py: 20px;

  /* ── Radius ────────────────────────────────────────────────────── */
  --r-sm:   6px;
  --r-md:   8px;
  --r-lg:   12px;
  --r-pill: 20px;

  /* ── Transitions ───────────────────────────────────────────────── */
  --t-fast: 0.12s ease;
  --t-std:  0.18s ease;
}

/* ── Scrollbars ─────────────────────────────────────────────────────── */
::-webkit-scrollbar            { width: 5px; height: 5px; }
::-webkit-scrollbar-track      { background: transparent; }
::-webkit-scrollbar-thumb      { background: rgba(255,255,255,0.1); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover{ background: rgba(255,255,255,0.2); }

/* ── Text ───────────────────────────────────────────────────────────── */
.v-application,
.v-application *:not(.v-icon):not([class*="mdi-"]) { color: #E2E8F0 !important; }

.text-medium-emphasis { color: rgba(226,232,240,0.55) !important; }
.text-disabled        { color: rgba(226,232,240,0.3)  !important; }
.text-primary         { color: #6366F1 !important; }
.text-secondary       { color: #22D3EE !important; }
.text-success         { color: #10B981 !important; }
.text-warning         { color: #F59E0B !important; }
.text-error           { color: #EF4444 !important; }
.text-info            { color: #38BDF8 !important; }

/* ── Inputs ─────────────────────────────────────────────────────────── */
.v-field__input, .v-field__input *,
.v-select__selection, .v-textarea textarea,
input, textarea, select { color: #E2E8F0 !important; }

/* ── Tables ─────────────────────────────────────────────────────────── */
.v-data-table td, .v-data-table th { color: #E2E8F0 !important; }

/* ── Misc ───────────────────────────────────────────────────────────── */
.v-chip__content { color: inherit !important; }
pre, code        { color: #CBD5E1 !important; }

/* ── Card defaults ──────────────────────────────────────────────────── */
.v-card {
  border: 1px solid var(--c-border) !important;
  background: var(--c-card) !important;
}

/* ── Page header utility ────────────────────────────────────────────── */
.page-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: #E2E8F0 !important;
}
.page-subtitle {
  font-size: 12px;
  color: var(--c-muted) !important;
  margin-top: 2px;
}

/* ── Section heading ────────────────────────────────────────────────── */
.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--c-muted) !important;
}

/* ── Stat number ────────────────────────────────────────────────────── */
.stat-number {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.5px;
  color: #E2E8F0 !important;
  font-variant-numeric: tabular-nums;
}


/* ── AppBar brand ───────────────────────────────────────────────────── */
.brand-icon {
  width: 30px; height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366F1 0%, #A78BFA 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 12px rgba(99,102,241,0.35);
  flex-shrink: 0;
}
.brand-text-wrap { display: flex; flex-direction: column; line-height: 1; }
.brand-text {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #E2E8F0 !important;
}
.brand-text--accent { color: #A78BFA !important; }
.brand-tag {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: rgba(226,232,240,0.3) !important;
  margin-top: 1px;
}
.appbar-right { display: flex; align-items: center; gap: 10px; }

/* ── Global stop button ─────────────────────────────────────────────── */
.global-stop-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid rgba(239,68,68,0.35);
  background: rgba(239,68,68,0.1);
  color: #EF4444 !important;
  font-size: 12px; font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  outline: none;
}
.global-stop-btn:hover:not(:disabled) {
  background: rgba(239,68,68,0.18);
  border-color: rgba(239,68,68,0.55);
}
.global-stop-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.global-stop-btn--stopping { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.1); color: #F59E0B !important; }

.global-stop-btn__dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #EF4444;
  animation: pulse-stop 1.2s ease-in-out infinite;
}
.global-stop-btn--stopping .global-stop-btn__dot { background: #F59E0B; animation: none; opacity: 0.7; }
.global-stop-btn__label { color: inherit !important; }

@keyframes pulse-stop {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
  50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
}

/* ── Stop button transition ─────────────────────────────────────────── */
.stop-fade-enter-active, .stop-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.stop-fade-enter-from, .stop-fade-leave-to { opacity: 0; transform: scale(0.85); }

/* ── Connection pill ────────────────────────────────────────────────── */
.conn-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.3px;
}
.conn-pill--on  { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); color: #10B981 !important; }
.conn-pill--off { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.2);  color: #EF4444 !important; }
.conn-dot {
  width: 6px; height: 6px; border-radius: 50%;
}
.conn-pill--on  .conn-dot { background: #10B981; box-shadow: 0 0 5px #10B981; animation: pulse-conn 2s ease-in-out infinite; }
.conn-pill--off .conn-dot { background: #EF4444; }
.conn-label { color: inherit !important; }
@keyframes pulse-conn {
  0%, 100% { box-shadow: 0 0 5px rgba(16,185,129,0.6); }
  50%       { box-shadow: 0 0 10px rgba(16,185,129,0.3); }
}

/* ── Hover card lift ────────────────────────────────────────────────── */
.card-hover {
  transition: border-color 0.2s, box-shadow 0.2s;
}
.card-hover:hover {
  border-color: rgba(99,102,241,0.18) !important;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18) !important;
}

/* ── Monospace ──────────────────────────────────────────────────────── */
.font-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }

/* ── Page layout ────────────────────────────────────────────────────── */
.page-root {
  padding: var(--page-py) var(--page-px);
  display: flex; flex-direction: column; gap: 16px;
  height: 100%; overflow-y: auto;
}
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px;
}

/* ── Panel (card container) ─────────────────────────────────────────── */
.panel {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.panel__header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 12px 14px;
  border-bottom: 1px solid var(--c-border-light);
}
.panel__header > .ph-left { display: flex; align-items: center; gap: 8px; }

/* ── Icon button ────────────────────────────────────────────────────── */
.icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: var(--r-md);
  background: transparent; border: 1px solid var(--c-border);
  color: var(--c-muted); cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  outline: none;
}
.icon-btn:hover { background: rgba(255,255,255,0.06); color: var(--c-text); border-color: var(--c-border-med); }
.icon-btn--spin .v-icon { animation: spin 0.7s linear infinite; }

/* ── Small action button ────────────────────────────────────────────── */
.action-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 11px; border-radius: var(--r-md);
  font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,0.04); border: 1px solid var(--c-border);
  color: var(--c-muted); cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
  outline: none;
}
.action-btn:hover { background: rgba(255,255,255,0.08); color: var(--c-text); }
.action-btn--danger { color: rgba(239,68,68,0.65); border-color: rgba(239,68,68,0.2); }
.action-btn--danger:hover { background: rgba(239,68,68,0.08); color: #EF4444; }

/* ── Inline pill button ─────────────────────────────────────────────── */
.pill-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: var(--r-pill);
  font-size: 11px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; background: transparent;
  transition: background var(--t-fast), border-color var(--t-fast);
  outline: none;
}

/* ── Count badge ────────────────────────────────────────────────────── */
.badge-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; padding: 1px 6px; border-radius: 10px;
  font-size: 10px; font-weight: 700;
  background: rgba(255,255,255,0.07); color: var(--c-muted);
}

/* ── Empty state ────────────────────────────────────────────────────── */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px;
  padding: 40px 24px;
  color: var(--c-faint); font-size: 13px; text-align: center;
}
.empty-state .v-icon { opacity: 0.25; }
.empty-state__title { font-size: 13px; color: var(--c-dim); }
.empty-state__sub   { font-size: 12px; color: var(--c-faint); }

/* ── Inline text empty (single-line, inside lists) ──────────────────── */
.empty-inline {
  padding: 14px 16px;
  font-size: 12px; color: var(--c-faint); text-align: center;
}

/* ── Standard dialog ────────────────────────────────────────────────── */
.dlg-card { background: var(--c-card) !important; border-radius: 14px !important; }
.dlg-header {
  display: flex; align-items: center; gap: 9px;
  padding: 16px 18px 0;
  font-size: 14px; font-weight: 700; color: var(--c-text);
}
.dlg-body {
  padding: 12px 18px 16px;
  font-size: 13px; color: var(--c-muted); line-height: 1.65;
}
.dlg-body strong { color: var(--c-text); }
.dlg-footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 8px; padding: 0 18px 16px;
}
.dlg-btn {
  padding: 6px 16px; border-radius: var(--r-md);
  font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; background: transparent;
  transition: background var(--t-fast), border-color var(--t-fast);
  outline: none;
}
.dlg-btn--cancel { border-color: var(--c-border-med); color: var(--c-muted); }
.dlg-btn--cancel:hover { background: rgba(255,255,255,0.05); color: var(--c-text); }
.dlg-btn--danger { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #F87171; }
.dlg-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
.dlg-btn--danger:disabled { opacity: 0.45; cursor: not-allowed; }
.dlg-btn--primary { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #A5B4FC; }
.dlg-btn--primary:hover { background: rgba(99,102,241,0.25); }

/* ── Live pulse dot ─────────────────────────────────────────────────── */
.live-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  background: #10B981;
  animation: pulse-live 2s ease-in-out infinite;
}

/* ── Status dots ────────────────────────────────────────────────────── */
.status-dot         { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-dot--online  { background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.5); }
.status-dot--offline { background: #EF4444; }
.status-dot--working { background: #F59E0B; animation: pulse-warn 1.2s ease-in-out infinite; }

/* ── Agent color chips ──────────────────────────────────────────────── */
.agent-chip {
  display: inline-block; padding: 1px 8px; border-radius: var(--r-pill);
  font-size: 10px; font-weight: 700; border: 1px solid; white-space: nowrap;
}
.agent-chip--researcher { color: var(--a-researcher); border-color: rgba(34,211,238,0.3);   background: rgba(34,211,238,0.08); }
.agent-chip--planner    { color: var(--a-planner);    border-color: rgba(129,140,248,0.3); background: rgba(129,140,248,0.08); }
.agent-chip--worker     { color: var(--a-worker);     border-color: rgba(52,211,153,0.3);  background: rgba(52,211,153,0.08); }
.agent-chip--reviewer   { color: var(--a-reviewer);   border-color: rgba(245,158,11,0.3);  background: rgba(245,158,11,0.08); }

/* ── Toolbar separator ──────────────────────────────────────────────── */
.toolbar-sep {
  width: 1px; height: 20px; flex-shrink: 0;
  background: var(--c-border-med); margin: 0 12px;
}

/* ── Search input wrapper ───────────────────────────────────────────── */
.search-wrap {
  display: flex; align-items: center; gap: 7px;
  padding: 0 10px; height: 32px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--c-border-med); border-radius: var(--r-md);
  transition: border-color var(--t-fast);
}
.search-wrap:focus-within,
.search-wrap--active { border-color: rgba(99,102,241,0.45); }
.search-input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 13px; color: var(--c-text);
}
.search-input::placeholder { color: var(--c-faint); }

/* ── Animations ─────────────────────────────────────────────────────── */
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes pulse-live {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
  50%       { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
}
@keyframes pulse-warn {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.5); }
  50%       { box-shadow: 0 0 0 4px rgba(245,158,11,0); }
}
@keyframes pulse-error {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
  50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-in { animation: fade-in 0.2s ease forwards; }

/* ── Pager (shared pagination) ──────────────────────────────────────── */
.pager { display: flex; align-items: center; gap: 4px; }
.pg-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: var(--r-sm);
  background: rgba(255,255,255,0.04); border: 1px solid var(--c-border);
  color: var(--c-muted); cursor: pointer; transition: all var(--t-fast);
}
.pg-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: var(--c-text); }
.pg-btn:disabled { opacity: 0.25; cursor: default; }
.pg-num {
  min-width: 28px; height: 28px; padding: 0 4px; border-radius: var(--r-sm);
  background: transparent; border: 1px solid transparent;
  font-size: 12px; font-weight: 500; color: var(--c-muted); cursor: pointer;
  transition: all var(--t-fast);
}
.pg-num:hover { background: rgba(255,255,255,0.05); color: var(--c-text); }
.pg-num--active {
  background: rgba(99,102,241,0.15) !important;
  border-color: rgba(99,102,241,0.35) !important;
  color: #A5B4FC !important; font-weight: 700;
}
.pg-info { font-size: 11px; color: var(--c-dim); white-space: nowrap; margin-left: 6px; }
</style>

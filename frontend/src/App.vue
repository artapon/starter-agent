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

onMounted(() => {
  socket.on('connect',    () => { connected.value = true; });
  socket.on('disconnect', () => { connected.value = false; });
  if (socket.connected) connected.value = true;

  socket.on('workflow:started',  (d) => { activeRunId.value = d.runId; stopping.value = false; });
  socket.on('workflow:complete', (d) => { if (d.runId === activeRunId.value) activeRunId.value = null; });
  socket.on('workflow:stopped',  (d) => { if (!d.runId || d.runId === activeRunId.value) activeRunId.value = null; });
  socket.on('workflow:error',    (d) => { if (d.runId === activeRunId.value) activeRunId.value = null; });
});
onUnmounted(() => {
  socket.off('connect');
  socket.off('disconnect');
  socket.off('workflow:started');
  socket.off('workflow:complete');
  socket.off('workflow:stopped');
  socket.off('workflow:error');
});
</script>

<style>
/* ── Base ──────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

:root {
  --c-primary:   #6366F1;
  --c-secondary: #22D3EE;
  --c-success:   #10B981;
  --c-warning:   #F59E0B;
  --c-error:     #EF4444;
  --c-info:      #38BDF8;
  --c-bg:        #08080F;
  --c-surface:   #0D0D1A;
  --c-card:      #12121E;
  --c-border:    rgba(255,255,255,0.06);
  --c-text:      #E2E8F0;
  --c-muted:     rgba(226,232,240,0.5);
  --c-dim:       rgba(226,232,240,0.3);
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
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.card-hover:hover {
  border-color: rgba(99,102,241,0.2) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
}

/* ── Monospace ──────────────────────────────────────────────────────── */
.font-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }
</style>

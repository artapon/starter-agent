<template>
  <v-app theme="dark">
    <AppNavDrawer v-model="drawer" />

    <v-app-bar color="surface" elevation="0" height="56" style="border-bottom:1px solid rgba(255,255,255,0.05)">
      <v-app-bar-nav-icon @click="drawer = !drawer" class="ml-1" />
      <div class="d-flex align-center ml-1">
        <div class="brand-icon mr-2">
          <v-icon size="18" color="white">mdi-robot</v-icon>
        </div>
        <span class="brand-text">Starter<span class="brand-text--dim">Agent</span></span>
      </div>
      <v-spacer />
      <div class="conn-pill mr-3" :class="connected ? 'conn-pill--on' : 'conn-pill--off'">
        <span class="conn-dot" />
        <span class="conn-label">{{ connected ? 'Connected' : 'Disconnected' }}</span>
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

const drawer = ref(true);
const connected = ref(false);
const socket = useSocket();

onMounted(() => {
  socket.on('connect',    () => { connected.value = true; });
  socket.on('disconnect', () => { connected.value = false; });
  if (socket.connected) connected.value = true;
});
onUnmounted(() => {
  socket.off('connect');
  socket.off('disconnect');
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
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #E2E8F0 !important;
}
.page-subtitle {
  font-size: 13px;
  color: var(--c-muted) !important;
  margin-top: 2px;
}

/* ── Section heading ────────────────────────────────────────────────── */
.section-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--c-muted) !important;
}

/* ── Stat card number ───────────────────────────────────────────────── */
.stat-number {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  color: #E2E8F0 !important;
}

/* ── AppBar brand ───────────────────────────────────────────────────── */
.brand-icon {
  width: 28px; height: 28px;
  border-radius: 7px;
  background: linear-gradient(135deg, #6366F1, #A78BFA);
  display: flex; align-items: center; justify-content: center;
}
.brand-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: #E2E8F0 !important;
}
.brand-text--dim { color: rgba(226,232,240,0.4) !important; }

/* ── Connection pill ────────────────────────────────────────────────── */
.conn-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px; font-weight: 500;
}
.conn-pill--on  { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #10B981 !important; }
.conn-pill--off { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.25);  color: #EF4444 !important; }
.conn-dot {
  width: 7px; height: 7px; border-radius: 50%;
}
.conn-pill--on  .conn-dot { background: #10B981; box-shadow: 0 0 6px #10B981; }
.conn-pill--off .conn-dot { background: #EF4444; }
.conn-label { color: inherit !important; }

/* ── Hover card lift ────────────────────────────────────────────────── */
.card-hover {
  transition: border-color 0.2s, box-shadow 0.2s;
}
.card-hover:hover {
  border-color: rgba(99,102,241,0.25) !important;
  box-shadow: 0 0 0 1px rgba(99,102,241,0.12) !important;
}

/* ── Monospace ──────────────────────────────────────────────────────── */
.font-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }
</style>

<template>
  <div class="sr-root">

    <div class="sr-header">
      <div class="sr-header__left">
        <v-icon size="20" color="#F59E0B">mdi-lightbulb-on-outline</v-icon>
        <div>
          <div class="sr-header__title">Requested Skills</div>
          <div class="sr-header__sub">Skills the Planner selected that don't exist in the library yet</div>
        </div>
      </div>
      <div class="sr-header__right">
        <span class="sr-count-chip">{{ requests.length }} pending</span>
        <v-btn v-if="requests.length" variant="tonal" size="small" color="error" @click="clearAll">
          <v-icon size="13" start>mdi-delete-sweep-outline</v-icon>
          Clear all
        </v-btn>
        <v-btn variant="tonal" size="small" @click="fetch">
          <v-icon size="13" start>mdi-refresh</v-icon>
          Refresh
        </v-btn>
      </div>
    </div>

    <div class="sr-body">

      <!-- Empty state -->
      <div v-if="!requests.length" class="sr-empty">
        <div class="sr-empty__icon">
          <v-icon size="40" color="rgba(226,232,240,0.12)">mdi-check-circle-outline</v-icon>
        </div>
        <div class="sr-empty__text">No pending skill requests</div>
        <div class="sr-empty__sub">All skills selected by the Planner exist in the library.</div>
      </div>

      <!-- Request list -->
      <div v-else class="sr-list">

        <div class="sr-info-bar">
          <v-icon size="13" color="#6366F1">mdi-information-outline</v-icon>
          Create the missing file at the path shown below — the Planner will use it on the next run.
          Files must follow the same format as existing skill files in <code>skills/library/</code>.
        </div>

        <div v-for="req in requests" :key="req.id" class="sr-card">
          <div class="sr-card__top">
            <span class="sr-agent-chip" :class="`sr-agent-chip--${req.agent_id}`">{{ req.agent_id }}</span>
            <span class="sr-skill-name">{{ req.skill_name }}</span>
            <span class="sr-new-badge">new</span>
            <div style="flex:1" />
            <span class="sr-ts">{{ req.requested_at ? new Date(req.requested_at * 1000).toLocaleString() : '' }}</span>
            <v-btn icon size="x-small" variant="text" color="rgba(226,232,240,0.25)" @click="dismiss(req.id)" title="Dismiss">
              <v-icon size="14">mdi-close</v-icon>
            </v-btn>
          </div>

          <div class="sr-card__path">
            <v-icon size="12" color="#818CF8">mdi-file-plus-outline</v-icon>
            <code>skills/library/<strong>{{ req.agent_id }}</strong>/<strong>{{ req.skill_name }}</strong>.md</code>
          </div>

          <div v-if="req.goal" class="sr-card__goal">
            <v-icon size="11" color="rgba(226,232,240,0.25)">mdi-flag-outline</v-icon>
            {{ req.goal }}
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const requests = ref([]);

async function fetch() {
  try {
    const { data } = await axios.get('/api/settings/skill-requests');
    requests.value = data;
  } catch { /* ignore */ }
}

async function dismiss(id) {
  await axios.delete(`/api/settings/skill-requests/${id}`);
  await fetch();
}

async function clearAll() {
  await axios.delete('/api/settings/skill-requests/all');
  await fetch();
}

onMounted(fetch);
</script>

<style scoped>
.sr-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--v-theme-background, #07070E);
}

/* ── Header ──────────────────────────────────────────────────────────── */
.sr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 28px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.sr-header__left  { display: flex; align-items: center; gap: 12px; }
.sr-header__right { display: flex; align-items: center; gap: 8px; }
.sr-header__title { font-size: 17px; font-weight: 800; letter-spacing: -0.02em; color: rgba(226,232,240,0.95); }
.sr-header__sub   { font-size: 12px; color: rgba(226,232,240,0.35); margin-top: 2px; }

.sr-count-chip {
  font-size: 11px; font-weight: 700; padding: 3px 12px; border-radius: 12px;
  background: rgba(245,158,11,0.1); color: #F59E0B; border: 1px solid rgba(245,158,11,0.25);
}

/* ── Body ────────────────────────────────────────────────────────────── */
.sr-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}

/* ── Empty ───────────────────────────────────────────────────────────── */
.sr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 260px;
  text-align: center;
}
.sr-empty__text { font-size: 15px; font-weight: 700; color: rgba(226,232,240,0.4); }
.sr-empty__sub  { font-size: 12px; color: rgba(226,232,240,0.2); }

/* ── Info bar ─────────────────────────────────────────────────────────── */
.sr-info-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: rgba(226,232,240,0.35);
  line-height: 1.6;
  margin-bottom: 16px;
}
.sr-info-bar code { font-size: 11px; color: #818CF8; }

/* ── List ────────────────────────────────────────────────────────────── */
.sr-list { display: flex; flex-direction: column; gap: 10px; }

/* ── Card ────────────────────────────────────────────────────────────── */
.sr-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.15s;
}
.sr-card:hover { border-color: rgba(245,158,11,0.25); }

.sr-card__top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.sr-card__path {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.sr-card__path code {
  font-family: 'JetBrains Mono','Cascadia Code',monospace;
  font-size: 11px;
  color: rgba(226,232,240,0.4);
  word-break: break-all;
}
.sr-card__path code strong { color: rgba(226,232,240,0.7); }

.sr-card__goal {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  color: rgba(226,232,240,0.25);
  line-height: 1.5;
  padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* ── Chips ───────────────────────────────────────────────────────────── */
.sr-agent-chip {
  font-size: 10px; font-weight: 800; padding: 2px 9px;
  border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
  color: rgba(226,232,240,0.5); text-transform: uppercase; letter-spacing: 0.05em;
}
.sr-agent-chip--researcher { border-color: rgba(34,211,238,0.35);  color: #22D3EE; }
.sr-agent-chip--worker     { border-color: rgba(52,211,153,0.35);  color: #34D399; }
.sr-agent-chip--reviewer   { border-color: rgba(251,191,36,0.35);  color: #FBBF24; }

.sr-skill-name {
  font-size: 15px; font-weight: 800; color: rgba(226,232,240,0.9); letter-spacing: -0.01em;
}
.sr-new-badge {
  font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 1px 7px; border-radius: 5px;
  background: rgba(245,158,11,0.12); color: #F59E0B; border: 1px solid rgba(245,158,11,0.3);
}
.sr-ts {
  font-size: 10px; color: rgba(226,232,240,0.2); white-space: nowrap;
}
</style>

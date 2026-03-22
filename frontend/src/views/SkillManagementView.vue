<template>
  <div class="sm-root">
    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <div class="sm-header">
      <div class="sm-header__left">
        <div class="sm-header__title">Skills</div>
        <div class="sm-header__sub">Manage reusable skill files for each agent</div>
      </div>
      <v-btn
        color="#6366F1"
        variant="flat"
        size="small"
        prepend-icon="mdi-plus"
        class="sm-new-btn"
        @click="openCreate"
      >New Skill</v-btn>
    </div>

    <!-- ── Filters ────────────────────────────────────────────────────── -->
    <div class="sm-filters">
      <!-- Agent filter -->
      <div class="sm-filter-row">
        <span class="sm-filter-label">Agent</span>
        <div class="sm-chips">
          <button
            v-for="opt in agentOptions"
            :key="opt.value"
            class="sm-chip"
            :class="{ 'sm-chip--active': agentFilter === opt.value }"
            :style="agentFilter === opt.value ? { background: opt.activeBg, color: opt.activeColor, borderColor: opt.borderColor } : {}"
            @click="agentFilter = agentFilter === opt.value ? '' : opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- Category filter -->
      <div v-if="categories.length" class="sm-filter-row">
        <span class="sm-filter-label">Category</span>
        <div class="sm-chips">
          <button
            class="sm-chip"
            :class="{ 'sm-chip--active': categoryFilter === '' }"
            @click="categoryFilter = ''"
          >All</button>
          <button
            v-for="cat in categories"
            :key="cat"
            class="sm-chip"
            :class="{ 'sm-chip--active': categoryFilter === cat }"
            :style="categoryFilter === cat ? { background: 'rgba(167,139,250,0.18)', color: '#A78BFA', borderColor: 'rgba(167,139,250,0.4)' } : {}"
            @click="categoryFilter = categoryFilter === cat ? '' : cat"
          >{{ cat }}</button>
        </div>
      </div>
    </div>

    <!-- ── Skills Grid ─────────────────────────────────────────────────── -->
    <div class="sm-body">
      <div v-if="loading" class="sm-empty">
        <v-progress-circular indeterminate color="#6366F1" size="32" />
      </div>

      <div v-else-if="filteredSkills.length === 0" class="sm-empty">
        <v-icon size="40" color="rgba(255,255,255,0.15)">mdi-book-open-outline</v-icon>
        <div class="sm-empty__text">No skills match the current filters</div>
      </div>

      <div v-else class="sm-grid">
        <div
          v-for="skill in filteredSkills"
          :key="`${skill.agentId}:${skill.name}`"
          class="sm-card"
          :class="{ 'sm-card--missing': !skill.exists }"
        >
          <!-- Card header row -->
          <div class="sm-card__top">
            <span class="sm-agent-chip" :style="agentChipStyle(skill.agentId)">
              {{ skill.agentId }}
            </span>
            <span v-if="skill.category" class="sm-cat-badge">{{ skill.category }}</span>
            <span v-if="skill.requested" class="sm-req-badge">Requested</span>
            <div class="sm-card__actions">
              <button class="sm-icon-btn" title="Edit skill" @click="openEdit(skill)">
                <v-icon size="14">mdi-pencil-outline</v-icon>
              </button>
              <button class="sm-icon-btn sm-icon-btn--danger" title="Delete skill" @click="confirmDelete(skill)">
                <v-icon size="14">mdi-trash-can-outline</v-icon>
              </button>
            </div>
          </div>

          <!-- Card body -->
          <div class="sm-card__name">{{ skill.name }}</div>
          <div class="sm-card__desc">{{ skill.description || '—' }}</div>

          <!-- Missing file notice -->
          <div v-if="!skill.exists" class="sm-card__missing-note">
            <v-icon size="12" color="#F59E0B">mdi-alert-outline</v-icon>
            File not found — requested skill
          </div>
        </div>
      </div>

      <!-- ── Requested skills without files ─────────────────────────── -->
      <template v-if="pendingRequests.length">
        <div class="sm-section-title">
          <v-icon size="14" color="#F59E0B" class="mr-1">mdi-lightbulb-on-outline</v-icon>
          Requested skills without a file ({{ pendingRequests.length }})
        </div>
        <div class="sm-req-list">
          <div
            v-for="req in pendingRequests"
            :key="`req-${req.requestId}`"
            class="sm-req-item"
          >
            <div class="sm-req-item__left">
              <span class="sm-agent-chip sm-agent-chip--sm" :style="agentChipStyle(req.agentId)">{{ req.agentId }}</span>
              <span class="sm-req-item__name">{{ req.name }}</span>
              <span v-if="req.requestGoal" class="sm-req-item__goal">"{{ req.requestGoal }}"</span>
            </div>
            <div class="sm-req-item__actions">
              <v-btn size="x-small" variant="outlined" color="#6366F1" @click="openCreateFromRequest(req)">
                Create
              </v-btn>
              <button class="sm-icon-btn sm-icon-btn--danger" title="Dismiss request" @click="dismissRequest(req.requestId)">
                <v-icon size="13">mdi-close</v-icon>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Create / Edit Dialog ──────────────────────────────────────── -->
    <v-dialog v-model="dialogOpen" max-width="680" :persistent="saving">
      <v-card class="sm-dialog">
        <div class="sm-dialog__header">
          <span class="sm-dialog__title">{{ editingSkill ? `Edit skill: ${form.name}` : 'New Skill' }}</span>
          <button class="sm-icon-btn" @click="closeDialog">
            <v-icon size="16">mdi-close</v-icon>
          </button>
        </div>

        <div class="sm-dialog__body">
          <!-- Agent -->
          <v-select
            v-model="form.agentId"
            :items="['researcher', 'worker', 'reviewer']"
            label="Agent"
            :disabled="!!editingSkill"
            variant="outlined"
            density="compact"
            hide-details
            class="sm-field"
          />

          <!-- Skill name -->
          <v-text-field
            v-model="form.name"
            label="Skill name"
            :disabled="!!editingSkill"
            variant="outlined"
            density="compact"
            hint="Lowercase letters and hyphens only (e.g. html-css, python-fastapi)"
            persistent-hint
            class="sm-field"
          />

          <!-- Category -->
          <v-combobox
            v-model="form.category"
            :items="categories"
            label="Category (optional)"
            variant="outlined"
            density="compact"
            clearable
            hide-details
            class="sm-field"
          />

          <!-- Content -->
          <v-textarea
            v-model="form.content"
            label="Skill file content (Markdown)"
            variant="outlined"
            rows="14"
            no-resize
            hide-details
            class="sm-field sm-field--mono"
          />
        </div>

        <div class="sm-dialog__footer">
          <v-btn variant="text" color="rgba(255,255,255,0.4)" :disabled="saving" @click="closeDialog">Cancel</v-btn>
          <v-btn
            color="#6366F1"
            variant="flat"
            :loading="saving"
            :disabled="!form.agentId || !form.name"
            @click="saveSkill"
          >{{ editingSkill ? 'Save changes' : 'Create skill' }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- ── Delete Confirmation Dialog ────────────────────────────────── -->
    <v-dialog v-model="deleteDialogOpen" max-width="400">
      <v-card class="sm-dialog">
        <div class="sm-dialog__header">
          <span class="sm-dialog__title">Delete skill</span>
        </div>
        <div class="sm-dialog__body">
          <p class="sm-delete-msg">
            Are you sure you want to delete
            <strong style="color:#E2E8F0">{{ skillToDelete?.name }}</strong>?
            This cannot be undone.
          </p>
        </div>
        <div class="sm-dialog__footer">
          <v-btn variant="text" color="rgba(255,255,255,0.4)" @click="deleteDialogOpen = false">Cancel</v-btn>
          <v-btn color="#EF4444" variant="flat" :loading="deleting" @click="executeDelete">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- ── Error snackbar ────────────────────────────────────────────── -->
    <v-snackbar :model-value="!!errorMsg" :timeout="4000" color="error" location="bottom right"
      @update:model-value="v => { if (!v) errorMsg = '' }">
      {{ errorMsg }}
      <template #actions>
        <v-btn variant="text" @click="errorMsg = ''">Dismiss</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

// ── State ──────────────────────────────────────────────────────────────────

const skills      = ref([]);
const loading     = ref(false);
const agentFilter = ref('');
const categoryFilter = ref('');
const errorMsg    = ref('');

const dialogOpen   = ref(false);
const editingSkill = ref(null);   // skill object when editing, null when creating
const saving       = ref(false);

const deleteDialogOpen = ref(false);
const skillToDelete    = ref(null);
const deleting         = ref(false);

const form = ref({
  agentId:  'researcher',
  name:     '',
  category: '',
  content:  '',
});

// ── Agent options ──────────────────────────────────────────────────────────

const agentOptions = [
  { value: '',           label: 'All',        activeBg: 'rgba(99,102,241,0.18)',   activeColor: '#818CF8', borderColor: 'rgba(99,102,241,0.4)' },
  { value: 'researcher', label: 'Researcher',  activeBg: 'rgba(34,211,238,0.15)',   activeColor: '#22D3EE', borderColor: 'rgba(34,211,238,0.4)' },
  { value: 'worker',     label: 'Worker',      activeBg: 'rgba(52,211,153,0.15)',   activeColor: '#34D399', borderColor: 'rgba(52,211,153,0.4)' },
  { value: 'reviewer',   label: 'Reviewer',    activeBg: 'rgba(251,191,36,0.15)',   activeColor: '#FBBF24', borderColor: 'rgba(251,191,36,0.4)' },
];

// ── Computed ───────────────────────────────────────────────────────────────

const categories = computed(() =>
  [...new Set(skills.value.map(s => s.category).filter(Boolean))].sort()
);

const filteredSkills = computed(() =>
  skills.value.filter(s => {
    if (!s.exists) return false;  // missing-file skills shown in "Requested" section below
    if (agentFilter.value && s.agentId !== agentFilter.value) return false;
    if (categoryFilter.value && s.category !== categoryFilter.value) return false;
    return true;
  })
);

const pendingRequests = computed(() =>
  skills.value.filter(s => s.requested && !s.exists)
);

// ── Data fetching ──────────────────────────────────────────────────────────

async function fetchSkills() {
  loading.value = true;
  try {
    const { data } = await axios.get('/api/skills');
    skills.value = data;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message;
  } finally {
    loading.value = false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function agentChipStyle(agentId) {
  const map = {
    researcher: { background: 'rgba(34,211,238,0.12)',  color: '#22D3EE', borderColor: 'rgba(34,211,238,0.25)' },
    worker:     { background: 'rgba(52,211,153,0.12)',  color: '#34D399', borderColor: 'rgba(52,211,153,0.25)' },
    reviewer:   { background: 'rgba(251,191,36,0.12)',  color: '#FBBF24', borderColor: 'rgba(251,191,36,0.25)' },
  };
  return map[agentId] || {};
}

function resetForm() {
  form.value = { agentId: 'researcher', name: '', category: '', content: '' };
}

// ── Dialog open/close ──────────────────────────────────────────────────────

function openCreate() {
  editingSkill.value = null;
  resetForm();
  dialogOpen.value = true;
}

function openCreateFromRequest(req) {
  editingSkill.value = null;
  form.value = {
    agentId:  req.agentId,
    name:     req.name,
    category: '',
    content:  `> ${req.name} skill\n\n## Overview\n\n`,
  };
  dialogOpen.value = true;
}

async function openEdit(skill) {
  editingSkill.value = skill;
  form.value = {
    agentId:  skill.agentId,
    name:     skill.name,
    category: skill.category || '',
    content:  '',
  };
  dialogOpen.value = true;
  // Fetch full content
  try {
    const { data } = await axios.get(`/api/skills/${skill.agentId}/${skill.name}`);
    form.value.content = data.content || '';
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message;
  }
}

function closeDialog() {
  dialogOpen.value = false;
  editingSkill.value = null;
  resetForm();
}

// ── Save ───────────────────────────────────────────────────────────────────

async function saveSkill() {
  saving.value = true;
  try {
    if (editingSkill.value) {
      await axios.put(`/api/skills/${form.value.agentId}/${form.value.name}`, {
        content:  form.value.content,
        category: form.value.category || null,
      });
    } else {
      await axios.post('/api/skills', {
        agentId:  form.value.agentId,
        name:     form.value.name,
        category: form.value.category || null,
        content:  form.value.content,
      });
    }
    await fetchSkills();
    closeDialog();
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message;
  } finally {
    saving.value = false;
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────

function confirmDelete(skill) {
  skillToDelete.value = skill;
  deleteDialogOpen.value = true;
}

async function executeDelete() {
  if (!skillToDelete.value) return;
  deleting.value = true;
  try {
    await axios.delete(`/api/skills/${skillToDelete.value.agentId}/${skillToDelete.value.name}`);
    deleteDialogOpen.value = false;
    skillToDelete.value = null;
    await fetchSkills();
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message;
  } finally {
    deleting.value = false;
  }
}

// ── Dismiss request ────────────────────────────────────────────────────────

async function dismissRequest(id) {
  try {
    await axios.delete(`/api/skills/requests/${id}`);
    await fetchSkills();
  } catch (err) {
    errorMsg.value = err.response?.data?.error || err.message;
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(fetchSkills);
</script>

<style scoped>
/* ── Root ─────────────────────────────────────────────────────────────── */
.sm-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #07070E;
  color: #E2E8F0;
}

/* ── Header ───────────────────────────────────────────────────────────── */
.sm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.sm-header__left { display: flex; flex-direction: column; gap: 3px; }
.sm-header__title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: #E2E8F0;
}
.sm-header__sub {
  font-size: 12px;
  color: var(--c-muted);
}
.sm-new-btn { font-size: 12px !important; font-weight: 600 !important; }

/* ── Filters ──────────────────────────────────────────────────────────── */
.sm-filters {
  padding: 12px 24px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sm-filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sm-filter-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(226,232,240,0.35);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  min-width: 62px;
}
.sm-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.sm-chip {
  padding: 3px 11px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: rgba(226,232,240,0.5);
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.1px;
}
.sm-chip:hover { background: rgba(255,255,255,0.08); color: rgba(226,232,240,0.8); }
.sm-chip--active { font-weight: 700; }

/* ── Body ─────────────────────────────────────────────────────────────── */
.sm-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── Empty state ──────────────────────────────────────────────────────── */
.sm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: rgba(226,232,240,0.3);
}
.sm-empty__text { font-size: 13px; }

/* ── Grid ─────────────────────────────────────────────────────────────── */
.sm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* ── Card ─────────────────────────────────────────────────────────────── */
.sm-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s, background 0.15s;
}
.sm-card:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.12);
}
.sm-card--missing {
  border-color: rgba(245,158,11,0.2);
  background: rgba(245,158,11,0.04);
}

.sm-card__top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 22px;
}
.sm-card__actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.sm-card:hover .sm-card__actions { opacity: 1; }

.sm-card__name {
  font-size: 14px;
  font-weight: 700;
  color: #E2E8F0;
  letter-spacing: -0.2px;
  margin-top: 2px;
}
.sm-card__desc {
  font-size: 11px;
  color: rgba(226,232,240,0.45);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sm-card__missing-note {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #F59E0B;
  margin-top: 4px;
}

/* ── Agent chip ───────────────────────────────────────────────────────── */
.sm-agent-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid transparent;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.sm-agent-chip--sm { font-size: 9px; padding: 1px 6px; }

/* ── Category badge ───────────────────────────────────────────────────── */
.sm-cat-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(167,139,250,0.12);
  color: #A78BFA;
  border: 1px solid rgba(167,139,250,0.25);
}

/* ── Requested badge ──────────────────────────────────────────────────── */
.sm-req-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: rgba(245,158,11,0.12);
  color: #F59E0B;
  border: 1px solid rgba(245,158,11,0.25);
}

/* ── Icon buttons ─────────────────────────────────────────────────────── */
.sm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: rgba(226,232,240,0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.sm-icon-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #E2E8F0;
  border-color: rgba(255,255,255,0.15);
}
.sm-icon-btn--danger:hover {
  background: rgba(239,68,68,0.15);
  color: #EF4444;
  border-color: rgba(239,68,68,0.3);
}

/* ── Section title ────────────────────────────────────────────────────── */
.sm-section-title {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #F59E0B;
  letter-spacing: 0.2px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(245,158,11,0.12);
}

/* ── Requested list ───────────────────────────────────────────────────── */
.sm-req-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sm-req-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(245,158,11,0.05);
  border: 1px solid rgba(245,158,11,0.12);
  border-radius: 8px;
}
.sm-req-item__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.sm-req-item__name {
  font-size: 13px;
  font-weight: 600;
  color: #E2E8F0;
}
.sm-req-item__goal {
  font-size: 11px;
  color: rgba(226,232,240,0.4);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}
.sm-req-item__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ── Dialog ───────────────────────────────────────────────────────────── */
.sm-dialog {
  background: #0D0D1A !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 14px !important;
}
.sm-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.sm-dialog__title {
  font-size: 14px;
  font-weight: 700;
  color: #E2E8F0;
}
.sm-dialog__body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sm-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* ── Form fields ──────────────────────────────────────────────────────── */
.sm-field :deep(.v-field) {
  background: rgba(255,255,255,0.035) !important;
  border-radius: 8px !important;
}
.sm-field :deep(.v-field__outline__start),
.sm-field :deep(.v-field__outline__end),
.sm-field :deep(.v-field__outline__notch) {
  border-color: rgba(255,255,255,0.1) !important;
}
.sm-field :deep(.v-field--focused .v-field__outline__start),
.sm-field :deep(.v-field--focused .v-field__outline__end),
.sm-field :deep(.v-field--focused .v-field__outline__notch) {
  border-color: rgba(99,102,241,0.6) !important;
}
.sm-field :deep(.v-label) { color: rgba(226,232,240,0.4) !important; font-size: 13px !important; }
.sm-field :deep(input),
.sm-field :deep(textarea) { color: #E2E8F0 !important; font-size: 13px !important; }
.sm-field--mono :deep(textarea) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
  font-size: 12px !important;
  line-height: 1.55 !important;
}
.sm-field :deep(.v-hint) { color: rgba(226,232,240,0.3) !important; font-size: 11px !important; }

/* ── Delete dialog ────────────────────────────────────────────────────── */
.sm-delete-msg {
  font-size: 13px;
  color: rgba(226,232,240,0.7);
  line-height: 1.6;
  margin: 0;
}

/* ── Scrollbar ────────────────────────────────────────────────────────── */
.sm-body::-webkit-scrollbar { width: 5px; }
.sm-body::-webkit-scrollbar-track { background: transparent; }
.sm-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
</style>

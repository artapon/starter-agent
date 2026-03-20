<template>
  <div class="cron-root">

    <!-- ── Toolbar ───────────────────────────────────────────────────────── -->
    <div class="cron-toolbar">
      <span class="toolbar-title">
        <v-icon size="16" color="#818CF8">mdi-clock-outline</v-icon>
        Schedule
      </span>
      <span class="job-count">{{ jobs.length }} job{{ jobs.length !== 1 ? 's' : '' }}</span>
      <div class="toolbar-spacer" />
      <button class="btn-new" @click="openCreate">
        <v-icon size="14">mdi-plus</v-icon>
        New Job
      </button>
    </div>

    <!-- ── Empty state ───────────────────────────────────────────────────── -->
    <div v-if="!jobs.length" class="empty-state">
      <v-icon size="48" color="rgba(148,163,184,0.3)">mdi-clock-plus-outline</v-icon>
      <p>No cron jobs yet. Create one to schedule recurring tasks.</p>
    </div>

    <!-- ── Jobs table ────────────────────────────────────────────────────── -->
    <div v-else class="jobs-table-wrap">
      <table class="jobs-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Schedule</th>
            <th>Target</th>
            <th>Project</th>
            <th>Last Run</th>
            <th>Next Run</th>
            <th>Status</th>
            <th>Runs</th>
            <th class="th-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in jobs" :key="job.id" :class="{ 'row--disabled': !job.enabled }">
            <td class="td-name">
              <span class="job-name">{{ job.name }}</span>
              <span v-if="!job.enabled" class="badge-disabled">paused</span>
            </td>
            <td class="td-schedule">
              <code class="schedule-code">{{ job.schedule }}</code>
            </td>
            <td class="td-target">
              <span class="target-chip" :class="`target-chip--${job.target}`">
                <v-icon size="11">{{ targetIcon(job.target) }}</v-icon>
                {{ job.target }}
              </span>
            </td>
            <td class="td-project">
              <span v-if="job.project_id" class="project-chip">
                <v-icon size="10">mdi-folder-outline</v-icon>
                {{ projectName(job.project_id) }}
              </span>
              <span v-else class="td-none">—</span>
            </td>
            <td class="td-time">{{ fmtTime(job.last_run) }}</td>
            <td class="td-time">{{ fmtTime(job.next_run) }}</td>
            <td class="td-status">
              <span v-if="job.last_status" class="status-chip" :class="`status-chip--${job.last_status}`">
                <span class="status-dot" />
                {{ job.last_status }}
              </span>
              <span v-else class="status-chip status-chip--idle">
                <span class="status-dot" />
                idle
              </span>
            </td>
            <td class="td-runs">{{ job.run_count || 0 }}</td>
            <td class="td-actions">
              <button class="action-btn" title="Run now" @click="runNow(job)">
                <v-icon size="14">mdi-play</v-icon>
              </button>
              <button class="action-btn" :title="job.enabled ? 'Pause' : 'Resume'" @click="toggle(job)">
                <v-icon size="14">{{ job.enabled ? 'mdi-pause' : 'mdi-play-circle-outline' }}</v-icon>
              </button>
              <button class="action-btn" title="Edit" @click="openEdit(job)">
                <v-icon size="14">mdi-pencil-outline</v-icon>
              </button>
              <button class="action-btn action-btn--danger" title="Delete" @click="confirmDelete(job)">
                <v-icon size="14">mdi-delete-outline</v-icon>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Create / Edit dialog ──────────────────────────────────────────── -->
    <v-dialog v-model="dialog" max-width="560" persistent>
      <v-card class="cron-dialog">
        <v-card-title class="dialog-title">
          <v-icon size="18" color="#818CF8">{{ editingJob ? 'mdi-pencil-outline' : 'mdi-plus-circle-outline' }}</v-icon>
          {{ editingJob ? 'Edit Cron Job' : 'New Cron Job' }}
        </v-card-title>
        <v-card-text class="dialog-body">
          <div class="field-group">
            <label class="field-label">Name</label>
            <input class="field-input" v-model="form.name" placeholder="e.g. Daily research digest" />
          </div>

          <div class="field-group">
            <label class="field-label">Goal / Prompt</label>
            <textarea class="field-textarea" v-model="form.prompt" rows="3"
              placeholder="Describe the task or goal to run on this schedule…" />
          </div>

          <div class="field-group">
            <label class="field-label">Schedule</label>
            <!-- Dropdown select -->
            <div class="schedule-select-wrap">
              <v-icon size="14" class="schedule-select-icon" color="rgba(148,163,184,0.4)">mdi-clock-outline</v-icon>
              <select class="schedule-select" v-model="scheduleMode" @change="onScheduleModeChange">
                <option v-for="p in SCHEDULE_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
              <v-icon size="14" class="schedule-select-caret" color="rgba(148,163,184,0.4)">mdi-chevron-down</v-icon>
            </div>
            <!-- Custom cron expression — shown only when mode is 'custom' -->
            <template v-if="scheduleMode === 'custom'">
              <div class="schedule-row" style="margin-top:8px">
                <input class="field-input" v-model="form.schedule"
                  placeholder="e.g. 0 9 * * *" @blur="validateSchedule" />
                <span v-if="scheduleValid === true" class="schedule-badge schedule-badge--ok">
                  <v-icon size="12">mdi-check</v-icon> valid
                </span>
                <span v-else-if="scheduleValid === false" class="schedule-badge schedule-badge--err">
                  <v-icon size="12">mdi-close</v-icon> invalid
                </span>
              </div>
              <p v-if="scheduleError" class="field-error">{{ scheduleError }}</p>
              <p class="field-hint-text">
                Format: <code class="inline-code">minute hour day month weekday</code>
                &nbsp;·&nbsp; Times are in <strong>{{ localTz }}</strong>
              </p>
            </template>
            <!-- Preview of resolved expression for preset options -->
            <p v-else class="schedule-expr-preview">
              <v-icon size="11">mdi-code-tags</v-icon>
              {{ form.schedule }}
              <span class="tz-note">{{ localTz }}</span>
            </p>
          </div>

          <div class="field-group">
            <label class="field-label">Target</label>
            <div class="target-select">
              <button v-for="t in TARGETS" :key="t.value"
                class="target-btn" :class="{ 'target-btn--active': form.target === t.value }"
                @click="form.target = t.value">
                <v-icon size="13">{{ t.icon }}</v-icon>
                {{ t.label }}
              </button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Project <span class="required-star">*</span></label>
            <div class="schedule-select-wrap">
              <v-icon size="14" class="schedule-select-icon" color="rgba(148,163,184,0.4)">mdi-folder-outline</v-icon>
              <select class="schedule-select" v-model="form.project_id">
                <option value="" disabled>— Select a project —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
              </select>
              <v-icon size="14" class="schedule-select-caret" color="rgba(148,163,184,0.4)">mdi-chevron-down</v-icon>
            </div>
            <p v-if="form.project_id" class="schedule-expr-preview">
              <v-icon size="11">mdi-folder-open-outline</v-icon>
              workspace/{{ projectFolder(form.project_id) }}
            </p>
          </div>

          <div class="field-group field-group--inline">
            <label class="field-label">Enabled</label>
            <v-switch v-model="form.enabled" color="#818CF8" density="compact" hide-details />
          </div>
        </v-card-text>
        <v-card-actions class="dialog-actions">
          <button class="btn-cancel" @click="closeDialog">Cancel</button>
          <button class="btn-save" :disabled="!canSave" @click="save">
            {{ editingJob ? 'Save Changes' : 'Create Job' }}
          </button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ── Delete confirmation ───────────────────────────────────────────── -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card class="cron-dialog">
        <v-card-title class="dialog-title">
          <v-icon size="18" color="#F87171">mdi-delete-outline</v-icon>
          Delete Job
        </v-card-title>
        <v-card-text class="dialog-body">
          Delete <strong>{{ deletingJob?.name }}</strong>? This cannot be undone.
        </v-card-text>
        <v-card-actions class="dialog-actions">
          <button class="btn-cancel" @click="deleteDialog = false">Cancel</button>
          <button class="btn-danger" @click="doDelete">Delete</button>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSocket } from '../plugins/socket.js';

const API = '/api/cron';
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// ── State ─────────────────────────────────────────────────────────────────────
const jobs        = ref([]);
const projects    = ref([]);
const dialog      = ref(false);
const deleteDialog = ref(false);
const editingJob  = ref(null);
const deletingJob = ref(null);
const scheduleValid = ref(null);
const scheduleError = ref('');

const EMPTY_FORM = () => ({ name: '', schedule: '0 9 * * *', target: 'workflow', prompt: '', enabled: true, project_id: '' });
const form = ref(EMPTY_FORM());
const scheduleMode = ref('daily_9am');

const TARGETS = [
  { value: 'workflow',   label: 'Workflow',   icon: 'mdi-graph' },
  { value: 'researcher', label: 'Researcher', icon: 'mdi-magnify' },
  { value: 'planner',    label: 'Planner',    icon: 'mdi-clipboard-list-outline' },
  { value: 'worker',     label: 'Worker',     icon: 'mdi-code-braces' },
];

const SCHEDULE_OPTIONS = [
  { value: 'every_minute',    label: 'Every minute',        expr: '* * * * *' },
  { value: 'every_5min',      label: 'Every 5 minutes',     expr: '*/5 * * * *' },
  { value: 'every_15min',     label: 'Every 15 minutes',    expr: '*/15 * * * *' },
  { value: 'every_30min',     label: 'Every 30 minutes',    expr: '*/30 * * * *' },
  { value: 'every_hour',      label: 'Every hour',          expr: '0 * * * *' },
  { value: 'every_2h',        label: 'Every 2 hours',       expr: '0 */2 * * *' },
  { value: 'every_6h',        label: 'Every 6 hours',       expr: '0 */6 * * *' },
  { value: 'every_12h',       label: 'Every 12 hours',      expr: '0 */12 * * *' },
  { value: 'daily_midnight',  label: 'Daily at midnight',   expr: '0 0 * * *' },
  { value: 'daily_6am',       label: 'Daily at 6:00 AM',    expr: '0 6 * * *' },
  { value: 'daily_9am',       label: 'Daily at 9:00 AM',    expr: '0 9 * * *' },
  { value: 'daily_noon',      label: 'Daily at noon',       expr: '0 12 * * *' },
  { value: 'daily_6pm',       label: 'Daily at 6:00 PM',    expr: '0 18 * * *' },
  { value: 'weekly_mon',      label: 'Weekly — Monday 9am', expr: '0 9 * * 1' },
  { value: 'weekly_fri',      label: 'Weekly — Friday 9am', expr: '0 9 * * 5' },
  { value: 'monthly_1st',     label: 'Monthly — 1st day',   expr: '0 9 1 * *' },
  { value: 'custom',          label: '— Custom schedule —', expr: '' },
];

const canSave = computed(() =>
  form.value.name.trim() &&
  form.value.schedule.trim() &&
  form.value.prompt.trim() &&
  form.value.project_id &&
  scheduleValid.value !== false,
);

// ── Socket updates ─────────────────────────────────────────────────────────
const socket = useSocket();

onMounted(async () => {
  await Promise.all([loadJobs(), loadProjects()]);

  socket.on('cron:status', ({ id, status, error }) => {
    const job = jobs.value.find(j => j.id === id);
    if (job) {
      job.last_status = status;
      if (error) job.last_error = error;
    }
  });

  socket.on('cron:updated', ({ id }) => {
    fetchJob(id);
  });
});

onUnmounted(() => {
  socket.off('cron:status');
  socket.off('cron:updated');
});

// ── API calls ─────────────────────────────────────────────────────────────────
async function loadJobs() {
  try {
    const res  = await fetch(API);
    const body = await res.json();
    jobs.value = body.data || [];
  } catch { /* silent */ }
}

async function loadProjects() {
  try {
    const res  = await fetch('/api/projects');
    const body = await res.json();
    projects.value = Array.isArray(body) ? body : (body.data || []);
  } catch { /* silent */ }
}

async function fetchJob(id) {
  try {
    const res  = await fetch(`${API}/${id}`);
    const body = await res.json();
    if (!body.data) return;
    const idx = jobs.value.findIndex(j => j.id === id);
    if (idx >= 0) jobs.value[idx] = body.data;
    else jobs.value.unshift(body.data);
  } catch { /* silent */ }
}

async function validateSchedule() {
  const s = form.value.schedule.trim();
  if (!s) { scheduleValid.value = null; scheduleError.value = ''; return; }
  try {
    const res  = await fetch(`${API}/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: s }),
    });
    const body = await res.json();
    scheduleValid.value = body.data?.valid ?? false;
    scheduleError.value = body.data?.error || '';
  } catch {
    scheduleValid.value = null;
    scheduleError.value = '';
  }
}

async function save() {
  const payload = {
    name:       form.value.name.trim(),
    schedule:   form.value.schedule.trim(),
    target:     form.value.target,
    prompt:     form.value.prompt.trim(),
    enabled:    form.value.enabled,
    project_id: form.value.project_id || null,
  };
  try {
    if (editingJob.value) {
      await fetch(`${API}/${editingJob.value.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    closeDialog();
    await loadJobs();
  } catch { /* silent */ }
}

async function toggle(job) {
  try {
    await fetch(`${API}/${job.id}/toggle`, { method: 'PUT' });
    await loadJobs();
  } catch { /* silent */ }
}

async function runNow(job) {
  try {
    await fetch(`${API}/${job.id}/run`, { method: 'POST' });
    job.last_status = 'running';
  } catch { /* silent */ }
}

async function doDelete() {
  if (!deletingJob.value) return;
  try {
    await fetch(`${API}/${deletingJob.value.id}`, { method: 'DELETE' });
    deleteDialog.value = false;
    deletingJob.value = null;
    await loadJobs();
  } catch { /* silent */ }
}

// ── Dialog helpers ─────────────────────────────────────────────────────────
function onScheduleModeChange() {
  if (scheduleMode.value === 'custom') {
    form.value.schedule = '';
    scheduleValid.value = null;
    scheduleError.value = '';
  } else {
    const opt = SCHEDULE_OPTIONS.find(o => o.value === scheduleMode.value);
    if (opt) {
      form.value.schedule = opt.expr;
      scheduleValid.value = true;
      scheduleError.value = '';
    }
  }
}

function _detectMode(expr) {
  const match = SCHEDULE_OPTIONS.find(o => o.value !== 'custom' && o.expr === expr);
  return match ? match.value : 'custom';
}

function openCreate() {
  editingJob.value    = null;
  form.value          = EMPTY_FORM();
  scheduleMode.value  = 'daily_9am';
  scheduleValid.value = true;
  scheduleError.value = '';
  dialog.value        = true;
}

function openEdit(job) {
  editingJob.value    = job;
  form.value          = { name: job.name, schedule: job.schedule, target: job.target, prompt: job.prompt, enabled: !!job.enabled, project_id: job.project_id || '' };
  scheduleMode.value  = _detectMode(job.schedule);
  scheduleValid.value = true;
  scheduleError.value = '';
  dialog.value        = true;
}

function closeDialog() {
  dialog.value = false;
  editingJob.value = null;
}

function confirmDelete(job) {
  deletingJob.value = job;
  deleteDialog.value = true;
}

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtTime(unix) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function projectName(id) {
  return projects.value.find(p => p.id === id)?.title || id;
}

function projectFolder(id) {
  const p = projects.value.find(p => p.id === id);
  return p?.folderName || (p?.title || '').toLowerCase().replace(/\s+/g, '-');
}

function targetIcon(target) {
  const map = { workflow: 'mdi-graph', researcher: 'mdi-magnify', planner: 'mdi-clipboard-list-outline', worker: 'mdi-code-braces' };
  return map[target] || 'mdi-robot-outline';
}
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────── */
.cron-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0F172A;
  color: #E2E8F0;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.cron-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(148,163,184,0.08);
  background: #0F172A;
  flex-shrink: 0;
}
.toolbar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: #CBD5E1;
}
.job-count {
  font-size: 11px;
  color: rgba(148,163,184,0.5);
  background: rgba(148,163,184,0.08);
  border-radius: 8px;
  padding: 1px 7px;
}
.toolbar-spacer { flex: 1; }
.btn-new {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: #818CF8;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-new:hover { background: #6366F1; }

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(148,163,184,0.4);
  font-size: 13px;
}

/* ── Table ───────────────────────────────────────────────────────────────── */
.jobs-table-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
.jobs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.jobs-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(148,163,184,0.5);
  border-bottom: 1px solid rgba(148,163,184,0.08);
}
.jobs-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148,163,184,0.05);
  vertical-align: middle;
}
.jobs-table tbody tr:hover td { background: rgba(148,163,184,0.03); }
.row--disabled td { opacity: 0.5; }

.td-name { min-width: 160px; }
.job-name { font-weight: 500; color: #E2E8F0; }
.badge-disabled {
  margin-left: 6px;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(148,163,184,0.1);
  color: rgba(148,163,184,0.5);
}

.schedule-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  background: rgba(129,140,248,0.08);
  color: #A5B4FC;
  padding: 2px 6px;
  border-radius: 4px;
}

.target-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.target-chip--workflow   { background: rgba(129,140,248,0.15); color: #A5B4FC; }
.target-chip--researcher { background: rgba(52,211,153,0.12);  color: #6EE7B7; }
.target-chip--planner    { background: rgba(251,191,36,0.12);  color: #FCD34D; }
.target-chip--worker     { background: rgba(248,113,113,0.12); color: #FCA5A5; }

.td-time    { color: rgba(148,163,184,0.6); white-space: nowrap; font-size: 11px; }
.td-project { font-size: 11px; }
.td-none    { color: rgba(148,163,184,0.25); }
.project-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94A3B8;
  background: rgba(148,163,184,0.07);
  border-radius: 5px;
  padding: 2px 6px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.status-chip--idle    { color: rgba(148,163,184,0.4); }
.status-chip--running { color: #60A5FA; animation: pulse 1.2s ease-in-out infinite; }
.status-chip--success { color: #34D399; }
.status-chip--error   { color: #F87171; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.td-runs { color: rgba(148,163,184,0.5); text-align: center; }
.th-actions, .td-actions { text-align: right; }
.td-actions { display: flex; gap: 4px; justify-content: flex-end; }

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(148,163,184,0.1);
  border-radius: 5px;
  background: rgba(148,163,184,0.04);
  color: rgba(148,163,184,0.6);
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover { background: rgba(129,140,248,0.12); color: #A5B4FC; border-color: rgba(129,140,248,0.3); }
.action-btn--danger:hover { background: rgba(248,113,113,0.12); color: #FCA5A5; border-color: rgba(248,113,113,0.3); }

/* ── Dialog ──────────────────────────────────────────────────────────────── */
.cron-dialog { background: #1E293B !important; border: 1px solid rgba(148,163,184,0.1) !important; }
.dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px !important;
  font-weight: 600;
  color: #E2E8F0;
  padding: 16px 20px 8px;
}
.dialog-body { padding: 8px 20px 4px; }
.dialog-actions { padding: 12px 20px 16px; gap: 8px; justify-content: flex-end; }

.field-group { margin-bottom: 14px; }
.field-group--inline { display: flex; align-items: center; gap: 12px; }
.field-row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.field-row .field-group { margin-bottom: 0; }
.field-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(148,163,184,0.6);
  margin-bottom: 5px;
}
.field-hint { font-size: 10px; text-transform: none; letter-spacing: 0; color: rgba(148,163,184,0.35); }
.required-star { color: #F87171; font-size: 12px; margin-left: 2px; }

.field-input, .field-textarea {
  width: 100%;
  background: rgba(15,23,42,0.8);
  border: 1px solid rgba(148,163,184,0.12);
  border-radius: 6px;
  padding: 7px 10px;
  color: #E2E8F0;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
  font-family: inherit;
  box-sizing: border-box;
}
.field-input:focus, .field-textarea:focus { border-color: rgba(129,140,248,0.5); }
.field-textarea { resize: vertical; min-height: 80px; }
.field-error { font-size: 11px; color: #F87171; margin-top: 4px; }

/* schedule select dropdown */
.schedule-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.schedule-select-icon {
  position: absolute;
  left: 9px;
  pointer-events: none;
}
.schedule-select-caret {
  position: absolute;
  right: 9px;
  pointer-events: none;
}
.schedule-select {
  width: 100%;
  appearance: none;
  background: rgba(15,23,42,0.8);
  border: 1px solid rgba(148,163,184,0.12);
  border-radius: 6px;
  padding: 7px 30px 7px 30px;
  color: #E2E8F0;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}
.schedule-select:focus { border-color: rgba(129,140,248,0.5); }
.schedule-select option { background: #1E293B; color: #E2E8F0; }

.schedule-row { display: flex; align-items: center; gap: 8px; }
.schedule-row .field-input { flex: 1; }
.schedule-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: 5px;
  white-space: nowrap;
}
.schedule-badge--ok  { background: rgba(52,211,153,0.12); color: #34D399; }
.schedule-badge--err { background: rgba(248,113,113,0.12); color: #F87171; }

.schedule-expr-preview {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
  font-size: 11px;
  color: rgba(148,163,184,0.4);
}
.inline-code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  background: rgba(129,140,248,0.08);
  color: #A5B4FC;
  padding: 1px 5px;
  border-radius: 3px;
}
.field-hint-text {
  margin-top: 5px;
  font-size: 11px;
  color: rgba(148,163,184,0.4);
}
.tz-note {
  font-size: 10px;
  color: rgba(148,163,184,0.35);
  background: rgba(148,163,184,0.06);
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 4px;
}

.target-select { display: flex; gap: 6px; flex-wrap: wrap; }
.target-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(148,163,184,0.12);
  background: rgba(148,163,184,0.04);
  color: rgba(148,163,184,0.6);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.target-btn--active { border-color: rgba(129,140,248,0.4); background: rgba(129,140,248,0.12); color: #A5B4FC; }
.target-btn:hover:not(.target-btn--active) { border-color: rgba(148,163,184,0.2); color: #CBD5E1; }

.btn-cancel, .btn-save, .btn-danger {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}
.btn-cancel { background: rgba(148,163,184,0.08); color: rgba(148,163,184,0.7); }
.btn-cancel:hover { background: rgba(148,163,184,0.14); }
.btn-save { background: #818CF8; color: #fff; }
.btn-save:hover:not(:disabled) { background: #6366F1; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-danger { background: rgba(248,113,113,0.2); color: #F87171; }
.btn-danger:hover { background: rgba(248,113,113,0.3); }
</style>

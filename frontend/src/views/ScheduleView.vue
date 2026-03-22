<template>
  <div class="sched-root">

    <!-- ── Toolbar ─────────────────────────────────────────────────────────── -->
    <div class="sched-toolbar">
      <div class="toolbar-title">
        <v-icon size="14" color="#818CF8">mdi-clock-outline</v-icon>
        Schedule
      </div>

      <div class="toolbar-sep" />

      <span class="stat-chip">
        <v-icon size="11">mdi-calendar-clock</v-icon>
        {{ jobs.length }} job{{ jobs.length !== 1 ? 's' : '' }}
      </span>

      <div class="toolbar-spacer" />

      <div class="toolbar-actions">
        <button class="action-btn" @click="loadJobs" title="Refresh">
          <v-icon size="13">mdi-refresh</v-icon>
        </button>
        <button class="action-btn action-btn--primary" @click="openCreate">
          <v-icon size="13">mdi-plus</v-icon>
          New Job
        </button>
      </div>
    </div>

    <!-- ── Table ──────────────────────────────────────────────────────────── -->
    <div class="sched-table-wrap">
      <table class="sched-table">
        <thead>
          <tr>
            <th class="col-name">Name</th>
            <th class="col-schedule">Schedule</th>
            <th class="col-target">Target</th>
            <th class="col-project">Project</th>
            <th class="col-time">Last Run</th>
            <th class="col-time">Next Run</th>
            <th class="col-status">Status</th>
            <th class="col-runs">Runs</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!jobs.length">
            <td colspan="9" class="td-empty">
              <v-icon size="32" color="rgba(255,255,255,0.07)">mdi-clock-plus-outline</v-icon>
              <span>No cron jobs yet — create one to schedule recurring tasks.</span>
            </td>
          </tr>
          <tr v-else v-for="job in jobs" :key="job.id"
            class="sched-row" :class="{ 'sched-row--disabled': !job.enabled }">
            <td class="col-name">
              <span class="job-name">{{ job.name }}</span>
              <span v-if="!job.enabled" class="badge-paused">paused</span>
            </td>
            <td class="col-schedule">
              <code class="schedule-code">{{ job.schedule }}</code>
            </td>
            <td class="col-target">
              <span class="target-chip" :class="`target-chip--${job.target}`">
                <v-icon size="10">{{ targetIcon(job.target) }}</v-icon>
                {{ job.target }}
              </span>
            </td>
            <td class="col-project">
              <span v-if="job.project_id" class="project-chip">
                <v-icon size="10">mdi-folder-outline</v-icon>
                {{ projectName(job.project_id) }}
              </span>
              <span v-else class="col-none">—</span>
            </td>
            <td class="col-time">{{ fmtTime(job.last_run) }}</td>
            <td class="col-time">{{ fmtTime(job.next_run) }}</td>
            <td class="col-status">
              <span class="status-chip" :class="`status-chip--${job.last_status || 'idle'}`">
                <span class="status-dot" />
                {{ job.last_status || 'idle' }}
              </span>
            </td>
            <td class="col-runs">{{ job.run_count || 0 }}</td>
            <td class="col-actions">
              <div class="row-actions">
                <button class="row-btn" title="Run now" @click="runNow(job)">
                  <v-icon size="13">mdi-play</v-icon>
                </button>
                <button class="row-btn" :title="job.enabled ? 'Pause' : 'Resume'" @click="toggle(job)">
                  <v-icon size="13">{{ job.enabled ? 'mdi-pause' : 'mdi-play-circle-outline' }}</v-icon>
                </button>
                <button class="row-btn" title="Edit" @click="openEdit(job)">
                  <v-icon size="13">mdi-pencil-outline</v-icon>
                </button>
                <button class="row-btn row-btn--danger" title="Delete" @click="confirmDelete(job)">
                  <v-icon size="13">mdi-delete-outline</v-icon>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Footer ─────────────────────────────────────────────────────────── -->
    <div class="sched-footer">
      <span class="footer-label">Timezone: {{ localTz }}</span>
    </div>

    <!-- ── Create / Edit dialog ──────────────────────────────────────────── -->
    <v-dialog v-model="dialog" max-width="560" persistent>
      <v-card rounded="lg" style="background:#12121E;border:1px solid rgba(255,255,255,0.08)">
        <div class="dialog-header">
          <v-icon size="15" color="#818CF8">{{ editingJob ? 'mdi-pencil-outline' : 'mdi-plus-circle-outline' }}</v-icon>
          {{ editingJob ? 'Edit Cron Job' : 'New Cron Job' }}
        </div>
        <div class="dialog-body">

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
            <div class="schedule-select-wrap">
              <v-icon size="13" class="schedule-select-icon" color="rgba(226,232,240,0.25)">mdi-clock-outline</v-icon>
              <select class="schedule-select" v-model="scheduleMode" @change="onScheduleModeChange">
                <option v-for="p in SCHEDULE_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
              <v-icon size="13" class="schedule-select-caret" color="rgba(226,232,240,0.25)">mdi-chevron-down</v-icon>
            </div>
            <template v-if="scheduleMode === 'custom'">
              <div class="schedule-row" style="margin-top:8px">
                <input class="field-input" v-model="form.schedule"
                  placeholder="e.g. 0 9 * * *" @blur="validateSchedule" />
                <span v-if="scheduleValid === true" class="schedule-badge schedule-badge--ok">
                  <v-icon size="11">mdi-check</v-icon> valid
                </span>
                <span v-else-if="scheduleValid === false" class="schedule-badge schedule-badge--err">
                  <v-icon size="11">mdi-close</v-icon> invalid
                </span>
              </div>
              <p v-if="scheduleError" class="field-error">{{ scheduleError }}</p>
              <p class="field-hint-text">
                Format: <code class="inline-code">minute hour day month weekday</code>
                &nbsp;·&nbsp; Times are in <strong>{{ localTz }}</strong>
              </p>
            </template>
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
                <v-icon size="12">{{ t.icon }}</v-icon>
                {{ t.label }}
              </button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">Project <span class="required-star">*</span></label>
            <div class="schedule-select-wrap">
              <v-icon size="13" class="schedule-select-icon" color="rgba(226,232,240,0.25)">mdi-folder-outline</v-icon>
              <select class="schedule-select" v-model="form.project_id">
                <option value="" disabled>— Select a project —</option>
                <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
              </select>
              <v-icon size="13" class="schedule-select-caret" color="rgba(226,232,240,0.25)">mdi-chevron-down</v-icon>
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

        </div>
        <div class="dialog-footer">
          <button class="dlg-btn dlg-btn--cancel" @click="closeDialog">Cancel</button>
          <button class="dlg-btn dlg-btn--primary" :disabled="!canSave" @click="save">
            {{ editingJob ? 'Save Changes' : 'Create Job' }}
          </button>
        </div>
      </v-card>
    </v-dialog>

    <!-- ── Delete confirmation ────────────────────────────────────────────── -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card rounded="lg" style="background:#12121E;border:1px solid rgba(255,255,255,0.08)">
        <div class="dialog-header">
          <v-icon size="15" color="#EF4444">mdi-delete-outline</v-icon>
          Delete Job
        </div>
        <div class="dialog-body">
          Delete <strong>{{ deletingJob?.name }}</strong>? This cannot be undone.
        </div>
        <div class="dialog-footer">
          <button class="dlg-btn dlg-btn--cancel" @click="deleteDialog = false">Cancel</button>
          <button class="dlg-btn dlg-btn--danger" @click="doDelete">Delete</button>
        </div>
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
const jobs         = ref([]);
const projects     = ref([]);
const dialog       = ref(false);
const deleteDialog = ref(false);
const editingJob   = ref(null);
const deletingJob  = ref(null);
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

function onCronStatus({ id, status, error }) {
  const job = jobs.value.find(j => j.id === id);
  if (job) {
    job.last_status = status;
    if (error) job.last_error = error;
  }
}
function onCronUpdated({ id }) { fetchJob(id); }

onMounted(async () => {
  await Promise.all([loadJobs(), loadProjects()]);
  socket.on('cron:status',  onCronStatus);
  socket.on('cron:updated', onCronUpdated);
});

onUnmounted(() => {
  socket.off('cron:status',  onCronStatus);
  socket.off('cron:updated', onCronUpdated);
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
/* ── Root ────────────────────────────────────────────────────────────────── */
.sched-root {
  display: flex; flex-direction: column;
  height: 100%; overflow: hidden;
  background: #08080F;
  color: #E2E8F0;
  font-size: 13px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.sched-toolbar {
  display: flex; align-items: center; gap: 0;
  padding: 0 20px;
  height: 50px; flex-shrink: 0;
  background: #0D0D1A;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  overflow-x: auto;
}
.sched-toolbar::-webkit-scrollbar { display: none; }

.toolbar-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 600;
  color: rgba(226,232,240,0.8);
  flex-shrink: 0;
}
.toolbar-sep {
  width: 1px; height: 22px; flex-shrink: 0;
  background: rgba(255,255,255,0.07); margin: 0 14px;
}
.toolbar-spacer { flex: 1; }

.stat-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 6px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  font-size: 11px; color: rgba(226,232,240,0.35); flex-shrink: 0;
}

.toolbar-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.action-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 7px;
  font-size: 11px; font-weight: 600;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(226,232,240,0.5); cursor: pointer; transition: all 0.15s;
}
.action-btn:hover { background: rgba(255,255,255,0.08); color: #E2E8F0; }
.action-btn--primary {
  background: rgba(129,140,248,0.12);
  border-color: rgba(129,140,248,0.3);
  color: #A5B4FC;
}
.action-btn--primary:hover { background: rgba(129,140,248,0.22); color: #C7D2FE; }

/* ── Table ───────────────────────────────────────────────────────────────── */
.sched-table-wrap { flex: 1; overflow-y: auto; }
.sched-table-wrap::-webkit-scrollbar { width: 5px; }
.sched-table-wrap::-webkit-scrollbar-track { background: transparent; }
.sched-table-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

.sched-table { width: 100%; border-collapse: collapse; font-size: 12px; }

.sched-table thead th {
  position: sticky; top: 0; z-index: 2;
  padding: 10px 12px;
  background: #0D0D1A;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: rgba(226,232,240,0.3);
  text-align: left; white-space: nowrap;
}

.sched-row td { padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); vertical-align: middle; }
.sched-row:hover td { background: rgba(255,255,255,0.02); }
.sched-row--disabled td { opacity: 0.4; }

/* Column sizing */
.col-name     { min-width: 150px; }
.col-schedule { width: 135px; }
.col-target   { width: 110px; }
.col-project  { width: 130px; }
.col-time     { width: 120px; color: rgba(226,232,240,0.38); white-space: nowrap; font-size: 11px; }
.col-status   { width: 95px; }
.col-runs     { width: 56px; text-align: center; color: rgba(226,232,240,0.3); }
.col-actions  { width: 112px; }
.col-none     { color: rgba(226,232,240,0.2); }

/* Name cell */
.job-name { font-weight: 500; color: rgba(226,232,240,0.9); }
.badge-paused {
  margin-left: 6px; font-size: 10px;
  padding: 1px 5px; border-radius: 4px;
  background: rgba(255,255,255,0.06); color: rgba(226,232,240,0.3);
}

/* Schedule expression */
.schedule-code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  background: rgba(129,140,248,0.08); color: #A5B4FC;
  padding: 2px 6px; border-radius: 4px;
}

/* Target chips — canonical agent colors */
.target-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 5px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.target-chip--workflow   { background: rgba(99,102,241,0.12);  color: #A5B4FC; }
.target-chip--researcher { background: rgba(34,211,238,0.12);  color: #67E8F9; }
.target-chip--planner    { background: rgba(129,140,248,0.14); color: #C4B5FD; }
.target-chip--worker     { background: rgba(52,211,153,0.12);  color: #6EE7B7; }

/* Project chip */
.project-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: rgba(226,232,240,0.5);
  background: rgba(255,255,255,0.05); border-radius: 5px;
  padding: 2px 7px;
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Status chip */
.status-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 5px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.status-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.status-chip--idle    { color: rgba(226,232,240,0.28); }
.status-chip--running { color: #38BDF8; animation: pulse-status 1.2s ease-in-out infinite; }
.status-chip--success { color: #34D399; }
.status-chip--error   { color: #EF4444; }
@keyframes pulse-status { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Row action buttons */
.row-actions { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
.row-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 6px;
  background: transparent; border: 1px solid rgba(255,255,255,0.06);
  color: rgba(226,232,240,0.4); cursor: pointer; transition: all 0.15s;
}
.row-btn:hover { background: rgba(255,255,255,0.07); color: rgba(226,232,240,0.85); border-color: rgba(255,255,255,0.12); }
.row-btn--danger:hover { background: rgba(239,68,68,0.1); color: #EF4444; border-color: rgba(239,68,68,0.28); }

/* Empty state */
.td-empty {
  text-align: center; padding: 64px 20px;
  color: rgba(226,232,240,0.25); font-size: 13px;
}
.td-empty > * { display: block; margin: 0 auto 8px; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.sched-footer {
  display: flex; align-items: center;
  height: 38px; flex-shrink: 0; padding: 0 20px;
  background: #0D0D1A;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
}
.footer-label { color: rgba(226,232,240,0.2); font-family: monospace; }

/* ── Dialog ──────────────────────────────────────────────────────────────── */
.dialog-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px 0;
  font-size: 13px; font-weight: 700; color: #E2E8F0;
}
.dialog-body {
  padding: 14px 20px 6px;
  font-size: 13px; color: rgba(226,232,240,0.65); line-height: 1.6;
}
.dialog-body strong { color: #E2E8F0; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 20px 16px; }

.dlg-btn {
  padding: 6px 16px; border-radius: 7px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  border: 1px solid transparent; transition: all 0.15s;
}
.dlg-btn--cancel { background: transparent; border-color: rgba(255,255,255,0.1); color: rgba(226,232,240,0.45); }
.dlg-btn--cancel:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.dlg-btn--primary { background: rgba(129,140,248,0.15); border-color: rgba(129,140,248,0.35); color: #A5B4FC; }
.dlg-btn--primary:hover:not(:disabled) { background: rgba(129,140,248,0.25); color: #C7D2FE; }
.dlg-btn--primary:disabled { opacity: 0.35; cursor: not-allowed; }
.dlg-btn--danger { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.28); color: #F87171; }
.dlg-btn--danger:hover { background: rgba(239,68,68,0.18); }

/* ── Form fields ─────────────────────────────────────────────────────────── */
.field-group { margin-bottom: 14px; }
.field-group--inline { display: flex; align-items: center; gap: 12px; }
.field-label {
  display: block;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: rgba(226,232,240,0.3);
  margin-bottom: 5px;
}
.required-star { color: #EF4444; font-size: 11px; margin-left: 2px; }

.field-input, .field-textarea {
  width: 100%;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px; padding: 7px 10px;
  color: #E2E8F0; font-size: 12px; outline: none;
  transition: border-color 0.15s;
  font-family: inherit; box-sizing: border-box;
}
.field-input:focus, .field-textarea:focus { border-color: rgba(129,140,248,0.5); }
.field-textarea { resize: vertical; min-height: 80px; }
.field-error { font-size: 11px; color: #EF4444; margin-top: 4px; }

.schedule-select-wrap { position: relative; display: flex; align-items: center; }
.schedule-select-icon  { position: absolute; left: 9px; pointer-events: none; }
.schedule-select-caret { position: absolute; right: 9px; pointer-events: none; }
.schedule-select {
  width: 100%; appearance: none;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px; padding: 7px 30px 7px 30px;
  color: #E2E8F0; font-size: 12px; font-family: inherit;
  outline: none; cursor: pointer; transition: border-color 0.15s;
}
.schedule-select:focus { border-color: rgba(129,140,248,0.5); }
.schedule-select option { background: #12121E; color: #E2E8F0; }

.schedule-row { display: flex; align-items: center; gap: 8px; }
.schedule-row .field-input { flex: 1; }

.schedule-badge {
  display: flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 600;
  padding: 3px 7px; border-radius: 5px; white-space: nowrap;
}
.schedule-badge--ok  { background: rgba(52,211,153,0.1);  color: #34D399; }
.schedule-badge--err { background: rgba(239,68,68,0.1);   color: #EF4444; }

.schedule-expr-preview {
  display: flex; align-items: center; gap: 5px;
  margin-top: 5px; font-size: 11px;
  color: rgba(226,232,240,0.35);
}
.inline-code {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  background: rgba(129,140,248,0.08); color: #A5B4FC;
  padding: 1px 5px; border-radius: 3px;
}
.field-hint-text { margin-top: 5px; font-size: 11px; color: rgba(226,232,240,0.35); }
.tz-note {
  font-size: 10px; color: rgba(226,232,240,0.3);
  background: rgba(255,255,255,0.05);
  border-radius: 4px; padding: 1px 5px; margin-left: 4px;
}

.target-select { display: flex; gap: 6px; flex-wrap: wrap; }
.target-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: rgba(226,232,240,0.5);
  font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.target-btn--active { border-color: rgba(129,140,248,0.4); background: rgba(129,140,248,0.1); color: #A5B4FC; }
.target-btn:hover:not(.target-btn--active) { border-color: rgba(255,255,255,0.14); color: #CBD5E1; }
</style>

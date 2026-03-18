<template>
  <div class="proj-root">

    <!-- Header -->
    <div class="proj-header">
      <div>
        <div class="page-title">Projects</div>
        <div class="page-subtitle">Organize your work — each project has isolated agent memory</div>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="openCreate"
        style="box-shadow:0 2px 12px rgba(99,102,241,0.25)">
        New Project
      </v-btn>
    </div>

    <!-- Empty state -->
    <div v-if="!projects.length && !loading" class="proj-empty">
      <v-icon size="52" style="color:rgba(226,232,240,0.1)">mdi-folder-open-outline</v-icon>
      <div class="proj-empty__title">No projects yet</div>
      <div class="proj-empty__sub">Create your first project to keep agent memory isolated per context</div>
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" class="mt-4" @click="openCreate">
        Create Project
      </v-btn>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="proj-empty">
      <v-progress-circular indeterminate color="#6366F1" size="32" />
    </div>

    <!-- Project grid -->
    <div v-else class="proj-grid">
      <div v-for="project in projects" :key="project.id" class="proj-card card-hover">
        <div class="proj-card__body">
          <div class="proj-card__icon">
            <v-icon size="20" color="#A78BFA">mdi-folder-outline</v-icon>
          </div>
          <div class="proj-card__info">
            <div class="proj-card__title">{{ project.title }}</div>
            <div class="proj-card__desc">{{ project.description || 'No description' }}</div>
            <div class="proj-card__meta">
              Created {{ formatDate(project.createdAt) }}
            </div>
          </div>
        </div>
        <div class="proj-card__actions">
          <v-btn size="x-small" variant="text" icon="mdi-pencil-outline"
            style="color:rgba(226,232,240,0.4)" @click="openEdit(project)" />
          <v-btn size="x-small" variant="text" icon="mdi-delete-outline"
            style="color:rgba(239,68,68,0.5)" @click="confirmDelete(project)" />
          <router-link :to="`/chat?projectId=${project.id}`" class="proj-open-btn">
            <v-icon size="13">mdi-chat-outline</v-icon>
            Chat
          </router-link>
          <router-link :to="`/memory?projectId=${project.id}`" class="proj-open-btn proj-open-btn--mem">
            <v-icon size="13">mdi-brain</v-icon>
            Memory
          </router-link>
        </div>
      </div>
    </div>

    <!-- Create / Edit dialog -->
    <v-dialog v-model="dialog.show" max-width="480">
      <v-card rounded="lg" style="background:#12121E">
        <div class="dialog-title">
          <v-icon size="16" color="#6366F1">{{ dialog.mode === 'create' ? 'mdi-plus-circle-outline' : 'mdi-pencil-outline' }}</v-icon>
          <span>{{ dialog.mode === 'create' ? 'New Project' : 'Edit Project' }}</span>
        </div>
        <div class="dialog-body">
          <v-text-field
            v-model="dialog.title"
            label="Title"
            variant="outlined"
            density="compact"
            hide-details="auto"
            :rules="[v => !!v?.trim() || 'Title is required']"
            autofocus
            class="mb-3"
          />
          <v-textarea
            v-model="dialog.description"
            label="Description (optional)"
            variant="outlined"
            density="compact"
            hide-details
            rows="3"
          />
        </div>
        <div class="dialog-footer">
          <v-btn variant="text" size="small" @click="dialog.show = false"
            style="color:rgba(226,232,240,0.4)">Cancel</v-btn>
          <v-btn color="primary" size="small" :loading="dialog.saving"
            :disabled="!dialog.title.trim()"
            @click="saveDialog">
            {{ dialog.mode === 'create' ? 'Create' : 'Save' }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Delete confirm dialog -->
    <v-dialog v-model="deleteDialog.show" max-width="380">
      <v-card rounded="lg" style="background:#12121E">
        <div class="dialog-title">
          <v-icon size="16" color="#EF4444">mdi-delete-outline</v-icon>
          <span>Delete Project</span>
        </div>
        <div class="dialog-body">
          <p style="font-size:14px;color:rgba(226,232,240,0.7)">
            Delete <strong style="color:#E2E8F0">{{ deleteDialog.project?.title }}</strong>?
            This cannot be undone.
          </p>
        </div>
        <div class="dialog-footer">
          <v-btn variant="text" size="small" @click="deleteDialog.show = false"
            style="color:rgba(226,232,240,0.4)">Cancel</v-btn>
          <v-btn color="error" size="small" :loading="deleteDialog.deleting"
            @click="doDelete">Delete</v-btn>
        </div>
      </v-card>
    </v-dialog>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const projects = ref([]);
const loading  = ref(true);

const dialog = ref({ show: false, mode: 'create', id: null, title: '', description: '', saving: false });
const deleteDialog = ref({ show: false, project: null, deleting: false });

async function fetchProjects() {
  loading.value = true;
  try { projects.value = await axios.get('/api/projects').then(r => r.data); }
  catch { projects.value = []; }
  finally { loading.value = false; }
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function openCreate() {
  dialog.value = { show: true, mode: 'create', id: null, title: '', description: '', saving: false };
}
function openEdit(p) {
  dialog.value = { show: true, mode: 'edit', id: p.id, title: p.title, description: p.description || '', saving: false };
}
function confirmDelete(p) {
  deleteDialog.value = { show: true, project: p, deleting: false };
}

async function saveDialog() {
  if (!dialog.value.title.trim()) return;
  dialog.value.saving = true;
  try {
    if (dialog.value.mode === 'create') {
      await axios.post('/api/projects', { title: dialog.value.title, description: dialog.value.description });
    } else {
      await axios.put(`/api/projects/${dialog.value.id}`, { title: dialog.value.title, description: dialog.value.description });
    }
    dialog.value.show = false;
    await fetchProjects();
  } catch { /* ignore */ }
  finally { dialog.value.saving = false; }
}

async function doDelete() {
  if (!deleteDialog.value.project) return;
  deleteDialog.value.deleting = true;
  try {
    await axios.delete(`/api/projects/${deleteDialog.value.project.id}`);
    deleteDialog.value.show = false;
    await fetchProjects();
  } catch { /* ignore */ }
  finally { deleteDialog.value.deleting = false; }
}

onMounted(fetchProjects);
</script>

<style scoped>
.proj-root { padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; }
.proj-header { display: flex; align-items: flex-start; justify-content: space-between; }

.proj-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 60px 20px; gap: 10px; text-align: center;
}
.proj-empty__title { font-size: 15px; font-weight: 600; color: rgba(226,232,240,0.4); }
.proj-empty__sub   { font-size: 12px; color: rgba(226,232,240,0.25); max-width: 320px; }

.proj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.proj-card {
  background: #12121E;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
  display: flex; flex-direction: column;
  transition: border-color 0.2s;
}
.proj-card:hover { border-color: rgba(99,102,241,0.2); }

.proj-card__body {
  display: flex; gap: 12px;
  padding: 16px;
  flex: 1;
}
.proj-card__icon {
  width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
  background: rgba(167,139,250,0.1);
  border: 1px solid rgba(167,139,250,0.2);
  display: flex; align-items: center; justify-content: center;
}
.proj-card__info   { flex: 1; min-width: 0; }
.proj-card__title  { font-size: 14px; font-weight: 700; color: #E2E8F0; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proj-card__desc   { font-size: 12px; color: rgba(226,232,240,0.45); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.proj-card__meta   { font-size: 11px; color: rgba(226,232,240,0.25); margin-top: 8px; }

.proj-card__actions {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.01);
}

.proj-open-btn {
  display: inline-flex; align-items: center; gap: 4px; margin-left: auto;
  font-size: 11px; font-weight: 600; color: #6366F1;
  text-decoration: none;
  padding: 3px 10px; border-radius: 5px;
  border: 1px solid rgba(99,102,241,0.3);
  background: rgba(99,102,241,0.08);
  transition: background 0.15s;
}
.proj-open-btn:hover { background: rgba(99,102,241,0.15); }
.proj-open-btn--mem {
  color: #14B8A6;
  border-color: rgba(20,184,166,0.3);
  background: rgba(20,184,166,0.08);
}
.proj-open-btn--mem:hover { background: rgba(20,184,166,0.15); }

/* Dialogs */
.dialog-title {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px 0;
  font-size: 14px; font-weight: 700;
}
.dialog-body   { padding: 16px 20px; }
.dialog-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 0 20px 16px;
}
</style>

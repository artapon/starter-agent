import { ref, watch } from 'vue';

// Module-level singleton — shared across all components
const activeProject = ref(null);

const stored = localStorage.getItem('activeProject');
if (stored) {
  try { activeProject.value = JSON.parse(stored); } catch { /* ignore */ }
}

watch(activeProject, (v) => {
  if (v) localStorage.setItem('activeProject', JSON.stringify(v));
  else localStorage.removeItem('activeProject');
}, { deep: true });

export function useActiveProject() {
  function setActiveProject(project) {
    activeProject.value = project ? { id: project.id, title: project.title, folderName: project.folderName } : null;
  }

  function clearActiveProject() {
    activeProject.value = null;
  }

  return { activeProject, setActiveProject, clearActiveProject };
}

import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: 'Dashboard', icon: 'mdi-view-dashboard' } },
  { path: '/projects',  component: () => import('../views/ProjectsView.vue'),  meta: { title: 'Projects',  icon: 'mdi-folder-multiple-outline' } },
  { path: '/chat',      component: () => import('../views/ChatView.vue'),      meta: { title: 'Chat',      icon: 'mdi-chat',         requiresProject: true } },
  { path: '/workflow',  component: () => import('../views/WorkflowView.vue'),  meta: { title: 'Workflow',  icon: 'mdi-graph',        requiresProject: true } },
  { path: '/memory',    component: () => import('../views/MemoryView.vue'),    meta: { title: 'Memory',    icon: 'mdi-brain',        requiresProject: true } },
  { path: '/debug',     component: () => import('../views/DebugView.vue'),     meta: { title: 'Debug',     icon: 'mdi-bug-outline' } },
  { path: '/report/:sessionId', component: () => import('../views/WalkthroughView.vue'), meta: { nav: false } },
  { path: '/logs',      component: () => import('../views/LogsView.vue'),      meta: { title: 'Logs',      icon: 'mdi-text-box-multiple' } },
  { path: '/settings',  component: () => import('../views/SettingsView.vue'),  meta: { title: 'Settings',  icon: 'mdi-cog' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (!to.meta?.requiresProject) return true;
  const stored = localStorage.getItem('activeProject');
  if (!stored) {
    return { path: '/projects', query: { redirect: to.fullPath } };
  }
  try {
    const p = JSON.parse(stored);
    if (!p?.id) return { path: '/projects', query: { redirect: to.fullPath } };
  } catch {
    return { path: '/projects', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;

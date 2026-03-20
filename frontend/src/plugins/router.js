import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: 'Dashboard', icon: 'mdi-view-dashboard' } },
  { path: '/projects',  component: () => import('../views/ProjectsView.vue'),  meta: { title: 'Projects',  icon: 'mdi-folder-multiple-outline' } },
  { path: '/chat',      component: () => import('../views/ChatView.vue'),      meta: { title: 'Chat',      icon: 'mdi-chat' } },
  { path: '/workflow',  component: () => import('../views/WorkflowView.vue'),  meta: { title: 'Workflow',  icon: 'mdi-graph' } },
  { path: '/schedule',  component: () => import('../views/ScheduleView.vue'),  meta: { title: 'Schedule',  icon: 'mdi-clock-outline' } },
  { path: '/memory',    component: () => import('../views/MemoryView.vue'),    meta: { title: 'Memory',    icon: 'mdi-brain' } },
  { path: '/debug',     component: () => import('../views/DebugView.vue'),     meta: { title: 'Debug',     icon: 'mdi-bug-outline' } },
  { path: '/report/:sessionId', component: () => import('../views/WalkthroughView.vue'), meta: { nav: false } },
  { path: '/logs',      component: () => import('../views/LogsView.vue'),      meta: { title: 'Logs',      icon: 'mdi-text-box-multiple' } },
  { path: '/settings',  component: () => import('../views/SettingsView.vue'),  meta: { title: 'Settings',  icon: 'mdi-cog' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});


export default router;

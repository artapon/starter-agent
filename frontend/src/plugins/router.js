import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: 'Dashboard', icon: 'mdi-view-dashboard' } },
  { path: '/chat',      component: () => import('../views/ChatView.vue'),      meta: { title: 'Chat',      icon: 'mdi-chat' } },
  { path: '/workflow',  component: () => import('../views/WorkflowView.vue'),  meta: { title: 'Workflow',  icon: 'mdi-graph' } },
  { path: '/memory',    component: () => import('../views/MemoryView.vue'),    meta: { title: 'Memory',    icon: 'mdi-brain' } },
  { path: '/debug',     component: () => import('../views/DebugView.vue'),     meta: { title: 'Debug',     icon: 'mdi-bug-outline' } },
  { path: '/report/:sessionId', component: () => import('../views/WalkthroughView.vue'), meta: { nav: false } },
  { path: '/logs',      component: () => import('../views/LogsView.vue'),      meta: { title: 'Logs',      icon: 'mdi-text-box-multiple' } },
  { path: '/settings',  component: () => import('../views/SettingsView.vue'),  meta: { title: 'Settings',  icon: 'mdi-cog' } },
];

export default createRouter({
  history: createWebHistory(),
  routes,
});

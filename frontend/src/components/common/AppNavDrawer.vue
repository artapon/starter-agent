<template>
  <v-navigation-drawer v-model="model" color="surface" width="220"
    style="border-right:1px solid rgba(255,255,255,0.06)">

    <!-- Brand -->
    <div class="nav-brand">
      <div class="nav-brand__icon">
        <v-icon size="18" color="white">mdi-robot-excited</v-icon>
      </div>
      <div class="nav-brand__text">
        <div class="nav-brand__name">StarterAgent</div>
        <div class="nav-brand__sub">Multi-Agent AI</div>
      </div>
    </div>

    <div class="nav-divider" />

    <!-- Nav items -->
    <div class="nav-list">
      <router-link
        v-for="route in navRoutes"
        :key="route.path"
        :to="route.path"
        class="nav-item"
        :class="{ 'nav-item--active': currentPath === route.path }"
      >
        <div class="nav-item__icon-wrap">
          <v-icon size="16" class="nav-item__icon">{{ route.meta.icon }}</v-icon>
        </div>
        <span class="nav-item__label">{{ route.meta.title }}</span>
        <span v-if="currentPath === route.path" class="nav-item__bar" />
      </router-link>
    </div>

    <!-- Footer -->
    <template #append>
      <div class="nav-divider" />
      <div class="nav-footer">
        <div class="nav-footer__badge">
          <v-icon size="11" color="#A78BFA">mdi-lightning-bolt</v-icon>
          <span>LM Studio</span>
        </div>
        <span class="nav-footer__version">v1.0</span>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const model = defineModel({ type: Boolean });
const router = useRouter();
const route  = useRoute();

const currentPath = computed(() => route.path);
const navRoutes   = computed(() => router.options.routes.filter(r => r.meta?.title && r.meta?.nav !== false));
</script>

<style scoped>
/* Brand */
.nav-brand {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 14px 12px;
}
.nav-brand__icon {
  width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366F1 0%, #A78BFA 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 0 16px rgba(99,102,241,0.3);
}
.nav-brand__text { display: flex; flex-direction: column; }
.nav-brand__name {
  font-size: 13px; font-weight: 700; letter-spacing: -0.3px;
  color: #E2E8F0 !important;
}
.nav-brand__sub {
  font-size: 10px; color: rgba(226,232,240,0.3) !important; margin-top: 1px;
  letter-spacing: 0.3px;
}

/* Divider */
.nav-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0; }

/* Nav list */
.nav-list { padding: 6px 8px; display: flex; flex-direction: column; gap: 1px; }

/* Nav item */
.nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 8px;
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
  position: relative;
  transition: background 0.15s, color 0.15s;
  color: rgba(226,232,240,0.5) !important;
}
.nav-item:hover {
  background: rgba(255,255,255,0.04);
  color: rgba(226,232,240,0.85) !important;
}
.nav-item--active {
  background: linear-gradient(90deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%) !important;
  color: #C4B5FD !important;
}
.nav-item__icon-wrap {
  width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.nav-item:hover .nav-item__icon-wrap { background: rgba(255,255,255,0.05); }
.nav-item--active .nav-item__icon-wrap { background: rgba(99,102,241,0.2); }
.nav-item__icon { color: inherit !important; }
.nav-item--active .nav-item__icon { color: #818CF8 !important; }
.nav-item__label { font-size: 13px; font-weight: 500; letter-spacing: -0.1px; color: inherit !important; }
.nav-item--active .nav-item__label { font-weight: 600; }
.nav-item__bar {
  position: absolute; right: 0; top: 8px; bottom: 8px;
  width: 3px; border-radius: 2px 0 0 2px;
  background: linear-gradient(180deg, #6366F1, #A78BFA);
}

/* Footer */
.nav-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
}
.nav-footer__badge {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; font-weight: 500; color: rgba(167,139,250,0.7) !important;
}
.nav-footer__version {
  font-size: 10px; color: rgba(226,232,240,0.2) !important;
  font-family: 'JetBrains Mono', monospace;
}
</style>

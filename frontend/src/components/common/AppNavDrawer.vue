<template>
  <v-navigation-drawer v-model="model" color="surface" width="220"
    style="border-right:1px solid rgba(255,255,255,0.05)">

    <!-- Brand -->
    <div class="nav-brand">
      <div class="nav-brand__icon">
        <v-icon size="20" color="white">mdi-robot</v-icon>
      </div>
      <div>
        <div class="nav-brand__name">StarterAgent</div>
        <div class="nav-brand__sub">AI Framework</div>
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
        <v-icon size="18" class="nav-item__icon">{{ route.meta.icon }}</v-icon>
        <span class="nav-item__label">{{ route.meta.title }}</span>
        <span v-if="currentPath === route.path" class="nav-item__bar" />
      </router-link>
    </div>

    <!-- Footer -->
    <template #append>
      <div class="nav-divider" />
      <div class="nav-footer">
        <v-icon size="14" color="rgba(226,232,240,0.3)">mdi-information-outline</v-icon>
        <span class="nav-footer__text">v1.0.0 · LM Studio</span>
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
  padding: 18px 16px 14px;
}
.nav-brand__icon {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  background: linear-gradient(135deg, #6366F1 0%, #A78BFA 100%);
  display: flex; align-items: center; justify-content: center;
}
.nav-brand__name {
  font-size: 13px; font-weight: 700; letter-spacing: -0.2px;
  color: #E2E8F0 !important;
}
.nav-brand__sub {
  font-size: 11px; color: rgba(226,232,240,0.35) !important; margin-top: 1px;
}

/* Divider */
.nav-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 6px 0; }

/* Nav list */
.nav-list { padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; }

/* Nav item */
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
  position: relative;
  transition: background 0.15s;
  color: rgba(226,232,240,0.55) !important;
}
.nav-item:hover {
  background: rgba(255,255,255,0.04);
  color: #E2E8F0 !important;
}
.nav-item--active {
  background: rgba(99,102,241,0.12) !important;
  color: #A78BFA !important;
}
.nav-item--active .nav-item__icon { color: #6366F1 !important; }
.nav-item--active .nav-item__label { color: #C4B5FD !important; font-weight: 600; }

.nav-item__icon { flex-shrink: 0; }
.nav-item__label { font-size: 13px; font-weight: 500; }
.nav-item__bar {
  position: absolute; right: 0; top: 6px; bottom: 6px;
  width: 3px; border-radius: 2px 0 0 2px;
  background: #6366F1;
}

/* Footer */
.nav-footer {
  display: flex; align-items: center; gap: 6px;
  padding: 12px 16px;
}
.nav-footer__text {
  font-size: 11px; color: rgba(226,232,240,0.3) !important;
}
</style>

<template>
  <div class="wt-root">

    <!-- Loading -->
    <div v-if="loading" class="wt-loading">
      <v-progress-circular indeterminate color="cyan" size="36" />
      <span>Loading report…</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="wt-error">
      <v-icon size="40" color="error">mdi-file-alert-outline</v-icon>
      <div class="wt-error__title">Report not found</div>
      <div class="wt-error__sub">{{ error }}</div>
      <v-btn variant="tonal" size="small" prepend-icon="mdi-arrow-left" @click="$router.back()">Go back</v-btn>
    </div>

    <!-- Report -->
    <template v-else>
      <!-- Toolbar -->
      <div class="wt-toolbar">
        <button class="wt-back" @click="$router.back()">
          <v-icon size="16">mdi-arrow-left</v-icon>
          Back
        </button>
        <div class="wt-toolbar__title">{{ pageTitle }}</div>
        <a
          :href="`/reports/${sessionId}/walkthrough.html`"
          target="_blank"
          class="wt-open"
        >
          <v-icon size="14">mdi-open-in-new</v-icon>
          Open HTML
        </a>
      </div>

      <!-- Injected report styles (scoped to .wt-main) -->
      <component :is="'style'" v-if="reportStyle">
        .wt-main { {{ reportStyle }} }
      </component>

      <!-- Main content rendered from the HTML file -->
      <div class="wt-main" v-html="reportMain" />
    </template>

  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route      = useRoute();
const sessionId  = route.params.sessionId;
const loading    = ref(true);
const error      = ref('');
const pageTitle  = ref('Walkthrough');
const reportStyle = ref('');
const reportMain  = ref('');

// Inject report CSS into a dedicated <style> element so it doesn't leak
let styleEl = null;

function injectStyle(css) {
  if (styleEl) styleEl.remove();
  if (!css) return;
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-wt', sessionId);
  // Scope every rule to .wt-main so they don't bleed out into the app
  styleEl.textContent = css
    .split('}')
    .map(block => {
      const [selPart, ...rest] = block.split('{');
      if (!selPart.trim() || rest.length === 0) return block;
      const scoped = selPart
        .split(',')
        .map(sel => {
          const s = sel.trim();
          if (!s) return '';
          // Keep @-rules and :root as-is
          if (s.startsWith('@') || s.startsWith(':root')) return s;
          return `.wt-main ${s}`;
        })
        .filter(Boolean)
        .join(', ');
      return `${scoped}{${rest.join('{')}`;
    })
    .join('}');
  document.head.appendChild(styleEl);
}

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const { data } = await axios.get(`/api/reports/${sessionId}/content`);
    pageTitle.value  = data.title || 'Walkthrough';
    reportMain.value = data.main  || '';
    injectStyle(data.style || '');
  } catch (e) {
    error.value = e.response?.data?.error || e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => { if (styleEl) styleEl.remove(); });
</script>

<style scoped>
.wt-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #08080F;
}

/* Toolbar */
.wt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: #0D0D1A;
  flex-shrink: 0;
}
.wt-back {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 500;
  color: rgba(226,232,240,0.5);
  background: transparent; border: none; cursor: pointer;
  padding: 5px 10px; border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
.wt-back:hover { background: rgba(255,255,255,0.05); color: #E2E8F0; }
.wt-toolbar__title {
  flex: 1;
  font-size: 13px; font-weight: 600;
  color: rgba(226,232,240,0.7);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wt-open {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 500;
  color: rgba(34,211,238,0.7);
  text-decoration: none; padding: 5px 10px; border-radius: 6px;
  border: 1px solid rgba(34,211,238,0.2);
  transition: background 0.15s, color 0.15s;
}
.wt-open:hover { background: rgba(34,211,238,0.07); color: #22D3EE; }

/* Loading / Error */
.wt-loading, .wt-error {
  flex: 1;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
  color: rgba(226,232,240,0.4);
  font-size: 14px;
}
.wt-error__title { font-size: 18px; font-weight: 700; color: rgba(226,232,240,0.7); }
.wt-error__sub   { font-size: 12px; color: rgba(226,232,240,0.35); }

/* Main content area */
.wt-main {
  flex: 1;
  overflow-y: auto;
}
</style>

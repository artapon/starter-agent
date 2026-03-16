<template>
  <div class="wt-root">

    <!-- Thin top bar inside the Vue shell -->
    <div class="wt-bar">
      <router-link to="/workflow" class="wt-back">
        <v-icon size="15">mdi-arrow-left</v-icon>
        Workflow
      </router-link>
      <span class="wt-title">
        <v-icon size="14" color="#22D3EE" class="mr-1">mdi-file-chart-outline</v-icon>
        Walkthrough Report
      </span>
      <a :href="reportUrl" target="_blank" rel="noopener" class="wt-open">
        <v-icon size="13">mdi-open-in-new</v-icon>
        Open raw
      </a>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="wt-loading">
      <v-progress-circular indeterminate color="#6366F1" size="32" />
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="wt-empty">
      <v-icon size="40" style="color:rgba(226,232,240,0.15)">mdi-file-alert-outline</v-icon>
      <div class="wt-empty__text">Report not found for this session.</div>
      <router-link to="/workflow" class="wt-back mt-4">← Back to Workflow</router-link>
    </div>

    <!-- Report iframe -->
    <iframe
      v-else
      :src="reportUrl"
      class="wt-frame"
      frameborder="0"
      sandbox="allow-same-origin allow-scripts"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const sessionId = computed(() => route.params.sessionId);
const reportUrl = computed(() => `/reports/${sessionId.value}/walkthrough.html`);

const loading  = ref(true);
const notFound = ref(false);

onMounted(async () => {
  try {
    await axios.get(`/api/reports/${sessionId.value}/content`);
  } catch (e) {
    if (e.response?.status === 404) notFound.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.wt-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.wt-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #0D0D1A;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.wt-back {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: rgba(226,232,240,0.5);
  text-decoration: none;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.07);
  transition: color 0.15s, border-color 0.15s;
}
.wt-back:hover { color: #e2e8f0; border-color: rgba(255,255,255,0.15); }

.wt-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: rgba(226,232,240,0.6);
  display: flex;
  align-items: center;
}

.wt-open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(34,211,238,0.6);
  text-decoration: none;
  transition: color 0.15s;
}
.wt-open:hover { color: #22D3EE; }

.wt-frame {
  flex: 1;
  width: 100%;
  border: none;
  background: #08080F;
}

.wt-loading, .wt-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.wt-empty__text {
  font-size: 13px;
  color: rgba(226,232,240,0.35);
}
</style>

<template>
  <v-app theme="dark">
    <AppNavDrawer v-model="drawer" />
    <v-app-bar color="surface" elevation="0" border="b">
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-app-bar-title>
        <span class="text-primary font-weight-bold">Starter</span>
        <span class="text-medium-emphasis">Agent</span>
      </v-app-bar-title>
      <v-spacer />
      <v-chip
        :color="connected ? 'success' : 'error'"
        size="small"
        class="mr-3"
        prepend-icon="mdi-circle"
      >
        {{ connected ? 'Connected' : 'Disconnected' }}
      </v-chip>
    </v-app-bar>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import AppNavDrawer from './components/common/AppNavDrawer.vue';
import { useSocket } from './plugins/socket.js';

const drawer = ref(true);
const connected = ref(false);
const socket = useSocket();

onMounted(() => {
  socket.on('connect', () => { connected.value = true; });
  socket.on('disconnect', () => { connected.value = false; });
  if (socket.connected) connected.value = true;
});

onUnmounted(() => {
  socket.off('connect');
  socket.off('disconnect');
});
</script>

<style>
/* Force white text globally in dark theme */
.v-application,
.v-application *:not(.v-icon):not([class*="mdi-"]) {
  color: #ffffff !important;
}

/* Restore intentional muted/colored text */
.text-medium-emphasis { color: rgba(255,255,255,0.6) !important; }
.text-disabled        { color: rgba(255,255,255,0.38) !important; }
.text-primary         { color: #7C4DFF !important; }
.text-secondary       { color: #00BCD4 !important; }
.text-success         { color: #4CAF50 !important; }
.text-warning         { color: #FF9800 !important; }
.text-error           { color: #F44336 !important; }
.text-info            { color: #2196F3 !important; }

/* Inputs, textareas, selects */
.v-field__input,
.v-field__input *,
.v-select__selection,
.v-textarea textarea,
input, textarea, select {
  color: #ffffff !important;
}

/* Table cells */
.v-data-table td,
.v-data-table th {
  color: #ffffff !important;
}

/* Chips, badges */
.v-chip__content { color: inherit !important; }

/* Pre / code blocks */
pre, code { color: #e0e0e0 !important; }
</style>

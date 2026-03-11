<template>
  <v-navigation-drawer v-model="model" color="surface">
    <v-list-item
      prepend-icon="mdi-robot"
      title="Starter Agent"
      subtitle="AI Framework"
      nav
      class="py-4"
    />
    <v-divider />
    <v-list nav density="compact" :selected="[currentPath]" color="primary">
      <v-list-item
        v-for="route in navRoutes"
        :key="route.path"
        :to="route.path"
        :value="route.path"
        :prepend-icon="route.meta.icon"
        :title="route.meta.title"
        rounded="lg"
      />
    </v-list>
    <template #append>
      <v-divider />
      <v-list-item class="py-3" subtitle="v1.0.0 · LM Studio" prepend-icon="mdi-information-outline" />
    </template>
  </v-navigation-drawer>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const model = defineModel({ type: Boolean });
const router = useRouter();
const route = useRoute();

const currentPath = computed(() => route.path);
const navRoutes = computed(() => router.options.routes.filter(r => r.meta?.title));
</script>

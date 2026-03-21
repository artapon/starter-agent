# Worker Skill: Vue 3 / Frontend

## Component style
- Always use Composition API with `<script setup>` — no Options API
- Keep components under 200 lines; split larger views into child components
- Use `<style scoped>` for all component styles; avoid inline styles
- One responsibility per component

## State & reactivity
- `ref()` for primitives, `reactive()` for objects; never mutate props directly
- Side effects in `watch()` or `watchEffect()` with proper cleanup
- `computed()` for derived values — never recompute in templates

## Vuetify
- Use Vuetify components where they fit (v-btn, v-card, v-dialog, v-form, v-data-table, etc.)
- Follow the dark-theme pattern already used in the project
- Use Vuetify's spacing/typography utilities (`class="text-h5 mb-4"`) instead of custom CSS where possible

## Communication
- Props down, emits up — document with `defineProps` and `defineEmits`
- Use `provide`/`inject` or a Pinia store for cross-tree state; avoid prop drilling beyond 2 levels

## Accessibility & HTML
- Every interactive element keyboard-accessible (tab order, enter/space triggers)
- Semantic HTML inside templates (`<nav>`, `<main>`, `<section>`, etc.)
- `aria-label` on icon-only buttons

## Router & API
- Lazy-load heavy route components with `defineAsyncComponent` or dynamic imports
- Handle loading and error states for every API call — never leave the UI hanging
- Show user-friendly error messages; log technical details to console only

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './plugins/router.js';
import vuetify from './plugins/vuetify.js';
import '@mdi/font/css/materialdesignicons.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(vuetify);
app.mount('#app');

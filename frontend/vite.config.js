import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  server: {
    port: 5173,
    allowedHosts: 'all',
    proxy: {
      '/api':      { target: 'http://localhost:3000', changeOrigin: true },
      '/reports':  { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io':{
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
            console.error('[proxy]', err.message);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});

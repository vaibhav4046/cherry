import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cherry ships as a static, local-first app. No server functions are required.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          storage: ['dexie'],
          archive: ['jszip'],
        },
      },
    },
  },
  css: { postcss: { plugins: [] } },
  server: { port: 5273, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1', strictPort: true },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Tauri expects a fixed dev port and its own console output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/sidecar/**'] },
  },
  build: {
    rollupOptions: {
      external: ['mock-aws-s3', 'aws-sdk', 'nock'],
    },
    commonjsOptions: {
      ignoreDynamicRequires: true,
    },
  },
});

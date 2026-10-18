import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Root .env contains server secrets; never load it into the frontend toolchain.
  envDir: fileURLToPath(new URL('./config', import.meta.url)),
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:3000' }
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist', emptyOutDir: true }
});

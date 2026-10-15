import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(process.env.BUILD_NUMBER || 'dev') },
  build: { outDir: 'dist', emptyOutDir: true },
});

import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
  build: {
    outDir: 'dist', emptyOutDir: false,
    lib: { entry: resolve(import.meta.dirname, 'src/content_script.js'), name: 'RymSpotify', formats: ['iife'], fileName: () => 'content_script.js' },
    sourcemap: 'inline',
  },
});

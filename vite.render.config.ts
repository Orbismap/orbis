import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Builds the weather render kit as a standalone ES module served at `/wx-render/v1.js`.
 * Output goes into public/ so Vite's dev server serves it and the app build copies it to dist/.
 */
export default defineConfig({
  // outDir lives inside public/ – don't let Vite copy public/ into itself recursively.
  publicDir: false,
  // Worker assets must resolve under /wx-render/ on the host origin, not /assets/.
  base: '/wx-render/',
  worker: { format: 'es' },
  build: {
    outDir: 'public/wx-render',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/export/wx-render.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'v1.js',
    },
    rollupOptions: {
      // The host app (orbis-wetter) already loads MapLibre; never ship a second copy.
      external: ['maplibre-gl'],
    },
  },
});

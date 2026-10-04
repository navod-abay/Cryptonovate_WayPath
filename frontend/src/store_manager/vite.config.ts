import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Shared component library lives at frontend/packages/ui. We point straight at its
// source so nobody has to build the library first.
const uiSrc = fileURLToPath(new URL('../../packages/ui/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {},
  },
  resolve: {
    alias: [
      { find: '@waypoint/ui/styles', replacement: `${uiSrc}/styles.css` },
      { find: '@waypoint/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
    // The library has no node_modules of its own; make its React the app's React.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['../..'] },
  },
  preview: { port: 4173, host: true },
});

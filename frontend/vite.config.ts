import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const ui = fileURLToPath(new URL('./packages/ui/src', import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@waypoint/ui/styles', replacement: `${ui}/styles.css` },
      { find: '@waypoint/ui', replacement: `${ui}/index.ts` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});

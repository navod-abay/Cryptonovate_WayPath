import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Resolve the shared @waypoint/ui package — go up: dispatcher → src → frontend → packages/ui
const ui = fileURLToPath(new URL('../../packages/ui/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@waypoint/ui/styles', replacement: `${ui}/styles.css` },
      { find: '@waypoint/ui', replacement: `${ui}/index.ts` },
    ],
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: Object.fromEntries(Object.entries({ auth:5001,orders:5002,planning:5003,fleet:5004,execution:5005,analytics:5006 }).map(([service,port])=>[
      `/api/${service}`, { target:`http://127.0.0.1:${port}`, changeOrigin:true, rewrite:(path:string)=>path.replace(new RegExp(`^/api/${service}`),'') || '/' },
    ])),
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});


import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // three-globe's unused hex layers are the only consumer of h3-js — see src/lib/h3-stub.ts.
  resolve: { alias: { 'h3-js': fileURLToPath(new URL('./src/lib/h3-stub.ts', import.meta.url)) } },
  // MapLibre loads its tile worker relative to its own file; pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})

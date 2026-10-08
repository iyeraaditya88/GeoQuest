import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// `vite preview` serves the same security headers as production (vercel.json), so the content
// security policy can be tested locally before it ships.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }
const siteHeaders = Object.fromEntries((vercel.headers?.find((h) => h.source === '/(.*)')?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value.replace('; upgrade-insecure-requests', '')]))

export default defineConfig({
  plugins: [react()],
  // three-globe's unused hex layers are the only consumer of h3-js — see src/lib/h3-stub.ts.
  resolve: { alias: { 'h3-js': fileURLToPath(new URL('./src/lib/h3-stub.ts', import.meta.url)) } },
  // MapLibre loads its tile worker relative to its own file; pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely; app code changes often. Keeping them in their own chunks means
        // an app update only re-downloads the (small) app code — the 3D engine stays cached.
        codeSplitting: {
          groups: [
            { name: 'vendor-3d', test: /node_modules[\\/](three|three-[a-z-]+|three-globe|react-globe\.gl|globe\.gl|kapsule|tween|@tweenjs|d3-[a-z-]+|topojson-client|earcut|delaunator|polished|accessor-fn|data-bind-mapper|frame-ticker|index-array-by|float-tooltip|yaot|lodash-es)[\\/]/, priority: 20 },
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler|motion|framer-motion|motion-dom|motion-utils|lucide-react)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  preview: {
    headers: siteHeaders,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})

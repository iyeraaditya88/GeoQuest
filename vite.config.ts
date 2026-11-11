import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

// `vite preview` serves the same security headers as production (vercel.json), so the content
// security policy can be tested locally before it ships.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }
const siteHeaders = Object.fromEntries((vercel.headers?.find((h) => h.source === '/(.*)')?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value.replace('; upgrade-insecure-requests', '')]))

// Narration in development: the recordings straight from narration/out (voice) and narration/sfx
// (sounds), at the same /narration/ paths production serves from the Blob store.
const narration: Plugin = {
  name: 'narration-files',
  configureServer(server) {
    server.middlewares.use('/narration', (req, res, next) => {
      const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
      if (name.includes('..')) return next()
      const file = name.startsWith('sfx/') ? `narration/${name}` : `narration/out/${name}`
      if (!existsSync(file)) return next()
      res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'audio/mpeg')
      res.setHeader('Accept-Ranges', 'bytes')
      // Byte ranges, as the Blob store serves them: an <audio> element needs them to seek.
      const size = statSync(file).size, m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
      if (!m) { res.setHeader('Content-Length', size); createReadStream(file).pipe(res); return }
      const start = m[1] ? +m[1] : size - +m[2], end = m[1] && m[2] ? +m[2] : size - 1
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
      res.setHeader('Content-Length', end - start + 1)
      createReadStream(file, { start, end }).pipe(res)
    })
  },
}

export default defineConfig({
  plugins: [react(), narration],
  // Which deployment this build is (Vercel's commit), so an open app can tell a newer one is live.
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev') },
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
            // MapLibre: shared by Street View and the battle cinema map (fetched only when one opens).
            { name: 'maplibre', test: /node_modules[\\/](maplibre-gl|@maplibre)[\\/]/, priority: 20 },
            // The atlas data (countries, cities…): large, and rarely changes — cached apart from app code.
            { name: 'data', test: /src[\\/](lib[\\/]data\.ts|data[\\/](countries|cities)\.json)$/, priority: 10 },
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

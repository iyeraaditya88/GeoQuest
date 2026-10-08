import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests (src/lib) run in jsdom; server tests opt into node with `@vitest-environment node`.
export default defineConfig({
  resolve: { alias: { 'h3-js': fileURLToPath(new URL('./src/lib/h3-stub.ts', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    pool: 'forks',
  },
})

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit layer for pure logic (runtime-config resolution, error normalization, matchers, utils,
// E2E harness helpers). Browser behaviour stays in Playwright; anything that needs the Nuxt
// runtime belongs there too. Aliases mirror Nuxt's so tests import app code the same way.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '~~': fromRoot('./'),
      '@@': fromRoot('./'),
      '~': fromRoot('./app'),
      '@': fromRoot('./app')
    }
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true
  }
})

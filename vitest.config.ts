import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // e2e/ is Playwright's; vitest owns the unit tests next to the source.
    include: ['src/**/*.test.ts'],
  },
})

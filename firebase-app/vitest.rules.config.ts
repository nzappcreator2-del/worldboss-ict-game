import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['emulator/**/*.rules.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    fileParallelism: false,
  },
})

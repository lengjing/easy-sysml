import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/node/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    environment: 'node',
  },
  resolve: {
    // Allow importing .ts files with .js extensions (needed for vitest)
    extensions: ['.ts', '.js'],
  },
})

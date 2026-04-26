import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['src/node/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    environment: 'node',
  },
  resolve: {
    alias: {
      'bun:bundle': resolve(__dirname, 'src/vendor/bun-bundle.ts'),
      'src/': resolve(__dirname, 'src/') + '/',
    },
    extensions: ['.ts', '.tsx', '.js'],
  },
})

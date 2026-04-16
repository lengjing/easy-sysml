import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000, // Langium initialization can be slow on first parse
    hookTimeout: 30_000,
  },
});

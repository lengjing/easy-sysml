import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'ES2022',
  },
  worker: {
    format: 'es',
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: ['@easy-sysml/protocol', '@easy-sysml/ast', '@easy-sysml/utils'],
      },
    },
  },
});

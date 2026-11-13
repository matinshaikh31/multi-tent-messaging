import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '/tmp/vitest-cache',
  test: {
    globals: true,
    environment: 'node',
    // Run tests sequentially (not in parallel) to avoid DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});


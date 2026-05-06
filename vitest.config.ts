import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure Node — no DOM emulation needed
    environment: 'node',

    // Vitest natively handles ESM; no transform plugin required for plain TS
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // Load test-only env overrides before any test file runs
    setupFiles: ['tests/setup.ts'],

    // Provide a deterministic test environment so production secrets never leak
    // and so config validation passes during test boot.
    env: {
      NODE_ENV: 'test',
      PRODUCTIVE_API_TOKEN: 'test-token',
      PRODUCTIVE_ORG_ID: 'test-org',
      PRODUCTIVE_USER_ID: 'test-user',
      PRODUCTIVE_API_BASE_URL: 'https://api.productive.io/api/v2/',
    },

    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/server.ts',
        'src/api/types.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
      reporter: ['text', 'json', 'html', 'lcov'],
    },
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests of the launcher process. Electron is replaced by a small stub
// (tests/stubs/electron.ts) that keeps every file inside a temporary folder.
export default defineConfig({
  resolve: {
    alias: {
      electron: fileURLToPath(new URL('./tests/stubs/electron.ts', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    // Each test file gets fresh module state (settings/profile caches).
    isolate: true,
    fileParallelism: false,
  },
});

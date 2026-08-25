import { defineConfig } from 'vitest/config';

/** Rules tests run against the Firestore emulator, driven by `npm run test:rules`. */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // The emulator is a single shared instance; parallel files would race.
    fileParallelism: false,
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['client/src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    // Rules tests talk to the Firestore emulator and are opt-in, since they
    // need `firebase emulators:start` running. Run them with `npm run test:rules`.
    exclude: ['**/node_modules/**', 'tests/rules/**'],
  },
});

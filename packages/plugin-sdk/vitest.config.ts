import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The SDK is browser code: it needs window, MessageChannel and postMessage.
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});

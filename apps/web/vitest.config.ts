import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    // Otherwise happy-dom really fetches any iframe src a test renders, and opens and loads
    // the page a clicked `target="_blank"` link points at, which turns a pure attribute or
    // event assertion into a network call.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
          navigation: { disableChildPageNavigation: true },
        },
      },
    },
    globals: true,
    setupFiles: [resolve(__dirname, 'test/setupTests.ts')],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});

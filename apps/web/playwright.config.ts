import { config } from 'dotenv';
import { execSync } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..', '..');

// Load root .env first (base configuration)
config({ path: resolve(rootDir, '.env') });

// Load root .env.tests with override — test values take priority over .env
config({ path: resolve(rootDir, '.env.tests'), override: true });

function assertPortFree(port: number, label: string): void {
  try {
    const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' }).trim();
    if (result) {
      throw new Error(
        `\n\n` +
          `Port ${port} is already in use (${label}).\n` +
          `Stop the running server before running e2e tests, otherwise tests will use the wrong environment.\n\n` +
          `  kill $(lsof -ti:${port})\n`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Port')) throw e;
    // lsof exits with code 1 when port is free — that's fine
  }
}

// In --ui mode and VS Code extension, Playwright re-evaluates config after
// starting webServers. Skip the port check on subsequent evaluations to avoid
// false positives from our own test servers.
if (!process.env.CI && !process.env.TEST_WORKER_INDEX && !process.env.__PW_PORT_CHECK_DONE) {
  process.env.__PW_PORT_CHECK_DONE = '1';
  assertPortFree(3000, 'backend');
  assertPortFree(5173, 'vite dev server');
}

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'https://localhost:5173',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // NOTE: Runs compiled JS — rebuild backend after code changes (`npm run build -w @owox/backend`)
      // or tests will execute against stale code. CI workflows handle this via explicit build step.
      command: 'node dist/src/main.js',
      cwd: '../backend',
      url: 'http://localhost:3000/api/flags',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        SERVER_TIMEOUT_MS: '180000',
        KEEP_ALIVE_TIMEOUT_MS: '180000',
        HEADERS_TIMEOUT_MS: '185000',
      },
    },
    {
      command: 'npx vite --config vite.config.ts',
      url: 'https://localhost:5173',
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

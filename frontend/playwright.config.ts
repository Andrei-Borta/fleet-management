import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests. Every UI feature MUST ship with a spec in e2e/<feature>.spec.ts.
 * Locally: start the backend (see RUNNING.md), then `npm run e2e`.
 * The Angular dev server is started automatically, unless E2E_BASE_URL points at a running
 * app (e.g. the production compose stack on http://localhost:8080).
 */
const baseURL = process.env['E2E_BASE_URL'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // Many local workers make the dev server time out.
  workers: process.env['CI'] ? undefined : 2,
  reporter: process.env['CI'] ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: baseURL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: baseURL
    ? undefined
    : {
        command: 'npm start',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000,
      },
});

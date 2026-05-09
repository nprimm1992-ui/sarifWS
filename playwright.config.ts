import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright smoke suite configuration.
 *
 * Design goals:
 *   - Run against `astro preview` so we exercise the real production
 *     build (CSP, asset hashing, content collections) — not the dev
 *     server which differs in non-trivial ways.
 *   - Default to chromium only; adding webkit/firefox lanes should be
 *     a deliberate decision, not a smoke-suite default.
 *   - Keep flake budget at zero: suites that need to touch the 3D
 *     lobby tolerate GL unavailability (skipping is preferred to
 *     brittle matchers).
 *
 * Local runbook:
 *   1. `npm run build`        (produces dist/ and also fails on CSP
 *                              hash drift, HTML budget, etc.)
 *   2. `npx playwright install chromium`  (first-time only)
 *   3. `npm run test:e2e`
 */

const PORT = 4321;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 6_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Spin up `astro preview` automatically unless the caller supplied
     their own server via PLAYWRIGHT_BASE_URL. The preview server
     honours the production CSP and uses static files under dist/. */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npx astro preview --host 127.0.0.1 --port 4321',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});

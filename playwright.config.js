const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'touch-tablet-chromium',
      testDir: './tests/e2e',
      use: {
        ...devices['iPad Mini'],
        browserName: 'chromium',
      },
    },
    // Perf harness — desktop Chromium, no touch. Read by `npm run perf:baseline`.
    // Writes JSON results into reports/perf-results/. See tests/perf/*.spec.js.
    {
      name: 'perf-desktop',
      testDir: './tests/perf',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    // Perf harness — mobile-throttled Chromium. Run with --project=perf-mobile
    // to capture the mobile floor for the same metrics.
    {
      name: 'perf-mobile',
      testDir: './tests/perf',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
      },
    },
    // Mobile audit + regression guards for reports/mobile-experience-audit.md.
    // Run both with `npm run test:mobile-audit`. The phone project holds the
    // measurements and the mobile-side assertions; the desktop one exists to
    // prove the mobile fixes did not change desktop behaviour, so they must
    // stay paired. See tests/mobile-audit/.
    {
      name: 'mobile-audit',
      testDir: './tests/mobile-audit',
      testIgnore: /desktop-.*\.spec\.js/,
      timeout: 180000,
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
      },
    },
    {
      name: 'mobile-audit-desktop',
      testDir: './tests/mobile-audit',
      testMatch: /desktop-.*\.spec\.js/,
      timeout: 180000,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'node serve.js 8000',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
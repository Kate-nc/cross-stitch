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
      use: {
        ...devices['iPad Mini'],
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'node serve.js 8000',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
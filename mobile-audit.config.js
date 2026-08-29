const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/mobile-audit',
  timeout: 180000,
  fullyParallel: false,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:8000', serviceWorkers: 'block' },
  projects: [
    { name: 'pixel5', testIgnore: /desktop-.*\.spec\.js/, use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'desktop', testMatch: /desktop-.*\.spec\.js/, use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: 'node serve.js 8000', url: 'http://127.0.0.1:8000', reuseExistingServer: true, timeout: 120000 },
});

const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/tracking-audit', testMatch: ['focused-accessibility.spec.js', 'focused-bughunt.spec.js', 'focused-save-flush.spec.js', 'focused-keyboard-controls.spec.js'],
  timeout: 120000, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8000', viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' },
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({ name: browserName, use: { browserName } })),
  webServer: { command: 'node serve.js 8000', url: 'http://127.0.0.1:8000', reuseExistingServer: true },
});

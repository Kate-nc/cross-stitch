const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/service-worker',
  timeout: 90000,
  workers: 1,
  use: { browserName: 'chromium', serviceWorkers: 'allow' },
});

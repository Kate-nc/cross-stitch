// Convert and Creator regressions on a mouse desktop and a Pixel 5.
// CHROMIUM_PATH can select an installed Chromium in managed environments.
const {defineConfig, devices} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e', testMatch: /(?:convert-|creator-).*\.spec\.js/,
  timeout: 90000, expect: {timeout: 10000}, workers: 2, reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:8000', serviceWorkers: 'block',
    launchOptions: process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}},
  projects: [
    {name: 'creator-desktop', use: {viewport: {width: 1440, height: 1000}, hasTouch: false, isMobile: false}},
    {name: 'creator-phone', use: {...devices['Pixel 5']}},
  ],
  webServer: {command: 'node serve.js 8000', url: 'http://127.0.0.1:8000', reuseExistingServer: true},
});

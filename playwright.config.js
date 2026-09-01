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
      // android-* belongs to the tablet project, desktop-* to the desktop one.
      testIgnore: /(desktop|android)-.*\.spec\.js/,
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
    // Android tablet. The other touch projects are a phone (Pixel 5) and an
    // iPad, so nothing covered the combination that matters most for the
    // canvas budget: a large viewport on a device that *reports*
    // navigator.deviceMemory. Every Android device with 8 GB reports the
    // spec-capped 8, which is why they used to take the desktop budget.
    // See tests/mobile-audit/android-devices.spec.js.
    {
      name: 'mobile-audit-tablet',
      testDir: './tests/mobile-audit',
      testMatch: /android-.*\.spec\.js/,
      timeout: 180000,
      use: {
        ...devices['Galaxy Tab S9'],
        browserName: 'chromium',
      },
    },
    // iPad on real WebKit. The other touch project is `iPad Mini` on *Chromium*,
    // which still exposes showDirectoryPicker and so cannot see any of the
    // behaviour that matters here — on a real iPad every browser is WebKit and
    // the File System Access API does not exist. Run with
    // `npm run test:ipad`. See tests/ipad/.
    {
      name: 'ipad-webkit',
      testDir: './tests/ipad',
      timeout: 120000,
      use: {
        ...devices['iPad (gen 7)'],
        browserName: 'webkit',
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
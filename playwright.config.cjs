const { defineConfig } = require('@playwright/test');

const smokeViewports = [
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-412x915', width: 412, height: 915 }
];

const fullViewports = [
  { name: 'mobile-360x800', width: 360, height: 800 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-412x915', width: 412, height: 915 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'tablet-1024x1366', width: 1024, height: 1366 }
];

const viewportProfile = process.env.PW_VIEWPORT_PROFILE === 'full' ? 'full' : 'smoke';
const selectedViewports = viewportProfile === 'full' ? fullViewports : smokeViewports;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: selectedViewports.map((viewport) => ({
    name: viewport.name,
    use: {
      viewport: {
        width: viewport.width,
        height: viewport.height
      }
    }
  })),
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  webServer: {
    command: 'npm run serve',
    url: 'http://127.0.0.1:4173',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI
  }
});

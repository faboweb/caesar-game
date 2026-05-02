import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  use: {
    baseURL: 'http://localhost:8888',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 8888',
    port: 8888,
    reuseExistingServer: true,
  },
});

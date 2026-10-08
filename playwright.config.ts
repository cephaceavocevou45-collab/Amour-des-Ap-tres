import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4300',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm.cmd --workspace @paroisse/web start -- --port 4300',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

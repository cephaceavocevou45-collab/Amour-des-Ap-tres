import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Playwright exige TEST_DATABASE_URL vers une base dédiée dont le nom contient « test ».');
}
const testDatabaseConfirmed = process.env.PLAYWRIGHT_TEST_DATABASE_CONFIRMED === '1';
if (!testDatabaseConfirmed && process.env.DATABASE_URL && new URL(testDatabaseUrl).href === new URL(process.env.DATABASE_URL).href) {
  throw new Error('Playwright refuse de démarrer si DATABASE_URL et TEST_DATABASE_URL désignent la même base.');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.PLAYWRIGHT_TEST_DATABASE_CONFIRMED = '1';
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=4096`.trim();

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4310',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm.cmd run dev:api',
      url: 'http://127.0.0.1:3101/api/v1/public/leader',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, PORT: '3101', FRONTEND_ORIGIN: 'http://127.0.0.1:4310', NODE_ENV: 'test' },
    },
    {
      command: 'node ../../node_modules/@angular/cli/bin/ng.js build && node ../../node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4310',
      url: 'http://127.0.0.1:4310',
      cwd: 'apps/web',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_OPTIONS: process.env.NODE_OPTIONS },
    },
  ],
});

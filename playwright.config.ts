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
  globalSetup: './tests/playwright/global-setup.cjs',
  testDir: './tests/playwright',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4310',
    ...devices['Desktop Chrome'],
  },
});

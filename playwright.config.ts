import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

// Load .env.local into the Playwright runner process (mirrors Next.js dev-server behaviour).
// The webServer process inherits the shell env, so variables set here (via process.env) are
// NOT automatically visible to the server — the server reads .env.local itself at startup.
loadDotenv({ path: '.env.local', override: false });

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  projects: [
    // Auth setup project — runs once before all E2E tests
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/local/default/storage-state.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: 'yarn nx run web:dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'yarn nx run agent-be:serve',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

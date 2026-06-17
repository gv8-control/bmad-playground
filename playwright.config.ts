import { defineConfig, devices } from '@playwright/test';

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
        storageState: 'playwright/auth-sessions/local/default/storage-state.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Uncomment when the Nx monorepo is scaffolded:
  // webServer: [
  //   {
  //     command: 'pnpm --filter @bmad-easy/web dev',
  //     url: 'http://localhost:3000',
  //     reuseExistingServer: !process.env.CI,
  //   },
  //   {
  //     command: 'pnpm --filter @bmad-easy/agent-be start:dev',
  //     url: 'http://localhost:3001/health',
  //     reuseExistingServer: !process.env.CI,
  //   },
  // ],
});

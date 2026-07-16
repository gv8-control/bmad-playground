import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

// Load env files into the Playwright runner process. .env provides
// AUTH_SECRET, DATABASE_URL, etc. needed by auth.setup.ts syntheticSession().
// .env.local provides test-specific vars (TEST_GITHUB_*). Both are loaded
// with override: false so real env vars always win.
// The webServer processes (Next.js, NestJS) read their own env files at startup.
loadDotenv({ path: '.env', override: false });
loadDotenv({ path: '.env.local', override: false });

// The storageState path is overridden by @seontechnologies/playwright-utils
// fixtures (which use process.env.TEST_ENV || 'local'), but we set it here
// for consistency and for projects that don't use the fixtures.
const storageStatePath = `.auth/${process.env.TEST_ENV || 'local'}/default/storage-state.json`;

// Tier selector — when '1', the runner targets the real-service nightly tier
// (real Daytona + real Claude Agent SDK + real GitHub OAuth). PR tier is the
// default (fake-by-omission: tested paths never trigger agent-run code, so the
// production SandboxService/AgentService wired in apps/agent-be/src/sandbox/
// sandbox.module.ts never reach out to real services). The flag selects which
// dev-server webServer block and which Playwright projects are active so a
// single config file can serve both tiers without source-level branching.
// See `_bmad-output/test-artifacts/test-design-qa.md` → Execution Strategy.
const isRealServiceTier = process.env.PLAYWRIGHT_REAL_SERVICE === '1';

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
    // Auth setup project — runs once before all E2E tests (PR + real-service tiers).
    // Reused by the real-service tier per test-design-qa.md Execution Strategy.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // ─── PR tier (fake-backed, runs in CI on every PR) ───────────────────────────
    // No real Daytona/Claude calls: tested paths never trigger agent-run code paths,
    // so the production SandboxService/AgentService never reach out. Real-service
    // specs are excluded via grepInvert so this tier stays hermetic even after
    // @real-service / @multi-conn / @performance-spike-tagged specs land in
    // the same playwright/ directory. The three nightly/weekly tags share a
    // single grepInvert so the PR tier never accidentally picks up a
    // heavy/real-service/non-deterministic spec.
    {
      name: 'chromium',
      grepInvert: /@real-service|@multi-conn|@performance-spike/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: storageStatePath,
      },
      dependencies: ['setup'],
    },
    // ─── Real-service tier (nightly only, ~$1-2/run) ────────────────────────────
    // Activated exclusively by `PLAYWRIGHT_REAL_SERVICE=1`. Runs ONLY tests tagged
    // @real-service. The dev server is started with real secrets by the
    // nightly-real-service GitHub Actions job; SandboxServiceFake is NEVER injected
    // because `yarn nx run agent-be:serve` boots the production AppModule
    // (apps/agent-be/src/sandbox/sandbox.module.ts:9 wires useClass: SandboxService
    // — the real implementation; fakes are wired only via buildTestModule() in
    // Jest tests). 3-retry budget per test-design-qa.md mitigation trade-off.
    ...(isRealServiceTier
      ? [
          {
            name: 'real-service',
            grep: /@real-service/,
            retries: 3,
            use: {
              ...devices['Desktop Chrome'],
              storageState: storageStatePath,
            },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  // webServer is global in Playwright (no per-project webServer). The tier flag
  // selects which dev-server block to use so the real-service tier never reuses
  // a stale fake-backed server started for a PR-tier run. The SandboxServiceFake
  // cannot be injected here regardless — `yarn nx run agent-be:serve` always uses
  // the production AppModule. The flag exists for webServer hygiene + diagnostics.
  webServer: isRealServiceTier
    ? [
        {
          command: 'yarn nx run web:dev',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: 'yarn nx run agent-be:serve',
          url: 'http://localhost:3001/health',
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : [
        {
          command: 'yarn nx run web:dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'yarn nx run agent-be:serve',
          url: 'http://localhost:3001/health',
          reuseExistingServer: !process.env.CI,
        },
      ],
});

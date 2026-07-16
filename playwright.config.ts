import { defineConfig, devices } from '@playwright/test';

// The test:e2e script wraps Playwright with `dotenv -e .env.test`, which loads
// .env.test into process.env before this config runs. We deliberately do NOT
// load .env.local here — it contains personal/tooling credentials (including
// real GitHub test-account creds) that leak TEST_GITHUB_USERNAME/TEST_GITHUB_PASSWORD
// into the E2E environment, triggering the real OAuth flow in auth.setup.ts
// instead of the synthetic session. .env.test has these set to empty strings.
//
// The webServer process (next dev / agent-be) inherits the shell env, so it
// reads .env.local itself at startup — the runner doesn't need to inject it.

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
// Real-service tier starts fresh servers (120s timeout); PR tier reuses the
// servers the CI workflow already started on the same ports.
const webServerReuse = isRealServiceTier
  ? { reuseExistingServer: false, timeout: 120_000 }
  : { reuseExistingServer: true };

export default defineConfig({
  globalSetup: 'playwright/global-setup.ts',
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
            // Shared default user — the real OAuth flow only creates one
            // session, so the real-service tier has no per-worker isolation.
            // Without this, parallel real-service tests mutating the same
            // RepoConnection row race the same way the PR tier did before
            // per-worker users. Per-project `workers` is supported in
            // Playwright 1.61.0+ (test.d.ts TestProject.workers).
            workers: 1,
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
  // selects whether servers are reused so the real-service tier never reuses a
  // stale fake-backed server started for a PR-tier run. The SandboxServiceFake
  // cannot be injected here regardless — `yarn nx run agent-be:serve` always uses
  // the production AppModule. The flag exists for webServer hygiene + diagnostics.
  webServer: [
    { command: 'yarn nx run web:dev',        url: 'http://localhost:3000',        ...webServerReuse },
    { command: 'yarn nx run agent-be:serve', url: 'http://localhost:3001/health', ...webServerReuse },
  ],
});

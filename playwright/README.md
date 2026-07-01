# bmad-easy — E2E Test Suite

Playwright E2E tests for the bmad-easy SaaS platform, scaffolded by the TEA Master Test Architect.

## Prerequisites

- Node 24 (see `.nvmrc` — `nvm use` from the repo root)
- Yarn workspace initialized (`yarn install` at monorepo root)
- Playwright browsers: `yarn playwright install --with-deps chromium`
- A `.env.test` file populated from `.env.example`

## Setup

```sh
# 1. Install dependencies
yarn install

# 2. Install Playwright browsers
yarn playwright install --with-deps chromium

# 3. Copy and fill in env vars
cp .env.example .env.test
# Edit .env.test — at minimum set TEST_GITHUB_USERNAME, TEST_GITHUB_PASSWORD, TEST_GITHUB_REPO_URL
```

## Running Tests

### Local (headed, useful for debugging)

```sh
yarn test:e2e:headed            # Opens browser window
yarn test:e2e:debug             # Step through tests with Playwright Inspector
yarn test:e2e -- --grep "OAuth" # Run a specific test by name
```

### Local (headless, standard)

```sh
yarn test:e2e                   # All tests
yarn test:e2e:auth              # Auth tests only
yarn test:e2e:conversation      # Conversation/SSE tests only
```

### CI

```sh
yarn test:e2e:ci                # CI mode: 4 workers, JUnit reporter, retries=2
```

Add these scripts to the **root** `package.json` when the Nx workspace is scaffolded:

```json
{
  "scripts": {
    "test:e2e": "dotenv -e .env.test -- playwright test",
    "test:e2e:ci": "CI=true dotenv -e .env.test -- playwright test",
    "test:e2e:headed": "dotenv -e .env.test -- playwright test --headed",
    "test:e2e:debug": "dotenv -e .env.test -- playwright test --debug",
    "test:e2e:auth": "dotenv -e .env.test -- playwright test playwright/e2e/auth/",
    "test:e2e:conversation": "dotenv -e .env.test -- playwright test playwright/e2e/conversation/",
    "test:e2e:report": "playwright show-report playwright-report"
  }
}
```

Add these scripts to **`apps/agent-be/package.json`** for backend tests:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:integration": "jest --config test/jest-integration.config.ts"
  }
}
```

## Architecture

```
playwright/
├── auth.setup.ts                  # One-time GitHub OAuth session (runs as 'setup' project)
├── support/
│   ├── merged-fixtures.ts         # ⭐ Single test import — all fixtures composed here
│   ├── custom-fixtures.ts         # Project-specific fixtures (seededRepository, etc.)
│   ├── auth/
│   │   └── github-auth-provider.ts  # Auth.js v5 / GitHub OAuth provider for auth-session
│   ├── factories/
│   │   ├── user-factory.ts          # createUser() — faker-backed, parallel-safe
│   │   └── repository-factory.ts   # createRepository(), createConversation()
│   └── page-objects/
│       └── conversation-page.ts    # Conversation UI: session status, SSE stream, tool pills
└── e2e/
    ├── auth/
    │   └── github-oauth.spec.ts    # P0-001: OAuth sign-in, redirect, credential health
    ├── conversation/
    │   └── sandbox-lifecycle.spec.ts  # P0-003/004: NFR-P1/P2 timing, working tree, commit
    └── project-map/
        └── project-map.spec.ts     # NFR-P3: Project Map load time, Daytona outage
```

All test files import from `../../support/merged-fixtures`:

```ts
import { test, expect } from '../../support/merged-fixtures';
```

This gives you `apiRequest`, `authToken`, `interceptNetworkCall`, `recurse`, `log`,
`networkErrorMonitor`, and `seededRepository` in every test.

## Fixtures

| Fixture | Source | What it provides |
|---------|--------|-----------------|
| `apiRequest` | playwright-utils | Typed HTTP client, auto-retry 5xx |
| `authToken` | playwright-utils | GitHub OAuth session token (from disk cache) |
| `interceptNetworkCall` | playwright-utils | Network spy/stub with JSON parsing |
| `recurse` | playwright-utils | Polling for eventual consistency (SSE events, job completion) |
| `log` | playwright-utils | Playwright-report-integrated structured logging |
| `networkErrorMonitor` | playwright-utils | Auto-fail on any 4xx/5xx response (catches silent backend errors) |
| `seededRepository` | custom | API-seeded repository record, cleaned up after test |

## Factories

Always use factories, never hardcode test data:

```ts
import { createRepository } from '../support/factories/repository-factory';

const repo = createRepository({ sizeKb: 50_000 }); // 50 MB — within NFR-P2 boundary
```

Factories use `faker` for parallel-safe, unique values. Override only what matters for the test.

## Selector Strategy

Use `data-testid` attributes exclusively for E2E selectors:

```ts
// ✅ Good — stable, not tied to styling or structure
page.getByTestId('session-status')

// ❌ Avoid — brittle to layout/copy changes
page.locator('.session-badge span')
page.getByText('Starting session…')
```

The `ConversationPage` page object encapsulates all conversation-screen selectors.

## Writing New Tests

```ts
import { test, expect } from '../../support/merged-fixtures';

test('my test', async ({ page, apiRequest, log }) => {
  await log.step('Arrange — seed test data via API');
  // Use apiRequest to seed state, NOT UI navigation

  await log.step('Act — perform UI action');
  await page.goto('/dashboard');

  await log.step('Assert — verify outcome');
  await expect(page.getByTestId('my-element')).toBeVisible();
});
```

## CI Integration

The `playwright.config.ts` includes a `junit` reporter writing to `test-results/junit.xml`.

Recommended GitHub Actions jobs pattern:

```yaml
- name: Run E2E tests
  run: yarn test:e2e:ci
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}
    TEST_GITHUB_USERNAME: ${{ secrets.TEST_GITHUB_USERNAME }}
    TEST_GITHUB_PASSWORD: ${{ secrets.TEST_GITHUB_PASSWORD }}
    TEST_GITHUB_REPO_URL: ${{ secrets.TEST_GITHUB_REPO_URL }}

- name: Upload Playwright report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
```

For shard-based parallelism (recommended for CI once the suite grows):

```yaml
strategy:
  matrix:
    shard: [1/4, 2/4, 3/4, 4/4]
steps:
  - run: yarn test:e2e:ci --shard=${{ matrix.shard }}
```

## NestJS Integration Tests

Integration tests live in `apps/agent-be/test/integration/`.

```sh
# From apps/agent-be/ (or via Nx):
yarn test:integration
```

The `buildTestModule()` helper automatically wires `SANDBOX_SERVICE` to `SandboxServiceFake`.
No real Daytona API calls are made in any integration test.

```ts
import { buildTestModule } from '../helpers/test-module-builder';

describe('MyService', () => {
  it('handles sandbox provision failure', async () => {
    const { module, sandboxFake } = await buildTestModule([MyModule]);
    sandboxFake.failNextProvision();
    const svc = module.get(MyService);
    await expect(svc.createConversation('conv-1')).rejects.toThrow();
  });
});
```

import { test, expect } from '../../support/merged-fixtures';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * P0-008 / NFR-R4 / R-04: 10 concurrent SSE connections without starvation.
 *
 * Tier: @multi-conn — runs only in the nightly `nightly-multi-conn` CI job
 *   (`.github/workflows/test.yml`), selected via `yarn playwright test --grep
 *   @multi-conn`. The PR-tier `chromium` project excludes this spec via
 *   `grepInvert: /@real-service|@multi-conn|@performance-spike/` in
 *   `playwright.config.ts`. CI secrets required (per the job definition):
 *   DATABASE_URL + AUTH_SECRET + CREDENTIAL_ENCRYPTION_KEK — no
 *   Daytona/Anthropic/Github-OAuth-secret set, because the tested code path
 *   is the SSE transport layer, not agent execution.
 *
 * Why REAL EventSource (not mocked): the existing conversation specs
 *   (`streaming-chat.spec.ts`, `concurrent-conversations.spec.ts`) mock
 *   `EventSource` to exercise the ConversationPane state machine. That
 *   pattern would bypass the HTTP/1.1 6-connection-per-origin ceiling
 *   entirely — defeating this test's purpose. We subclass the real
 *   `EventSource` ONLY to tap events for assertion; `super(url, init)`
 *   still performs the genuine HTTP request and the real network transport
 *   is exercised. This is the only way the HTTP/1.1 ceiling (R-04) can
 *   manifest in the test.
 *
 * Skip rule: the `nightly-multi-conn` CI job runs with `CI=true` and
 *   `--grep @multi-conn`; local devs opt in explicitly via
 *   `PLAYWRIGHT_MULTI_CONN=1`. The skip is evaluated in `beforeEach` so
 *   it short-circuits BEFORE `withRepoConnection` resolves (no wasted DB
 *   row churn, no dev-server dependency on the skip path). A stray
 *   `--grep @P0` smoke run elsewhere fails safe: skipped unless
 *   `PLAYWRIGHT_MULTI_CONN=1`.
 *
 * Fake-backed assumption (per `test-design-qa.md` Execution Strategy):
 *   the multi-conn dev server boots `yarn nx run agent-be:serve` which
 *   wires the production `SandboxService` — when Daytona is unreachable
 *   (the multi-conn CI env has no DAYTONA_API_KEY), `SESSION_ERROR`
 *   fires quickly, which is still an SSE event in the transport sense,
 *   so the no-starvation assertion still holds. When `SandboxServiceFake`
 *   is wired (intended target), `SESSION_READY` fires within milliseconds.
 *   Either way, the HTTP/1.1 ceiling — if present — manifests as
 *   connections 7-10 receiving no event within the no-starvation window.
 */

const CONCURRENT_CONTEXTS = 10;
const HTTP1_BROWSER_CEILING = 6; // Per-origin concurrent HTTP/1.1 SSE cap in browsers.
const FIRST_EVENT_TIMEOUT_MS = 30_000; // NFR-R4 no-starvation window (per test-design-qa.md).
const STORAGE_STATE_PATH = '.auth/local/default/storage-state.json';

interface ConnectionResult {
  index: number;
  receivedEvent: boolean;
  events: string[];
  finalUiState: 'ready' | 'error-or-timeout' | 'limit-reached' | 'unknown';
}

// EventSource event names emitted by `apps/agent-be/src/streaming/streaming.controller.ts`
// and consumed by `apps/web/src/components/conversation/ConversationPane.tsx`. The
// lifecycle events (SESSION_*) are what we expect to arrive within the no-starvation
// window on a healthy connection. `open` / `error` are EventSource transport primitives.
const TAPPED_EVENT_TYPES = [
  'SESSION_READY',
  'SESSION_ERROR',
  'SESSION_TIMEOUT',
  'SESSION_DRAINING',
  'RUN_STARTED',
  'RUN_FINISHED',
  'RUN_ERROR',
  'STREAM_ERROR',
  'WORKING_TREE_DIRTY',
  'WORKING_TREE_CLEAN',
  'open',
  'error',
] as const;

async function installEventSourceTap(page: Page): Promise<void> {
  await page.addInitScript(
    (types: string[]) => {
      const w = window as unknown as { __sseEvents: string[] };
      w.__sseEvents = [];
      const Original = window.EventSource;
      // Subclass REAL EventSource — `super(url, init)` performs the genuine
      // HTTP request and preserves all real network behaviour. We only attach
      // listener taps so the test can assert on received events. Mocking the
      // constructor (as the existing conversation specs do) would bypass the
      // HTTP transport and hide the HTTP/1.1 ceiling this test exists to catch.
      class TappingEventSource extends Original {
        constructor(url: string, init?: EventSourceInit) {
          super(url, init);
          for (const type of types) {
            this.addEventListener(type, () => {
              (window as unknown as { __sseEvents: string[] }).__sseEvents.push(type);
            });
          }
        }
      }
      // Cast through `unknown` because TS won't propagate EventSource's static
      // readonly literal-type constants (CONNECTING/OPEN/CLOSED) through `extends`,
      // even though the subclass inherits them at runtime via the prototype chain.
      (window as unknown as { EventSource: typeof Original }).EventSource =
        TappingEventSource as unknown as typeof Original;
    },
    [...TAPPED_EVENT_TYPES],
  );
}

async function detectFinalUiState(page: Page): Promise<ConnectionResult['finalUiState']> {
  // ConversationPane renders into one of the observable terminal states:
  //   - 'ready'           → input enabled, no Retry button
  //   - 'error'/'timeout' → Retry button visible
  //   - 'limit-reached'   → 409 limit-reached copy visible (no EventSource opened)
  // `getByRole` is preferred per the selector-resilience hierarchy.
  if ((await page.getByRole('button', { name: 'Retry' }).count()) > 0) {
    return 'error-or-timeout';
  }
  if ((await page.getByText(/reached the limit of 10 active conversations/i).count()) > 0) {
    return 'limit-reached';
  }
  if ((await page.getByRole('textbox', { name: 'Message input' }).count()) > 0) {
    return 'ready';
  }
  return 'unknown';
}

async function openConversationAndObserveSse(page: Page, index: number): Promise<ConnectionResult> {
  await installEventSourceTap(page);
  await page.goto('/conversations/new', { waitUntil: 'domcontentloaded' });

  let receivedEvent = false;
  try {
    await page.waitForFunction(
      () => (window as unknown as { __sseEvents: string[] }).__sseEvents.length > 0,
      { timeout: FIRST_EVENT_TIMEOUT_MS },
    );
    receivedEvent = true;
  } catch {
    // No event arrived within the no-starvation window — flag as starved so the
    // HTTP/1.1 ceiling check can classify it. Do NOT throw here; the aggregation
    // step needs the full 10-connection picture to distinguish ceiling starvation
    // (exactly 6 succeed) from a generic transport failure.
    receivedEvent = false;
  }

  const events = await page.evaluate(
    () => (window as unknown as { __sseEvents: string[] }).__sseEvents.slice(),
  );
  const finalUiState = await detectFinalUiState(page);

  return { index, receivedEvent, events, finalUiState };
}

test.describe('P0-008 / NFR-R4 / R-04: 10 concurrent SSE connections without starvation @multi-conn @P0', () => {
  // Single test, parallel describe mode is a no-op here, but declares intent:
  // the test orchestrates its own fan-out via Promise.all + browser.newContext().
  test.describe.configure({ mode: 'parallel' });

  // Evaluated before the test body's fixtures resolve, so `withRepoConnection`
  // is NOT set up on the skip path (avoids a dev-server dependency for users
  // who run `--grep @P0` smoke without the multi-conn tier).
  test.beforeEach(async () => {
    test.skip(
      process.env.CI !== 'true' && process.env.PLAYWRIGHT_MULTI_CONN !== '1',
      'multi-conn tier only — set PLAYWRIGHT_MULTI_CONN=1 locally or run via the nightly-multi-conn CI job (`yarn playwright test --grep @multi-conn`)',
    );
  });

  test('[P0] 10 concurrent conversations each receive at least one SSE event within the no-starvation window @multi-conn', async ({
    browser,
    withRepoConnection,
  }) => {
    // Generous headroom for 10 parallel Chromium contexts on slow CI runners.
    test.setTimeout(120_000);

    expect(
      withRepoConnection.connectionId,
      'withRepoConnection fixture must prepare a RepoConnection so /conversations/new does not redirect to /onboarding',
    ).toBeTruthy();

    const contexts: BrowserContext[] = [];
    try {
      // Each context reuses the synthetic E2E user's auth storage state (the
      // same user `withRepoConnection` just prepared a RepoConnection for).
      // All 10 share the user — that's intentional, the test exercises the
      // SSE transport, not per-user tenant isolation (covered separately by P0-015).
      for (let i = 0; i < CONCURRENT_CONTEXTS; i++) {
        contexts.push(await browser.newContext({ storageState: STORAGE_STATE_PATH }));
      }

      // Parallel navigation + SSE establishment. Promise.all maximises the
      // concurrent pressure on the SSE transport — exactly the condition that
      // exposes the HTTP/1.1 6-connection ceiling (R-04) if the agent-be
      // reverse proxy ever regresses to HTTP/1.1.
      const results = await Promise.all(
        contexts.map(async (ctx, i) => {
          const page = await ctx.newPage();
          return openConversationAndObserveSse(page, i);
        }),
      );

      const successes = results.filter((r) => r.receivedEvent);
      const starved = results.filter((r) => !r.receivedEvent);

      // ─── HTTP/1.1 ceiling signature (R-04 / NFR-R4) ─────────────────────────
      // Exactly HTTP1_BROWSER_CEILING of CONCURRENT_CONTEXTS succeed, the rest
      // starve. This is the textbook browser-per-origin HTTP/1.1 SSE cap. Fail
      // loudly with the specific diagnostic so the deployment-config problem
      // (agent-be reverse proxy not HTTP/2-capable) is unambiguous — distinct
      // from a generic "no event arrived" failure.
      if (
        successes.length === HTTP1_BROWSER_CEILING &&
        starved.length === CONCURRENT_CONTEXTS - HTTP1_BROWSER_CEILING
      ) {
        throw new Error(
          `HTTP/1.1 ceiling bug detected (R-04 / NFR-R4): exactly ${HTTP1_BROWSER_CEILING} of ` +
            `${CONCURRENT_CONTEXTS} concurrent SSE connections received an event within ` +
            `${FIRST_EVENT_TIMEOUT_MS / 1000}s; the remaining ${starved.length} starved. ` +
            `Browser-per-origin HTTP/1.1 caps concurrent SSE at ${HTTP1_BROWSER_CEILING}; ` +
            `the agent-be reverse proxy is NOT HTTP/2-capable. ` +
            `Starved context indices: [${starved.map((r) => r.index).join(', ')}]. ` +
            `Per-connection debug: ${JSON.stringify(results)}.`,
        );
      }

      // ─── NFR-R4 no-starvation ───────────────────────────────────────────────
      // Every concurrent connection must receive at least one SSE event within
      // the window. Any non-ceiling starvation is also a failure (e.g. only 3
      // of 10 succeed → some other transport contention, worth surfacing).
      expect(
        successes.length,
        `${starved.length}/${CONCURRENT_CONTEXTS} concurrent SSE connections starved without an event within ` +
          `${FIRST_EVENT_TIMEOUT_MS / 1000}s. Per-connection debug: ` +
          `${JSON.stringify(results, null, 2)}`,
      ).toBe(CONCURRENT_CONTEXTS);
    } finally {
      // Close all contexts even on assertion failure so worker teardown is clean.
      // `allSettled` so a single close error doesn't mask the original failure.
      await Promise.allSettled(contexts.map((ctx) => ctx.close()));
    }
  });
});

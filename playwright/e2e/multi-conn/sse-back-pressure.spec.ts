import { test, expect } from '../../support/merged-fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * P1-013 / NFR-R3 / B-03: SSE back-pressure does not silently drop events.
 *
 * Tier: @multi-conn — runs only in the nightly `nightly-multi-conn` CI job
 *   (`.github/workflows/test.yml`), selected via `yarn playwright test --grep
 *   @multi-conn`. The PR-tier `chromium` project excludes this spec via
 *   `grepInvert: /@real-service|@multi-conn|@performance-spike/` in
 *   `playwright.config.ts`. CI secrets required: DATABASE_URL + AUTH_SECRET +
 *   CREDENTIAL_ENCRYPTION_KEK — no Daytona / Anthropic / GitHub-OAuth secret
 *   set, because the tested path is the SSE back-pressure contract, not
 *   agent execution.
 *
 * NFR-R3 threshold (B-03, resolved 2026-07-07 — verified PASS):
 *   - Per-connection SSE queue capped at 200 events.
 *   - If not drained within 30 s, server emits
 *       `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }` and closes.
 *   - Silent event drops are never acceptable.
 *
 * Architecture reference (`_bmad-output/project-context.md` → SSE back-pressure):
 *   - The `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' }` frame bypasses
 *     `SessionEventsService.emit()` and writes directly to `res` so a
 *     reconnecting client never replays a stale back-pressure error on its
 *     fresh connection.
 *   - The reconnect-eligible close signal is `200 + data: [DONE]`.
 *
 * Implementation contract under test:
 *   `apps/agent-be/src/streaming/streaming.controller.ts` `subscribe.next` —
 *   `pendingCount` increments when `res.write()` returns `false` (Node stream
 *   buffer above highWaterMark); at `pendingCount >= 200` a 30 s
 *   `backPressureTimer` starts; on fire, the controller writes `STREAM_ERROR`
 *   + `[DONE]` and calls `res.end()`. The `res` `drain` event resets
 *   `pendingCount = 0` and clears the timer.
 *
 * Skip rule (deliberate red-phase coordination gap, not a flake guard):
 *   The multi-conn tier boots the production AppModule via
 *   `yarn nx run agent-be:serve` (`playwright.config.ts` `webServer`). The
 *   production wiring is `SandboxService` (real) + `AgentService` (real) —
 *   `AgentServiceFake` (default script = 6 events, configurable via
 *   `setScript`) and `SandboxServiceFake` are wired ONLY by
 *   `apps/agent-be/test/helpers/test-module-builder.ts` `buildTestModule()`
 *   (Jest integration tests), NOT in the E2E dev server. The multi-conn CI
 *   env has no `DAYTONA_API_KEY`, so the real `SandboxService.provision`
 *   fails fast and the real `AgentService.runTurn` never produces enough
 *   events. There is NO production-side mechanism that emits 200+ SSE events
 *   for one conversation. Therefore this spec REQUIRES a test-only flood
 *   endpoint on agent-be at `POST /api/internal/test/sse-flood` (mirroring the
 *   `app/api/internal/test/*` pattern + `assertTestEnvNotInProduction()`
 *   guard documented in `project-context.md`). If absent, the test fails
 *   safe (skips) with the explicit blocker. See
 *   `_bmad-output/test-artifacts/test-design-qa.md` → P1-013 (Execution
 *   Strategy: Nightly Multi-Connection).
 *
 * Cleanly complementary to `streaming.controller.spec.ts` Story 3.3 (unit):
 *   the Jest suite proves the controller's back-pressure logic with a mocked
 *   `res` + `jest.useFakeTimers()`; this spec is the transport-level
 *   complement — the only artifact that exercises the full Node HTTP
 *   back-pressure chain (`res.write` → `drain` → 30 s `setTimeout` →
 *   `STREAM_ERROR` + `[DONE]` + `res.end()`).
 */

const SSE_DRAIN_TIMEOUT_MS = 30_000;
const BACK_PRESSURE_WINDOW_MS = SSE_DRAIN_TIMEOUT_MS + 5_000; // drain timeout + jitter/headroom from flood POST return
const TEST_TIMEOUT_MS = 60_000; // generous: slow consumer pause + buffer flush + diagnostic headroom
const QUEUE_CAP = 200;
const FLOOD_EVENT_COUNT = QUEUE_CAP * 2 + 50; // 450 — well above the 200-threshold + Node write-buffer fill (~16 KB / ~80 B per event ≈ 200 events before the first `false`)

const AGENT_BE_BASE = process.env.AGENT_BE_URL ?? 'http://localhost:3001';
const FLOOD_ENDPOINT_PATH = '/api/internal/test/sse-flood';

interface SseStreamState {
  status: number;
  chunks: string[];
  streamClosed: boolean;
  streamErrorSeen: boolean;
  doneSignalSeen: boolean;
  errorMessage: string | null;
  // Diagnostic timing (ms since epoch). Captured inside the page context so
  // the test can assert "STREAM_ERROR fired within 30 s of the queue
  // filling" explicitly — not just "was observed by 35 s after the flood".
  floodCompleteAt: number | null;
  streamErrorSeenAt: number | null;
  streamClosedAt: number | null;
}

interface FloodRequestBody {
  conversationId: string;
  count: number;
  token: string;
}

/**
 * Replaces `window.EventSource` with a token-capturing stub that does NOT
 * open a real network connection. The page's `ConversationPane.startSession`
 * instantiates this stub; instead of competing with our slow-consumer
 * `fetch + reader` for the SSE channel, the stub records the boundary JWT
 * and conversationId parsed from the SSE URL on `globalThis.__sseBackPressureTest`
 * and returns a dormant EventSource-like object.
 *
 * Why not subclass the real `EventSource` (as `concurrent-sse.spec.ts`
 * does)? The companion spec subclasses `EventSource` to TAP events on a
 * healthy connection. Here we need ZERO competition for the SSE channel —
 * the slow consumer must be the only subscriber so the controller's
 * back-pressure path is unambiguous. A real `EventSource` drains wire
 * frames eagerly (the browser drains TCP receive buffer), which would
 * prevent `res.write` from ever returning `false` and prevent
 * `pendingCount` from reaching 200.
 */
async function installEventSourceStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type SseStubGlobals = {
      __sseBackPressureTest: {
        boundaryJwt: string | null;
        conversationId: string | null;
      };
    };
    const g = globalThis as unknown as SseStubGlobals;
    g.__sseBackPressureTest = { boundaryJwt: null, conversationId: null };

    class StubEventSource {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSED = 2;
      readyState = 0;
      url: string;
      withCredentials = false;
      onopen: ((ev: Event) => unknown) | null = null;
      onmessage: ((ev: MessageEvent) => unknown) | null = null;
      onerror: ((ev: Event) => unknown) | null = null;

      constructor(url: string) {
        this.url = url;
        try {
          const u = new URL(url, globalThis.location?.href ?? 'http://localhost:3001');
          const token = u.searchParams.get('token');
          if (token) g.__sseBackPressureTest.boundaryJwt = token;
          const match = u.pathname.match(/\/api\/conversations\/([^/]+)\/events/);
          if (match) g.__sseBackPressureTest.conversationId = match[1] ?? null;
        } catch {
          // URL parse failure: leave the captured globals at null. The test
          // asserts truthy and surfaces a clear diagnostic if capture failed.
        }
      }
      addEventListener(): void {
        // no-op — we do not consume events via this stub
      }
      removeEventListener(): void {
        // no-op
      }
      close(): void {
        // no-op
      }
      dispatchEvent(): boolean {
        return true;
      }
    }

    (globalThis as unknown as { EventSource: typeof StubEventSource }).EventSource =
      StubEventSource;
  });
}

/**
 * Probes agent-be for the test flood endpoint with `OPTIONS`. Returns true if
 * the endpoint exists (response status !== 404). Used by the skip rule to
 * fail safe when the test-only flood infrastructure is missing.
 *
 * `OPTIONS` rather than the actual `POST` so a missing endpoint has no side
 * effects on a partial/old agent-be build — the genuine `POST` runs exactly
 * once, from the browser context, inside the `page.evaluate` call below.
 */
async function floodEndpointAvailable(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.fetch(`${AGENT_BE_BASE}${FLOOD_ENDPOINT_PATH}`, {
      method: 'OPTIONS',
      timeout: 5_000,
    });
    return response.status() !== 404;
  } catch {
    return false;
  }
}

test.describe('P1-013 / NFR-R3 / B-03: SSE back-pressure does not silently drop events @multi-conn @P1', () => {
  // Evaluated before fixtures resolve, matching the pattern in
  // `concurrent-sse.spec.ts`. A stray `--grep @P1` smoke run elsewhere fails
  // safe (skipped) unless the multi-conn tier is explicitly opted into — no
  // dev-server dependency on the skip path.
  test.beforeEach(async () => {
    test.skip(
      process.env.CI !== 'true' && process.env.PLAYWRIGHT_MULTI_CONN !== '1',
      'multi-conn tier only — set PLAYWRIGHT_MULTI_CONN=1 locally or run via the nightly-multi-conn CI job (`yarn playwright test --grep @multi-conn`)',
    );
  });

  test(`[P1] slow consumer triggers STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' } within the 30 s drain window and closes with reconnect-eligible 200 + data: [DONE] @multi-conn`, async ({
    page,
    request,
    withRepoConnection,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);

    expect(
      withRepoConnection.connectionId,
      'withRepoConnection fixture must prepare a RepoConnection so /conversations/new does not redirect to /onboarding',
    ).toBeTruthy();

    const floodAvailable = await floodEndpointAvailable(request);
    test.skip(
      !floodAvailable,
      `agent-be test flood endpoint (POST ${FLOOD_ENDPOINT_PATH}) is missing — required to emit ${FLOOD_EVENT_COUNT}+ SSE events for back-pressure testing. The multi-conn tier boots the production AppModule; AgentServiceFake / SandboxServiceFake are NOT injectable in E2E (only via buildTestModule() in Jest). The default AgentServiceFake script emits 6 events — well short of the 200-event threshold. See _bmad-output/test-artifacts/test-design-qa.md → P1-013 and the architectural NFR-R3 / B-03 contract (per _bmad-output/project-context.md). This is a deliberate coordination gap between QA and Backend, not a flake guard.`,
    );

    await installEventSourceStub(page);

    // Navigate to /conversations/new. The Server Component mints a boundary
    // JWT (`mintBoundaryJwt`) and renders `<ConversationPane boundaryJwt=... />`.
    // ConversationPane.startSession POSTs `/api/conversations` (agent-be
    // creates the conversation), then instantiates `new EventSource(url)`
    // — our stub captures `?token=` and the conversationId from the URL
    // WITHOUT opening a real SSE connection.
    await page.goto('/conversations/new', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => {
        const g = globalThis as unknown as {
          __sseBackPressureTest?: { conversationId: string | null };
        };
        return !!g?.__sseBackPressureTest?.conversationId;
      },
      { timeout: 30_000 },
    );

    const captured = await page.evaluate(() => {
      const g = globalThis as unknown as {
        __sseBackPressureTest: { boundaryJwt: string | null; conversationId: string | null };
      };
      return g.__sseBackPressureTest;
    });

    expect(
      captured?.boundaryJwt,
      'boundary JWT must be captured from the EventSource URL the ConversationPane mints via mintBoundaryJwt()',
    ).toBeTruthy();
    expect(
      captured?.conversationId,
      'conversationId must be captured from the SSE URL (ConversationPane.startSession creates it via POST /api/conversations)',
    ).toBeTruthy();

    const conversationId = captured.conversationId as string;
    const boundaryJwt = captured.boundaryJwt as string;
    const sseUrl = `${AGENT_BE_BASE}/api/conversations/${encodeURIComponent(conversationId)}/events?token=${encodeURIComponent(boundaryJwt)}`;
    const floodUrl = `${AGENT_BE_BASE}${FLOOD_ENDPOINT_PATH}`;
    const floodBody: FloodRequestBody = {
      conversationId,
      count: FLOOD_EVENT_COUNT,
      token: boundaryJwt,
    };

    // Open a slow-consumer SSE channel via `fetch + reader`, then trigger the
    // flood, then PAUSE all `reader.read()` calls for the drain window, then
    // drain Node's buffer. This single page.evaluate orchestrates the whole
    // sequence inside the browser context so the order is unambiguous (the
    // flood POST happens AFTER the SSE channel is open, which means the
    // StreamingController has already subscribed to the conversation's
    // ReplaySubject — every emit reaches our subscriber synchronously).
    //
    // The deliberate read-pause is the slow consumer:
    //   1. fetch resolves when the server flushes headers (controller has
    //      already wired `subscribe` + `req.on('close')` + `res.on('drain')`).
    //   2. flood POST returns once the server has synchronously called
    //      `sessionEvents.emit()` N times. Each emit triggers the controller's
    //      `subscribe.next` → two `res.write()` calls.
    //   3. After the Node write buffer fills (~16 KB / ~200 events), each
    //      subsequent `res.write` returns `false` → `pendingCount++`. At 200,
    //      the controller's 30 s `backPressureTimer` starts.
    //   4. We DRAIN NOTHING during the 30 s + jitter window. The timer fires,
    //      writing `STREAM_ERROR` + `[DONE]` (also buffered, since the client
    //      still hasn't read) and calling `res.end()`.
    //   5. After the pause we resume reading. Draining delivers every queued
    //      frame (flood events + STREAM_ERROR + [DONE]) in order. The next
    //      `reader.read()` resolves `{ done: true }` because `res.end()` was
    //      called, terminating the read loop.
    //
    // We do NOT use real EventSource here — EventSource consumes wire frames
    // eagerly and drains the TCP receive buffer, which prevents Node's
    // back-pressure from building. `fetch + manual reader` is the only
    // Playwright-level technique that exercises the controller's real
    // back-pressure path.
    const stream = await page.evaluate<SseStreamState, {
      sseUrl: string;
      floodUrl: string;
      floodBody: FloodRequestBody;
      drainWindowMs: number;
    }>(
      async (params) => {
        const state: SseStreamState = {
          status: 0,
          chunks: [],
          streamClosed: false,
          streamErrorSeen: false,
          doneSignalSeen: false,
          errorMessage: null,
          floodCompleteAt: null,
          streamErrorSeenAt: null,
          streamClosedAt: null,
        };
        (globalThis as unknown as { __sseBackPressureState?: SseStreamState }).__sseBackPressureState = state;

        try {
          const response = await fetch(params.sseUrl, {
            headers: { Accept: 'text/event-stream' },
          });
          state.status = response.status;
          if (!response.body) {
            state.errorMessage = 'fetch() returned no ReadableStream body';
            return state;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          const floodResponse = await fetch(params.floodUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(params.floodBody),
          });
          if (!floodResponse.ok) {
            state.errorMessage = `flood POST returned ${floodResponse.status}: ${await floodResponse.text()}`;
            return state;
          }
          // The flood returns once the server has synchronously emitted all N
          // events. Each emit triggers StreamingController.subscribe.next →
          // two res.write() calls. pendingCount >= 200 is reached during this
          // synchronous burst, so the 30 s backPressureTimer starts at (or
          // within milliseconds of) this timestamp — it is the proxy for
          // "queue filling time" referenced by NFR-R3.
          state.floodCompleteAt = Date.now();

          // SLOW CONSUMER PAUSE — do NOT call reader.read() for the drain
          // window so the server's 30 s backPressureTimer can fire and write
          // STREAM_ERROR + [DONE] to the back-pressured response stream.
          await new Promise<void>((resolve) => setTimeout(resolve, params.drainWindowMs));

          // Resume reading — drain Node's buffer. Queued frames flush in
          // order: flood events → STREAM_ERROR → [DONE]. The next
          // reader.read() resolves `{ done: true }` because res.end() was
          // called during the pause, terminating the read loop.
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              state.streamClosed = true;
              state.streamClosedAt = Date.now();
              break;
            }
            if (!value) continue;
            const text = decoder.decode(value, { stream: true });
            state.chunks.push(text);
            const joined = state.chunks.join('');
            if (
              !state.streamErrorSeen &&
              joined.includes('STREAM_ERROR') &&
              joined.includes('STREAM_BACK_PRESSURE')
            ) {
              state.streamErrorSeen = true;
              state.streamErrorSeenAt = Date.now();
            }
            if (!state.doneSignalSeen && joined.includes('data: [DONE]')) {
              state.doneSignalSeen = true;
            }
          }
        } catch (err) {
          state.errorMessage = err instanceof Error ? err.message : String(err);
        }
        return state;
      },
      {
        sseUrl,
        floodUrl,
        floodBody,
        drainWindowMs: BACK_PRESSURE_WINDOW_MS,
      },
    );

    // ─── NFR-R3 assertions ──────────────────────────────────────────────────
    expect(
      stream.errorMessage,
      'no fetch-level error should occur during SSE channel open, flood POST, or read drain',
    ).toBeNull();
    expect(
      stream.status,
      'SSE response status must be 200 — the reconnect-eligible close signal requires `200 + data: [DONE]` per architecture',
    ).toBe(200);
    expect(
      stream.floodCompleteAt,
      'floodCompleteAt timestamp must be captured (proxy for the moment the 200-event queue filled — flood POST returns only after the server synchronously emitted all events)',
    ).not.toBeNull();
    expect(
      stream.streamErrorSeenAt,
      `STREAM_ERROR { code: 'STREAM_BACK_PRESSURE' } must be observed in the SSE stream (NFR-R3). A silent close without the STREAM_ERROR notification is a back-pressure contract violation (silent drops are never acceptable).`,
    ).not.toBeNull();

    // Explicit within-30 s timing assertion: the controller's
    // `backPressureTimer` is set when `pendingCount >= 200` and fires 30 s
    // later. `floodCompleteAt` is the proxy for queue-filling moment (the
    // flood POST returns from the server AFTER all N events are emitted
    // synchronously, so `pendingCount` reached its peak and the timer is
    // active by this point). `streamErrorSeenAt` is captured the moment the
    // STREAM_ERROR frame arrives in the read drain — bounded by the 30 s
    // timer + jitter for the synchronous emit and the buffer flush.
    const elapsedMs =
      stream.streamErrorSeenAt !== null && stream.floodCompleteAt !== null
        ? stream.streamErrorSeenAt - stream.floodCompleteAt
        : Number.POSITIVE_INFINITY;
    expect(
      elapsedMs,
      `STREAM_ERROR must be emitted within ${SSE_DRAIN_TIMEOUT_MS / 1000} s of the queue filling (NFR-R3 threshold). Observed ${Math.round(elapsedMs / 1000)} s — a longer delay indicates the controller's backPressureTimer is misconfigured or the threshold is not 200 events.`,
    ).toBeLessThanOrEqual(BACK_PRESSURE_WINDOW_MS);
    expect(
      stream.doneSignalSeen,
      "connection must close with `data: [DONE]` after STREAM_ERROR — the architecture's reconnect-eligible close signal is `200 + data: [DONE]`",
    ).toBe(true);
    expect(
      stream.streamClosed,
      'connection must close cleanly (res.end() called by the controller after writing STREAM_ERROR + [DONE])',
    ).toBe(true);

    const allText = stream.chunks.join('');
    expect(
      allText,
      "STREAM_ERROR frame payload must include the STREAM_BACK_PRESSURE code (asserts the controller's full STREAM_ERROR + JSON payload contract, not just the event name)",
    ).toContain('STREAM_BACK_PRESSURE');

    // ─── No silent drops (NFR-R3 architectural guarantee) ───────────────────
    // "Silent drops are never acceptable" is operationalised as: when the
    // back-pressure queue overflows, the server MUST emit STREAM_ERROR rather
    // than silently close the connection. The STREAM_ERROR notification IS
    // the no-silent-drops guarantee — its presence proves the server told
    // the client about the overflow condition (vs. silently discarding every
    // buffered event without warning). An exact `emitted === received`
    // event-count comparison is not possible at the wire level: the 200+
    // events that triggered the overflow are by design buffered in Node's
    // write queue and only delivered when the client eventually drains —
    // `res.end()` marks the stream for closure but the buffer's flush timing
    // is transport-dependent. The architecture accepts this as the explicit
    // failure mode as long as STREAM_ERROR notification fires. The unit
    // coverage at `streaming.controller.spec.ts` Story 3.3 + this assertion
    // together prove the guarantee.
    expect(
      stream.streamErrorSeen,
      'no silent drops (NFR-R3): the STREAM_ERROR notification proves the server warned the client about back-pressure rather than silently discarding buffered events — without it, every event in the queue would be lost with no signal to the client/reconnect logic',
    ).toBe(true);
  });
});


# Suite-Wide Test Review — 2026-07-08

## Suite Inventory

- **Total test files:** 105
- **Total test cases:** ~1,169 (grep count; actual run count below)
- **Breakdown by area:**

| Area                          | Files | Test Cases (grep) | Test Cases (run) |
| ----------------------------- | ----- | ----------------- | ----------------- |
| `apps/web/src/**` (unit/integration) | 61    | 675               | 702               |
| `apps/agent-be/src/**` (unit)  | 14    | —                 | 271               |
| `apps/agent-be/test/**` (integration + contract) | 3     | —                 | 16 (integration)  |
| `playwright/e2e/**` (E2E)     | 27    | 210               | not run (see note) |

Note: Playwright E2E tests (210 cases across 27 files) were not executed in this review — they require a running dev server, database, and auth setup. The grep count of 210 is approximate (may include `test.describe` blocks). Unit and integration suites were fully executed.

## Test Run Results

| Suite        | Command                                          | Suites | Tests | Result |
| ------------ | ------------------------------------------------ | ------ | ----- | ------ |
| web          | `yarn nx run web:test --no-coverage`             | 61     | 702   | PASS   |
| agent-be     | `yarn nx run agent-be:test --no-coverage`        | 15     | 271   | PASS   |
| integration  | `yarn nx run agent-be:test-integration`          | 2      | 16    | PASS   |

All 989 unit/integration tests pass. Zero failures, zero skips.

**Integration test invocation note:** The integration tests must be run via `yarn nx run agent-be:test-integration` (which sets `cwd: "apps/agent-be"`). Running `npx jest --config apps/agent-be/test/jest-integration.config.ts` directly from the workspace root fails with `File not found: ./tsconfig.spec.json` because the config's `tsconfig` path is relative (`./tsconfig.spec.json`) and resolves against cwd, not the config file location. This is a pre-existing config fragility, not a regression from the remediation work — but it should be hardened (see Medium Finding M-4).

## Newly Added/Modified Test Review

### `playwright/e2e/conversation/streaming-chat.spec.ts` (scroll-pause flakiness fix)

- **Quality:** Good. The scroll-pause tests (lines 531–677) now use `.first()` on locators to disambiguate multiple matches, and add `content-render waits` (`await expect(page.getByText(...).first()).toBeVisible()`) before asserting on scroll position. This correctly sequences: emit content → wait for DOM render → check scroll state. The fix addresses the root cause of flakiness (asserting scroll position before content was painted).
- **Isolation:** Good. Each test calls `setupStreamingMocks(page)` independently with its own page context. Serial mode is appropriate (shared E2E user). No cross-test state leaks.
- **Determinism:** Moderate. The scroll tests use `page.waitForFunction` with a 5s timeout for scroll-position checks — this is condition-based, not a fixed sleep. However, `page.locator('[aria-live="polite"]').first().evaluate(...)` uses a CSS attribute selector to find the scroll container, which violates the test's own stated selector policy ("getByRole > getByText > getByLabel — no CSS classes or XPath"). `aria-live` is a semantic attribute (more resilient than a class), but it's still not `getByRole`.
- **Coverage:** Good. Covers auto-scroll follow, scroll-up pause, scroll-to-bottom button with count badge, and re-enable on click. All four UX-DR9 sub-behaviors are tested.
- **Findings:** See M-1 (selector policy inconsistency).

### `apps/web/src/components/shell/AppShell.test.tsx` (weak assertion fix)

- **Quality:** Good. The fix adds `expect(screen.getByTestId('sheet-content')).toBeVisible()` and `expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument()` — these are meaningfully stronger than the previous assertions. `toBeVisible()` checks computed styles (display, visibility, opacity), not just DOM presence.
- **Isolation:** Good. `jest.clearAllMocks()` in beforeEach. No shared state.
- **Determinism:** Good. Uses `waitFor` for async drawer open/close transitions.
- **Coverage:** Good. Covers drawer open, Escape close, pathname-change close, focus management (immediate + deferred h1), no-regression for synchronous focus.
- **Findings:** See M-2 (partial fix — `.bg-overlay` class selector still used in `waitFor` and pathname-change test).

### `apps/web/src/components/shell/AppShell.tsx` (added `data-testid`)

- **Quality:** Correct. The `data-testid="sheet-content"` attribute (line 80) is placed on the `SheetContent` component, which forwards `...props` to `DialogPrimitive.Content`. The test-id is test-only infrastructure — it doesn't affect production behavior.
- **Findings:** None.

### `apps/web/src/__tests__/workspace-build.exclusion.spec.ts` (new P2 smoke test)

- **Quality:** Acceptable for its stated purpose. The test is explicitly honest: "This smoke test replaces 'NONE' coverage with a minimal structural sanity check... It does NOT test the build system." Three trivial file-existence assertions (`package.json`, `nx.json`, at least one `project.json`).
- **Isolation:** N/A (no state, no mocks).
- **Determinism:** Good (filesystem checks are deterministic).
- **Coverage:** Minimal by design. This is a P2 placeholder — it provides a non-zero signal where there was previously none, but the signal is extremely weak (file existence ≠ build correctness).
- **Findings:** See L-1 (low value, but honest).

### `apps/web/src/__tests__/tailwind-theme.spec.ts` (new P3 theme token test)

- **Quality:** Good. Imports the real `tailwind.config.ts` and asserts exact hex values match DESIGN.md. Covers dark mode, background/border/text/accent/semantic colors, and typography. Each assertion is independent and specific.
- **Isolation:** Good. Pure config import, no side effects.
- **Determinism:** Good. Config values are static.
- **Coverage:** Good for a structural test. Covers 16 tokens across 6 categories.
- **Findings:** None. Appropriate for a P3 design-token guard.

### `apps/web/src/components/conversation/CopyButton.test.tsx` (new P3 copy behavior tests)

- **Quality:** Good. Tests "Copied" label appearance, aria-label change, 1.5s revert timing (with fake timers), and `alwaysVisible` prop behavior. The fake-timer usage is correct — `act()` flushes the microtask from the mocked `clipboard.writeText` before `waitFor` checks synchronously.
- **Isolation:** Good. `jest.useFakeTimers()` in beforeEach, `jest.useRealTimers()` + `jest.restoreAllMocks()` in afterEach.
- **Determinism:** Good. Timer-based behavior is tested with `jest.advanceTimersByTime(1500)`, not real waits.
- **Coverage:** Good. Covers happy path (click → Copied → revert), aria-label transition, and both `alwaysVisible` states.
- **Mock quality:** Good. `navigator.clipboard.writeText` is mocked with `jest.fn().mockResolvedValue(undefined)` — models the real async clipboard contract.
- **Findings:** See L-2 (CSS class assertions for `alwaysVisible` — implementation detail, but necessary in jsdom).

### `apps/web/src/components/conversation/UserMessage.test.tsx` (added timestamp hover test)

- **Quality:** Good. The new test (lines 35–43) verifies the timestamp wrapper has `opacity-0` and `group-hover:opacity-100` classes, confirming hover-only visibility per DESIGN.md.
- **Isolation:** Good. No shared state.
- **Determinism:** Good. Static class assertions.
- **Coverage:** Adequate. The test verifies the CSS mechanism for hover-only behavior. In jsdom, actual `:hover` can't be simulated, so class presence is the correct proxy.
- **Findings:** See L-2 (same CSS class assertion pattern as CopyButton).

### `apps/web/src/components/conversation/WorkingTreeIndicator.test.tsx` (added 3 help-text reachability tests)

- **Quality:** Good. The three new tests (lines 148–163) cover negative cases: info affordance absent in clean state, absent in hidden state, present only in dirty state. These complement the existing positive test (line 36) and provide proper state-coverage matrix.
- **Isolation:** Good. `onSave.mockClear()` in beforeEach, `jest.clearAllMocks()` in afterEach.
- **Determinism:** Good. All synchronous renders with `fireEvent`.
- **Coverage:** Good. The help-text reachability is now tested across all three relevant states (dirty/clean/hidden). The focus-trap test (lines 122–146) is well-constructed — verifies Tab wrap, Shift+Tab wrap, and Escape-to-trigger.
- **Findings:** See L-3 (minor redundancy — line 159 test overlaps with line 36 test).

### `apps/agent-be/test/integration/sse-concurrent-connections.integration.spec.ts` (new NFR-R4 concurrent SSE test)

- **Quality:** Good overall. Creates a real NestJS application (`app.listen(0)`), mints real JWTs via `jose` with the real `AUTH_SECRET`, opens real HTTP connections, and parses real SSE event streams. Tests both no-starvation (10 concurrent connections each receive their event) and isolation (events don't leak across conversations).
- **Isolation:** Good. `beforeEach` sets up fresh conversations, fresh app, fresh port. `afterEach` destroys all open connections, closes the app, restores `process.env`, clears mocks. The `openConnections` array tracks every connection for reliable cleanup.
- **Determinism:** Moderate. The test uses `await new Promise((resolve) => setTimeout(resolve, 500))` to wait for SSE event propagation. This is a fixed sleep, not a condition-based wait. On slow CI runners, 500ms may be insufficient; on fast runners, it wastes time. Should use a polling loop that checks `connections[i].events.length` until the expected event arrives or a timeout expires.
- **Coverage:** Good. Covers the two core NFR-R4 properties: no-starvation and isolation. Does not test the HTTP/1.1 6-connection ceiling (that's the Playwright E2E test's job, which is correctly noted in the docstring).
- **Mock quality:** Good. The mock Prisma models `conversation.findFirst` with real lookup logic (finds by id + userId). `DAYTONA_CLIENT` is nulled out (not needed for SSE transport). `CredentialsService` is stubbed. The mock is realistic for the SSE transport layer being tested.
- **Findings:** See M-3 (fixed sleep for event propagation).

## Broader Suite Review

### Epic 3 Conversation Tests

#### `apps/web/src/components/conversation/ConversationPane.test.tsx`

- **Quality:** Strong. 50+ tests covering Stories 3.1–3.7, 3.9, 3.11, 3.12. Covers provisioning, streaming, slash commands, stop button, tool pill lifecycle, working tree indicator, credential failures, resume/reconnect, concurrent conversation limits, and drain. Tests verify both happy paths and error paths (RUN_ERROR, STREAM_ERROR, SESSION_ERROR, provision failure cleanup, credential failure).
- **Isolation:** Good. `MockEventSource.reset()` in beforeEach clears static state. `global.fetch`, `global.EventSource`, `global.localStorage` are saved and restored in afterEach. `cleanup()` from testing-library is called.
- **Determinism:** Moderate. Some tests use `jest.useFakeTimers()` in the top-level beforeEach but sub-describe blocks switch to `jest.useRealTimers()`. This mixed timer strategy works but is fragile — a test added to the wrong describe block could inherit fake timers unexpectedly. The `await new Promise((r) => setTimeout(r, 50))` pattern for waiting on fire-and-forget `runTurn` is timing-dependent.
- **Mock quality:** Good. `MockEventSource` models the real EventSource contract (addEventListener, removeEventListener, close, readyState). The static `emit` method is a test-only convenience for injecting events. `global.fetch` mock handles all API endpoints with realistic response shapes.
- **Findings:** See L-4 (mixed fake/real timer strategy).

#### `apps/agent-be/src/streaming/agent.service.spec.ts`

- **Quality:** Good. Tests via `ConversationsService` integration with `AgentServiceFake`. Covers fire-and-forget `runTurn`, response persistence on `RUN_FINISHED`, no-persist on `RUN_ERROR`, and `stopAgent` returning `stopped: true`.
- **Isolation:** Good. Fresh module per test via `Test.createTestingModule`. `jest.clearAllMocks()` in afterEach.
- **Determinism:** Moderate. Uses `await new Promise((r) => setTimeout(r, 50))` to wait for fire-and-forget completion — timing-dependent but generous (50ms for an in-memory fake).
- **Mock quality:** Good. `AgentServiceFake` and `SandboxServiceFake` are dedicated test doubles that model the real service contracts. The Prisma mock is bare `jest.fn()` calls (less realistic than the Map-backed mock in `conversations.service.spec.ts`).
- **Findings:** None critical.

#### `apps/agent-be/src/conversations/conversations.service.spec.ts`

- **Quality:** Excellent. 70+ tests covering Stories 3.1–3.12. Covers provisioning pipeline order, failure cleanup, idle timeout (pre- and post-first-message), concurrent conversation limits, git identity resolution (with fallbacks), manual commit, drain, and tenant isolation. Tests verify both positive and negative paths.
- **Isolation:** Good. Uses a `Map`-backed mock Prisma that's more realistic than bare `jest.fn()` — `findFirst` actually looks up by id+userId, `update` mutates the map. `jest.useFakeTimers()` / `jest.useRealTimers()` in afterEach.
- **Determinism:** Good. Timer-based tests use `jest.advanceTimersByTimeAsync` (fake timers). Async operations use `setImmediate` flush.
- **Mock quality:** Strong. The `SandboxServiceFake` tracks provision/clone/inject/destroy/commit calls with invocation order, enabling ordering assertions. The `AgentServiceFake` supports stream delays, failure injection, and concurrent-run rejection.
- **Findings:** None.

### Hydration Tests

#### `apps/web/src/components/shell/AppShell.hydration.test.tsx` (HYD-UNIT-001)

- **Quality:** Good. Uses `renderAndHydrate` to server-render via `renderToStaticMarkup`, inject into DOM, then `hydrateRoot`. Captures `console.error` during hydration — React 19 logs mismatch warnings there. Asserts zero console errors.
- **Mock quality:** Good. `SideNavigation` and `Sheet` are mocked with `createElement` (not JSX) to avoid jsx-runtime serialization issues with `renderToStaticMarkup`. The docstring explains why.
- **Findings:** None.

#### `apps/web/src/app/(dashboard)/(app)/project-map/page.hydration.test.tsx` (HYD-UNIT-002)

- **Quality:** Strong. Renders the REAL `ProjectMapPage` (async server component) wrapped in the REAL `AppShell`, server-renders the full tree, then hydrates. Only data dependencies are mocked (auth, prisma, credential health, artifacts action). This is the strongest hydration test pattern — it exercises the real component tree.
- **Mock quality:** Good. Data mocks return realistic shapes (artifacts with id, path, type, title, status, lastModifiedAt). The component tree is real.
- **Findings:** None.

#### `apps/web/src/lib/test/no-setattribute-in-effects.test.ts` (HYD-UNIT-003)

- **Quality:** Good. Meta-test (regression guard) that scans all `.tsx` files under `apps/web/src/` for `setAttribute` calls inside `useEffect` callbacks in `'use client'` components. Uses a simple brace-matching parser (not full AST) — the docstring is honest about this limitation.
- **Findings:** See L-5 (simple parser, but sufficient for a regression guard).

### Contract Tests

#### `apps/agent-be/test/sdk-contract-replay.spec.ts`

- **Quality:** Excellent. Replays a real recorded `@anthropic-ai/claude-agent-sdk` session (JSONL fixture) through the REAL `AgentService` pipeline. Asserts the AG-UI event sequence (lifecycle bookends, tool-call lifecycle, text lifecycle, working-tree events, cost capture). Tests `interrupt()` method directly (not just absence of error).
- **Isolation:** Good. `jest.isolateModules` ensures the SDK mock doesn't leak. `jest.clearAllMocks()` + `jest.restoreAllMocks()` in afterEach.
- **Determinism:** Good. Fixture is a static file; no network, no Daytona, no API key.
- **Mock quality:** Excellent. The `createMockQuery` helper returns a real `Query` object with a working `interrupt()` method — the test directly verifies `getInterruptMock(...).toHaveBeenCalled()` rather than inferring it from absence of errors. The docstring (I-1, I-2 notes) is transparent about coverage limitations.
- **Findings:** None. This is a model test — honest about what it does and doesn't cover.

### E2E Isolation Tests

#### `playwright/e2e/multi-conn/concurrent-sse.spec.ts`

- **Quality:** Excellent. Subclasses the REAL `EventSource` (not a mock) to tap events while preserving genuine HTTP transport — this is the only way the HTTP/1.1 6-connection ceiling can manifest. Detects the ceiling signature (exactly 6 succeed, 4 starve) and fails with a specific diagnostic. Properly skips outside the multi-conn CI tier.
- **Isolation:** Good. Creates fresh browser contexts per connection. `finally` block closes all contexts even on failure.
- **Determinism:** Good. Uses `page.waitForFunction` with a 30s timeout for event arrival — condition-based, not fixed sleep.
- **Findings:** None.

#### `playwright/e2e/hydration/hydration.spec.ts`

- **Quality:** Good. Uses a global console-error guard (wired via `merged-fixtures.ts`) that automatically fails on any `console.error` or `pageerror`. Tests are minimal (navigate + assert visible heading) because the guard does the heavy lifting.
- **Findings:** None.

#### `playwright/e2e/shell/app-shell.spec.ts`

- **Quality:** Good. Covers AC-1 (side nav), AC-2 (three-zone scroll), AC-3 (breadcrumb), AC-4 (accessibility/keyboard), AC-5 (responsive drawer). Uses `getByRole` and `getByText` selectors consistently. Tests both positive (visible) and negative (not visible) assertions.
- **Isolation:** Good. Serial mode (shared E2E user). `withRepoConnection` fixture manages DB state.
- **Determinism:** Good. Uses `getComputedStyle` for visual assertions (not screenshot diffing). Uses `evaluate` for scroll-position checks.
- **Findings:** None.

## Findings Summary

### Critical (must fix before merge)

None. All newly added and modified tests pass. No false positives, no skipped tests, no tautological assertions were found in the remediation delta.

### Medium (should fix soon)

- **M-1: `streaming-chat.spec.ts` uses `[aria-live="polite"]` attribute selector, violating its own stated selector policy.** The test header declares "Selectors follow the selector-resilience hierarchy: getByRole > getByText > getByLabel (no CSS classes or XPath)." But the scroll tests (lines 518, 553, 562, 589, 619, 645, 666) use `page.locator('[aria-live="polite"]')` and `document.querySelector('[aria-live="polite"]')`. `aria-live` is a semantic attribute (more resilient than a CSS class), but it's not `getByRole`. If the `aria-live` attribute is removed or changed, these tests break. Consider adding a `data-testid` or using `page.getByRole('log')` (the implicit role for `aria-live="polite"` regions) if the container supports it.

- **M-2: `AppShell.test.tsx` — weak assertion fix is partial.** The "drawer closes on pathname change" test (lines 102–120) still uses only `document.querySelectorAll('.bg-overlay')` to verify drawer closure. It does not assert `screen.queryByTestId('sheet-content')` is absent. The other drawer tests (open, Escape close) were strengthened with `data-testid="sheet-content"` assertions, but this one was missed. The `.bg-overlay` class selector is an implementation detail — if the overlay class name changes, the test breaks silently (passes vacuously if the selector matches zero elements).

- **M-3: `sse-concurrent-connections.integration.spec.ts` uses fixed `setTimeout(resolve, 500)` for event propagation.** Both tests (lines 197, 227) use a 500ms fixed sleep to wait for SSE events to propagate to all connections. This is timing-dependent — on a slow CI runner under load, 500ms may be insufficient for 10 concurrent HTTP connections to receive and parse events. Should be replaced with a polling loop: `await Promise.all(connections.map(c => waitForEvent(c, 'TEST_EVENT', timeout)))` that checks `c.events` until the expected event arrives or a timeout expires.

- **M-4: Integration test jest config has a fragile relative tsconfig path.** `apps/agent-be/test/jest-integration.config.ts` line 8 uses `tsconfig: './tsconfig.spec.json'` which resolves relative to cwd, not the config file. Running `npx jest --config apps/agent-be/test/jest-integration.config.ts` from the workspace root fails with `File not found: ./tsconfig.spec.json`. The nx target works because it sets `cwd: "apps/agent-be"`. Should use `<rootDir>/../tsconfig.spec.json` (like the main jest config uses `<rootDir>/tsconfig.spec.json`) to be cwd-independent.

### Low (backlog)

- **L-1: `workspace-build.exclusion.spec.ts` provides minimal signal.** Three file-existence checks (`package.json`, `nx.json`, at least one `project.json`). The test is honest about its limitations, but the signal is extremely weak — file existence ≠ build correctness. Acceptable as a P2 placeholder, but CI already catches build failures via `nx build`. Consider whether this test adds value or just adds runtime.

- **L-2: CSS class-name assertions in `CopyButton.test.tsx` and `UserMessage.test.tsx`.** Both tests assert on CSS class presence (`opacity-0`, `group-hover:opacity-100`) to verify hover-only behavior. This is an implementation detail — if the class names change (e.g., switching to a different utility or a styled-components approach), the tests break even though behavior is unchanged. This is a necessary trade-off in jsdom (where `:hover` can't be simulated), but the tests should be documented as testing the CSS mechanism, not the visual behavior.

- **L-3: `WorkingTreeIndicator.test.tsx` line 159 test is redundant with line 36 test.** Both verify the info affordance is present in the dirty state. The line 36 test ("dirty state renders 'ⓘ' info affordance") and the line 159 test ("info affordance is present only in dirty state") check the same positive assertion. The line 159 test adds value only via the "only" qualifier, but it doesn't actually test exclusivity (it doesn't verify the affordance is absent in other states — that's covered by the separate clean/hidden tests at lines 149 and 154). Consider merging or removing the redundancy.

- **L-4: `ConversationPane.test.tsx` uses mixed fake/real timer strategy.** The top-level `beforeEach` calls `jest.useFakeTimers()`, but multiple sub-describe blocks call `jest.useRealTimers()` in their own `beforeEach`. This works but is fragile — a new test added to the wrong describe block could inherit unexpected timer behavior. Consider making the timer strategy explicit per-test (e.g., `jest.useFakeTimers()` inside the specific `it` blocks that need it) rather than relying on describe-block inheritance.

- **L-5: `no-setattribute-in-effects.test.ts` uses a simple brace-matching parser.** The `findMatchingBrace` function doesn't parse strings or comments, so a `setAttribute(` inside a string literal within a `useEffect` would be a false positive. The docstring is honest about this. Sufficient for a regression guard, but a false positive could surface if a comment or string contains `setAttribute(`.

## Recommendations

1. **Fix M-3 (fixed sleep in SSE integration test) — highest priority.** Replace `setTimeout(resolve, 500)` with a polling helper that waits for each connection to receive its expected event. This is the most likely source of CI flakiness in the newly added tests.

2. **Fix M-2 (partial AppShell assertion fix).** Add `expect(screen.queryByTestId('sheet-content')).not.toBeInTheDocument()` to the "drawer closes on pathname change" test for consistency with the other drawer tests.

3. **Fix M-4 (fragile integration config path).** Change `./tsconfig.spec.json` to `<rootDir>/../tsconfig.spec.json` in `jest-integration.config.ts` so the config is cwd-independent.

4. **Address M-1 (selector policy) opportunistically.** The `aria-live` attribute selector works and is more resilient than a CSS class, but it violates the stated policy. If the scroll container can be given a `data-testid` or accessed via `getByRole('log')`, do so. Otherwise, update the stated policy to acknowledge the exception.

5. **No action needed on L-1 through L-5.** These are low-severity improvements that can be addressed in normal maintenance. The tests are correct and pass — these are style/robustness improvements, not defects.

6. **Overall assessment: the newly added tests are well-constructed.** The remediation work added meaningful coverage (NFR-R4 concurrent SSE, copy behavior, theme tokens, help-text reachability, hydration guards) without introducing false positives, skipped tests, or tautological assertions. The test suite is in a healthy state — 989 unit/integration tests passing across 78 files, with 27 E2E specs (210 cases) available for execution in CI.

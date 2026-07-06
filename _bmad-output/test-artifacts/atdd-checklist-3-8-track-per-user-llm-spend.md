---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-06'
workflowType: 'testarch-atdd'
storyId: '3.8'
storyKey: 3-8-track-per-user-llm-spend
storyFile: _bmad-output/implementation-artifacts/3-8-track-per-user-llm-spend.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-3-8-track-per-user-llm-spend.md
generatedTestFiles:
  - apps/agent-be/src/cost-tracking/cost-tracking.service.spec.ts
  - apps/agent-be/src/streaming/agent.service.unit.spec.ts
  - apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/3-8-track-per-user-llm-spend.md
  - _bmad-output/project-context.md
  - _bmad-output/decision-policy.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-priorities-matrix.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/ci-burn-in.md
---

# ATDD Checklist — Story 3.8: Track Per-User LLM Spend

**TDD Phase:** RED (test scaffolds generated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — but this story is backend-only (`apps/agent-be` + `libs/database-schemas`)
**Generated:** 2026-07-06
**Execution Mode:** SEQUENTIAL (Jest unit tests only — no Playwright/E2E in scope)

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS; both `playwright.config.ts` and `jest.config.ts` present)
- Story scope: backend-only (agent-be `CostTrackingService` + `AgentService` cost recording + `SandboxService` NFR-S1 regression guards; Prisma `CostRecord` model)

### Prerequisites
- Story 3.8 approved, status `ready-for-dev`, 4 clear ACs
- Jest configured: `apps/agent-be/jest.config.ts` with `@jest-environment node` for backend tests
  - `transformIgnorePatterns: ['node_modules/(?!jose|@ag-ui|@anthropic-ai)']`
  - `moduleNameMapper` maps `@anthropic-ai/claude-agent-sdk` to manual `__mocks__/claude-agent-sdk.ts`
- Playwright configured but not needed for this story (backend-only)
- Dev environment available
- All dependencies already installed (no new packages needed)

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/3-8-track-per-user-llm-spend.md`
- **Story key:** `3-8-track-per-user-llm-spend`
- **Story ID:** `3.8`
- **Acceptance Criteria:**
  - AC-1: Cost recorded per turn from SDK cost reporting (NFR-O1) — `cost-tracking.service.ts` records per-user spend to Postgres before `RUN_FINISHED` emits; aborted turns still record cost if `result` message arrived
  - AC-2: Budget alert fires when monthly spend exceeds threshold (NFR-O1) — structured `logger.warn` with month-to-date total, threshold, user identifier; non-blocking
  - AC-3: Platform-internal credentials never injected into Sandbox (NFR-S1) — only `labels` passed to `daytona.create()`; OAuth token in git URL only; `injectGitConfig()` passes name/email only; no credentials in command strings
  - AC-4: Sandbox network has no route to agent-be internal endpoints (NFR-S1) — verified at launch as a deployment invariant, not via automated test

### Framework & Existing Patterns
- Jest with `@jest-environment node` for backend unit tests
- Co-located tests (`*.spec.ts` next to source)
- P0/P1 priority tags in `it()` descriptions
- Mock patterns: `jest.mock` at top, `jest.clearAllMocks` in `beforeEach`, `jest.restoreAllMocks` in `afterEach`
- Test header comments citing story, ACs, red-phase status
- `jest.isolateModules` for per-test `jest.doMock` of already-imported modules (agent.service.unit.spec.ts pattern)
- `jest.spyOn(service['logger'], 'warn')` for private logger spy pattern
- Mock prisma pattern: plain object with jest.fn() methods
- `SandboxServiceFake` for sandbox-path tests (not needed for NFR-S1 — uses mock Daytona client directly)
- `AgentServiceFake` does NOT need cost recording (DP-5 — cost recording verified in unit tests with real AgentService + mock prisma)

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- `data-factories.md` (core) — Factory functions with overrides, API-first setup
- `component-tdd.md` (core) — Red-Green-Refactor cycle, provider isolation
- `test-quality.md` (core) — Deterministic, isolated, explicit, focused, fast tests
- `test-healing-patterns.md` (core) — Common failure patterns and fixes
- `test-levels-framework.md` (core) — Unit vs integration vs E2E selection
- `test-priorities-matrix.md` (core) — P0-P3 priority assignment
- `ci-burn-in.md` (core) — CI burn-in patterns

### Existing Test Files (to be extended)
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` — Story 3.4/3.7 delivered this. Story 3.8 adds cost recording tests (recordCost called with correct data, before RUN_FINISHED, not called when no result, failure doesn't crash, SDKResultError, result after tool calls)

### New Test Files (to be created)
- `apps/agent-be/src/cost-tracking/cost-tracking.service.spec.ts` — `CostTrackingService` unit tests (recordCost, checkBudgetAlert, threshold env var)
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` — NFR-S1 regression guard tests (provision labels-only, clone OAuth-in-URL, injectGitConfig name/email-only, commit no-credentials, listSkills no-credentials)

### Key Implementation Context (from story + project-context.md)
- **`CostTrackingService`**: new `@Injectable()` in `cost-tracking/` module. Injects `PrismaService`. `recordCost()` inserts to `prisma.costRecord.create` then calls `checkBudgetAlert`. `checkBudgetAlert` queries `prisma.costRecord.aggregate` with month-to-date sum, logs `logger.warn` if > threshold. Both wrapped in try/catch — failures logged and swallowed (non-blocking)
- **`SPEND_ALERT_THRESHOLD_USD`**: module-level constant, parsed from `process.env.LLM_SPEND_ALERT_THRESHOLD_USD` with `parseFloat`, falls back to `20` on invalid/missing. Follows `CIRCUIT_BREAKER_TIMEOUT_MS` pattern
- **`AgentService` cost recording**: `lastCostData` local variable in `runTurn`, captured from SDK `result` message in the `while` loop. Recorded after `pendingClassifierPromises` await but before `RUN_FINISHED` emit. Ungated on abort state (records whenever `lastCostData` is set). `recordCost` has its own try/catch
- **`CostRecord` Prisma model**: `userId`, `conversationId`, `costUsd` (Float), `sessionId`, `numTurns`, `durationMs`, `createdAt`. `@@index([userId, createdAt])` for month-to-date query
- **NFR-S1 regression guards**: verify `provision()` passes only `labels` to `daytona.create()`, `clone()` injects OAuth token into git URL, `injectGitConfig()` passes only name/email, `commit()` and `listSkills()` command strings contain no platform credentials

---

## Step 2 Output: Generation Mode

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear and well-specified (4 ACs with Given/When/Then)
- Scenarios are standard: service logic (cost recording, budget alert), regression guards (credential isolation)
- Stack is backend-only for this story — no browser recording needed
- Backend logic (`CostTrackingService`, `AgentService` cost capture) is unit-testable with mocks
- NFR-S1 regression guards are unit-testable with mock Daytona client
- No complex UI interactions

---

## Step 3 Output: Test Strategy

### AC-1: Cost recorded per turn from SDK cost reporting (NFR-O1)

**Backend — `CostTrackingService.recordCost`:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 1.1 | `recordCost` calls `prisma.costRecord.create` with correct fields | Unit | P0 | `cost-tracking.service.spec.ts` |
| 1.2 | `recordCost` does NOT throw when `prisma.costRecord.create` fails — logs via `logger.error` and swallows | Unit | P0 | `cost-tracking.service.spec.ts` |

**Backend — `AgentService` cost recording from SDK `result` message:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 1.3 | `recordCost` called with correct cost data when `result` message in stream | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.4 | `recordCost` called BEFORE `RUN_FINISHED` is emitted (event ordering) | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.5 | `recordCost` NOT called when no `result` message in stream | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.6 | `recordCost` failure does not crash the agent run — `RUN_FINISHED` still emits | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.7 | Cost recorded from `SDKResultError` (subtype `error_max_turns`) as well as `SDKResultSuccess` | Unit | P0 | `agent.service.unit.spec.ts` |
| 1.8 | Cost recorded when `result` message arrives after tool calls | Unit | P1 | `agent.service.unit.spec.ts` |

### AC-2: Budget alert fires when monthly spend exceeds threshold (NFR-O1)

**Backend — `CostTrackingService.checkBudgetAlert`:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 2.1 | `recordCost` calls `checkBudgetAlert` after inserting the cost record | Unit | P0 | `cost-tracking.service.spec.ts` |
| 2.2 | `checkBudgetAlert` queries `prisma.costRecord.aggregate` with correct where/_sum | Unit | P0 | `cost-tracking.service.spec.ts` |
| 2.3 | `checkBudgetAlert` logs `logger.warn` when month-to-date > threshold ($25 > $20) | Unit | P0 | `cost-tracking.service.spec.ts` |
| 2.4 | `checkBudgetAlert` does NOT log when month-to-date < threshold ($15 < $20) | Unit | P0 | `cost-tracking.service.spec.ts` |
| 2.5 | `recordCost` does NOT throw when `checkBudgetAlert` fails (aggregate rejects) | Unit | P0 | `cost-tracking.service.spec.ts` |
| 2.6 | `SPEND_ALERT_THRESHOLD_USD` reads from `process.env.LLM_SPEND_ALERT_THRESHOLD_USD` when set | Unit | P1 | `cost-tracking.service.spec.ts` |
| 2.7 | `SPEND_ALERT_THRESHOLD_USD` falls back to `20` when env var unset or invalid | Unit | P1 | `cost-tracking.service.spec.ts` |

### AC-3: Platform-internal credentials never injected into Sandbox (NFR-S1)

**Backend — `SandboxService` NFR-S1 regression guards:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.1 | `provision()` calls `daytona.create()` with only `labels` — no `env`, `resources`, `metadata` | Unit | P0 | `sandbox.service.nfr-s1.spec.ts` |
| 3.2 | `labels` contain `conversationId` only — no credentials in labels | Unit | P0 | `sandbox.service.nfr-s1.spec.ts` |
| 3.3 | `clone()` injects OAuth token into git URL via `x-access-token` username | Unit | P0 | `sandbox.service.nfr-s1.spec.ts` |
| 3.4 | `clone()` credential is NOT passed as env var or separate argument | Unit | P0 | `sandbox.service.nfr-s1.spec.ts` |
| 3.5 | `injectGitConfig()` passes only name/email — no credentials in command string | Unit | P0 | `sandbox.service.nfr-s1.spec.ts` |
| 3.6 | `commit()` command string does not interpolate platform credentials | Unit | P0 | `sandbox.service.nfr-s1.spec.ts` |
| 3.7 | `listSkills()` command string is `ls -1 .claude/skills/` — no credential interpolation | Unit | P1 | `sandbox.service.nfr-s1.spec.ts` |

### AC-4: Sandbox network has no route to agent-be internal endpoints (NFR-S1)

**Deferred per DP-5** — requires a real Daytona Sandbox attempting a network connection to `apps/agent-be`'s internal endpoints. Not feasible in CI. Per architecture line 305, this is a launch-checklist deployment invariant, not an automated test.

### E2E Deferral Check

**Per user instruction:** Before deferring E2E coverage, verify no browser-level mock pattern can simulate the scenario.

| AC | Browser mock possible? | Reason | Decision | Policy |
|----|----------------------|--------|----------|--------|
| AC-1 | No | DB write from SDK `result` message — no browser interaction. Unit test with `jest.doMock` SDK + mock prisma covers fully. | Defer E2E | DP-5 |
| AC-2 | No | `logger.warn` is server-side — not browser-verifiable. Unit test with mock prisma covers fully. | Defer E2E | DP-5 |
| AC-3 | No | `daytona.create()` arg verification — not a browser-level interaction. Unit test with mock Daytona client covers fully. | Defer E2E | DP-5 |
| AC-4 | No | Requires real Daytona Sandbox — explicitly deferred in story per DP-5. | Defer E2E | DP-5 |

**Conclusion:** No browser-level mock pattern can simulate any AC in this story. All ACs are covered by unit tests. E2E deferral is justified.

### Decision Records

**Decision (DP-5):** E2E coverage deferred for all ACs. No browser-level mock pattern can simulate the scenarios — AC-1/AC-2 are backend DB writes and server-side logs, AC-3 is a Daytona API call argument verification, AC-4 requires a real Daytona Sandbox. Unit tests cover ACs 1-3 fully; AC-4 is a launch-checklist deployment invariant per architecture line 305.

**Decision (DP-4):** Test file organization follows existing co-located patterns. `cost-tracking.service.spec.ts` next to `cost-tracking.service.ts`, `sandbox.service.nfr-s1.spec.ts` next to `sandbox.service.ts`, `agent.service.unit.spec.ts` extended with new describe block. Autonomous test-structure decision.

**Decision (DP-5):** `AgentServiceFake` does NOT need cost recording. Same as Story 3.7's `markCredentialFailed` decision. Cost recording is a DB write verified in `agent.service.unit.spec.ts` (real AgentService with mock prisma). Adding cost recording to the fake would require injecting `CostTrackingService` into the fake's constructor, changing every test that constructs the fake — disproportionate to the value for MVP.

### Red Phase Confirmation

All new test cases will fail until implementation:
- `CostTrackingService` stub throws "not implemented" → `cost-tracking.service.spec.ts` tests fail when unskipped
- `AgentService` has no cost capture/recording logic → `agent.service.unit.spec.ts` new tests fail when unskipped
- `SandboxService` NFR-S1 regression guards verify EXISTING behavior → tests PASS when unskipped (regression guards, not red-phase failures)

### Test File Plan

| File | Action | Tests | Priority Breakdown |
|------|--------|-------|-------------------|
| `apps/agent-be/src/cost-tracking/cost-tracking.service.spec.ts` | Create | 9 | P0: 7, P1: 2 |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Extend | 6 (new describe) | P0: 5, P1: 1 |
| `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` | Create | 7 | P0: 6, P1: 1 |
| **Total** | | **22 test cases** | **P0: 18, P1: 4** |

---

## Step 4 Output: Test Generation (RED PHASE)

**Execution Mode:** SEQUENTIAL (Jest unit tests only — no Playwright/E2E in scope)

**TDD Red Phase:** All new test cases use `it.skip()` — tests are skipped until implementation lands. Remove `it.skip()` → `it()` when activating for the current task.

### Stub Files Created (for TDD red phase compilation)

| File | Type | Stub Behavior |
|------|------|---------------|
| `apps/agent-be/src/cost-tracking/cost-tracking.service.ts` | NestJS Injectable | `recordCost()` throws "not implemented — Story 3.8" |
| `apps/agent-be/src/cost-tracking/cost-tracking.module.ts` | NestJS Module | Exports `CostTrackingService` (no imports needed — `PrismaModule` is `@Global()`) |

### Existing Files Modified (minimal stub changes for compilation)

| File | Changes |
|------|---------|
| `apps/agent-be/src/streaming/agent.service.ts` | Added `CostTrackingService` import + 5th constructor parameter (`costTracking`). Constructor body has `void this.costTracking;` to suppress unused-property error. No cost capture/recording logic yet. |
| `apps/agent-be/src/streaming/streaming.module.ts` | Added `CostTrackingModule` to imports array. |

### Test Files Generated

| File | Action | New Tests | Priority Breakdown |
|------|--------|-----------|-------------------|
| `apps/agent-be/src/cost-tracking/cost-tracking.service.spec.ts` | Created | 9 | P0: 7, P1: 2 |
| `apps/agent-be/src/streaming/agent.service.unit.spec.ts` | Extended | 6 (new describe) | P0: 5, P1: 1 |
| `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` | Created | 7 | P0: 6, P1: 1 |
| **Total** | | **22 new test cases** | **P0: 18, P1: 4** |

### TDD Red Phase Compliance

- All new test cases use `it.skip()` (Jest equivalent of `test.skip()`)
- All tests assert EXPECTED behavior (not placeholder assertions)
- All tests are marked as expected_to_fail (stubs throw "not implemented" or logic not yet implemented)
- No active passing tests generated (correct TDD red phase)
- NFR-S1 regression guard tests are `it.skip()` but will PASS when activated (existing code satisfies NFR-S1) — these are verification tests, not red-phase failures

### Next Steps (Task-by-Task Activation)

During implementation of each task:

1. Remove `it.skip()` from the current test file or describe block
2. Run tests: `yarn nx test agent-be`
3. Verify the activated test fails first, then passes after implementation (green phase)
4. If any activated tests still fail unexpectedly:
   - Either fix implementation (feature bug)
   - Or fix test (test bug)
5. Commit passing tests

### Implementation Guidance

**Backend (agent-be) to implement:**
- `CostTrackingService.recordCost()` — insert to `prisma.costRecord.create`, then call `checkBudgetAlert`. Both wrapped in try/catch (failures logged and swallowed)
- `CostTrackingService.checkBudgetAlert()` — query `prisma.costRecord.aggregate` with month-to-date sum, log `logger.warn` if > threshold. Own try/catch.
- `SPEND_ALERT_THRESHOLD_USD` — module-level constant, parse from env with fallback to 20
- `AgentService.runTurn()` — capture cost data from SDK `result` message in `while` loop (`lastCostData` local variable), record after `pendingClassifierPromises` await but before `RUN_FINISHED` emit, ungated on abort state
- `CostRecord` Prisma model + migration (Task 1)
- `LLM_SPEND_ALERT_THRESHOLD_USD` env var in `.env.example` (Task 7)

---

## Step 5 Output: Validate & Complete

### Validation Results

| Check | Status |
|-------|--------|
| Story approved with clear acceptance criteria | PASS — 4 ACs, all testable |
| Test framework configured (Jest) | PASS — jest.config.ts in apps/agent-be |
| Test files created correctly | PASS — 2 new, 1 extended |
| Checklist matches acceptance criteria | PASS — all 4 ACs mapped to test scenarios |
| Tests are red-phase scaffolds with `it.skip()` | PASS — 22 new test cases, all `it.skip()` |
| Story metadata and handoff paths captured | PASS — frontmatter complete |
| Temp artifacts in `_bmad-output/test-artifacts/` | PASS |
| TypeScript typecheck passes | PASS — `tsc --noEmit -p apps/agent-be/tsconfig.app.json` clean |
| ESLint passes (0 errors) | PASS — 0 errors in agent-be (24 pre-existing warnings, none from Story 3.8) |
| Existing tests still pass | PASS — 140 passed, 22 skipped (9 cost-tracking + 7 nfr-s1 + 6 agent.service.unit Story 3.8) |
| New skipped tests verified | PASS — 22 new tests properly skipped |

### Completion Summary

**Story:** 3.8 — Track Per-User LLM Spend
**Story ID:** 3.8
**Story key:** 3-8-track-per-user-llm-spend
**TDD Phase:** RED (test scaffolds generated, all `it.skip()`)

**Test files created:**
- `apps/agent-be/src/cost-tracking/cost-tracking.service.spec.ts` (9 tests)
- `apps/agent-be/src/sandbox/sandbox.service.nfr-s1.spec.ts` (7 tests)

**Test files extended:**
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (+6 cost recording tests)

**Stub files created (for compilation):**
- `apps/agent-be/src/cost-tracking/cost-tracking.service.ts`
- `apps/agent-be/src/cost-tracking/cost-tracking.module.ts`

**Existing files modified (minimal stub changes):**
- `apps/agent-be/src/streaming/agent.service.ts` — added 5th constructor param (`CostTrackingService`)
- `apps/agent-be/src/streaming/streaming.module.ts` — imported `CostTrackingModule`

**Total: 22 new test cases (P0: 18, P1: 4)**

**Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-3-8-track-per-user-llm-spend.md`

**Key risks/assumptions:**
- The `CostTrackingService` tests rely on `jest.isolateModules` to re-import the service with different env values for the `SPEND_ALERT_THRESHOLD_USD` tests. The implementation must parse `process.env.LLM_SPEND_ALERT_THRESHOLD_USD` at module load time (not at call time) for this pattern to work.
- The `AgentService` cost recording tests use `mockCostTracking.recordCost` to verify the correct cost data is passed. The implementation must capture cost data from the SDK `result` message's `total_cost_usd`, `session_id`, `num_turns`, and `duration_ms` fields.
- The NFR-S1 regression guard tests verify EXISTING behavior — they will PASS when activated (not fail like true red-phase tests). They are regression guards: if a future change adds env vars to `daytona.create()` or interpolates credentials into command strings, these tests fail.
- The `recordCost` failure test (1.6) mocks `recordCost` to reject. The implementation's `recordCost` has its own try/catch that logs and swallows — but if it throws despite the try/catch, the `runTurn` try/catch catches it. The test verifies the run does not crash either way.

**Next recommended workflow:** `bmad-dev-story` — implement Story 3.8 tasks, removing `it.skip()` → `it()` per task and verifying green phase.

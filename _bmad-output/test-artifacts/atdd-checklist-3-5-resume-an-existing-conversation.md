---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: '2026-07-04'
storyId: '3.5'
storyKey: 3-5-resume-an-existing-conversation
storyFile: _bmad-output/implementation-artifacts/3-5-resume-an-existing-conversation.md
atddChecklistPath: _bmad-output/test-artifacts/atdd-checklist-3-5-resume-an-existing-conversation.md
generatedTestFiles:
  - apps/agent-be/src/conversations/conversations.service.spec.ts
  - apps/web/src/components/conversation/ConversationPane.test.tsx
  - apps/web/src/hooks/use-conversation-presence.test.ts
  - apps/web/src/components/project-map/InProgressArtifactCard.test.tsx
  - apps/web/src/components/project-map/ArtifactCard.test.tsx
inputDocuments:
  - _bmad-output/implementation-artifacts/3-5-resume-an-existing-conversation.md
  - _bmad-output/project-context.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/data-factories.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/component-tdd.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-quality.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-healing-patterns.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-levels-framework.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/test-priorities-matrix.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/ci-burn-in.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/selector-resilience.md
  - .claude/skills/bmad-testarch-atdd/resources/knowledge/timing-debugging.md
---

# ATDD Checklist — Story 3.5: Resume an Existing Conversation

**TDD Phase:** RED (test scaffolds to be generated, will fail until implementation)
**Stack:** fullstack (Next.js + NestJS) — this story spans both backend and frontend
**Generated:** 2026-07-04
**Execution Mode:** SEQUENTIAL

---

## Step 1 Output: Preflight & Context

### Stack Detection
- Config `test_stack_type`: auto
- Auto-detected: `fullstack` (package.json with Next.js/React + NestJS; both `playwright.config.ts` and `jest.config.ts` present)
- Story scope: fullstack (agent-be `resumeConversation` service + web `ConversationPane` reconnecting state + cross-tab BroadcastChannel hooks)

### Prerequisites
- Story 3.5 approved, status `ready-for-dev`, 3 clear ACs
- Jest configured: jsdom for component tests, `@jest-environment node` for pure function/backend tests
  - `apps/web/jest.config.ts` — `transformIgnorePatterns: ['node_modules/(?!jose|@ag-ui|@anthropic-ai)']`
  - `apps/agent-be/jest.config.ts` + `jest-integration.config.ts`
- Playwright configured: `playwright.config.ts` (auth setup + chromium projects, 4 shards)
- Dev environment available
- All dependencies already installed (BroadcastChannel is browser API; `jose`, `zod`, `nestjs-zod`, `rxjs` already installed)

### Story Context
- **Story file:** `_bmad-output/implementation-artifacts/3-5-resume-an-existing-conversation.md`
- **Story key:** `3-5-resume-an-existing-conversation`
- **Story ID:** `3.5`
- **Acceptance Criteria:**
  - AC-1: Full chat history restored immediately from Postgres, independent of Sandbox state (FR13, NFR-R2) — *already satisfied by Story 3.2's `[conversationId]/page.tsx`; no code change needed, validated only*
  - AC-2: "Reconnecting…" state with git identity re-injection on sandbox re-init — input disabled, full history visible, re-enables on SESSION_READY; git identity re-injected at resume (not only at initial provision); timeout falls back to same Session start timeout treatment
  - AC-3: Focus existing Conversation tab from Project Map (FR8) — in-progress artifact with open conversation tab → focus that tab instead of opening Artifact Browser

### Framework & Existing Patterns
- Jest with jsdom (default) for client component tests
- `@jest-environment node` for backend unit tests with no DOM needs
- Co-located tests (`*.spec.ts` / `*.test.tsx` next to source)
- P0/P1 priority tags in `it()` descriptions
- Mock patterns: `jest.mock` at top, `jest.clearAllMocks` in `beforeEach`, `jest.restoreAllMocks` in `afterEach`
- Test header comments citing story, ACs, red-phase status
- `buildTestModule()` for agent-be tests (pre-wires `SandboxServiceFake`, supports array-form overrides)
- `MockEventSource` class pattern for SSE testing in ConversationPane (static `emit(eventType, data)`)
- `jest.mock('next/navigation', ...)` for `useRouter` mock
- `jest.mock('react-markdown', () => ({ __esModule: true, default: ... }))` for ESM default-export mock
- `jest.useFakeTimers()` + `jest.advanceTimersByTime()` for timer-dependent tests
- `userEvent.type()` over `fireEvent.change` for React 19 text inputs
- `Object.defineProperty` to mock layout properties in jsdom
- `AgentServiceFake` mimics production side effects (Turn persistence, `terminateProcess` calls, SSE event emission)

### TEA Config Flags
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: false
- `tea_pact_mcp`: none
- `tea_browser_automation`: auto
- `test_stack_type`: auto

### Knowledge Fragments Loaded
- `data-factories.md` (core) — Factory functions with overrides, API-first setup
- `component-tdd.md` (core) — Red-Green-Refactor cycle, provider isolation, accessibility assertions
- `test-quality.md` (core) — Deterministic, isolated, explicit, focused, fast tests
- `test-healing-patterns.md` (core) — Common failure patterns and fixes
- `test-levels-framework.md` (core) — Unit vs integration vs E2E selection
- `test-priorities-matrix.md` (core) — P0-P3 priority assignment
- `ci-burn-in.md` (core) — CI burn-in patterns
- `selector-resilience.md` (extended) — Robust selector strategies (frontend/fullstack)
- `timing-debugging.md` (extended) — Race condition identification and deterministic waits (frontend/fullstack)

### Existing Test Files (to be extended)
- `apps/agent-be/src/conversations/conversations.service.spec.ts` — Stories 3.1/3.2 delivered this. Story 3.5 adds `resumeConversation` describe block (fast path, slow path, tenant isolation, git identity re-injection, event emission, idle timer dedup)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` — Stories 3.1/3.2/3.3/3.4 delivered this. Story 3.5 adds reconnecting state tests (state transition, resume endpoint call, timeout, handleRetry fix, label rendering)
- `apps/web/src/components/project-map/ArtifactCard.test.tsx` — Story 2.2/2.6 delivered this. Story 3.5 adds `onClick` prop test (backward compatibility)

### New Test Files (to be created)
- `apps/web/src/hooks/use-conversation-presence.test.ts` — BroadcastChannel hooks (`useConversationPresence`, `useOpenConversations`) — mount/unmount broadcast, focus-conversation, dedup, SSR no-op
- `apps/web/src/components/project-map/InProgressArtifactCard.test.tsx` — cross-tab focus wrapper — preventDefault + broadcast when conversations open, default navigation when empty

### Key Implementation Context (from story + project-context.md)
- **`resumeConversation` fast path:** sandbox alive in-memory (`sandboxStatuses.get(id) === 'ready'` and `sandboxIds.has(id)`) → re-inject git config → `git status --porcelain` → emit `WORKING_TREE_*` → emit `SESSION_READY`. Returns `{ sandboxStatus: 'ready' }`
- **`resumeConversation` slow path:** sandbox not alive → set status to `'provisioning'`, fire-and-forget `void this.provisionSandbox(conversationId, userId).catch(...)`. Returns `{ sandboxStatus: 'provisioning' }`
- **`resumeConversation` not-found:** returns `{ sandboxStatus: 'failed' }` (don't leak existence — consistent with `listSkills` pattern)
- **`resolveGitIdentity` helper:** extracted from `provisionSandbox` lines 66-82 — `name ?? githubLogin`, `email ?? ${githubLogin}@users.noreply.github.com`. Private method on `ConversationsService` (not shared library — deliberate cross-service logic duplication)
- **`'reconnecting'` SessionState:** new state for resume path (distinct from `'provisioning'`). Input disabled, "Reconnecting…" label via `SessionStartSpinner` `label` prop
- **Resume endpoint call:** `POST /conversations/:id/resume` — not awaited, fire-and-forget with `.catch()` for error state. SESSION_READY arrives via SSE
- **Client-side timeout:** must also fire during `'reconnecting'` state (add `|| prev === 'reconnecting'` to existing condition at ConversationPane.tsx:384-392)
- **`handleRetry` fix:** remove `conversationIdRef.current = initialConversationId ?? null` line — reuse existing conversation ID if a previous attempt created one
- **BroadcastChannel cross-tab:** `useConversationPresence(conversationId)` broadcasts opened/closed, listens for focus-conversation → `window.focus()`. `useOpenConversations()` tracks open conversation IDs (most-recent-first, dedup). Channel name: `'bmad-easy-conversations'`. SSR guard: `if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;`
- **`InProgressArtifactCard`:** wraps `ArtifactCard` with `onClick` — if `openConversations.length > 0`, `preventDefault()` + broadcast `focus-conversation` with `openConversations[0]`; else let default `<Link>` navigation proceed
- **`ArtifactCard` `onClick` prop:** optional `onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void`, backward-compatible (default `undefined` is no-op)
- **`ProjectMapArtifacts`:** new Client Component — calls `useOpenConversations()`, renders `InProgressArtifactCard` for in-progress + `ArtifactCard` for completed. Empty state stays in Server Component
- **`SessionStartSpinner` `label` prop:** default `'Starting session…'`, pass `'Reconnecting…'` for reconnecting state
- **`POST /conversations/:id/resume` endpoint:** `@Post(':id/resume')`, empty body DTO (`ResumeConversationDto`), returns `{ conversationId, sandboxStatus }` directly (no `{ data: ... }` wrapper)
- **`ReplaySubject<SseEvent>(100)`:** ensures late SSE subscribers receive missed SESSION_READY events — the resume flow relies on this
- **Tenant isolation:** `resumeConversation` verifies ownership via `findFirst({ where: { id: conversationId, userId }, select: { id: true } })` — the `userId` filter IS the tenant authorization check

---

## Step 2 Output: Generation Mode

**Mode:** AI Generation

**Rationale:**
- Acceptance criteria are clear and well-specified (3 ACs with Given/When/Then)
- Scenarios are standard: service logic (resume fast/slow path), component state rendering (reconnecting state), cross-tab communication (BroadcastChannel), timer-based behavior (timeout)
- Stack is fullstack with well-established Jest patterns (`MockEventSource`, `buildTestModule`, `MockBroadcastChannel`)
- No complex UI interactions requiring live browser recording (no drag/drop, wizards, or multi-step visual state)
- Backend logic (`resumeConversation`) is unit-testable with mocks
- Cross-tab logic (BroadcastChannel) is unit-testable with a `MockBroadcastChannel` test implementation

---

## Step 3 Output: Test Strategy

### AC-1: Full chat history restored immediately from Postgres (FR13, NFR-R2)

*Already satisfied by Story 3.2's `[conversationId]/page.tsx`. Validation test ensures the resume flow (AC-2) doesn't break history display.*

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 1.1 | Initial messages are rendered during 'reconnecting' state (history visible before SSE ready) | Component integration | P0 | `ConversationPane.test.tsx` |

### AC-2: "Reconnecting…" state with git identity re-injection on sandbox re-init

**Backend — `ConversationsService.resumeConversation`:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 2.1 | Returns 'ready' status and does NOT call provision when sandbox is already alive (fast path) | Unit | P0 | `conversations.service.spec.ts` |
| 2.2 | Re-injects git config on fast-path resume (AC-2 git identity re-injection) | Unit | P0 | `conversations.service.spec.ts` |
| 2.3 | Emits WORKING_TREE_* and SESSION_READY on fast-path resume | Unit | P0 | `conversations.service.spec.ts` |
| 2.4 | Returns 'provisioning' and calls provisionSandbox when sandbox is not alive (slow path) | Unit | P0 | `conversations.service.spec.ts` |
| 2.5 | Returns 'failed' for conversation not owned by user (tenant isolation) | Unit | P0 | `conversations.service.spec.ts` |
| 2.6 | Does not start duplicate idle timer when one is already running | Unit | P1 | `conversations.service.spec.ts` |
| 2.7 | resolveGitIdentity resolves git identity with noreply email fallback | Unit | P1 | `conversations.service.spec.ts` |

**Frontend — `ConversationPane` reconnecting state:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 2.8 | Sets state to 'reconnecting' (not 'provisioning') when initialConversationId is provided | Component | P0 | `ConversationPane.test.tsx` |
| 2.9 | Calls POST /conversations/:id/resume when initialConversationId is provided | Component | P0 | `ConversationPane.test.tsx` |
| 2.10 | Does NOT call POST /conversations (create) when initialConversationId is provided | Component | P0 | `ConversationPane.test.tsx` |
| 2.11 | Shows "Reconnecting…" label when state is 'reconnecting' | Component | P0 | `ConversationPane.test.tsx` |
| 2.12 | Input is disabled when state is 'reconnecting' | Component | P0 | `ConversationPane.test.tsx` |
| 2.13 | Transitions to 'ready' on SESSION_READY from 'reconnecting' state | Component | P0 | `ConversationPane.test.tsx` |
| 2.14 | Transitions to 'timeout' when SESSION_READY doesn't arrive within CLIENT_TIMEOUT_MS during 'reconnecting' state | Component | P0 | `ConversationPane.test.tsx` |
| 2.15 | handleRetry reuses existing conversationIdRef instead of resetting to null | Component | P0 | `ConversationPane.test.tsx` |
| 2.16 | Shows "Starting session…" (not "Reconnecting…") for new conversations | Component | P1 | `ConversationPane.test.tsx` |

### AC-3: Focus existing Conversation tab from Project Map (FR8)

**`useConversationPresence` / `useOpenConversations` hooks:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.1 | Broadcasts conversation-opened on mount | Unit | P0 | `use-conversation-presence.test.ts` |
| 3.2 | Broadcasts conversation-closed on unmount | Unit | P0 | `use-conversation-presence.test.ts` |
| 3.3 | Calls window.focus() on focus-conversation message | Unit | P0 | `use-conversation-presence.test.ts` |
| 3.4 | useOpenConversations returns open conversation IDs | Unit | P0 | `use-conversation-presence.test.ts` |
| 3.5 | Deduplicates conversation-opened messages | Unit | P1 | `use-conversation-presence.test.ts` |
| 3.6 | Is a no-op when conversationId is null | Unit | P1 | `use-conversation-presence.test.ts` |
| 3.7 | Is a no-op when BroadcastChannel is unavailable | Unit | P1 | `use-conversation-presence.test.ts` |

**`InProgressArtifactCard` component:**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.8 | Calls preventDefault and broadcasts focus-conversation when openConversations is non-empty | Component | P0 | `InProgressArtifactCard.test.tsx` |
| 3.9 | Does NOT preventDefault when openConversations is empty (lets navigation proceed) | Component | P0 | `InProgressArtifactCard.test.tsx` |
| 3.10 | Renders ArtifactCard with correct props | Component | P0 | `InProgressArtifactCard.test.tsx` |
| 3.11 | Focuses the most recent conversation (openConversations[0]) | Component | P1 | `InProgressArtifactCard.test.tsx` |

**`ArtifactCard` onClick prop (backward compatibility):**

| # | Scenario | Level | Priority | File |
|---|----------|-------|----------|------|
| 3.12 | Accepts optional onClick prop and attaches it to the Link (backward compatible) | Component | P0 | `ArtifactCard.test.tsx` |

### Red Phase Confirmation

All new test cases will fail until implementation:
- `resumeConversation` method does not exist on `ConversationsService` → `conversations.service.spec.ts` resume tests fail
- `ConversationPane` has no `'reconnecting'` state, no resume endpoint call, `handleRetry` resets ref → `ConversationPane.test.tsx` new tests fail
- `useConversationPresence` / `useOpenConversations` hooks don't exist → `use-conversation-presence.test.ts` import fails
- `InProgressArtifactCard` component doesn't exist → `InProgressArtifactCard.test.tsx` import fails
- `ArtifactCard` has no `onClick` prop → `ArtifactCard.test.tsx` onClick test fails

### Test File Plan

| File | Action | Tests | Priority Breakdown |
|------|--------|-------|-------------------|
| `apps/agent-be/src/conversations/conversations.service.spec.ts` | Extend | 7 (new describe) | P0: 5, P1: 2 |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Extend | 10 (new describe) | P0: 9, P1: 1 |
| `apps/web/src/hooks/use-conversation-presence.test.ts` | Create | 7 | P0: 4, P1: 3 |
| `apps/web/src/components/project-map/InProgressArtifactCard.test.tsx` | Create | 4 | P0: 3, P1: 1 |
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Extend | 1 (new test) | P0: 1 |
| **Total** | | **29 test cases** | **P0: 22, P1: 7** |

---

## Step 4 Output: Test Generation (RED PHASE)

**Execution Mode:** SEQUENTIAL (Jest unit/component tests only — no Playwright/E2E in scope)

**TDD Red Phase:** All new test cases use `it.skip()` — tests are skipped until implementation lands. Remove `it.skip()` → `it()` when activating for the current task.

### Stub Files Created (for TDD red phase compilation)

| File | Type | Stub Behavior |
|------|------|---------------|
| `apps/web/src/hooks/use-conversation-presence.ts` | React Hook | Throws "not implemented" on call |
| `apps/web/src/components/project-map/InProgressArtifactCard.tsx` | Client Component | Throws "not implemented" on render |

### Minimal Type Extensions (for compilation)

| File | Changes |
|------|---------|
| `apps/agent-be/src/conversations/conversations.service.ts` | Added `resumeConversation()` stub method (throws "not implemented") |
| `apps/web/src/components/conversation/ConversationPane.tsx` | Added `'reconnecting'` to `SessionState` type |
| `apps/web/src/components/conversation/SessionStartSpinner.tsx` | Added `label` prop (default: `'Starting session…'`) |
| `apps/web/src/components/project-map/ArtifactCard.tsx` | Added optional `onClick` prop, passed to `<Link>` |

### Test Files Generated

| File | Action | New Tests | Priority Breakdown |
|------|--------|-----------|-------------------|
| `apps/agent-be/src/conversations/conversations.service.spec.ts` | Extended | 7 (new describe) | P0: 5, P1: 2 |
| `apps/web/src/components/conversation/ConversationPane.test.tsx` | Extended | 10 (new describe) | P0: 9, P1: 1 |
| `apps/web/src/hooks/use-conversation-presence.test.ts` | Created | 7 | P0: 4, P1: 3 |
| `apps/web/src/components/project-map/InProgressArtifactCard.test.tsx` | Created | 4 | P0: 3, P1: 1 |
| `apps/web/src/components/project-map/ArtifactCard.test.tsx` | Extended | 1 (new describe) | P0: 1 |
| **Total** | | **29 new test cases** | **P0: 22, P1: 7** |

### TDD Red Phase Compliance

- All new test cases use `it.skip()` (Jest equivalent of `test.skip()`)
- All tests assert EXPECTED behavior (not placeholder assertions)
- All tests are marked as expected_to_fail (stubs throw "not implemented")
- No active passing tests generated (correct TDD red phase)

### Next Steps (Task-by-Task Activation)

During implementation of each task:

1. Remove `it.skip()` from the current test file or describe block
2. Run tests: `yarn nx test agent-be` / `yarn nx test web`
3. Verify the activated test fails first, then passes after implementation (green phase)
4. If any activated tests still fail unexpectedly:
   - Either fix implementation (feature bug)
   - Or fix test (test bug)
5. Commit passing tests

### Implementation Guidance

**Backend (agent-be) to implement:**
- `ConversationsService.resumeConversation()` — fast path (sandbox alive: re-inject git config → git status → emit WORKING_TREE_* → emit SESSION_READY), slow path (fire-and-forget provisionSandbox), not-found (return 'failed')
- `ConversationsService.resolveGitIdentity()` — private helper, extract from provisionSandbox
- `ConversationsController` — `POST :id/resume` endpoint
- `ResumeConversationDto` — empty body DTO

**Frontend (web) to implement:**
- `ConversationPane` — 'reconnecting' state on resume, call POST /conversations/:id/resume, fix handleRetry, wire useConversationPresence, update timeout handler for 'reconnecting'
- `SessionStartSpinner` — pass `label="Reconnecting…"` for reconnecting state
- `useConversationPresence` / `useOpenConversations` — BroadcastChannel cross-tab hooks
- `InProgressArtifactCard` — cross-tab focus wrapper (preventDefault + broadcast when conversations open)
- `ArtifactCard` — onClick prop (already added as stub)
- `ProjectMapArtifacts` — Client Component for artifact list with cross-tab logic

---

## Step 5 Output: Validate & Complete

### Validation Results

| Check | Status |
|-------|--------|
| Story approved with clear acceptance criteria | PASS — 3 ACs, all testable |
| Test framework configured (Jest) | PASS — jest.config.ts in apps/web + apps/agent-be |
| Test files created correctly | PASS — 2 new, 3 extended |
| Checklist matches acceptance criteria | PASS — all 3 ACs mapped to test scenarios |
| Tests are red-phase scaffolds with `it.skip()` | PASS — 29 new test cases, all `it.skip()` |
| Story metadata and handoff paths captured | PASS — frontmatter complete |
| Temp artifacts in `_bmad-output/test-artifacts/` | PASS |
| TypeScript typecheck passes | PASS — `tsc --noEmit` clean for both apps |
| ESLint passes (0 errors) | PASS — 0 errors in agent-be; 1 pre-existing error in web (CredentialErrorBanner.test.tsx, not Story 3.5) |
| Existing tests still pass | PASS — agent-be: 80 passed, 7 skipped; web: 571 passed, 22 skipped |
| New skipped tests verified | PASS — 7 agent-be + 22 web = 29 new tests properly skipped |

### Completion Summary

**Story:** 3.5 — Resume an Existing Conversation
**Story ID:** 3.5
**Story key:** 3-5-resume-an-existing-conversation
**TDD Phase:** RED (test scaffolds generated, all `it.skip()`)

**Test files created:**
- `apps/web/src/hooks/use-conversation-presence.test.ts` (7 tests)
- `apps/web/src/components/project-map/InProgressArtifactCard.test.tsx` (4 tests)

**Test files extended:**
- `apps/agent-be/src/conversations/conversations.service.spec.ts` (+7 resume tests)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` (+10 reconnecting tests)
- `apps/web/src/components/project-map/ArtifactCard.test.tsx` (+1 onClick test)

**Stub files created (for compilation):**
- `apps/web/src/hooks/use-conversation-presence.ts`
- `apps/web/src/components/project-map/InProgressArtifactCard.tsx`

**Minimal type extensions (for compilation):**
- `apps/agent-be/src/conversations/conversations.service.ts` — `resumeConversation()` stub
- `apps/web/src/components/conversation/ConversationPane.tsx` — `'reconnecting'` in SessionState
- `apps/web/src/components/conversation/SessionStartSpinner.tsx` — `label` prop
- `apps/web/src/components/project-map/ArtifactCard.tsx` — `onClick` prop

**Total: 29 new test cases (P0: 22, P1: 7)**

**Checklist output:** `_bmad-output/test-artifacts/atdd-checklist-3-5-resume-an-existing-conversation.md`

**Key risks/assumptions:**
- The `resumeConversation` fast-path tests require the sandbox to be in-memory after `provisionSandbox`. The test setup calls `provisionSandbox` first, which populates `sandboxStatuses` and `sandboxIds` Maps. The implementation must check these Maps in `resumeConversation`.
- The `handleRetry` test verifies that retry reuses the existing conversation ID rather than creating a new one. The implementation must NOT reset `conversationIdRef.current` in `handleRetry`.
- The `useConversationPresence` tests use a `MockBroadcastChannel` that simulates cross-tab communication. The implementation must use the `CONVERSATION_CHANNEL` constant for the channel name.
- The `InProgressArtifactCard` tests use `jest.spyOn(event, 'preventDefault')` on a manually created `MouseEvent` — the implementation must call `event.preventDefault()` in the onClick handler when `openConversations.length > 0`.
- The `ArtifactCard` `onClick` prop is already added as a stub (backward-compatible). The implementation just needs to pass it through to `<Link>`.

**Next recommended workflow:** `bmad-dev-story` — implement Story 3.5 tasks, removing `it.skip()` → `it()` per task and verifying green phase.

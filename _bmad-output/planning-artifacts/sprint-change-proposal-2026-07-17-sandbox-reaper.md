# Sprint Change Proposal: Reconcile Orphaned Daytona Sandboxes via Environment-Scoped Labels

**Date:** 2026-07-17
**Trigger:** Daytona account disk quota (30GiB) is being exhausted by orphaned sandboxes that leak across local dev, dev deployment, tests, and production — which share a single Daytona account with no reconciliation mechanism
**Scope Classification:** Moderate — adds a new Epic 8 with one story spanning env config, a label injection, a mock factory extension, a new reaper service, a scheduled interval, a script update, and per-environment env-var wiring
**Status:** Proposed — pending approval
**Mode:** Batch — assumptions documented in §Assumptions

---

## Section 1: Issue Summary

### Problem Statement

The bmad-easy platform provisions a Daytona sandbox per conversation via `SandboxService.provision()`. Sandboxes from four distinct environments — local development, the dev deployment, the test suite, and production — all share the same Daytona account and accumulate against its 30GiB disk quota. There is no mechanism that reconciles the set of live Daytona sandboxes against the set of sandboxes the application believes it owns. When a sandbox is allocated but never destroyed, it leaks: it continues consuming disk quota indefinitely, invisible to the application, until the account hits its limit and new provisions fail.

The leak has four distinct causes, each a code path where `destroy()` is never reached or silently fails:

1. **Server crashes / SIGKILL — no `onModuleDestroy` hook on `ConversationsService`.** `ConversationsService` (`apps/agent-be/src/conversations/conversations.service.ts:26-27`) is declared `@Injectable() export class ConversationsService` with no `implements OnModuleDestroy`. It holds the in-memory `sandboxIds` Map (line 30) that maps conversation IDs to sandbox IDs, and it is the only service that knows which sandboxes are active. When `apps/agent-be` receives `SIGTERM` (deploy) or is hard-killed (`SIGKILL`, OOM, crash), the idle-timeout timers — which use `.unref()` (`idle-timeout.service.ts:41`) precisely so they do not keep the process alive — never fire. The sandboxes they would have torn down are orphaned in Daytona with no record to drive their destruction. `IdleTimeoutService.onModuleDestroy` (line 63) calls `clearAll()`, which clears the timers but does not destroy the sandboxes they reference.

2. **Provisioning failures between `create()` and `installBinaries()`.** `SandboxService.provision()` (`sandbox.service.ts:108-130`) calls `daytona.create()` (line 108) then `installBinaries()` (line 122). The catch block (line 123-129) does attempt cleanup if `sandbox` is assigned — but if the process crashes (not a thrown exception) in the window between `create()` resolving and `installBinaries()` completing, the sandbox is allocated in Daytona with no application record pointing to it. The `conversationId` label is set, but nothing lists sandboxes by that label to find it again.

3. **`destroy()` is best-effort on timeout paths.** Both idle-timeout callbacks in `ConversationsService` (the pre-first-message timeout at line 146-161 and the mid-session timeout at line 349-381) call `this.sandboxService.destroy(sandboxId!)` inside a `try/catch` that logs the error and continues (`catch (err) { this.logger.error(...) }`). If the Daytona API is unavailable, returning a transient error, the destroy silently fails with no retry. The in-memory state is cleared regardless (line 152-153, 370-371), so the application forgets the sandbox exists while it remains alive in Daytona.

4. **No background reaper exists.** There is no service that periodically lists Daytona sandboxes and reconciles them against the database. The only reconciliation tool is `scripts/cleanup-daytona-sandboxes.ts`, which lists **all** sandboxes in the account (line 28: `for await (const sandbox of daytona.list())` — no filter) and deletes every one. This is a blunt pre-test clean-slate tool, not an environment-scoped reaper: running it from one environment destroys every other environment's sandboxes too.

### Evidence

| # | Cause | File / code | Evidence |
|---|-------|-------------|----------|
| 1 | No `onModuleDestroy` on `ConversationsService` | `conversations.service.ts:26-27` | `@Injectable() export class ConversationsService` — no `implements OnModuleDestroy`. Holds `sandboxIds` Map (line 30), the only record of active sandbox IDs. |
| 1 | Timers `.unref()`'d, cleared but not drained | `idle-timeout.service.ts:41,63` | `timer.unref?.()` (line 41) — timers do not keep the process alive; `onModuleDestroy()` → `clearAll()` (line 63) clears timers without destroying their target sandboxes. |
| 2 | Provisioning window between `create()` and `installBinaries()` | `sandbox.service.ts:108,122` | `daytona.create({ labels: { conversationId } })` (line 108-109) → `installBinaries(sandbox)` (line 122). A crash in this window orphans an allocated sandbox. |
| 3 | Best-effort destroy on timeout paths | `conversations.service.ts:154-157,372-377` | `try { await this.sandboxService.destroy(sandboxId!) } catch (err) { this.logger.error(...) }` — transient Daytona failures are logged and swallowed; in-memory state is cleared unconditionally. |
| 4 | No reaper; cleanup script is unscoped | `scripts/cleanup-daytona-sandboxes.ts:28` | `for await (const sandbox of daytona.list())` — no label filter; deletes every sandbox in the account. |
| — | Only `conversationId` label is set at creation | `sandbox.service.ts:109` | `labels: { conversationId: params.conversationId }` — no environment/scope label to filter by. |
| — | Env validation has no env-scope var | `env.validation.ts:3-9` | Zod schema lists `DATABASE_URL, DAYTONA_API_URL, DAYTONA_API_KEY, AUTH_SECRET, ANTHROPIC_API_KEY` — no `SANDBOX_ENV_LABEL`. |
| — | Mock factory has no `list` method | `mock-daytona.ts:98-103` | `MockDaytona` interface: `create, get, delete, start` — no `list`, so the reaper cannot be tested against the typed mock seam. |

### Consequences

- **Quota exhaustion → provisioning failure.** Once the 30GiB disk quota is exhausted, `daytona.create()` fails for every environment sharing the account. A leak in the test suite can block production; a leak in local dev can block the dev deployment. This is the failure mode the existing `cleanup-daytona-sandboxes.ts` script was written to paper over — but it papers over it by destroying everything, which is itself destructive to other environments.
- **Silent billing accrual.** Orphaned sandboxes consume resources indefinitely. There is no alert when a sandbox leaks; the leak is discovered only when provisioning starts failing.
- **Cross-environment interference.** Because all environments share one account and no label distinguishes them, no environment can safely reap only its own orphans. The cleanup script's "delete all" behavior is the only currently available option, and it is unsafe to run from any environment that is not the sole active one.
- **The leak is structural, not a one-off bug.** Each of the four causes is a missing reconciliation path, not a transient error. Adding retry to `destroy()` or an `onModuleDestroy` hook addresses one cause each; only a background reaper that reconciles Daytona state against the database addresses all four — including the crashes that bypass every in-process cleanup path entirely.

---

## Section 2: Impact Analysis

### Epic Impact

This proposal adds a **new Epic 8 (Sandbox Reconciliation via Environment-Scoped Labels)**. No existing epic is reopened, re-scoped, or contradicted.

| Epic | Status | Impact |
|-------|--------|--------|
| Epic 1 | done (incl. retrospective) | Not touched. |
| Epic 2 | done (incl. retrospective) | Not touched. |
| Epic 3 | done (incl. retrospective) | Not touched. Story 3.1's provision-failure-cleanup AC and Story 3.12's graceful-drain AC are *reinforced* by the reaper (defense-in-depth), not contradicted — the reaper is a background safety net for the cases those stories' in-process cleanup cannot reach (crashes, transient destroy failures). |
| Epic 4 | done (incl. retrospective) | Not touched. The reaper runs inside `apps/agent-be`; no new infrastructure. |
| Epic 5 | done (incl. retrospective) | Not touched. Frontend-only epic. |
| Epic 6 | done (incl. retrospective) | Not touched. Epic 6 migrated agent execution into the sandbox; the reaper operates on the sandbox lifecycle, not the agent execution path. |
| Epic 7 | backlog (14 stories) | Not touched. Frontend UX epic; no dependency. Can run in parallel. |
| **Epic 8 (new)** | **backlog (new)** | **Created by this proposal.** One story (8.1). |

### Story Impact

No existing stories are modified or removed. One new story is added:

| New Story | Title | Epic | Priority |
|-----------|-------|------|----------|
| 8.1 | Reconcile Orphaned Sandboxes via Environment-Scoped Labels | Epic 8 | P1 |

### Artifact Conflicts

- **`epics.md`:** Epic 8 section appended after Epic 7, with Story 8.1 in BDD format. No existing epic or story text is changed.
- **`sprint-status.yaml`:** New `epic-8` block and `8-1-...` entry appended after the Epic 7 block; `last_updated` timestamp refreshed.
- **`architecture.md`:** No structural change. The reaper is a new service within the existing `apps/agent-be` Sandbox module boundary; `apps/agent-be` remains the sole initiating party toward Daytona (the reaper calls `daytona.list()` / `daytona.delete()`, same boundary as `SandboxService`). A review note documenting the reaper's reconciliation contract and the `scope` label convention is added.
- **PRD:** No change. Sandbox lifecycle and quota are operational concerns, not product requirements. No new FR or NFR.
- **UX Design:** No change. No user-facing surface.
- **`.env.example` / environment wiring:** `SANDBOX_ENV_LABEL` is added as a required env var in `apps/agent-be`'s validation; each environment sets a distinct value. `SANDBOX_REAPER_INTERVAL_MS` is added as an optional env var with a default.

### Technical Impact

- **Code:** New `SandboxReaperService` in `apps/agent-be/src/sandbox/`, registered in `SandboxModule`. `env.validation.ts` and `configuration.ts` gain `SANDBOX_ENV_LABEL` (required) and `SANDBOX_REAPER_INTERVAL_MS` (optional, default 900000). `SandboxService.provision()` injects a `scope` label alongside `conversationId`. `mock-daytona.ts` gains a `list` mock. `scripts/cleanup-daytona-sandboxes.ts` gains a `--scope` flag. No schema migration — the reaper reads existing `conversation.sandboxStatus` / `conversation.sandboxId` columns.
- **Infrastructure:** None. The reaper uses `setInterval` in `onModuleInit`; no new dependency (no `@nestjs/schedule`).
- **Deployment:** `SANDBOX_ENV_LABEL` must be set in each environment's Railway/env config: `local`, `dev`, `prod`, `test`. This is the one operational prerequisite.
- **Testing:** Unit tests for the reaper against the extended `mock-daytona.ts` (list returns scoped sandboxes; reconciliation destroys orphans, skips active). Integration test that the reaper destroys a sandbox whose conversation is gone or in a terminal status and leaves active ones alone.

---

## Section 3: Recommended Approach

### Selected: Direct Adjustment — new Epic 8, Story 8.1

Add a new Epic 8 with a single story that delivers an environment-scoped label at sandbox creation plus a periodic background reaper that reconciles Daytona sandboxes against the database, scoped to its own environment by that label. No rollback (nothing is broken — this is a missing reconciliation mechanism). No MVP scope change (sandbox lifecycle is operational, not a product goal).

### Rationale

1. **A label is the smallest change that enables safe, scoped reaping.** Without an environment-scope label, the reaper would face the same problem as the cleanup script: it cannot tell its own sandboxes from another environment's. Injecting a `scope` label at `daytona.create()` time and filtering `daytona.list({ labels: { scope } })` server-side lets each environment reap only its own orphans. The Daytona SDK supports this directly — `list(query?: ListSandboxesQuery)` where `ListSandboxesQuery` has `labels?: Record<string, string>` (`@daytonaio/sdk` `Daytona.d.ts:300,125`).

2. **A background reaper is the only mechanism that covers all four leak causes.** Causes 1 (crash, no `onModuleDestroy`), 2 (provisioning-window crash), and 3 (transient destroy failure) all bypass in-process cleanup. A reaper that periodically lists sandboxes and reconciles against the database catches orphans regardless of how they were orphaned — including crashes that never run any cleanup code. Adding `onModuleDestroy` to `ConversationsService` or retry to `destroy()` would address one cause each; the reaper addresses all of them as a defense-in-depth safety net. It does not replace those in-process paths (which remain the first line of defense); it catches what they miss.

3. **`setInterval` over `@nestjs/schedule`.** The project does not currently depend on `@nestjs/schedule`. Adding a dependency for a single periodic task is over-engineering. `setInterval` in `onModuleInit`, with `.unref()` so it does not block shutdown and `clearInterval` in `onModuleDestroy`, is the simplest correct option and matches the existing `IdleTimeoutService` pattern (which also uses `setTimeout` + `.unref()`).

4. **Reconcile against DB `sandboxStatus`, not in-memory Maps.** `ConversationsService` holds `sandboxStatuses` and `sandboxIds` in in-memory `Map`s that are lost on restart (the exact gap Story 3.12's prerequisite flagged). The reaper must not depend on in-memory state that a crash clears — it reads `conversation.sandboxStatus` and `conversation.sandboxId` from Postgres, which survive restarts. A sandbox is destroyed only if its conversation is gone or its status is terminal (`'idle-timeout'` / `'failed'`); sandboxes whose conversations are `'ready'` or `'provisioning'` are skipped (active).

5. **New epic, not folded into Epic 3 or 6.** Epic 3 (Conversations) and Epic 6 (Sandbox-Based Execution) are both `done` with retrospectives. Reopening either to add an operational reliability story would conflate a closed feature epic with ongoing operational hardening and invalidate the retrospective boundary. Epic 8 is a small, self-contained operational epic — the same pattern the project used for Epic 4 (deployment) and Epic 7 (live-usage UX).

### Alternatives Considered and Rejected

- **Add `onModuleDestroy` to `ConversationsService` to destroy sandboxes on shutdown.** Rejected as the sole fix — it addresses cause 1 (graceful `SIGTERM`) but not `SIGKILL`/OOM/crashes (cause 1's hard-kill case), provisioning-window crashes (cause 2), or transient destroy failures (cause 3). It is a worthwhile first-line defense and may be added within Story 8.1's scope, but it is not sufficient alone. The reaper remains necessary as the reconciliation backstop.
- **Add retry to `destroy()` on timeout paths.** Rejected as the sole fix — addresses cause 3 only. Does not help when the process crashed before reaching the destroy call (causes 1, 2).
- **Fold into Epic 7.** Rejected — Epic 7 is a frontend UX epic; mixing backend operational reliability into it dilutes both and couples an independent timeline.
- **Use `@nestjs/schedule` (`@Cron` / `@Interval`).** Rejected — adds a dependency for one periodic task; `setInterval` matches the existing `IdleTimeoutService` pattern and keeps the change dependency-free.
- **Reap by `conversationId` label without a `scope` label.** Rejected — `daytona.list()` without a scope filter returns every environment's sandboxes. Reaping by `conversationId` requires already knowing which conversations to look up, which is the database reconciliation the reaper performs; without `scope`, the reaper cannot safely destroy a sandbox whose conversation it cannot find, because that sandbox might belong to another environment that simply has no matching row in *this* environment's database. The `scope` label is what makes cross-environment safety possible.

### Effort, Risk, and Timeline

| Dimension | Assessment |
|------------|------------|
| **Effort** | Medium. One story, seven coordinated changes (env validation, config, label injection, mock factory, reaper service, scheduling, script flag, env wiring). No schema migration; no new dependency. |
| **Risk** | Low–medium. The reaper destroys sandboxes — a destructive operation. The risk is a false-positive: destroying a sandbox that is actually active. Mitigated by (a) scoping to the environment's own `scope` label and (b) the DB status gate (only destroy if conversation is gone or status is `'idle-timeout'`/`'failed'`; skip `'ready'`/`'provisioning'`). The 15-minute default interval bounds how stale the DB status can be before a reaper pass. |
| **Timeline** | Single sprint. One story; no upstream/downstream story dependencies. |
| **MVP impact** | None. Operational reliability, not a product scope change. |

---

## Section 4: Detailed Change Proposals

### 4.1 Story Mapping Summary

| Step | Change | Artifact |
|------|--------|----------|
| 1 | Add `SANDBOX_ENV_LABEL` (required) + `SANDBOX_REAPER_INTERVAL_MS` (optional) to env validation and configuration | `env.validation.ts`, `configuration.ts` |
| 2 | Inject `scope` label into `daytona.create()` alongside `conversationId` | `sandbox.service.ts` |
| 3 | Add `list` method to `mock-daytona.ts` typed mock factory | `mock-daytona.ts` |
| 4 | Add `SandboxReaperService` — lists by `scope`, reconciles against DB, destroys orphans | new `sandbox-reaper.service.ts` |
| 5 | Schedule the reaper with `setInterval` in `onModuleInit` (15 min default) | `sandbox-reaper.service.ts`, `sandbox.module.ts` |
| 6 | Update `scripts/cleanup-daytona-sandboxes.ts` to support `--scope` flag | `cleanup-daytona-sandboxes.ts` |
| 7 | Set `SANDBOX_ENV_LABEL` per environment (local/dev/prod/test) | environment config (operational) |

### 4.2 New Epic 8 definition

Append to `_bmad-output/planning-artifacts/epics.md` after the Epic 7 section, and add the Epic 8 entry to the Epic List.

**Epic List entry (appended after the Epic 7 bullet):**

> ### Epic 8: Sandbox Reconciliation via Environment-Scoped Labels
> Daytona sandboxes from local dev, the dev deployment, tests, and production share one account and a 30GiB disk quota, with no reconciliation mechanism — sandboxes leak on crashes, provisioning-window failures, and transient destroy failures, exhausting the quota. This epic adds an environment-scope label to every sandbox at creation time and a periodic background reaper that lists sandboxes by that label, reconciles them against the database, and destroys orphans. Defense-in-depth for the in-process cleanup paths in Epic 3 (Stories 3.1, 3.9, 3.12) that cannot run when the process crashes.
> **Change proposal:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-17-sandbox-reaper.md`

### 4.3 Story 8.1 — appended to Epic 8 in `epics.md`

The story is authored in the project's full BDD (Given/When/Then) format with acceptance criteria and scope notes, matching the Epic 7 story style. Each acceptance criterion maps to one of the seven steps. See the Epic 8 section appended to `epics.md`.

### 4.4 sprint-status.yaml — append Epic 8 block

Append after the Epic 7 block in `_bmad-output/implementation-artifacts/sprint-status.yaml`:

```yaml
  # ── Epic 8: Sandbox Reconciliation via Environment-Scoped Labels ──
  # Background reaper that reconciles Daytona sandboxes against the DB,
  # scoped to its own environment by a `scope` label. Defense-in-depth for
  # the in-process cleanup paths in Epic 3 that cannot run on crash.
  # See: sprint-change-proposal-2026-07-17-sandbox-reaper.md
  epic-8: backlog
  8-1-reconcile-orphaned-sandboxes-via-environment-scoped-labels: backlog
```

Update the top-of-file `last_updated` timestamp to the current UTC datetime on the day this is applied.

### 4.5 Architecture review note

`architecture.md` gains a short review note (authored at implementation prep time) documenting:

1. **Reaper reconciliation contract.** `SandboxReaperService` lists sandboxes via `daytona.list({ labels: { scope } })`, reconciles each against `Conversation.sandboxStatus` / `Conversation.sandboxId` in Postgres, and destroys only those whose conversation is gone or in a terminal status (`'idle-timeout'` / `'failed'`). It is a background safety net for the in-process cleanup paths in Stories 3.1, 3.9, and 3.12 — it does not replace them.
2. **`scope` label convention.** Every sandbox is labeled `scope: <env>` at `daytona.create()` time. Values: `local`, `dev`, `prod`, `test`. The reaper and the `--scope` cleanup-script flag filter on this label so no environment reaps another's sandboxes.
3. **Boundary preserved.** The reaper runs inside `apps/agent-be` and calls `daytona.list()` / `daytona.delete()` — the same Daytona SDK boundary `SandboxService` already owns. `apps/agent-be` remains the sole initiating party toward Daytona; no new boundary is introduced.

No structural architecture change; no diagram update.

---

## Section 5: Implementation Handoff

### Scope Classification: Moderate

Moderate, not Minor, because it spans **seven coordinated changes** across env validation, configuration, the sandbox creation path, the typed mock factory, a new reaper service with scheduling, the cleanup script, and per-environment env-var wiring — plus a new epic and sprint-status entries. It is a single story, but it touches multiple files and has an operational prerequisite (setting `SANDBOX_ENV_LABEL` in four environments). It does not rise to Major: no architectural replan, no PM/Architect strategic intervention, no MVP goal/scope change, no schema migration, no new external dependency. The destructive-operation risk (the reaper destroys sandboxes) is bounded by the `scope` label and the DB terminal-status gate, both specified in the story ACs.

### Handoff Recipients

| Role | Responsibility | Deliverable |
|------|---------------|-------------|
| **Architect (Winston)** | Approve the architecture review note (§4.5); confirm the reaper's reconciliation contract and the `scope` label convention. | Updated architecture.md review note. |
| **Developer (Amelia)** | Append Epic 8 + Story 8.1 to `epics.md`; add the sprint-status.yaml entries (§4.4); implement Story 8.1 via `bmad-dev-story`, working through the seven acceptance criteria in order (env validation first — it gates boot). | New epic/story, sprint-status entries, working reaper + tests. |
| **QA** | Unit tests against extended `mock-daytona.ts` (list returns scoped sandboxes; reaper destroys orphans, skips active, logs destroy failures without aborting); integration test that a sandbox whose conversation is gone or terminal is destroyed and a `ready`/`provisioning` one is left alone; test that `SANDBOX_ENV_LABEL` unset/empty fails startup. | Added tests. |
| **Operator (Marius)** | Set `SANDBOX_ENV_LABEL` in each environment (`local`/`dev`/`prod`/`test`) and optionally `SANDBOX_REAPER_INTERVAL_MS`; run the one-time unlabeled-sandbox cutover cleanup. | Environment config applied. |

### Recommended Implementation Order

1. **Step 1 — env validation + configuration first.** `SANDBOX_ENV_LABEL` is required at boot; nothing else can be tested until startup succeeds with it set. Add `SANDBOX_REAPER_INTERVAL_MS` in the same pass.
2. **Step 2 — label injection.** Inject `scope` into `daytona.create()`. Once this lands, all new sandboxes are attributable.
3. **Step 3 — mock factory `list` method.** The reaper cannot be unit-tested without this seam.
4. **Steps 4–5 — reaper service + scheduling.** The core of the story; build and unit-test against the extended mock.
5. **Step 6 — cleanup script `--scope` flag.** Independent of the reaper; can be done in parallel with steps 4–5.
6. **Step 7 — environment wiring.** Operational; set the env vars in each environment once the code is deployed.

### Success Criteria

1. `apps/agent-be` fails to start when `SANDBOX_ENV_LABEL` is unset or empty (Zod validation), and starts with `SANDBOX_REAPER_INTERVAL_MS` defaulting to 900000 when unset. (Step 1)
2. Every sandbox created by `SandboxService.provision()` carries both `conversationId` and `scope` labels in Daytona. (Step 2)
3. `mock-daytona.ts` exposes a typed `list` mock that supports label-filtered iteration, and the reaper's unit tests use it to assert scoped reconciliation. (Step 3)
4. `SandboxReaperService.reap()` lists sandboxes scoped to its environment, destroys those whose conversation is gone or in `'idle-timeout'`/`'failed'` status, and skips `'ready'`/`'provisioning'` ones. (Step 4)
5. The reaper runs on a `setInterval` (default 15 min, `.unref()`'d, cleared in `onModuleDestroy`) with no `@nestjs/schedule` dependency, and the first reap is deferred one interval. (Step 5)
6. `scripts/cleanup-daytona-sandboxes.ts` accepts `--scope <value>` and filters by it; absent the flag it preserves current behavior with a deprecation warning. (Step 6)
7. `SANDBOX_ENV_LABEL` is set to a distinct value in each of local/dev/prod/test. (Step 7)
8. `epics.md` contains Epic 8 with Story 8.1; `sprint-status.yaml` contains the `epic-8` and `8-1-...` `backlog` entries. (§4.2–4.4)

---

## Assumptions

Documented decisions made on the user's behalf in Batch mode (no interactive halts):

1. **Mode = Batch.** All changes presented at once, no per-edit approval loop.

2. **New Epic 8, not folded into Epic 3 or 6.** Epic 3 (Conversations) and Epic 6 (Sandbox-Based Execution) are both `done` with retrospectives. Reopening either for an operational reliability story would conflate a closed feature epic with ongoing operational hardening and invalidate the retrospective boundary. Epic 8 is a small, self-contained operational epic — the pattern used for Epic 4 (deployment) and Epic 7 (live-usage UX).

3. **One story (8.1), not seven.** The seven steps are tightly coupled — the reaper (step 4) is untestable without the mock `list` (step 3), non-functional without the label (step 2), and unschedulable without the env var (step 1). Splitting them into seven stories would create stories that cannot be independently verified (a story that only adds the label but no reaper has no observable behavior). One story with seven BDD acceptance criteria is the right granularity.

4. **`scope` label name.** Chosen over `env` to avoid collision with common Daytona label names and to read clearly as "the scope this sandbox belongs to." The value is the environment identifier.

5. **`setInterval` over `@nestjs/schedule`.** The project does not depend on `@nestjs/schedule`. Adding it for one periodic task is over-engineering. `setInterval` + `.unref()` + `onModuleDestroy` clearance matches the existing `IdleTimeoutService` pattern exactly.

6. **Reconcile against Postgres, not in-memory Maps.** The in-memory `sandboxIds`/`sandboxStatuses` Maps in `ConversationsService` are lost on restart — the exact scenario that orphans sandboxes. The reaper reads Postgres, which survives. This is a deliberate dependency on the persistence Story 3.12's prerequisite established.

7. **Terminal-status gate = `'idle-timeout'` + `'failed'`.** These are the statuses `ConversationsService` sets when it believes a sandbox should no longer be alive. `'ready'` and `'provisioning'` are active statuses the reaper must not touch. This is the false-positive guard for the destructive operation.

8. **First reap deferred one interval.** A rolling deploy starts a new instance while the old instance's sandboxes are active. Firing `reap()` immediately could destroy a sandbox the old instance is still serving. Waiting one interval gives the drain window.

9. **Pre-existing unlabeled sandboxes are not auto-destroyed.** Sandboxes created before this story ships have no `scope` label and are invisible to the scoped `daytona.list()`. A one-time manual cutover cleanup clears them; this is operational, not a story AC.

10. **Optional `onModuleDestroy` on `ConversationsService` is in-scope but not required to close the story.** Adding it closes cause 1's graceful-`SIGTERM` case directly as a first-line defense. It is encouraged within Story 8.1's scope but the reaper covers it; the story closes on the reaper + label, not on the hook.

11. **Spec artifact edits are specified in this proposal but not applied by this run.** Following the pattern of the 2026-07-16 proposal, this run produces the *proposal* document only. The actual edits to `epics.md`, `sprint-status.yaml`, and `architecture.md` are post-approval implementation steps carried out by the handoff recipients in §5.

---

## Blockers / Decisions Needing Human Sign-off Before Implementation

1. **`SANDBOX_ENV_LABEL` values per environment.** The proposal specifies `local`/`dev`/`prod`/`test`. Confirm these are the intended identifiers (or substitute equivalents) before wiring — once sandboxes are labeled, changing the scheme requires reaping or relabeling existing sandboxes.

2. **Reaper default interval (15 min).** Confirm 15 minutes is acceptable as the default. A shorter interval catches leaks faster but increases Daytona API load; a longer interval is gentler but leaks persist longer. The interval is configurable per environment, so the default only bounds the worst case.

3. **One-time cutover cleanup of pre-existing unlabeled sandboxes.** Before the reaper can keep the account clean, the existing unlabeled orphans must be cleared manually (the reaper cannot see them). This is an operational step for Marius, not a code change — but it should be scheduled before the first deploy of Story 8.1, or the reaper will appear not to work (the quota will already be exhausted by pre-existing orphans it cannot see).

4. **Whether to add `onModuleDestroy` to `ConversationsService` within this story.** The proposal marks it optional-but-encouraged. The Architect should confirm whether the graceful-`SIGTERM` destroy belongs in Story 8.1 or a follow-up, given Story 3.12 already owns the graceful-drain surface (and its `onModuleDestroy` prerequisite notes).

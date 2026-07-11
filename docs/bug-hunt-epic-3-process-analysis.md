# Bug Hunt Process Analysis: Epic 3

**Date:** 2026-07-08
**Source:** Bug hunt on 20 Epic 3 source files (Stories 3.1–3.12)
**Report:** `_bmad-output/implementation-artifacts/bug-hunt-epic-3-conversations-running-bmad-skills-with-the-agent.md`
**Findings analyzed:** 15 critical + high (3 critical, 12 high); 17 low (including 5 deferred architectural items)

## Purpose

Trace each critical/high finding back to the earliest process stage that could have prevented it, to identify which process improvements would have the highest leverage. The goal is not to assign blame but to find systemic gaps.

## Process stage distribution

Each finding was categorized by the earliest stage that could have prevented it. Findings can have multiple contributing stages, so counts sum to more than 15.

| Process stage | Findings prevented | Count |
|---|---|---|
| Story implementation | C1, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C14, C15 | 13 |
| Architecture completeness | C1, C2, C3, C11 | 4 |
| Lack of API behavior investigation | C2, C9, C13 | 3 |
| Test case writing | 0 critical/high (1 low: C32) | 0 |
| Story development | 0 | 0 |

## Findings by stage

### Story implementation (primary fault — 13 of 15)

The architecture was remarkably prescriptive and correct. `project-context.md` contains 173 rules. Many bugs are cases where a rule existed and the implementation didn't follow it:

- **C4** (`num_turns`/`duration_ms` not guarded with `Number.isFinite`): Rule 177 says "guard with `Number.isFinite(value)` before the write" — applies to ALL external numerics. Only `total_cost_usd` was guarded. The implementer knew the pattern (they applied it to one field) but didn't generalize it to the other two fields in the same block of code.
- **C5** (no logging when `Number.isFinite` returns false): Rule 140 says "logger.warn() in catch blocks that return a default value" — the cost is silently dropped with no log.
- **C6** (`stop()` doesn't await `pendingClassifierPromises`): Rule 153 says "Await pending event-emitting promises before run completion." The `runTurn` method follows this (lines 142-145); `stop()` doesn't, despite being a parallel code path in the same class.
- **C20** (ls exitCode not checked): Rule 155 says "every command where success/failure matters MUST check `exitCode`." Four other commands in the same file check it; `listSkills` doesn't.

**Pattern:** The implementer knew the pattern, applied it in some places, and missed it in adjacent places within the same file or class. This is a discipline gap, not a knowledge gap.

### Architecture completeness (secondary fault — 4 of 15)

Four findings live in the seam between "architecture prescribed the pattern for scenario A" and "the adjacent scenario B was not explicitly covered":

- **C1** (DB writes after `RUN_FINISHED`): Rule 153 prescribes awaiting event-emitting promises before `RUN_FINISHED`. The same principle — don't emit completion before side effects are durable — applies to DB writes, but the rule only mentions promises, not DB writes.
- **C2** (back-pressure timer try/catch): Rule 154 prescribes wrapping `res.end()` in try/catch in `complete`/`error` callbacks. The timer callback does the same `res.write()` + `res.end()` but isn't mentioned.
- **C3** (pendingCommits not added during execution): Rule 157 prescribes the `executingCommits` Set pattern. The rule describes the guard and the tail-flush, but doesn't explicitly state "also add to `pendingCommits` when returning `queued: true` during execution."
- **C11** (onerror during processing): Rule 124 prescribes the `onerror` state-preservation guard for conversation state. It doesn't address `agentState` reset when the connection dies mid-processing.

**Pattern:** The architecture captured the lesson from the first scenario but didn't explicitly generalize it. An implementer who understood the principle would apply it; one following the letter of the rule would not.

### Lack of API behavior investigation (tertiary fault — 3 of 15)

Three findings stem from not investigating the actual behavior of an external API before implementing against it:

- **C2**: `res.write()` on a closed/destroyed response throws an uncaught exception. This is Express's actual contract — the `complete`/`error` callbacks handle it, but the timer callback doesn't. The implementer treated `res.write()` as fire-and-forget, not as a throwing operation.
- **C9**: React `useEffect` cleanup runs synchronously when a component unmounts, but an `await fetch()` in the effect body continues after cleanup. The EventSource created after the `await` is orphaned. This is the React effect lifecycle contract.
- **C13**: During IME composition (CJK input), Enter confirms the composed character AND fires the `keydown` handler. `e.nativeEvent.isComposing` (or `keyCode === 229`) is the standard guard. The implementer didn't investigate browser input event behavior for international users.

### Test case writing (not a primary fault)

The one test quality issue found (C32 — the false-green test) is a **low** severity finding because it doesn't hide a production bug (verified `markCredentialFailed` has its own internal try/catch). The test mocks an impossible scenario, which is bad practice, but it's not masking a real defect.

The broader test gap — many ECH findings have no test coverage at all — is real, but these are edge cases that tests typically don't cover unless explicitly required. The tests that DO exist are mostly faithful (the TFA confirmed this). The issue is test coverage breadth, not test fidelity.

### Story development (not at fault)

Stories define functional acceptance criteria ("the chat is ready within 10 seconds," "the user can manually save"). Edge cases like "Postgres fails during `turn.create` after `RUN_FINISHED` is emitted" or "Enter fires during IME composition" are implementation concerns, not story-level requirements. No reasonable story would include these as acceptance criteria. This is the correct layer separation.

## Recommendations

### 1. Implementation verification gate against project-context.md (highest leverage)

The architecture is good. The gap is verification that the implementation follows it. A post-implementation checklist that grep-checks each rule against the code that should follow it would have caught C4, C5, C6, and C20 — four findings where the rule was right there and the code didn't follow it. This is the single highest-leverage process improvement: **the rules exist; they're just not being enforced at implementation time.**

- **Effort:** Low (automated rule-to-code verification)
- **Impact:** Catches ~4 of 15 critical/high findings

### 2. Generalize architecture rules explicitly (medium leverage)

When adding a rule to `project-context.md` after a review patch, state the principle and then enumerate all the places it applies. For example, rule 154 should say "Wrap `res.end()` and `res.write()` in try/catch in `complete`, `error`, AND timer callbacks" — not just the callbacks where the bug was originally found. This would have prevented C1, C2, C3, and C11.

- **Effort:** Low (editorial pass on existing rules)
- **Impact:** Catches ~4 of 15 critical/high findings

### 3. API behavior investigation checklist for external boundaries (medium leverage)

Before implementing against an external API (Express Response, EventSource, React useEffect, Daytona SDK), document the failure/edge contract: "What does `res.write()` do on a closed response? What happens to an `await` in a `useEffect` when the component unmounts? Does Enter fire during IME composition?" This would have prevented C2, C9, and C13.

- **Effort:** Medium (requires discipline at implementation time)
- **Impact:** Catches ~3 of 15 critical/high findings

### 4. No change needed to story development or test writing process

Stories are at the right abstraction level. Tests are faithful where they exist. The gap is coverage breadth (edge cases not tested), but that's what the bug hunt is for — it's the correct layer for finding these.

## Risks and unknowns

- **The "implementation discipline" diagnosis could be wrong if the rules were added to `project-context.md` AFTER the code was written.** Many rules note "caught as a review patch" or reference a specific story. If the code was written before the rule existed, the fault is not "didn't follow the rule" but "rule didn't exist yet, and no retroactive application." This would require checking git history against the rule annotations. If this is the case, the primary fault shifts from "implementation discipline" to "no retroactive rule application" — a different process gap with a different fix (periodic rule-application audits on existing code).

- **The 17 low-severity findings include 5 "defer" items that require architectural changes.** These are genuinely hard problems (cross-tab presence, ReplaySubject lifecycle, timestamp threading) that no process stage short of upfront architecture design would have prevented. They represent the inherent tail of edge cases that only surface through exploration.

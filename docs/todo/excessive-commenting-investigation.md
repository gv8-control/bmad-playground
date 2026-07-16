# Excessive Commenting Investigation

**Date:** 2026-07-16
**Status:** Investigation complete, implementation plan below

## Problem

Excessive comments appear across all code in the project (app and tests). Multiple comment patterns are present, each driven by a different instruction source in the BMAD skill system.

## Comment patterns found in the codebase

### 1. Story/AC tracking headers in test files (most widespread)

Every test file opens with a multi-line docblock mapping stories to acceptance criteria:

```
// agent.service.unit.spec.ts
/**
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 * ...
 * Story 3.4 covers: AC-1 (tool call lifecycle), AC-2 (classifier integration),
 *                   AC-5 (circuit breaker).
 */
```

Found in: `agent.service.unit.spec.ts`, `ConversationPane.test.tsx`, `ToolPill.test.tsx`, and nearly every test file with a header docblock.

### 2. Audit-finding reference comments (most verbose)

Long inline comments explaining why test fixtures are shaped a certain way, referencing audit findings by number:

```
// --- Type-checked SDKMessage fixture builders ---
// The builders below use no `as SDKMessage` / `as unknown as SDKMessage` /
// `as never` assertions: each returns a full object literal that the compiler
// checks against the real @anthropic-ai/claude-agent-sdk type declarations...
// silence (audit finding #2).
//
// Type-checking is enforced by the `agent-be:typecheck` target (runs
// `tsc --noEmit -p apps/agent-be/tsconfig.spec.json`), which CI runs before
// the ts-jest test step. ts-jest operates in transpile-only mode
// (`isolatedModules: true`), so without this gate the builders below would
// NOT actually be verified (audit finding C-1).
```

Found in: `agent.service.unit.spec.ts` (lines 104-117, 142-145, 214-216, 539-543, 603-614, 1256-1260, 1274-1278), `anthropic-proxy.controller.spec.ts`.

### 3. AC-prefixed describe block names

```
describe('[P0] AC-1 — Tool call lifecycle emission', () => {
describe('[P0] AC-2 — Classifier integration', () => {
describe('[P0] audit finding #1 — processAssistantMessage coverage', () => {
```

These are test names, not comments, but they contribute to the noise and originate from the same root cause.

### 4. Given-When-Then comments inside test bodies

The `testarch-automate` and `testarch-atdd` skills both instruct: "Clear Given-When-Then comments in test code" and "All tests use Given-When-Then structure with clear comments."

### 5. Provider endpoint comments + scrutiny evidence blocks (latent — not present in code)

Prescribed by `bmad-testarch-automate/checklist.md` (lines 196-211) and `step-03a-subagent-api.md` (line 108, 150-162). However, these are conditional on `use_pactjs_utils` being enabled, which it is not (`_bmad/tea/config.yaml` line 8: `tea_use_pactjs_utils: false`). No Pact dependencies are installed, no Pact config files exist, and no test asserts on comment presence. This pattern is currently inert — it would only activate if someone enabled Pact.js Utils in the future.

## Root cause sources

| Comment pattern | Root cause source | Evidence |
|---|---|---|
| Story/AC header docblocks in tests | `_bmad-output/project-context.md` line 309 | "Test files include a header comment block citing the story, acceptance criteria, and red-phase status." |
| Audit-finding reference comments | `.claude/skills/bmad-dev-story/SKILL.md` line 350 (added in commit `a034ee5`) + `docs/sdk-contract-testing-gap.md` | The contract-fidelity `<critical>` clause tells devs to ensure tests exercise the real SDK contract shape and references the incident doc. Devs then document WHY fixtures are shaped a certain way by referencing "audit finding #1", "audit finding C-1", etc. |
| AC-prefixed describe block names | `_bmad-output/project-context.md` line 309 + dev-story AC tracking | The AC-citing instruction extends from headers into describe block names. |
| Given-When-Then comments | `.claude/skills/bmad-testarch-automate/checklist.md` lines 181, 242 + `.claude/skills/bmad-testarch-atdd/checklist.md` line 96 | "Clear Given-When-Then comments in test code" / "All tests use Given-When-Then structure with clear comments" |
| Provider endpoint + scrutiny evidence comments | `.claude/skills/bmad-testarch-automate/checklist.md` lines 196-211 + `steps-c/step-03a-subagent-api.md` lines 108, 150-162 | Latent — conditional on `use_pactjs_utils` which is disabled |
| "Story X.Y — caught as a review patch" modeling | `_bmad-output/project-context.md` (entire document) | Every rule ends with "See `File.tsx` (Story X.Y — caught as a review patch)" or "(Story X.Y — NFR audit fix)". Models behavior where code comments should reference stories and findings. |

## The direct contradiction

`_bmad-output/project-context.md` lines 305-309 contains a self-contradiction:

```
#### Comments & Documentation

- **DO NOT add comments unless explicitly requested** (per `CLAUDE.md`). Code should be self-documenting.
- JSDoc is used sparingly for public API contracts where the "why" isn't obvious...
- Test files include a header comment block citing the story, acceptance criteria, and red-phase status.
```

Line 307 says "DO NOT add comments." Line 309 says "Test files include a header comment block." The third bullet contradicts the first. The dev-story and testarch skills pile more comment-prescribing instructions on top, making the "don't add comments" rule unenforceable in practice.

## What was recently updated

- `2aff37b` (Jul 7) — "improve test fidelity skill" — modified the fidelity auditor's references but did NOT remove the audit-finding comment pattern from the dev-story skill or project-context.md.
- `a034ee5` (Jul 6) — "add contract-fidelity clause to DoD" — this ADDED the clause that causes audit-finding comments. This is a recent addition that INTRODUCED the problem, not a fix for it.

The dev-story skill (`bmad-dev-story`) and the testarch skills (`bmad-testarch-automate`, `bmad-testarch-atdd`) have NOT been updated to reduce comments. They still actively prescribe comment patterns.

## Analysis

### Root cause: multiple skills prescribe comments, one rule says don't

The excessive commenting is not caused by a single source. It is caused by **five independent instruction sets** that each prescribe a different category of comment, all running against a single "DO NOT add comments" rule that is immediately contradicted.

The contradiction in `project-context.md` (lines 307 vs 309) is the structural defect. The dev-story contract-fidelity clause and the testarch checklists are the operational drivers — they actively instruct agents to leave comments in code. The "don't add comments" rule is powerless against three skills that say "add comments."

### The contract-fidelity clause is the most damaging recent addition

Commit `a034ee5` added the contract-fidelity `<critical>` clause to `bmad-dev-story/SKILL.md`. This clause is well-intentioned — it prevents a real class of bug (fabricated-contract testing). But its side effect is that devs document the reasoning for every fixture shape decision by referencing "audit finding #1", "audit finding C-1", etc. The audit findings are ephemeral review artifacts; embedding them in code comments makes the code harder to read and the comments stale the moment the next audit runs.

The fidelity auditor's output format (findings labeled "Gap A", "Gap B", "Gap C" with `path:line` citations) further reinforces this: when a dev fixes a finding, they leave a comment referencing the finding number. The finding is in a report; the code should just be correct.

### The project-context.md models the wrong behavior

Every rule in `project-context.md` ends with a parenthetical like "(Story 3.8 — caught as a review patch)" or "(Story 4.5 — NFR-2 audit fix)". This is appropriate for a context document — it tells the agent where the pattern was established. But it models a behavior: "code should reference stories and audit findings." Agents generalize this pattern from the context document into the code they write.

### The testarch skills prescribe comments that should be test names or assertions

"Clear Given-When-Then comments in test code" is the wrong instruction. Given-When-Then should be expressed in test structure (setup → action → assertion) and test names, not inline comments. The checklist item conflates test structure with test comments.

The provider endpoint comment and scrutiny evidence block are more defensible — they document a contract verification process. But they should be in a separate file (e.g. a `scrutiny.md` alongside the test), not as block comments in the test file itself. (This is moot for this project since Pact.js Utils is disabled.)

### Second-order effect: comment rot

Audit-finding reference comments rot immediately. The next audit produces new findings with new numbers. The old "audit finding #2" comment now references a finding that no longer exists in the current audit report. The comment becomes noise that references a ghost.

Story/AC reference comments rot when stories are renumbered or consolidated. The header docblock listing "Story 3.4 covers: AC-1, AC-2, AC-5" becomes wrong the moment a story is split or an AC is renumbered.

## CI gate verification

Investigated whether any CI gate enforces the provider-endpoint/scrutiny-evidence comments. Result: **No CI gate enforces any comment pattern.**

- Pact.js Utils is disabled (`_bmad/tea/config.yaml` line 8, `_bmad/config.toml` line 26).
- No `@pact-foundation/*` packages installed.
- No Pact config files exist.
- No test asserts on comment presence.
- CI runs lint, typecheck, unit, e2e, burn-in, security scan — none inspect comment content.

Nothing would break if any comment pattern were removed from the codebase.

---

## Implementation plan

### Priority 1: Fix the contradiction in project-context.md

**File:** `_bmad-output/project-context.md`
**Lines:** 305-309
**Effort:** Low
**Impact:** High — this is the single highest-leverage fix

**Change:** Remove line 309 ("Test files include a header comment block citing the story, acceptance criteria, and red-phase status.") or rewrite it to:

```
- Test files may include a one-line `@jest-environment` pragma if needed. Do not add story/AC tracking headers — the test names and describe blocks are the documentation.
```

This eliminates the direct contradiction with line 307 ("DO NOT add comments unless explicitly requested").

### Priority 2: Remove audit-finding reference comments from the contract-fidelity clause

**File:** `.claude/skills/bmad-dev-story/SKILL.md`
**Line:** 350
**Effort:** Low
**Impact:** High — stops the most verbose comment pattern

**Change:** The clause currently says "See `docs/sdk-contract-testing-gap.md` for the incident that motivated this requirement." Add to the clause:

```
Do NOT reference audit findings, finding numbers, or incident documents in code comments. The code should be correct; the audit report is the place for findings.
```

Keep the clause itself (the instruction to use type-checked construction, not `as` bypasses) — that is correct and should stay. Only add the instruction not to reference findings in code comments.

### Priority 3: Fix the testarch checklists

**Files:**
- `.claude/skills/bmad-testarch-automate/checklist.md` lines 181, 242
- `.claude/skills/bmad-testarch-atdd/checklist.md` line 96

**Effort:** Low
**Impact:** Medium — stops the Given-When-Then comment pattern

**Changes:**
- Line 181: "Clear Given-When-Then comments in test code" → "Clear Given-When-Then structure in test code (setup → action → assertion, expressed in test names and code organization, not inline comments)"
- Line 242: "All tests use Given-When-Then format with clear comments" → "All tests use Given-When-Then format with clear structure"
- `bmad-testarch-atdd/checklist.md` line 96: "All tests use Given-When-Then structure with clear comments" → "All tests use Given-When-Then structure with clear code organization"

### Priority 4: Clean up existing comments in the codebase

**Files (worst offenders):**
- `apps/agent-be/src/streaming/agent.service.unit.spec.ts` (57 `//` comments)
- `apps/agent-be/test/sdk-contract-replay.spec.ts` (36)
- `apps/web/src/actions/repo-connection.actions.spec.ts` (28)
- `apps/agent-be/test/unit/deploy-workflow.spec.ts` (27)
- `apps/web/src/lib/credential-health.test.ts` (24)
- `apps/web/src/components/conversation/ConversationPane.tsx` (24)
- `apps/web/src/components/conversation/ConversationPane.test.tsx` (23)
- `apps/agent-be/src/anthropic-proxy/anthropic-proxy.controller.spec.ts` (23)

**Effort:** Medium
**Impact:** Medium — removes the accumulated comment debt

**Changes:**
- Strip audit-finding reference comments (e.g. "audit finding #2", "finding C-1") — the code is correct without them.
- Collapse story/AC header docblocks to one-line `@jest-environment` pragmas where needed, remove entirely otherwise.
- Remove Given-When-Then inline comments — the test structure and names should communicate this.
- Keep `eslint-disable-next-line` comments (these are load-bearing for the linter).
- Keep `@jest-environment` pragmas (these are load-bearing for Jest).

### Priority 5: De-model the "Story X.Y — caught as a review patch" pattern

**File:** `_bmad-output/project-context.md`
**Effort:** Low
**Impact:** Low (ongoing)

**Change:** Add a convention note at the top of the document:

```
Story references in this document are provenance for the rule, not a pattern to replicate in code comments. Do not add story/AC references to code.
```

This doesn't require changing every rule's parenthetical — just adding the convention note so agents understand the distinction between context-document provenance and code-comment patterns.

## Risks and unknowns

**Risk: Removing the contract-fidelity clause's reference to the incident doc could weaken the safeguard.** The clause exists because a real incident occurred. Removing the reference might cause future devs to not understand why the clause exists. Mitigation: keep the clause, just add the instruction not to reference findings in code comments. The clause itself (the instruction to use type-checked construction, not `as` bypasses) is correct and should stay.

**Risk: The testarch provider endpoint comments may be load-bearing for Pact contract verification.** Investigated and resolved — `use_pactjs_utils` is disabled, no Pact dependencies installed, no CI gate enforces their presence. Nothing to break.

**Unknown: The `bmad-quick-dev` step-04 review subagents (Blind Hunter, Edge Case Hunter, Acceptance Auditor) may prescribe leaving comments in code when they find issues.** The review findings are written to the story file (step-04-present.md), not to code comments — but the Acceptance Auditor reads the spec and might instruct the dev to add AC-tracking comments when fixing findings. Worth checking if the pattern persists after the above fixes.

**Unknown: The `bmad-code-review` skill's step files may contain comment-prescribing instructions.** The code-review skill writes findings to the story file, not to code, but its review layers might model a comment-heavy style that devs replicate. Worth checking if the pattern persists after the above fixes.

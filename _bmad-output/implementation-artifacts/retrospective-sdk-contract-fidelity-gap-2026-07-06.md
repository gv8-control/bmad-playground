# Retrospective — SDK Contract Fidelity Gap

**Date:** 2026-07-06
**Facilitator:** Amelia (Developer)
**Project Lead:** Marius
**Type:** Incident retrospective (not epic-scoped)
**Theme:** A documented open concern, an architecture prescription, and a proposed fix sat untouched for the duration of Epic 3. Three production bugs shipped behind 251 green tests. The fix itself introduced a second-order false-green that adversarial review caught. The pipeline's feedback loops watched the wrong signals.

**Related artifacts:**

- `docs/sdk-contract-testing-gap.md` (origin, dated 2026-07-06, status "Open concern")
- `apps/agent-be/src/streaming/agent.service.ts` (the broken production code)
- `_bmad-output/planning-artifacts/architecture.md:80` (prescription: recorded BMAD session replay)
- `_bmad-output/planning-artifacts/epics.md:117` (downgrade: "PR-review checklist item enforced by process, not a story acceptance criterion or automated test")
- `docs/self-improving-pipeline.md` (pipeline architecture and reflect-step design)
- `_bmad-output/test-artifacts/` (fidelity re-audit verdict: PASS)
- Predecessor retro: `_bmad-output/implementation-artifacts/epic-2-retro-2026-07-06.md`

---

## Team Participants

- Amelia (Developer) — facilitating
- Winston (System Architect) — architecture-prescription gap
- Murat (Master Test Architect) — test fidelity, classification of green tests
- John (Product Manager) — backlog traceability for "Open concern" entries
- Mary (Business Analyst) — documentation-action gap
- Marius (Project Lead)
- Vera (Test Fidelity Auditor, invoked skill) — guest; external audit triggered the fix and confirmed fidelity post-fix

This is an incident retrospective, not an epic completion retro. Epic 3's 12 stories were marked `done` in `sprint-status.yaml` prior to this session; `epic-3-retrospective` was `optional` at the time of this incident retro but was later set to `done`. The full Epic 3 epic-completion retro artifact was reconstructed on 2026-07-15 at `_bmad-output/implementation-artifacts/epic-3-retro-2026-07-06.md`; this document closes the SDK fidelity incident only.

---

## What went well

1. **The fidelity audit was run at all.** The `bmad-agent-fidelity-auditor` skill (Vera) was invoked at Epic 3 closeout, surfaced all five prior findings, and produced a gate-check verdict. An external, contract-aware reviewer was the only instrument that could have caught this class of bug — the internal pipeline had no such vantage point.

2. **The fix sequence was correct end-to-end.** Implementation (`bmad-quick-dev`) → adversarial code review (`bmad-code-review`) → fix review findings → fidelity re-audit. Each step found something the previous step missed. This is the intended shape of the development pipeline, and it worked:
   - Implementation produced a 23-message recorded session replay fixture (`apps/agent-be/test/fixtures/sdk-session-replay.jsonl`), a 229-line contract replay test (`apps/agent-be/test/sdk-contract-replay.spec.ts`), and removed `as SDKMessage` type-assertion bypasses.
   - Code review caught the second-order false-green (audit finding C-1: `tsc --noEmit` was never enforced; ts-jest's transpile-only mode silently dropped 11 type errors), the fabricated `id` field (C-2), and invalid UUIDs (C-3).
   - The fidelity re-audit confirmed all 5 prior findings resolved. The architecture prescription at `architecture.md:80` is now an automated test, not a manual checklist item.

3. **The CI gate was added, not just the test.** `apps/agent-be/project.json` now has a `typecheck` target, and `.github/workflows/test.yml` has a dedicated `typecheck` job (lines 50–75) that runs `yarn nx run-many --target=typecheck --all` with an explicit inline comment naming audit finding C-1 as the reason it exists. This is the right shape — a fix without an enforcement layer would have been cosmetic.

4. **The original gap document was well-written.** `docs/sdk-contract-testing-gap.md` identified the concern precisely, listed the three bugs, explained why the existing methodology missed it, proposed a specific mitigation with setup steps, analyzed trade-offs vs. a live smoke test, and enumerated open questions. As a piece of technical writing, it was actionable. The failure was not in the documentation; it was in the absence of any loop connecting the documentation to a backlog item.

5. **Predecessor retro had already named the pattern.** Epic 2's retro (`epic-2-retro-2026-07-06.md`) explicitly identified: *"The autonomous pipeline's 'defer-and-move-on' quality gate is accumulating blocking debt rather than resolving it"* and *"Deferred retro action items compound."* The shape of this incident was a known shape. Lesson: naming a pattern in a retro is necessary but not sufficient — without an enforcement mechanism, the named pattern recurs at a higher level.

---

## What didn't go well

### A. The documentation-action gap

`docs/sdk-contract-testing-gap.md` carried `Status: Open concern, raised 2026-07-06`, a "Proposed mitigation" section, "Setup" steps, "Trade-off" analysis, and three "Open questions" — none of which were ever actioned. Nothing in the project connects a markdown status header to a sprint-status key, a backlog item, or an owner.

The gap doc proposed the exact fix that was eventually implemented (recorded-session contract replay test, JSONL fixture, CI integration, no network/API key). It was implemented months later. The delay was not a discovery problem — the discovery was already done. It was a loop-closing problem.

### B. The architecture-prescription-to-implementation gap

`architecture.md:80` prescribes: *"Pin to an exact binary version in the Dockerfile (no floating tags). Before any upgrade: diff the JSONL→AG-UI event mapping in the release changelog; run the new version against a recorded BMAD session replay and validate the expected AG-UI event sequence matches."*

`epics.md:117` downgrades it verbatim: *"This is a PR-review checklist item enforced by process, not a story acceptance criterion or automated test."*

The downgrade was deliberate, documented, and never revisited. The manual checklist had no owner, no trigger, and no audit. It never fired. Story 3.3 implemented `AgentService` using `query()` without `includePartialMessages: true` — a direct violation of the recorded-session-replay discipline the architecture had prescribed — and no story acceptance criterion existed to catch it, because the architecture prescription had explicitly been excluded from acceptance criteria.

### C. The type-checking enforcement gap (second-order false-green)

`ts-jest` runs in transpile-only mode (`isolatedModules: true`). Real type errors don't surface in the test step. The implementation step's "type-checked fixture builder" claim was therefore unverifiable by the test pipeline. Adversarial code review (audit finding C-1) was the only instrument that caught this.

The fix for "false confidence in tests" would itself have given false confidence ("we type-check now") without the adversarial review catching the absence of enforcement. This is a regression of a regression: the fix inherits the same trust-the-green bias it was supposed to repair. The CI typecheck gate (now in `.github/workflows/test.yml`) closes the second-order gap; without it, the "type-checked construction" fix would have been cosmetic.

### D. The "green tests" risk indicator

- 251 tests passed green while production code was non-functional (no streaming, no `processAssistantMessage` work, no credential-failure classification).
- 260 tests passed green while the "type-checked" fixture builders contained 11 (later 38) type errors.

A high pass rate was treated as reassurance. It was a risk indicator. The 251 green tests proved only that code processed the fabricated fixtures the same developer had written — tautological confirmation, not contract verification. The 260 green tests proved only that `tsc` was never invoked, because no gate enforced it.

The pipeline's own self-congratulation compounded this: Story 3.3's `implement-story` journal entry (`journal.jsonl` line 203) reported *"Created production `AgentService` using Claude Agent SDK's `query()` with AG-UI event mapping"*. The subsequent `review-tests` step scored 89/100 (Grade A — Approve with comments). Every layer trusted the description "uses SDK query()" without anyone verifying the SDK actually emitted the events being mapped.

### E. The self-improving pipeline missed it

The gen-2 pipeline (`docs/self-improving-pipeline.md`) has all the expected machinery: `journal.jsonl` events, `ledger.jsonl` observations with stable fingerprints, a `reflect` step that reads them and writes proposals, and a deterministic `apply-amendments.mjs` gatekeeper. It works as designed for what it was designed to catch — operational/implementation-level drift (skipped tasks, missing NFR patterns, hard waits, schema-migration drift, missing select projections).

It does NOT read planning artifacts (`architecture.md`, `epics.md`) or `docs/*.md`. Its reflect step is explicitly told: *"most findings are noise; record observations, don't eagerly propose fixes."* That design philosophy is correct for noise reduction but structurally filters out slow-burn architectural drift — exactly the class this incident represents.

The ledger DID record one adjacent signal that should have escalated and didn't: Story 3.3's `review-code` step (`journal.jsonl` line 209) recorded an "architecture reconciliation deferred to architect" observation about `terminateProcess` being effectively a no-op because the agent runs in-host via `query()`. The observation was logged; nothing escalated from it. A reviewer noted the architecture was being deviated from in the same week the gap doc was being written, and the two findings never met.

### F. The predecessor retro's action items were not closed

Epic 2's retro flagged this exact failure mode and committed to action items targeting it:

- Action item 3: **"Re-commit to Epic 1 retro action items 3 (auto-analyst) and 6 (trend accumulator) — the missing feedback loop that let Epic 2's sync-error pattern recur four times undetected."**

Epic 1 retro item 3 ("Wire Analyst as Automated Post-Execution Step") was redesigned as the gen-2 pipeline's Reflect step — but the Reflect step was scoped to per-story operational findings, not cross-epic architectural drift. The "auto-analyst" function was rebuilt narrower than its original mandate. `_bmad-output/n8n-analysis/` — the directory Epic 1 retro item 3 specified — is empty. The function moved; the scope narrowed; nobody re-checked whether the narrowed scope still covered the original intent.

---

## Lessons learned

1. **A documented gap without a tracking key is documentation, not action.** The gap doc was complete, correct, and ignored. "Status: Open" is a markdown header, not a backlog state. Until the project has a feedback loop that connects `docs/*.md` "Open concern" markers to `sprint-status.yaml` development_status keys (or to an explicit, dated, owner-attributed deferral), every gap doc has the same probability of being ignored.

2. **An architecture prescription downgraded to "enforced by process" is a prescription with no enforcement.** `epics.md:117` literally says *"not a story acceptance criterion or automated test"* — the architecture's safeguard was downgraded out of the only layers that fire automatically. Manual checklists fire only when a developer remembers; in this incident, no developer ever did. Architecture prescriptions that name a specific safeguard (a recorded session, a property test, a checksum diff) should either be automated tests or carry a CI-level trigger that fires on the relevant event (SDK upgrade PR, dependency bump).

3. **A fix for a verification gap requires an independent verification layer applied to the fix itself.** The "type-checked fixture builder" was a fix for false greens. Without a CI gate enforcing `tsc --noEmit`, the fix itself produced false greens. Verifying the fix is not the same as implementing the fix. Every verification-gap fix should add a witness test: a deliberately-broken artifact that the new gate catches, proving the gate fires.

4. **Green tests against fabricated fixtures are tautologies, not evidence.** Test reports should classify each test by contract source: (a) tests against real contracts (the new replay test), (b) tests against fabricated fixtures (corrected only when the fixtures are derived from or anchored to the real contract), (c) tests against pure internal logic. A 100% green report with zero (a)-category tests for code that consumes an external SDK is not confidence — it is a measured absence of evidence.

5. **The pipeline's reflect step reads the wrong scope for slow-burn architectural drift.** It reads `journal.jsonl`, `ledger.jsonl`, trends, and `runner-errors.jsonl`. It does not read `architecture.md`, `epics.md`, or `docs/*.md`. It is told "most findings are noise." Both choices are correct for the per-story operational layer it was designed for. Both choices are wrong for the cross-epic architectural layer this incident lives in. The two layers need different instruments.

---

## Action items

Each item is SMART: specific, measurable, achievable, relevant, and sequenced by a trigger (not a calendar date — per skill convention, no time estimates).

### Process improvements

1. **Add an "open concerns registry" feedback loop.** Any `docs/*.md` file carrying a `Status: Open` or `Status: Open concern` header must reference a tracking key in `sprint-status.yaml` (a story key, an explicit deferral marker with a re-evaluation trigger, or a `_bmad-output/deferred-work.md` entry). The Reflect step (or a scheduled audit script under `scripts/pipeline/`) scans for `^Status: Open` markdown headers and surfaces any document that doesn't carry a tracking-key reference. This generalizes Epic 2 retro's 2-strike escalation rule from intra-epic deferrals to cross-epic open concerns.
   - Owner: Mary (Business Analyst) for the registry convention; Amelia (Developer) for the scan script
   - Sequencing: scan script before Epic 4 kickoff; convention applied to `docs/sdk-contract-testing-gap.md` immediately (status should be flipped from "Open concern" to "Resolved — implemented in apps/agent-be/test/sdk-contract-replay.spec.ts" with the implementation reference)
   - Success criteria: zero `Status: Open` lines in `docs/*.md` without an explicit tracking-key reference; weekly audit run (or per-epic Reflect-run reading)

2. **Forbid "enforced by process" as a deferral rationale for architecture safeguards.** Architecture prescriptions that name a specific verification mechanism (recorded session replay, property test, checksum diff, staged migration dry-run) must either (a) be implemented as an automated test, or (b) carry a deferral record with: an owner, a trigger event, and a CI-level enforcement hook. "PR-review checklist enforced by process" is not an acceptable downgrade. Apply retroactively to `epics.md:117` and `epics.md:118` — both should be re-classified: the recorded-session replay is now an automated test (`sdk-contract-replay.spec.ts`); the AG-UI upgrade validation needs an explicit trigger hook.
   - Owner: Winston (Architect)
   - Sequencing: `epics.md` and `architecture.md` reconciliation before Epic 4 kickoff
   - Success criteria: no `enforced by process` string in `_bmad-output/planning-artifacts/*.md` without an accompanying owner + trigger + CI-hook declaration

3. **Require a witness test for every verification-gap fix.** When a regression class is identified and fixed (false greens, silent type errors), the fix must include a test that proves the gate fires. Concrete: add a test that deliberately checks in a broken fixture (e.g., a fake `SDKMessage` with `content` directly on it, the original bug shape) and asserts either `tsc --noEmit` fails OR `sdk-contract-replay.spec.ts` fails on it. This is a regression test for the regression test.
   - Owner: Murat (Master Test Architect)
   - Sequencing: applied to the SDK contract fix first (it's the immediate regression class); pattern documented in `project-context.md` Testing Rules section
   - Success criteria: a checked-in negative fixture that the CI typecheck gate rejects; the test runs in CI; failure of the witness test fails CI

4. **Classify every test in the test report by contract source.** Test runs (unit and integration) should report three counts: (a) tests against real external contracts (replay, recorded, captured), (b) tests against fabricated fixtures, (c) tests against pure internal logic. A 100% green report with category-(a) == 0 for code that consumes an external SDK receives a "contract-coverage: none" label in the test summary — visible in CI output and in `_bmad-output/implementation-artifacts/tests/test-summary.md`.
   - Owner: Murat (Master Test Architect) for the classification rules; Amelia (Developer) for the Jest reporter / `test-summary.md` generator
   - Sequencing: applied to `apps/agent-be` first (where SDK-consuming code lives); rolled to `apps/web` once stable
   - Success criteria: every test summary file reports the three counts; "contract-coverage: none" label surfaces in CI when applicable

### Technical debt

1. **`docs/sdk-contract-testing-gap.md` status update.** Status should move from "Open concern, raised 2026-07-06" to "Resolved 2026-07-06 — implemented in `apps/agent-be/test/sdk-contract-replay.spec.ts`; Open questions section answered (recording script lives in `apps/agent-be/test/fixtures/record-session.ts`; JSONL fixture committed; project-context.md pattern entry to be added per item below)."
   - Owner: Mary (Business Analyst)
   - Priority: HIGH — closes the gap doc that this retro was about
   - Effort: trivial

2. **`project-context.md` entry for recorded-session contract tests.** Add to the Testing Rules section: a rule that any code consuming an external SDK's streaming or message contract (`@anthropic-ai/claude-agent-sdk`, `@daytonaio/sdk`, GitHub API contents) should ship with a recorded-session replay test as the contract anchor, not just fabricated-fixture tests. Reference `sdk-contract-replay.spec.ts` as the canonical pattern.
   - Owner: Amelia (Developer)
   - Priority: HIGH — pattern establishment prevents recurrence in new SDK-consuming code
   - Effort: small

3. **Audit other SDK-consuming code for the same fabricated-fixture pattern.** The gap doc explicitly names candidates: `SandboxService` (Daytona SDK) and `artifacts.service.ts` (GitHub API contents). Run a fidelity-audit-style check on both: do their tests validate against recorded real output, or against hand-rolled fixtures?
   - Owner: Murat (Master Test Architect)
   - Priority: MEDIUM — needs a separate audit invocation per area
   - Effort: medium per area

### Team agreements

- An `Status: Open` line in any `docs/*.md` file is not a closure. To close an open concern: update the status, attach an implementation reference, and re-run the audit (or the suite) that would have caught the original gap.
- An architecture safeguard that names a specific mechanism is either an automated test or a deferral with a CI-level trigger. "Process" is not a verification layer.
- A green test report for code that consumes an external contract is read as: *tests pass against the fixtures the author wrote.* Verify what the fixtures are anchored to before treating green as evidence.
- A fix for a verification gap requires a witness test proving the gate fires.

---

## Pipeline feedback loops to add

Contributions to the self-improving pipeline (`docs/self-improving-pipeline.md`):

1. **Extend the Reflect step's reading set.** `reflect-prompt.mjs` should pass the Reflect LLM access to:
   - All `docs/*.md` files containing `^Status: Open` headers (open concerns registry).
   - `_bmad-output/planning-artifacts/architecture.md` and `epics.md`, with correlation to find any `architecture.md` line cited as the source for an `epics.md` "enforced by process" downgrade.
   - `sprint-status.yaml` for any `epic-N-retrospective` key stuck on `optional` past one completed epic.
   Each becomes a new observation class in the ledger with a stable fingerprint prefix (e.g., `open-concern-*`, `prescription-downgrade-*`, `stale-retro-*`).

2. **Recurrence escalation for the new observation classes.** Apply the existing `addStepRecurrenceThreshold` (≥2 distinct runs) to the new observation classes. An open concern that survives 2 Reflect runs without a tracking-key reference escalates as a proposal (e.g., "block next-story loop until the open concern has a tracking key"). The default policy — "most findings are noise; record observations, don't eagerly propose fixes" — remains for operational findings; architectural-drift findings carry stronger escalation.

3. **Cross-correlate "architecture reconciliation deferred" ledger entries.** The ledger already records `*_architecture-reconciliation-deferred`-style observations (Story 3.3's `terminateProcess` no-op was one). Add a cross-correlation check: any ledger observation mentioning "deferred to architect" or "architecture reconciliation" that survives 1 Reflect cycle without an `architecture.md` update or a new planning-artifact entry escalates as a `stale-architecture-deferral-*` observation.

4. **Test-summary classification hook.** Extend `scripts/pipeline/journal.mjs story` to read the three-count test classification (real-contract / fabricated-fixture / internal-only) from `test-summary.md` and journal it on the `step_end` event for `unit-tests`, `review-tests`, and `e2e-tests`. A `contract-coverage: none` marker becomes a Reflect-step input like any other.

5. **Witness-test presence check.** When a code-review step's findings include a verification-gap fix (C-class or I-class), the subsequent `review-tests` step must verify the presence of a witness test asserting the gate fires. Absence is a Reflect-step observation with fingerprint `missing-witness-test-*`.

Each of these maintains the pipeline's core invariants: observations are cheap, changes are expensive, the LLM proposes, the deterministic gatekeeper decides (`docs/self-improving-pipeline.md` §Learning policy). No widening of the machine's authority; only widening of its reading set.

---

## Readiness assessment

**Testing & quality:** ✅ Verified post-fix
- Fidelity re-audit verdict: PASS, *"Fidelity confirmed."* All 5 prior findings resolved.
- 260 tests passing on the post-fix codebase (per incident report).
- CI now enforces `tsc --noEmit` via the `typecheck` job in `.github/workflows/test.yml`; 38 type errors fixed post-C-1 audit finding.
- Contract replay test (`sdk-contract-replay.spec.ts`) is now in CI and exercises the `AgentService.processSdkMessage` pipeline against a recorded 23-message real SDK session.

**Architecture prescription status:** ✅ Promoted to automated test
- `architecture.md:80`'s "recorded BMAD session replay" is now `apps/agent-be/test/sdk-contract-replay.spec.ts`.
- Gap remains: `epics.md:117` and `epics.md:118` still carry the *"PR-review checklist item enforced by process, not a story acceptance criterion or automated test"* wording; Action item 2 reconciles this.

**Documentation status:** ⚠️ Partially closed
- The implementation is done and audited; `docs/sdk-contract-testing-gap.md` itself still reads `Status: Open concern` until Technical debt item 1 lands.

**Pipeline readiness for the next similar gap:** ⚠️ Not yet
- The reflect step does not yet read the open-concerns registry, planning artifacts, or stale-retrospective keys (Pipeline feedback loops to add, items 1–3). Until those ship, the next "Open concern" doc has the same probability of being ignored as this one did.

**Stakeholder acceptance:** ⚠️ Implicit
- Marius reviewed the fix sequence and the re-audit verdict. No explicit sign-off recorded beyond the audit's gate-check verdict.

**Unresolved blockers:** None blocking
- Open question (gap doc, "What this does NOT replace") remains: a real browser session observing a live conversation end-to-end is still a deployment-integration concern, not covered by the contract replay test. This is consistent with the project-wide "manual browser reload is the refresh mechanism" posture and is not in scope for this incident.

---

## Commitments and next steps

1. Update `docs/sdk-contract-testing-gap.md` status and answer its Open Questions section (Owner: Mary).
2. Reconcile `architecture.md:80–81` and `epics.md:117–118` wording; replace "enforced by process" downgrade with explicit automated-test reference + AG-UI upgrade-trigger hook (Owner: Winston).
3. Add `project-context.md` entry for recorded-session contract tests as the canonical pattern (Owner: Amelia).
4. Add witness test proving the CI typecheck gate rejects the original fabricated-fixture bug shape (Owner: Murat).
5. Implement three-count test-report classification for `apps/agent-be` (Owners: Murat for rules, Amelia for reporter).
6. Add Reflect-step reading-set extension (open concerns, planning artifacts, stale-retrospective keys) and the three new ledger observation classes (Owner: Amelia for `reflect-prompt.mjs`; gatekeeper rules via existing `apply-amendments.mjs`).
7. Schedule the SandboxService and `artifacts.service.ts` fidelity audit (Owner: Murat).
8. Review action items in next standup; track in `sprint-status.yaml` if/when an `incident-` retrospective key convention is added.

Per `CLAUDE.md`, changes to `_bmad-output` files are not auto-committed. All action items above are unstaged until owners pick them up.

---

## Housekeeping notes

- **Epic 3's `epic-3-retrospective` key in `sprint-status.yaml`** was `optional` at the time of this incident retro (2026-07-06). It was later set to `done`, and the full Epic 3 epic-completion retro artifact was reconstructed on 2026-07-15 at `_bmad-output/implementation-artifacts/epic-3-retro-2026-07-06.md`. This incident retrospective covers only the SDK fidelity incident that surfaced at Epic 3 closeout.
- **Predecessor retro continuity.** Epic 2 retro Action Item 3 ("Re-commit to Epic 1 retro action items 3 and 6") is partly addressed by Pipeline feedback loop item 1 (extending the Reflect reading set). Epic 2 retro Action Item 2 ("2-strike escalation rule for deferred findings") is generalized here from intra-epic deferrals to cross-epic open concerns — Action item 1.
- **Fidelity Auditor as a recurring instrument.** This incident validated the `bmad-agent-fidelity-auditor` skill (Vera) as a load-bearing quality instrument, not just a one-off. Action item 7 (audit other SDK-consuming code) suggests a standing practice of invoking the fidelity auditor at epic closeout for any code that consumes an external contract — a practice that should be added to the Epic-closeout checklist once Epic 3's full retro runs.

# Retrospective Wisdom

Process lessons about *how to develop* within BMAD — artifact flow, test discipline,
process choices that aged well or poorly. Project-agnostic; travels to fresh projects.
Read before planning the first epic. Lessons are context-bound: re-derive in each project,
don't import as rules.

## Adding entries

Append by **type**, not date. One entry per distinct lesson — recurrence appends to the
existing entry. Date and `Source:` every entry. Overturned entries are marked
`**Superseded YYYY-MM-DD**`, never deleted.

---

## 1. Process sequencing and artifact handoffs

When work should happen; what must flow between artifacts (research → PRD → architecture → epics → stories → tests).

<!--
### <title>

**Lesson (YYYY-MM-DD):** <positive instruction>
**What went wrong:** <failure or rework>
**Root cause:** <structural gap, not "we forgot">
**Source:** <epic/story/person>
**Recurrence:** <re-learned? when?>
-->

### Escaped bugs need a feedback loop back into the audit methodology

**Lesson (2026-07-07):** When a bug escapes the entire process (green tests, passing gate, production failure), feed it back as a new fingerprint for the fidelity audit and test-design knowledge base. A pipeline that learns per-story but not from post-gate escapes will repeat the same blind spots.

**What went wrong:** The self-improving pipeline learns per-story through reflection + amendments (journal, ledger, proposals). When a bug escaped the entire process — 873 tests green, gate PASS, production broken — there was no mechanism to record it as a methodology failure. The pipeline's reflection reads the journal; the journal records story-level outcomes, not post-gate escapes. The fidelity audit that had cleared the broken boundary was never re-triggered, and its clearance stood as the last word.

**Root cause:** The learning loop's boundary is the story. Escaped bugs cross that boundary — they are found in production, after the gate, outside the journal. No artifact records "the process failed here" in a form reflection can read. The fidelity audit is a point-in-time run, not a continuously updated fingerprint database that new failures feed back into.

**Source:** Epic 3 sandbox provisioning — production bug escaped 873 passing tests and a PASS gate; fidelity audit that cleared the boundary was not re-triggered.

**Recurrence:** Not yet re-evaluated.

---

## 2. Test and quality strategy

What to test, how, when; what reviews catch early vs. late; real APIs/sandboxes vs. mocks.

<!--
### <title>

**Lesson (YYYY-MM-DD):** <positive instruction>
**What went wrong (or right):** <failure or payoff>
**Why the existing approach missed it:** <what class of check was absent>
**Covers — and doesn't:** <name the boundary>
**Source:** <epic/story/person>
**Recurrence:** <resurfaced? held?>
-->

### Audit coverage bias: reviews clear what they don't deeply examine

**Lesson (2026-07-07):** For every external-contract boundary in a fidelity audit, explicitly answer: does the mock model failure modes and environmental preconditions — not just return shape and boundary placement? A forcing function, not reviewer discretion, must enforce this uniformly.

**What went wrong:** A test fidelity audit was run across the full project. Its methodology explicitly defined three gap types (untested consumer, fabricated shape, success-only mock) and described the exact failure mode: "a mock that always returns `{ exitCode: 0 }` ... the gap is in what the mock never does, not in what it does." The audit found 3 blockers on one SDK path — where a prior incident created recency bias — and cleared the other SDK boundary as "acceptable test design, not a fidelity gap," verifying shape and boundary but not applying its own behavioral analysis. The cleared boundary was where the production bug lived: the mock never modeled the environmental precondition (non-empty working directory) that the real command depended on.

**Why the existing approach missed it:** The audit had the right principles but no forcing function to apply them uniformly. It was thorough where prior incidents focused attention and lighter elsewhere. Shape-correct and boundary-correct mocks look correct at the surface; the behavioral gap is invisible without explicitly asking "what does the mock never do?" The methodology says this — the audit didn't enforce it for every boundary.

**Covers — and doesn't:** Covers the principle that success-only mocks are a fidelity gap even when shape and boundary are correct. Doesn't cover the enforcement gap — having the principle in the methodology and applying it to every boundary are different things. A checklist forcing function ("for each boundary: does the mock model failure modes? environmental states?") is what closes this. Without it, the audit's depth tracks recency bias, not risk.

**Source:** Epic 3 sandbox provisioning — `git clone` into non-empty working directory; 873 tests passing, production broken. Fidelity audit cleared the boundary (`test-fidelity-audit-2026-07-06.md`, C6 "verified clean").

**Recurrence:** Not yet re-evaluated.

---

## 3. Estimation, scope, and dependencies

Sizing, sequencing dependencies, managing scope; complexity assumptions that proved wrong.

<!--
### <title>

**Lesson (YYYY-MM-DD):** <positive instruction>
**What we assumed:** <the estimate/dependency/scope call>
**What happened:** <the outcome>
**Why wrong:** <missing info or flawed reasoning>
**Generalizes to:** <what class of future work>
**Source:** <epic/story/person>
**Recurrence:** <resurfaced? when?>
-->

---

## 4. Decisions and their trade-offs

Non-obvious, costly-to-reverse decisions. The reassessment is the most valuable part.

<!--
### <decision>

**Decided (YYYY-MM-DD):** <the decision>
**Alternatives rejected:** <what was on the table>
**Trade-off accepted:** <what was given up — name it explicitly>
**Reassessment (YYYY-MM-DD):** <did the trade age well? same call today?>
**Source:** <epic/person>
**Recurrence:** <re-evaluated? when?>
-->

---

## 5. Anti-patterns that tempted us

Traps that looked reasonable and weren't. The trap's shape is the most portable part.

<!--
### <anti-pattern>

**The temptation (YYYY-MM-DD):** <what it looked like, why it seemed reasonable>
**Why it fails:** <concrete failure mode>
**Trap's shape:** <what makes it tempting in general>
**What we did instead:** <alternative, if any>
**Source:** <epic/story/person>
**Recurrence:** <resurfaced? caught?>
-->

### "Mitigated by a plan" is not "mitigated"

**The temptation (2026-07-07):** A fidelity gap was identified (service fake replaces the contract consumer; real SDK shape drift, real timing, and real network failures are invisible). A mitigation was designed (a nightly real-service smoke tier). The mitigation was never built. But the NFR assessment recorded the gap as "mitigated" — because a plan existed in the handoff document. Each artifact in the chain treated the previous one's plan as evidence of completion. No artifact verified the mitigation existed in the codebase.

**Why it fails:** Tracking systems that collapse "designed" and "implemented" into a single "mitigated" status create false closure. The plan travels forward through documents (handoff → QA plan → NFR assessment), and each downstream document inherits the upstream plan as a resolved item without checking. The production bug lived in exactly the gap the unbuilt mitigation would have covered.

**Trap's shape:** A plan is concrete enough to feel like progress. The handoff document prescribes the mitigation in detail — test tier, cost, retry budget. That detail makes it feel real. But detail in a plan is not existence in the world. The trap is mistaking the richness of the design for evidence of the implementation. The richer the plan, the more convincing the false closure.

**What we did instead:** Re-opened the "mitigated" status. The gap should have read "open — mitigation designed, not implemented" until the nightly tier was built and running.

**Source:** Epic 3 — `bmad-easy-handoff.md` prescribed nightly smoke tier; `nfr-assessment-full-20260707.md` marked Finding 5 "mitigated"; no nightly tier exists in the codebase.

**Recurrence:** Not yet re-evaluated.

### Observability fix is not root-cause fix

**The temptation (2026-07-07):** A clone failure was silently swallowed (exit code not checked), producing a misleading downstream error (`fatal: not in a git directory`). A fix added the exit-code check, making clone's real error surface directly. The investigation concluded "the fix is correct and sufficient; no further code change required for the cause itself" — and predicted the user would now see clone's real error instead of the misleading one. That prediction was correct. But the investigation never asked *what that real error would be* or *why clone was failing*. It assumed auth/URL issues. The actual cause (non-empty working directory) was never considered as a failure mode.

**Why it fails:** A fix that makes a hidden error visible feels like a resolution — the symptom shifts from confusing to clear, and the clarity itself is satisfying. But the fix only changed the *message*; the *cause* was still unknown. The investigation concluded at "the error is now visible" instead of "the error is now diagnosed." The false closure blocked the actual fix: the user still hit the same broken clone, just with a better error message.

**Trap's shape:** Observability improvements are real progress — they convert a confusing symptom into a clear one. That progress is genuinely satisfying, which is exactly why it's a trap. The clarity of the new error message feels like understanding, but it's just better visibility. The investigation treated "the mechanism that hid the bug is fixed" as equivalent to "the bug is fixed." It fixed the *hiding*; it didn't fix the *bug*. Any fix that improves error visibility without diagnosing the now-visible error has this shape.

**What we did instead:** Re-investigated from the now-visible error, traced it to the environmental precondition (working directory not empty), and identified the root cause.

**Source:** Epic 3 sandbox provisioning — commit `d2919c2` (exitCode check); investigation concluded "no further code change required" (`fe-git-not-in-a-git-directory-investigation.md`); user still hitting the error post-fix.

**Recurrence:** Not yet re-evaluated.

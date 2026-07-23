# Chain Composition Guidelines

You are the planning agent. You run opencode on the devcontainer, and every planning
run you read this document alongside the per-run prompt, `graph.json`, and the backlog.
This is your "how to think about composing chains for this project" reference. It
carries the project-specific vocabulary (story, epic, phase, sprint, scope) and restates
the immutable graph rules in the language you reason in. The machinery enforces graph
shape; this document tells you what nodes to compose for a given unit of work.

The immutable rules below also appear in your prompt. The prompt is the contract; this
document gives those rules context and vocabulary so you reason in terms of them rather
than discovering them as fold-time rejections.

This project's trunk branch is `main`. Wherever a rule says `<trunkBranch>`, read `main`.

This document is seeded from the gen-2 playbook step sequence and the human's manual
post-scope flow. You never read `playbook.json` or any gen-2 file; the seed lives here,
authored fresh.

---

## 1. Chain composition principles

These are the immutable graph rules, restated in your vocabulary. The fold enforces them
mechanically; internalize them so you reason in terms of them rather than discovering
them as rejection errors.

- **A chain is a total order.** Every node modifies files, so two nodes in the same chain
  can never run concurrently on one shared branch — both would push to the same head.
  Within a chain, `dependsOn` is simply the previous node. The only branching in the graph
  is cross-chain, at merge points.
- **Every chain's final node carries `mergeTo: main`.** A final node without `mergeTo` is
  a planning error rejected at fold time. There is no chain-end special case in the
  dispatcher; "merge when marked" is the rule, and the final node must be marked.
- **Cross-chain `dependsOn` edges target merge-point nodes only.** A cross-chain edge may
  only land on a node carrying `mergeTo`. An edge to an unmarked node is rejected at fold
  time. This keeps "cross-chain dependencies gate on a merge" an invariant, not a
  convention.
- **The graph stays acyclic.** Never emit a `dependsOn` edge that closes a cycle.
- **A claimed node's spec is frozen; replanning touches only unclaimed nodes.** The
  claimed/unclaimed boundary in `graph.json` is the most load-bearing fact in your
  context — it is exactly what you may touch. Prefer additive changes near nodes likely
  to be claimed while you plan, and touch unclaimed nodes only. A parked node's pending
  answer can invalidate dependents you would otherwise extend a chain with; check parked
  state before extending.
- **Never compose past an information-producing node.** This is the single most important
  planning decision you make. An information-producing node is one whose artifact
  determines what the rest of the chain should be — `create-story` is the type case. You
  compose up to the next information-producing node, then stop. The next planning run
  composes the next segment once the artifact is readable at `origin/main`. See Decision
  rules — Lazy composition for the unambiguous statement.

---

## 2. Chain patterns

Templates for common chain shapes. Each pattern states: when it applies, what nodes it
gets, where the merge points are, where lazy composition cuts the chain, and what
metadata the nodes carry. These patterns are advice, not templates stamped blindly — you
adapt them per the unit of work's content. A unit whose substance is human-performed
setup gets no e2e-test node; a unit with no testable behavior gets no prepare-tests node.
The guidelines say when a step applies, not that it always does.

### 2a. Story chain

Seeded from the gen-2 playbook step sequence. Use when the backlog entry is a story.

**First segment — `create-story` only.**

- One node: `create-story`. This is the type case of an information-producing node — its
  artifact (the story spec) determines what the rest of the chain should be.
- Compose this one node and stop. Do not compose past it.
- `mergeTo` placement: if another chain depends on the story artifact (e.g. a chain
  implementing against the story's schemas and contracts), `create-story` carries
  `mergeTo: main` as a mid-chain merge point so the dependent chain can start. Otherwise
  it does not carry `mergeTo`, and the chain continues on the same branch after the
  artifact is produced. Either way, you do not compose past it.
- The next segment is composed in a later planning run, once the artifact is readable at
  `origin/main`.

**Second segment — composed after `create-story`'s artifact lands on `main`.**

Node sequence (in chain order):

1. `validate` (1st pass)
2. `prepare-tests`
3. `validate` (2nd pass)
4. `implement`
5. `unit-tests`
6. `e2e-tests`
7. `code-review`
8. `test-review`
9. `NFR-review`
10. `update-project-context`
11. `commit` (final node, carries `mergeTo: main`)

**Include/skip conditions per step.** Each step carries a condition stating when it
applies. These are empirical hypotheses, not immutable rules: empty-diff evidence in the
journal is what shows a condition is wrong. A verification node that finds nothing
produced information and stays; a generation node that finds nothing was waste and its
include condition tightens on the next replan.

- `prepare-tests`: skip if the story has no testable behavior. The falsifiable case is a
  story whose substance is human-performed setup — there is no automatable behavior to
  scaffold tests for. If the story describes code the system must execute, include it.
- `e2e-tests`: skip if the ATDD checklist deferred E2E coverage because no browser-level
  mock can simulate the acceptance criteria. You read the checklist from the
  `prepare-tests` artifact (on `main`) to decide. If the checklist did not defer, include
  it.
- `validate (2nd pass)`: skip if `prepare-tests` made no changes to the story spec — the
  story did not need updating after tests exist. If `prepare-tests` modified the spec,
  include the second pass.
- `review-nfrs`: include always. Even a story with no code changes may have NFR concerns;
  the NFR review determines whether there are findings, not whether the step runs.
- `update-project-context`: include always; the step may be a no-op. The include condition
  is "always include, the step itself decides whether to produce output" — skip is not a
  planner decision here.

**Within-chain review ordering:** `code-review` → `test-review` → `NFR-review`. All nodes
are assumed file-modifying, so ordering is chain position. This default order is advice;
you may deviate with a reason journaled in the node's prompt. If a review finds fundamental
issues that invalidate an earlier review's patches, you append a re-implementation node
and a re-review — that is a replan, not a different initial order.

**Metadata:** every node in a story chain carries `metadata.story` (the story identifier),
`metadata.epic`, `metadata.sprint`, and `metadata.scope` so reporting and display can
group them. The machinery never reads these fields.

### 2b. Scope-finalization chain

Seeded from the human's manual post-scope flow. Composed late, once the scope's work
chains have all merged. Use when a scope's work chains are done or nearly done and the
scope needs its finalization pass.

**Fan-in:** the first node's `dependsOn` fans in to every work chain's final merge-point
node. This is legal under the cross-chain-edges-target-merge-points invariant — every
work chain's final node carries `mergeTo: main`, so the finalization chain's first node
may depend on all of them. Finalization starts only after the scope's last work chain
merges. Compose this chain late, once those final nodes exist.

**Aggressive lazy composition.** This chain is full of information-producing nodes, so
lazy composition applies with force. The sequence unfolds across several planning
rounds by design. A planner that composes the whole finalization chain up front will
pre-plan a fix node for a trace that has not failed yet — do not do that.

Node sequence (each composed in its own planning round as the prior node's outcome lands):

1. `bmad-bug-hunt` (target: the scope). **Information-producing: yes.** Findings
   determine whether remediation nodes are appended in the next planning round. The
   fidelity audit stays folded into bug-hunt, not a separate node. Compose this node
   first; stop. After its findings land, compose the next.
2. `bmad-testarch-trace` (Create mode). **Information-producing: conditional.** A FAIL
   decision gets a fix node (`bmad-quick-dev` or `bmad-dev-story`) appended in the next
   planning round; a PASS continues to the next node. Compose this node after bug-hunt's
   findings land; stop. After trace's PASS/FAIL lands, compose the rest (or the fix
   node).
3. `bmad-testarch-nfr` (Create mode for the scope). **Information-producing: no.** It
   audits and applies fixes, but its findings do not determine the next node's existence.
4. `bmad-quick-dev` — prune `deferred-work.md` by checking each item against the current
   codebase and removing resolved ones. **Information-producing: conditional.** If a
   finding is not a stale deferral (the code has changed but the deferral is still
   relevant, or the deferral describes a problem that has worsened), the node parks with
   QUESTION — the standard path, not a separate node type. The rule: ask when a finding is
   not a stale deferral; otherwise, report that work is completed.
5. `bmad-retrospective` (target: the scope). **Information-producing: no.** Produces a
   repo artifact.
6. `bmad-testarch-test-design` (Edit mode — revise the project's test plan to fit current
   reality). **Information-producing: no.**
7. `bmad-agent-architect` — cleanup `project-context.md`: throw out redundant items,
   consolidate multiple items. **Information-producing: no.** This is the final node; it
   carries `mergeTo: main`.

**Where lazy composition cuts:** after node 1 (bug-hunt) and after node 2 (trace). The
planner composes bug-hunt first, then (after its findings land) composes trace, then
(after trace's FAIL/PASS lands) composes the rest. If trace FAILs, the next round composes
a fix node, then re-runs trace or continues per the fix's outcome.

**Metadata:** every node carries `metadata.scope` (the scope identifier) and
`metadata.scopePhase: "finalization"`.

### 2c. Early-phase doc chain

BMAD phases 1-2. Use when the project is in its early phases and the work is doc-writing,
not code. Each phase is a chain of doc-writing nodes. Every node modifies files
(markdown), so the total-order assumption holds. The merge cycle integrates without
tests — the post-merge hook is absent or a no-op for doc-only work.

Node sequence:

1. `bmad-brainstorming`
2. `bmad-prd`
3. `bmad-create-architecture`
4. `bmad-create-epics-and-stories`

**Information-producing nodes:** `bmad-prd` and `bmad-create-architecture` both produce
artifacts that determine downstream work, so lazy composition applies. Compose
brainstorming, stop. After its output lands, compose PRD, stop. After the PRD lands,
compose architecture, stop. After architecture lands, compose epics.

Sequential composition is fine: one chain or a sequence of chains. If you compose a
single chain, each information-producing node is a cut point — you compose up to it, then
stop, and the next planning round composes the next segment after its artifact lands on
`main`.

**Metadata:** every node carries `metadata.phase` (e.g. `"phase-1"`, `"phase-2"`).

---

## 3. Skill catalog

The atomic reference for every skill you may emit as a node. Each entry specifies the
`skill` field value, the `agent` field value, the skill's purpose, what it reads, what it
produces, a default deadline (ISO duration), and whether it is information-producing.

The `information-producing` field is the single most load-bearing catalog entry: it
drives the lazy-composition decision. `yes` means the skill's artifact determines what
the rest of the chain should be, and you must not compose past it. `conditional` means it
depends on the outcome (e.g. `bmad-testarch-trace` is information-producing on FAIL — a
fix node is appended — but not on PASS). `no` means you may compose past it freely.

Deadlines are defaults tuned empirically; you may override per node with a reason
journaled in the node's prompt.

| Skill | Agent | Purpose | Reads | Produces | Default deadline | Info-producing |
|---|---|---|---|---|---|---|
| `bmad-create-story` | planner | Create a comprehensive story spec file giving the dev agent everything needed for flawless implementation. | Epics, PRD, architecture, prior stories, codebase. | Story spec file with tasks, ACs, file list, dev context. | PT1H | yes |
| `bmad-testarch-atdd` | coder | Generate red-phase acceptance test scaffolds before implementation using the TDD red-green-refactor cycle. | Story spec, acceptance criteria, codebase. | Acceptance test scaffolds (red phase), ATDD checklist. | PT1H30M | yes |
| `bmad-dev-story` | coder | Execute story implementation following a context-filled story spec file. | Story spec, codebase, project conventions. | Implemented code, updated story file (tasks, file list, dev record). | PT2H | yes |
| `bmad-testarch-automate` | coder | Expand test automation coverage after implementation or analyze the codebase to generate a test suite. | Codebase, existing tests, story spec. | Expanded automated tests. | PT1H30M | no |
| `bmad-qa-generate-e2e-tests` | coder | Generate automated API and E2E tests for implemented code. | Implemented code, story spec, acceptance criteria. | E2E test suite, or a deferral note when no browser-level mock can simulate the ACs. | PT1H30M | conditional |
| `bmad-code-review` | reviewer | Review code changes adversarially using parallel review layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) with structured triage. | Diff under review, story spec, codebase. | Review findings, applied patches. | PT1H | no |
| `bmad-testarch-test-review` | reviewer | Review test quality using a comprehensive knowledge base and best-practices validation. | Test suite, codebase, story spec. | Test-quality findings, applied fixes. | PT1H | no |
| `bmad-testarch-nfr` | reviewer | Audit implemented non-functional requirement evidence (performance, security, reliability, maintainability) with evidence-based validation. | Implementation evidence, NFR specs, codebase. | NFR audit findings, applied fixes. | PT1H | no |
| `bmad-agent-tech-writer` | coder | Transform complex concepts into accessible, structured documentation; curate project knowledge. | Codebase, existing docs, project context. | Updated project-context docs, curated knowledge. | PT1H | no |
| `commit` | coder | Stage and commit changes with a well-formed Conventional Commits message. | Working tree, staged changes. | A git commit. | PT30M | no |
| `bmad-bug-hunt` | reviewer | Find bugs hidden by lack of exploration through a three-layer orchestrated sweep (Test Fidelity Audit, Edge Case Hunter, Code Review). | Target scope's merged code, tests, story specs. | Prioritized bug-hunt report with findings. | PT2H | yes |
| `bmad-testarch-trace` | reviewer | Generate a requirements-to-tests traceability matrix and make a quality gate decision (PASS / CONCERNS / FAIL / WAIVED). | Requirements/journeys, test suite, codebase. | Traceability matrix, quality gate decision. | PT1H30M | conditional |
| `bmad-quick-dev` | coder | Turn any intent, requirement, story, bug fix, or change request into a hardened, reviewable code artifact following the project's architecture and conventions. | Intent/spec, codebase, project conventions. | Working code artifact, or a QUESTION parked when a finding is not a stale deferral. | PT2H | conditional |
| `bmad-retrospective` | planner | Post-epic review to extract lessons and assess success. | Epic artifacts, journal, story outcomes. | Retrospective analysis repo artifact (insights, lessons, action items). | PT1H | no |
| `bmad-testarch-test-design` | planner | Produce an epic-level or system-level test plan grounded in risk and testability assessment. | PRD, architecture, epics, codebase. | Revised test plan / test strategy. | PT1H30M | no |
| `bmad-agent-architect` | planner | Turn product requirements and UX into technical architecture that ships; clean up project context. | PRD, architecture, project-context.md, codebase. | Cleaned-up `project-context.md`, architecture decisions. | PT1H | no |
| `bmad-brainstorming` | planner | Facilitate interactive brainstorming sessions using diverse creative techniques and ideation methods. | Problem statement, prior research, user input. | Brainstorming output (ideation session artifact). | PT1H30M | yes |
| `bmad-prd` | planner | Create, update, or validate a PRD scoped to the level and rigor appropriate to the user's needs. | Product brief, research, prior PRD, user input. | PRD document with frontmatter and decision log. | PT2H | yes |
| `bmad-create-architecture` | planner | Create architecture and solution design decisions through collaborative step-by-step discovery for AI agent consistency. | PRD, UX spec, codebase, prior decisions. | Architecture document with decisions. | PT2H | yes |
| `bmad-create-epics-and-stories` | planner | Break PRD requirements and architecture decisions into comprehensive stories organized by user value with complete acceptance criteria. | PRD, architecture, codebase. | Epics and stories list with acceptance criteria. | PT1H30M | yes |

**The catalog is not exhaustive.** You may emit a node for any skill or atomic CLI
command. Entries for skills not in the catalog default to `information-producing: no`
unless you have a reason to flag otherwise — journaled in the node's prompt.

---

## 4. Decision rules

The tricky calls. Each is stated as a rule with its rationale.

### Lazy composition

**Rule:** never compose past an information-producing node. Compose up to the next
information-producing node, then stop. The next planning run — triggered by the
ready-node frontier running low after the artifact lands on `main` — composes the next
segment.

**What "information-producing" means, unambiguously:** a node is information-producing
when its artifact determines what the rest of the chain should be. The catalog's
`information-producing` field is the authority. `yes` always cuts. `conditional` cuts
when the outcome that produces information is possible — if you cannot rule out the
information-producing outcome at compose time, treat it as a cut point and let the next
round compose the rest. `no` never cuts.

**Rationale:** composing a whole chain up front from the backlog entry alone plans
speculation, and depth-first claiming makes the mistake irreversible. The pass that
folds the artifact-producing node's completion claims the pre-planned successor in the
same pass, leaving no window for a replan to remove a node the artifact just revealed as
unnecessary. Lazy composition closes that gap with existing machinery — no successor
exists yet, so the ready-node frontier runs low and the standard expansion trigger fires
with the artifact now on `main`.

### Merge-point placement

**Rule:** mark `mergeTo: main` on a node only where a dependent chain exists to unlock.
If a replan drops the dependent, clear `mergeTo` on the unclaimed node.

**Rationale:** a mid-chain merge point inserts merge-queue latency between two chain
segments; mark one only where it buys something. The classic case: `create-story` merges
right away so another chain can start implementing against the artifact while this
chain's own implementation is still running. If no dependent chain exists, do not mark
the mid-chain node — let the chain continue on the same branch.

The final node of every chain always carries `mergeTo: main` regardless of dependents;
that is the total-order rule, not this decision.

### Review ordering

**Rule:** `code-review` → `test-review` → `NFR-review` (default). All nodes are assumed
file-modifying, so ordering is chain position. You may deviate with a reason journaled in
the node's prompt. If a review finds fundamental issues, append a re-implementation node
and a re-review — that is a replan, not a different initial order.

**Rationale:** code-review patches the implementation; test-review then validates the
tests against the patched code; NFR-review then audits the whole for non-functional
concerns. Reversing the order reviews against stale state.

### Conflict resolution — in-place vs rework

**Rule:** the common case is in-place resolution (rebase, resolve preserving both sides'
intent, push). Rework is when the conflict reveals semantic divergence — the merged
upstream invalidated this chain's approach, so resolving hunks would merge wrong code.
Choose per the conflict details: conflicted files, diffstat, fingerprint history from the
journal. When a resolution is heavy (a resolution commit that bypassed the chain's
review nodes), append a trailing review node after the resolution node.

**Rationale:** in-place preserves work and keeps the chain's review coverage intact.
Rework is reserved for the case where the conflict is not textual but semantic — the
upstream change made this chain's approach wrong, and resolving hunks would silently
merge incorrect code. Chains that keep conflicting should be serialized, not run
concurrently — read the journal's conflict fingerprints to detect this.

### Scope overlap

**Rule:** hold next-scope composition back when an in-flight trace or NFR audit whose
evidence next-scope merges would invalidate is running. Next-scope early work rarely
disturbs a scope audit, so overlap is otherwise safe. Decide per scope; this is guideline
adherence, not construction.

**Rationale:** finalization audits the scope's merged whole. Next-scope merges landing
mid-audit move the target the audit is measuring against. A trace or NFR audit produces
evidence tied to a specific merged state; a next-scope merge invalidates that evidence.
Early next-scope work (brainstorming, PRD drafting) touches different files and rarely
disturbs a code audit, so overlap is safe there.

### Scope selection

**Rule:** continue down the backlog in backlog order. When a scope's chains run out, the
ready-node frontier runs low and the standard expansion trigger fires; you continue down
the backlog. A human override ("skip to epic 7", "start the architecture phase") is a
replan instruction through the inbox — apply it, do not invent your own reordering.

**Backlog shape for this project:** epics files and sprint plan (the standard BMAD
backlog). Read the epics files and sprint plan to know what work exists, its declared
cross-chain dependencies, and the scope order that drives scope selection. Merge-point
placement needs lookahead: a merge point is added only where a dependent chain actually
exists to unlock, so you must see beyond the chain you are currently composing.

---

## 5. Node-spec schema

The concrete format you emit in `addNode` ops. Emit exactly these fields, with these
types. Required fields must be present on every node; optional fields are present only
when the rule they encode applies.

```
{
  "id":          <string, required — planner-authored, must be fresh — not colliding with any existing node id>
  "chainId":     <string, required — structural identifier the machinery reads — derived into branch name pipeline/<runId>/<chainId>>
  "skill":       <string, required — skill name from the catalog, or a CLI command>
  "agent":       <string, required — "planner" | "coder" | "reviewer" — which opencode agent runs the skill>
  "prompt":      <string, required — the prompt text passed to the skill; may carry step-specific instructions>
  "deadline":    <string, required — ISO duration, e.g. "PT2H" — from the catalog default or overridden with a reason in the prompt>
  "dependsOn":   <string[], required — node ids; within a chain: the previous node; cross-chain: a merge-point node. Empty array for a chain's first node.>
  "mergeTo":     <string, optional — "main" (this project's trunk branch); present only on merge-point nodes; absence means no merge at this node>
  "metadata":    <object, required — free-form, project-specific fields the machinery never reads: story, epic, sprint, phase, scope, scopePhase. May be empty {} but must be present.>
}
```

**Fields you must NOT emit** (the machinery derives them; emitting them is an error):
branch names, `runId`, `sandboxId`, `sessionId`, `status`, `attempts`, `baseCommit`.
Your only shared output is the graph delta; you write nothing else.

### Fold-time validation rules

These are stated as rules you will be held to. A delta that violates any of them is
rejected as a whole — no partial application.

- A chain's final node carries `mergeTo: main`.
- Cross-chain `dependsOn` edges target merge-point nodes only (nodes carrying `mergeTo`).
- The graph stays acyclic.
- Every chain remains a total order (a path) — within a chain, `dependsOn` is the previous
  node.

Emit the delta as the run's last act, even when empty. An empty delta is a valid output
when the planner has nothing to add — write the file.

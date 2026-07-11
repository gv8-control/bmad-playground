# Recommend Contract-Test Strategy

## What This Capability Does

When a fidelity gap is found, prescribes the leanest fix that makes the contract exercised by construction — not by intention, not by process, but by the structure of the test itself. The fix should make it impossible for the test to pass against a fabricated contract without the author noticing.

## What Success Looks Like

A recommendation that, if implemented, would have caught the bug class the audit found. The recommendation is specific to the code path and the gap type — not a generic "add more tests." It names the technique, the boundary where the test seam should sit, and why that boundary is correct.

The test of a good recommendation: would implementing it have caught the specific bugs that shipped? If yes, it's the right fix. If it would have passed green alongside the bugs, it's insufficient.

## Techniques (apply the leanest that closes the gap)

### Recorded-session replay fixture

Record one real session with the external contract — a real SDK call, a real API response, a real library output — and capture the raw output as a committed fixture (JSONL, JSON, whatever the contract's native format is). Replay the fixture through the real processing code in a unit test. Assert the downstream output matches expectations.

This is the highest-leverage technique because it exercises the real contract shape by construction — the fixture IS the real shape, captured from a real session. The test cannot pass against a fabricated contract because the fixture is the contract.

**When it applies:** the code consumes a streaming or message-based external contract where the shape is non-obvious and a real session can be captured once.

**What it catches:** processing regressions — the code breaking against a known-good contract output. A real recording has the correct shape; the test would have failed.

**What it doesn't catch:** contract changes in future SDK versions. The recording is a snapshot. Mitigation: re-record on every SDK version upgrade (the architecture's version-pinning discipline already gates upgrades).

### Deeper test seam

Move the test seam from the service boundary to the external-dependency boundary. Instead of replacing the entire service (including the contract-consuming code) with a fake, mock only the external dependency — the SDK's `query()` function, the API client, the library entry point — and let the real processing code run against the mock's output.

**When it applies:** the code has a clean separation between "consume external contract" and "process the result." The fake was placed at the service boundary, replacing both.

**The key question:** does the mock yield real-shaped objects? If the mock returns `as SDKMessage` fabricated objects, this is Gap B (fabricated-contract test), not a fix. The mock must yield objects whose shape matches the real SDK's actual type declarations — verified by reading the SDK types, not by assumption.

### Type-checked construction

Replace `as SDKMessage` type assertions with real construction. If the SDK exports a type, construct objects that satisfy the type without assertion. If the SDK exports a factory or builder, use it. If neither exists, construct the object literal and let the compiler check it — no `as`, no `as unknown as`, no `as never`.

**When it applies:** test fixtures construct external-contract objects by hand and use type assertions to silence the compiler. The assertions hide shape mismatches that the compiler would have caught.

**What it catches:** shape drift between the test fixture and the real type. If the SDK changes a field name or nesting, the compiler flags it at the fixture — not at runtime in production.

**What it doesn't catch:** the fixture being correct in shape but wrong in content (e.g. a `tool_result` block placed in an assistant-typed message when the real SDK puts it in a user-typed message). Shape-correct but semantically-wrong fixtures require the recorded-session approach.

### Failure-mode and environmental-state coverage

For each code path that consumes an external contract, enumerate: what does the real contract return when it fails? What preconditions must hold for it to succeed? What environmental state does it depend on? A success-only mock is Gap C regardless of how well-shaped it is — the fix is to model the contract's behaviors, not just its type.

**When it applies:** the mock is at the correct boundary and shape-correct, but only models the success path (Gap C). The real contract has failure modes or environmental dependencies the mock never represents.

This technique has two sub-approaches. Choose by a single decision criterion: **can the failure mode be faithfully modeled in a mock?**

#### Mock enrichment — when the failure modes are contract-internal

When the contract's failure modes are return-value variations the SDK or API can produce — non-zero exit codes, error response shapes, empty results, malformed-but-valid output — enrich the mock to return these. The mock already sits at the correct boundary; it just needs to exhibit more of the contract's behaviors.

**What it catches:** code that mishandles the contract's documented failure modes — unhandled non-zero exits, unchecked error fields, assumptions about always-populated responses.

**When it is sufficient:** the failure modes are enumerable from the contract's type declarations or documentation, and the code path's correctness depends only on how it processes the return value. No environmental preconditions are involved.

**When it is insufficient:** the contract's behavior depends on environmental state — filesystem contents, container image contents, network conditions, permissions, process state. A mock that models these is reimplementing the environment, and any reimplementation can be wrong in the same ways the original assumption was wrong. Mock enrichment reaches diminishing returns and becomes a fabrication of the environment, not a verification of the contract.

#### Gated live integration test — when the failure modes are environmental

When the contract's behavior depends on environmental state that cannot be faithfully modeled in a mock, no mock-based technique closes the gap. The only sufficient technique is a test that runs against the real external dependency — a gated live integration test, gated behind an environment flag (e.g. `RUN_LIVE_SANDBOX_TESTS=true`), excluded from the default CI run, and run manually or on a schedule.

**What it catches:** production failures that occur when the real environment doesn't match the mock's assumptions — non-empty working directories, missing permissions, container image state, network conditions, filesystem state. These are failures no mock can catch because the mock is the assumption being tested.

**Why this is not an escalation but a first-class technique:** by the Decision Principle below, the technique that exercises the real contract by construction is preferred over one that exercises a fabrication. A live integration test exercises the real contract and the real environment by construction — the test cannot pass without touching the real thing. Mock enrichment, even when enriched, still exercises a fabrication. When the failure mode is environmental, mock enrichment is insufficient by construction, not just by effort — the Decision Principle already prefers the live test.

**Trade-off:** highest maintenance cost of any technique — requires real credentials, real infrastructure, and ongoing upkeep. Excluded from default CI to avoid blocking on external dependencies. The cost is justified because no cheaper technique catches the bug class: environmental-state failures are invisible to every mock-based approach.

## Decision Principle

Prefer the technique that makes the contract exercised *by construction* — where the test cannot pass without touching the real contract — over techniques that rely on the author's diligence. A recorded-session fixture exercises the real contract by construction. A gated live integration test exercises the real contract and the real environment by construction. A "process-only checklist item enforced by review" exercises it by intention. The first two catch bugs; the third catches nothing if the reviewer forgets.

When choosing between mock enrichment and a gated live integration test for Gap C, apply this principle directly: if the failure mode is environmental (depends on real filesystem, container image, network, or process state), mock enrichment is insufficient by construction — it exercises a fabrication of the environment, not the environment. The live test is the preferred technique, not the escalation. Cost does not override this: an insufficient technique is insufficient at any cost.

If the architecture or epics already prescribe a safeguard (e.g. "validate against a recorded session replay"), the recommendation is to implement that prescription — not invent a new one. Quote the existing prescription and cite where it lives. The gap is often not a missing technique but an unimplemented one.

## Output

For each fidelity gap found in the audit, a recommendation block:

1. **Gap** — reference to the audit finding.
2. **Recommended technique** — one of the four above (or a justified alternative).
3. **Why this technique** — what bug class it catches, what it doesn't.
4. **Boundary** — where the test seam should sit and why that boundary is correct.
5. **Existing prescription** — if the architecture or epics already prescribe this, quote and cite it. The recommendation is "implement what's already prescribed," not "invent something new."
6. **Trade-off** — what this costs (fixture maintenance, re-recording on upgrades, test complexity) and why the cost is justified by the bug class it catches.

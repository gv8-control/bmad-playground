# Audit Test Fidelity

## What This Capability Does

Audits whether tests exercise the real external contract or a fabricated assumption. Given a story, diff, code area, or test file, identify every place where a test validates against an *assumed* contract rather than the *real* one — and produce an evidence-backed fidelity report with a clear verdict.

## What Success Looks Like

A report that a developer can act on immediately. Every finding cites `path:line`. Every claim about "the real contract" references the actual SDK type declaration, API schema, or architecture prescription. The report ends with one of two verdicts:

- **Fidelity confirmed** — the tests exercise the real contract. Any mocks or fakes are placed at the right boundary (the external dependency, not the code consuming it).
- **False confidence found** — specific tests pass against a fabricated contract. Each finding names: what the test assumes, what the real contract is, where the gap is, and what production bug class this would hide.

No finding without evidence. No vague "consider reviewing your tests" — either the test exercises the real contract or it doesn't.

## What to Look For

The failure class this agent catches: code consumes an external contract (SDK message stream, API response shape, library type), and tests validate the processing logic against a *fabricated* version of that contract — one the author assumed matched reality. The tests pass. The code is broken in production. The gap is invisible because nothing ever compared the fabricated shape to the real one.

Scan for the mechanical fingerprints of fabricated-contract testing:

- **Type-assertion bypasses** — `as SDKMessage`, `as unknown as SDKMessage`, `as never`, `as any` in test files. Each one silences the compiler where the real shape mismatch would have surfaced. Not every assertion is a problem (some are legitimate test scaffolding), but every assertion that casts a fabricated object to an external SDK type is a contract assumption that was never verified.
- **Mocks of external SDK packages** — `jest.doMock('@anthropic-ai/...')`, `jest.mock('...')`, `__mocks__/` directories for external packages. A mock replaces the real contract with the author's assumption of it. The question is always: does the mock's return shape match the real SDK's actual output shape?
- **Test fakes placed at the wrong boundary** — an `IAgentService` fake that replaces the *entire* service (including the SDK consumption and event-mapping code) rather than mocking only the SDK boundary. The fake emits the downstream events directly; the mapping code is never exercised. This is the most dangerous pattern because the fake is often praised as "well-designed" — it just tests the wrong layer.
- **Missing recorded-session replay fixtures** — where the architecture prescribes "validate against a recorded session replay" (check architecture.md and epics.md for this language), is there actually a recorded fixture? A prescription without a fixture is a safeguard that was never implemented.

For each candidate finding, verify against the real contract. Read the SDK's type declarations, the API's schema, or the architecture's prescription. Compare the test's assumed shape to the real shape. Only report findings where the gap is real.

## Approach

Start from the code that consumes an external contract, not from the test files. The question is: "does any test exercise this code path against the real contract?" Trace from the production code outward to the tests — not from the tests inward to the code. A test file that looks comprehensive but never instantiates the code under test is the most common finding.

Distinguish between two gaps that share the same root cause:

- **Gap A — untested contract consumer.** The code that consumes an external contract has zero test coverage. A test seam (fake, mock, interface) was placed at the service boundary, replacing the entire service including the contract-consuming code. The fake emits downstream events directly; the mapping code is never exercised.
- **Gap B — fabricated-contract test.** The contract-consuming code IS tested, but against a hand-rolled fixture whose shape doesn't match the real contract. The test passes because the fixture matches what the (possibly broken) code expects.

Both gaps are fidelity failures. Both produce green tests. Both hide production bugs. The report should name which gap each finding represents.

## Scope

This audit covers code that consumes an external contract — SDK message streams, API response shapes, library type contracts. It does not cover internal business logic tested with standard mocks (a `PrismaService` mock returning canned data is not a fidelity gap; a `@anthropic-ai/claude-agent-sdk` mock returning a fabricated `SDKMessage` shape is).

The distinction: internal mocks test your code's behavior against your own assumptions about your own interfaces. External-contract mocks test your code's behavior against your assumptions about *someone else's* contract. The second class can be wrong in ways the first cannot — you control your own interfaces, but the external SDK can change its output shape, and your assumption can be wrong from the start.

## Output

A structured fidelity report:

1. **Scope** — what was audited (files, code area, story).
2. **Contract consumers identified** — every code path that consumes an external contract, with `path:line`.
3. **Findings** — each finding names: the code path, the test (or absence of test), what the test assumes, what the real contract is, the gap, and the production bug class this would hide. Cited with `path:line`.
4. **Verdict** — fidelity confirmed, or false confidence found (with count of findings).
5. **Cross-references** — where the architecture or epics already prescribe a safeguard (e.g. recorded-session replay) that was not implemented. Quote the prescription and cite where it lives.

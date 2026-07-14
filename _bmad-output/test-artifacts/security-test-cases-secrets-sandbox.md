---
title: Security Test Cases — Secrets Handling in Daytona Sandbox
source: Party Mode roundtable (Amelia + Murat), 2026-07-11
status: draft
related_stories: [3.1, 4.5]
related_nfrs: [NFR-S1, NFR-S2]
related_architecture_section: Authentication & Security (items 4, 6)
---

# Security Test Cases — Secrets Handling in Daytona Sandbox

**Context:** Raised during Epic 4 planning. The Claude Code agent inside a Daytona sandbox accepts arbitrary user prompts (FR9/FR10). Two secrets are currently injected at `daytona.create()` time: `ANTHROPIC_API_KEY` (platform-level) and `GITHUB_TOKEN` (per-user). NFR-S1 mandates no platform-internal credentials in the sandbox.

**Decision (2026-07-11):** NFR-S1 is inviolable. `ANTHROPIC_API_KEY` must not be injected into the sandbox. The proxy-through-agent-be approach is the selected solution.

---

## Test Cases (Amelia)

| ID | Concern | Tag | Story | AC Exists? | Test Description | Status |
|---|---|---|---|---|---|---|
| SEC-001 | Egress to non-allow-listed host fails | [P0] | 3.1 | Existing | Assert that a sandbox with `networkAllowList` applied rejects egress to an arbitrary non-allow-listed host. Red-green in `SandboxServiceFake`; companion integration test against real Daytona. | Existing AC — keep |
| SEC-002 | `ANTHROPIC_API_KEY` absent from sandbox env | [P0] | 4.5 | New | Assert that `provision()` does not set `ANTHROPIC_API_KEY` in the sandbox environment. Verify the proxy-through-agent-be path is used instead (`ANTHROPIC_BASE_URL` points at agent-be, key never enters sandbox). | New — required by NFR-S1 decision |
| SEC-003 | Sandbox env contains only expected vars | [P0] | 4.5 | New | Positive enumeration test: sandbox env contains exactly the expected set (`GITHUB_TOKEN`, `ANTHROPIC_BASE_URL`, git config vars). Any addition is a deliberate, reviewed change that fails this test until updated. | New |
| SEC-004 | `GITHUB_TOKEN` scope limited to intended repos | [P0] | 1.3 | New | Verify token is scoped (repo-scoped OAuth from sign-in). Test the scope assertion at credential-store time, not just at injection. Assert token has `repo` scope and no admin scopes. | New |
| SEC-005 | Egress allowlist can't be bypassed via allowed hosts as exfiltration channels | [P1] | 3.1 | New | Hard to test deterministically — acknowledge as residual risk in NFR evidence. Document that allowed hosts (GitHub, Anthropic API, registries) are exfiltration channels by design; the allowlist blocks unsanctioned destinations, not sanctioned-destination abuse. | New — residual risk documentation |

---

## Complementary Test Cases (Murat)

| ID | Concern | Tag | Story | Test Description | Status |
|---|---|---|---|---|---|
| SEC-006 | Egress allow-list enforcement (real sandbox) | [P0-integration] | 3.1 | Run negative egress test against a real Daytona sandbox in integration pipeline. Must exercise a real egress attempt, not a config-assertion mock. `SandboxServiceFake` version is unit coverage only; insufficient for security assurance. | New |
| SEC-007 | Egress allow-list config correctness (fake) | [P0] | 3.1 | Assert `networkAllowList` contains exactly GitHub + Anthropic API + required package registries, nothing else. | New |
| SEC-008 | KEK never logged | [P0] | 4.5 | Verify `CREDENTIAL_ENCRYPTION_KEK` value never appears in any agent-be log output path. Log-hygiene integration test that greps agent-be output for kek-like patterns. | New |
| SEC-009 | Sandbox env injection only contains expected keys | [P0] | 4.5 | Assert no unintended secrets leak into sandbox env: `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEK`, `DAYTONA_API_KEY`, `AUTH_SECRET`, `AUTH_GITHUB_SECRET` must never appear in sandbox env vars. Overlaps with SEC-003. | New |
| SEC-010 | `SandboxServiceFake` failure injection — no secret in error path | [P0] | 3.1 | When `daytona.create()` fails mid-injection, the error path does not surface `ANTHROPIC_API_KEY` or `GITHUB_TOKEN` in the response payload or logs. Use `SandboxServiceFake`'s `failNextProvision()` to test. | New |

---

## Notes

- SEC-002 and SEC-003 are directly downstream of the NFR-S1 decision: `ANTHROPIC_API_KEY` must not enter the sandbox. The proxy-through-agent-be approach replaces direct injection.
- SEC-005 is a documented residual risk, not a testable pass/fail. It should be referenced in NFR evidence as an acknowledged gap.
- SEC-006 (real-sandbox integration test) is the single highest-value negative test in the platform per Murat's assessment.
- SEC-009 overlaps with SEC-003; they should be consolidated during implementation.

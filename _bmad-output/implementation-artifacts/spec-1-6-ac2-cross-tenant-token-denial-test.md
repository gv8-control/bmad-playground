---
title: '1.6-AC2: Cross-tenant token resolution denial test'
type: 'bugfix'
created: '2026-07-02'
status: 'done'
route: 'one-shot'
---

# 1.6-AC2: Cross-tenant token resolution denial test

## Intent

**Problem:** The Epic 1 traceability report flagged 1.6-AC2 (P0) as PARTIAL — the positive path proved the correct user's token resolves, but no test attempted cross-tenant access and asserted denial, leaving the AC's core security guarantee ("tokens never resolved across users") untested.

**Approach:** Add a negative-path test to `credential-health.test.ts` that seeds a credential for userB, proves userB can resolve their own token (positive control), then calls `resolveOAuthToken(userA)` and asserts it throws `CredentialFailureError` rather than returning userB's token — confirming the tenant-scoped query cannot reach another user's credential row.

## Suggested Review Order

**Test fixtures**

- Second user + credential fixture enabling cross-tenant negative-path coverage
  [`credential-health.test.ts:56`](../../apps/web/src/lib/credential-health.test.ts#L56)

**Cross-tenant denial test (the core change)**

- Positive control proves userB's token is reachable for its owner — so the denial is genuine, not an empty-store artifact
  [`credential-health.test.ts:124`](../../apps/web/src/lib/credential-health.test.ts#L124)

- Negative path: userA's resolution throws; decryptToken only ever called for userB, never under userA's context
  [`credential-health.test.ts:128`](../../apps/web/src/lib/credential-health.test.ts#L128)

- Load-bearing scoping assertion — catches a `where: {}` regression (mutation-verified)
  [`credential-health.test.ts:134`](../../apps/web/src/lib/credential-health.test.ts#L134)

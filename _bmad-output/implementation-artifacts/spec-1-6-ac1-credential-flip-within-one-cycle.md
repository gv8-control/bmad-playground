---
title: '1.6-AC1: Credential health flip within one operation cycle'
type: 'feature'
created: '2026-07-02'
status: 'done'
route: 'one-shot'
baseline_commit: '498d454a114e8b30a45c571e0d184935bb43fd47'
---

# 1.6-AC1: Credential health flip within one operation cycle

## Intent

**Problem:** The traceability report (`traceability-matrix-epic-1.md`) flagged 1.6-AC1 as P0 PARTIAL: existing tests only assert `markCredentialFailed` was *called* via `toHaveBeenCalledWith(...)`, but never verify the credential health status actually *flipped* to `'failed'` before the action returned — the "within one operation cycle" timing property (NFR-R1) is untested.

**Approach:** Add an integration test in `repo-connection.actions.spec.ts` that wires `markCredentialFailed` and `getCredentialHealth` through shared state, triggers the 401 path via `connectRepository`, then immediately queries `getCredentialHealth` and asserts `'failed'`. A `setImmediate` macrotask inside the `markCredentialFailed` mock makes the flip genuinely async, so the test proves the action `await`s the flip — a fire-and-forget would leave health `'healthy'`.

## Suggested Review Order

**Test mechanism — shared-state wiring + setImmediate timing**

- Why `setImmediate` makes the flip genuinely async so the test discriminates awaited vs fire-and-forget
  [`repo-connection.actions.spec.ts:603`](../../apps/web/src/actions/repo-connection.actions.spec.ts#L603)

- `getCredentialHealth` mock must read eagerly (no `await` before read) for macrotask timing to work
  [`repo-connection.actions.spec.ts:613`](../../apps/web/src/actions/repo-connection.actions.spec.ts#L613)

- `afterAll` resets mock implementations so the `setImmediate` impl doesn't leak into other describes
  [`repo-connection.actions.spec.ts:623`](../../apps/web/src/actions/repo-connection.actions.spec.ts#L623)

**Test cases — both 401 trigger paths**

- GitHub API 401 → `await markCredentialFailed` → health is `'failed'` immediately after action returns
  [`repo-connection.actions.spec.ts:628`](../../apps/web/src/actions/repo-connection.actions.spec.ts#L628)

- `resolveOAuthToken` throws `CredentialFailureError(401)` → same flip, second call site (line 75 in production)
  [`repo-connection.actions.spec.ts:638`](../../apps/web/src/actions/repo-connection.actions.spec.ts#L638)

**Production code under test — the two `await markCredentialFailed` call sites**

- GitHub API 401 path: `await markCredentialFailed(session.userId, capturedAt)` before returning `NO_CREDENTIAL`
  [`repo-connection.actions.ts:106`](../../apps/web/src/actions/repo-connection.actions.ts#L106)

- `resolveOAuthToken` catch path: `await markCredentialFailed(...).catch(...)` — swallows errors but still awaited
  [`repo-connection.actions.ts:75`](../../apps/web/src/actions/repo-connection.actions.ts#L75)

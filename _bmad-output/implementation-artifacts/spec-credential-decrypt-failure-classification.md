---
title: 'Reclassify decrypt failures as CredentialFailureError'
type: 'bugfix'
created: '2026-07-04'
status: 'done'
route: 'one-shot'
---

# Reclassify decrypt failures as CredentialFailureError

## Intent

**Problem:** A React error surfaced in the browser tracing to `crypto.ts:97` — a GCM auth-tag verification failure. Investigation (`_bmad-output/implementation-artifacts/investigations/legacy-oauth-credential-aad-mismatch-investigation.md`) confirmed the immediate cause was a stale local credential row (fixed by DB cleanup + re-auth), but also found that `resolveOAuthToken` let any `decryptToken` failure propagate raw, so all three callers (`connectRepository`, `syncArtifactsAction`, `validateRepository`) misclassified it as generic `UNKNOWN` instead of the actionable `NO_CREDENTIAL` re-auth prompt they already have for this exact situation.

**Approach:** `resolveOAuthToken` now catches `decryptToken` failures and reclassifies them as `CredentialFailureError(401)` (with `cause` preserved), so all three existing callers route to their existing `NO_CREDENTIAL` branch with no changes needed there. Adversarial review caught that this blanket catch would also swallow a KEK misconfiguration (env var missing/malformed) — an ops problem, not a per-user credential problem — and misreport it the same way while writing `credentialHealth: 'failed'` for every user. Fixed by adding a distinct `KekConfigurationError` in `crypto.ts` (thrown from `parseKekHex`) that `resolveOAuthToken` re-throws as-is instead of reclassifying.

## Suggested Review Order

**Error classification split (ops vs. per-user credential failure)**

- Entry point — the catch block that separates KEK config errors (rethrown raw) from genuine decrypt failures (reclassified to `CredentialFailureError`).
  [`credential-health.ts:35-44`](../../apps/web/src/lib/credential-health.ts#L35-L44)

- New `KekConfigurationError` class, thrown by `parseKekHex` instead of a generic `Error` — gives the catch block above something to distinguish on.
  [`crypto.ts:10`](../../apps/web/src/lib/crypto.ts#L10)

- `CredentialFailureError` now accepts an optional `cause`, so the original decrypt error survives into any exception telemetry instead of being discarded.
  [`credential-health.ts:6-11`](../../apps/web/src/lib/credential-health.ts#L6-L11)

**Test coverage locking in the split**

- Decrypt failure → `CredentialFailureError(401)` with `cause` set to the original error.
  [`credential-health.test.ts:103`](../../apps/web/src/lib/credential-health.test.ts#L103)

- `KekConfigurationError` → re-thrown as-is, not reclassified.
  [`credential-health.test.ts:132`](../../apps/web/src/lib/credential-health.test.ts#L132)

- `findUnique` (DB) failure → propagates as-is, proving the `try` doesn't over-reach into the credential lookup.
  [`credential-health.test.ts:142`](../../apps/web/src/lib/credential-health.test.ts#L142)

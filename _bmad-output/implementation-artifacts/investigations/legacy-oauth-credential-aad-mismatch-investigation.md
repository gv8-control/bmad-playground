# Investigation: Legacy OAuth credential fails GCM auth-tag check in `unwrapDek`

## Hand-off Brief

1. **What happened.** The local dev database holds one `oauth_credentials` row (`user_id cmr2h0hc1000346qhfcwv4fpa`) created 2026-07-01 — before migration `20260702000000_backlog_hardening_aad_kekid_constraints` added AAD binding to `crypto.ts`. Decrypting it now fails GCM authentication at `apps/web/src/lib/crypto.ts:97`, throws out of `resolveOAuthToken`, is caught in `syncArtifactsAction` (`apps/web/src/actions/artifacts.actions.ts:69`), logged via `console.error`, and surfaces in the browser via Next.js dev-mode server-log forwarding — the "1 react issue" Marius saw.
2. **Where the case stands.** Root cause Confirmed, High confidence. This is a documented, approved breaking change (see migration comment) — not a code defect in the crypto path itself.
3. **What's needed next.** Operational fix: clear the stale credential and re-authenticate (see Reproduction Plan). Separately, a real UX gap exists — the failure is classified as generic `UNKNOWN` instead of a `CredentialFailureError`, so the user gets "unexpected error, try again" instead of an actionable re-auth prompt.

## Case Info

| Field            | Value                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Ticket           | N/A — reported ad hoc via browser dev overlay                                             |
| Date opened      | 2026-07-03                                                                                 |
| Status           | Concluded                                                                                  |
| System           | Local dev, apps/web (Next.js 16 App Router), Postgres via Prisma, Node crypto (AES-256-GCM) |
| Evidence sources | Source code (`crypto.ts`, `credential-health.ts`, 3 Server Action files), live Postgres query, migration SQL + its comments, `deferred-work.md` |

## Problem Statement

Marius reported one React issue in the browser dev overlay:

> Unsupported state or unable to authenticate data
> `src/lib/crypto.ts:97`

No further symptom detail was given. Initial hypothesis (mine, not the user's): a GCM authentication-tag verification failure in `unwrapDek`, caused by a KEK mismatch, AAD mismatch, corrupted stored ciphertext, or a rotation issue — needed to trace which.

## Evidence Inventory

| Source                                             | Status    | Notes                                                                                          |
| --------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/crypto.ts`                       | Available | Stronghold — exact throw site (line 97, `dekDecipher.final()` in `unwrapDek`).                  |
| Call sites of `resolveOAuthToken`/`decryptToken`    | Available | Exactly 3: `repo-connection.actions.ts:70`, `artifacts.actions.ts:58`, `repository-validation.actions.ts:61`. All three wrap the call in try/catch. |
| Live Postgres (`oauth_credentials` table)          | Available | Queried directly; 1 row, `kek_id = 'legacy-pre-aad-rewrap'`, `created_at 2026-07-01T19:30:41Z`.  |
| Migration `20260702000000_..._aad_kekid_constraints/migration.sql` | Available | Comment explicitly documents the breaking change and the sentinel's purpose.                     |
| `_bmad-output/implementation-artifacts/deferred-work.md:29` | Available | Pre-existing, already-tracked note: decrypt failure in `connectRepository` surfaces as `UNKNOWN`, untested. |
| Browser-side confirmation that this was dev-overlay log forwarding (vs. an actual crash) | Missing   | Not directly observed — Deduced from code (no call site lets the error escape uncaught). Would be confirmed by reproducing locally and watching the Next.js terminal vs. browser overlay simultaneously. |

## Timeline of Events

| Time                     | Event                                                                                      | Source                                                                 | Confidence |
| ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| 2026-07-01T19:30:41Z     | `oauth_credentials` row created for user `cmr2h0hc1000346qhfcwv4fpa` — encrypted without AAD | DB `created_at` column                                                | Confirmed  |
| 2026-07-02T00:00:00Z     | Migration adds AAD binding to `crypto.ts` + backfills existing rows with sentinel `kek_id`   | `migration.sql:6-11`                                                   | Confirmed  |
| 2026-07-03 (report time) | Marius opens FE; first-visit sync (`project-map` or `artifacts` page) triggers `syncArtifactsAction` → `resolveOAuthToken` → decrypt attempt on the pre-AAD row → GCM auth failure | `artifacts/page.tsx:51-52`, `project-map/page.tsx:51-52`, `crypto.ts:97` | Deduced    |

## Confirmed Findings

### Finding 1: Throw site is a GCM auth-tag verification failure

**Evidence:** `apps/web/src/lib/crypto.ts:94-97` — `unwrapDek` calls `dekDecipher.setAAD(toAad(userId))` (line 95) then `dekDecipher.final()` (line 97). Node's OpenSSL binding throws exactly `"Unsupported state or unable to authenticate data"` when the computed tag doesn't match — caused by wrong key, wrong/missing AAD, or corrupted ciphertext/nonce/tag.

**Detail:** This is the only place in the codebase this exact error string can originate.

### Finding 2: The stored credential predates AAD binding

**Evidence:** Live query against `oauth_credentials`: `{"userId":"cmr2h0hc1000346qhfcwv4fpa","kekId":"legacy-pre-aad-rewrap","createdAt":"2026-07-01T19:30:41.505Z"}`.

**Detail:** `kek_id` is not a real `computeKekId()` fingerprint (16 hex chars of `sha256(kek)`) — it's the literal sentinel string from the migration's `DEFAULT 'legacy-pre-aad-rewrap'`.

### Finding 3: The sentinel is a deliberate, documented, approved breaking change

**Evidence:** `libs/database-schemas/src/prisma/migrations/20260702000000_backlog_hardening_aad_kekid_constraints/migration.sql:6-10`:
> "Existing rows predate the AAD-binding change in apps/web/src/lib/crypto.ts and are no longer decryptable regardless (approved breaking change — affected users must re-authenticate). They are backfilled with a sentinel that will not match any real KEK fingerprint, so scripts/rotate-kek.ts correctly reports them as FAILED ... rather than silently mis-rotating them."

**Detail:** This isn't a code bug in `crypto.ts` — it's expected fallout from an approved security hardening (Story 1.9 deferred scope), scoped in the migration itself.

### Finding 4: All three call sites catch generically, none crash to a React error boundary

**Evidence:** `repo-connection.actions.ts:69-83`, `artifacts.actions.ts:57-74`, `repository-validation.actions.ts:60-77` — each wraps `resolveOAuthToken` in try/catch; the crypto error (not `instanceof CredentialFailureError`) falls to the generic branch: `console.error(...)` + return `{ error: 'An unexpected error occurred...', errorCode: 'UNKNOWN' }`.

**Detail:** No path exists for this error to reach the browser as an actual uncaught exception/crash.

## Deduced Conclusions

### Deduction 1: The "react issue" is dev-overlay log forwarding of a caught, handled error — not a crash

**Based on:** Finding 1, Finding 4, and the sync-on-first-visit pattern (`artifacts/page.tsx:51-52`, `project-map/page.tsx:51-52`) that calls `syncArtifactsAction()` whenever the page loads with an empty `Artifact` table.

**Reasoning:** Marius "opened FE in the browser" → one of the two sync-on-first-visit pages ran → `syncArtifactsAction` called `resolveOAuthToken` → hit the pre-AAD row → threw at `crypto.ts:97` → caught at `artifacts.actions.ts:69` → `console.error` logged the original `Error` (whose stack still points at `crypto.ts:97`) → Next.js dev mode forwards server console output to the browser, which the dev overlay counts as "1 issue."

**Conclusion:** The app itself degraded gracefully — the page would have rendered `<CredentialErrorBanner />` (via `credentialFailed = true`) or a generic sync error, not a blank/crashed screen. The alarming-looking browser message is a side effect of log forwarding, not an application crash.

## Hypothesized Paths

### Hypothesis 1: KEK env var drifted between encrypt and decrypt time

**Status:** Refuted

**Theory:** `CREDENTIAL_ENCRYPTION_KEK` changed in `.env` after the credential was stored, causing the wrap key itself to mismatch.

**Would confirm:** Stored `kek_id` would be a real 16-hex-char `sha256` fingerprint that doesn't match `computeKekId(currentKek)`.

**Would refute:** Stored `kek_id` is a non-fingerprint sentinel value instead.

**Resolution:** Refuted — `kek_id` is the literal string `legacy-pre-aad-rewrap`, not a mismatched real fingerprint (Finding 2). The KEK itself was never rotated; the row predates AAD binding entirely.

## Missing Evidence

| Gap                                                                 | Impact                                                              | How to Obtain                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Direct browser/terminal observation confirming dev-overlay log forwarding (Deduction 1) is truly what Marius saw, vs. some other rendering path | Would upgrade Deduction 1 from Deduced to Confirmed                  | Reproduce locally: hit `/project-map` or `/artifacts` fresh, watch both the terminal (`yarn nx serve web`) and browser dev overlay simultaneously |

## Source Code Trace

| Element       | Detail                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Error origin  | `apps/web/src/lib/crypto.ts:97` — `dekDecipher.final()` inside `unwrapDek`                                                  |
| Trigger       | `syncArtifactsAction()` sync-on-first-visit, called from `artifacts/page.tsx:52` or `project-map/page.tsx:52` when the local `Artifact` table is empty |
| Condition     | The single `oauth_credentials` row was encrypted before AAD binding was added; every decrypt attempt now sets AAD and fails the tag check |
| Related files | `apps/web/src/lib/credential-health.ts:23-31` (`resolveOAuthToken`/`decryptToken`), `apps/web/src/actions/artifacts.actions.ts:56-74`, migration `20260702000000_backlog_hardening_aad_kekid_constraints/migration.sql` |

## Conclusion

**Confidence:** High

Confirmed: the throw is a GCM auth-tag failure on a single pre-AAD-migration `oauth_credentials` row, which the migration itself documents as an approved, intentionally-irreversible breaking change requiring re-authentication. Confirmed: no call site lets this error crash the React tree — it's caught and converted to a typed `UNKNOWN` result in all three Server Actions. Deduced (not directly observed): the "1 react issue" is Next.js dev-mode forwarding of the resulting `console.error` to the browser overlay, since that's the only mechanism consistent with an error that both (a) references `crypto.ts:97` and (b) doesn't crash anything.

## Recommended Next Steps

### Fix direction

Two independent things, don't conflate them:

1. **Local data fix (not a code change).** Delete the stale row so re-authentication produces a fresh, correctly-encrypted credential:
   `DELETE FROM oauth_credentials WHERE user_id = 'cmr2h0hc1000346qhfcwv4fpa';` — then sign out and sign back in via GitHub OAuth. This is expected/intended per the migration's design, not a regression to fix in code.
2. **Real, scoped code gap (optional, separate from the above).** `syncArtifactsAction`, `connectRepository`, and `validateRepository` all treat a decrypt failure as generic `UNKNOWN` rather than `CredentialFailureError`. Per the migration's own stated intent ("affected users must re-authenticate"), this specific failure mode should route to the same `NO_CREDENTIAL` / re-auth messaging as an expired token — right now the user gets a dead-end "unexpected error, try again" instead of a path forward. This is a widening of the already-tracked gap at `deferred-work.md:29` (which only mentions `connectRepository`) to all three call sites.

### Diagnostic

None needed — root cause is Confirmed with direct DB evidence.

## Reproduction Plan

1. Confirm the stale row: query `oauth_credentials` for `kek_id = 'legacy-pre-aad-rewrap'` (already done — 1 row).
2. Visit `/project-map` or `/artifacts` with the `Artifact` table empty → observe `syncArtifactsAction` fail and (per Deduction 1) the dev overlay flag "1 issue" referencing `crypto.ts:97`, while the page itself shows a generic sync-error state, not a crash.
3. Apply the local data fix (delete the row, re-authenticate) → re-visit the same page → sync succeeds, no dev-overlay issue.

## Side Findings

- `deferred-work.md:29` already tracks part of item 2 above (scoped to `connectRepository` only) — worth expanding to cover `artifacts.actions.ts` and `repository-validation.actions.ts` too, since the same generic-catch pattern repeats in all three.

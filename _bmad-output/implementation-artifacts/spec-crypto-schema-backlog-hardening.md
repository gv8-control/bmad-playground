---
title: 'Crypto/schema backlog hardening (AAD binding, kekId, unused columns, constraints)'
type: 'chore'
created: '2026-07-02'
status: 'in-progress'
context: []
baseline_commit: '659258e935c455c031eb2264be1cbcb26edbbaa9'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Post-Epic-1 review surfaced six approved backlog gaps in the credential envelope-encryption and schema surface: unused User columns, a ciphertext-transplant vulnerability (no AAD binding), trial-decryption-based KEK identification in rotation, three minor crypto hardening gaps, an app-only-validated enum column, and an unverified email uniqueness constraint.

**Approach:** Bundle all schema changes into one migration; add userId-bound AAD to the envelope encryption (breaking change — pre-AAD rows require re-auth); add a `kekId` fingerprint column so rotation matches KEKs deterministically instead of by trial-decryption; apply small crypto hardening fixes; add a DB-level CHECK constraint; add `@unique` to `User.email` (pre-verified: 0 duplicates, 2 rows, in the live `bmad_easy_test` DB).

## Boundaries & Constraints

**Always:** Bind AAD to `userId` on both GCM layers (DEK-wrap and token-encryption) in encrypt and decrypt. Zero DEK buffers after use. Validate nonce length before decode-driven use. Preserve rotate-kek.ts's existing safety properties (per-row optimistic update guard, idempotent re-run, dry-run mode, fail-closed on unmatched KEK). One new migration only. Only touch the single encryptToken/decryptToken call-site lines (plus auth.ts's upsert data block for the new kekId field) in auth.ts and credential-health.ts — no other logic changes there.

**Ask First:** N/A — pre-approved by the requester; email-uniqueness duplicate check already completed (0 duplicates found).

**Never:** Do not add a new env var for kekId (must be a deterministic fingerprint of the existing KEK). Do not modify auth.ts/credential-health.ts logic beyond the specified lines. Do not run git commit/push. Do not start a Playwright dev server or run the full test suite.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Decrypt cross-user ciphertext | Ciphertext encrypted under AAD=userA, decrypted with AAD=userB | Throws GCM auth-tag error | Caller (resolveOAuthToken) propagates; repo-connection/repository-validation actions catch generically and return user-facing "unexpected error" (already verified, no code change) |
| Decrypt pre-AAD-format ciphertext | Ciphertext created before this change (no AAD was ever set) | Throws GCM auth-tag error | Same as above — intentional breaking change, user must re-authenticate |
| Rotate with correct old KEK | Row's stored `kekId` equals `computeKekId(oldKek)` | Row selected for rotation, re-wrapped, `kekId` updated to new fingerprint | N/A |
| Rotate re-run (idempotent) | Row's stored `kekId` already equals `computeKekId(newKek)` | Row reported `skipped` | N/A |
| Rotate with row under neither KEK | Row's `kekId` matches neither old nor new fingerprint | Reported `failed` — user must re-authenticate | Fail closed, no write |
| Malformed nonce | `dekNonce`/`tokenNonce` decodes to != 12 bytes | Throws clear application Error | Not a native OpenSSL error |
| Undersized encryptedDek | `encryptedDek` decodes to < 48 bytes (32-byte DEK + 16-byte tag) | Throws "Malformed encryptedDek" | Guard now catches 16-47 byte range too |
| credential_health CHECK constraint | Attempt to write a value other than 'healthy'/'failed' via raw SQL | Postgres rejects with constraint violation | DB-level defense in depth |

</frozen-after-approval>

## Code Map

- `libs/database-schemas/src/prisma/schema.prisma` -- drop `active`/`lastActiveAt`, add `OAuthCredential.kekId`, add `User.email @unique`
- `libs/database-schemas/src/prisma/migrations/<new>/migration.sql` -- one bundled migration: drop columns, add kekId column, add CHECK constraint, add unique index
- `apps/web/src/lib/crypto.ts` -- AAD binding (userId) on wrapDek/unwrapDek/rewrapDek/encryptToken/decryptToken; `computeKekId` helper; DEK buffer zeroing; nonce-length validation; fixed encryptedDek size guard
- `apps/web/src/lib/crypto.test.ts` -- new test(s) for AAD cross-user/pre-AAD failure; existing tests updated for new signatures
- `scripts/rotate-kek.ts` -- select/classify rows by stored `kekId` fingerprint instead of trial-decryption; pass userId as AAD to unwrapDek/rewrapDek
- `docs/runbooks/kek-rotation.md` -- update only if rotation output/semantics wording changes
- `apps/web/src/lib/auth.ts` -- single call-site line: `encryptToken(account.access_token, user.id)`, plus persist `kekId` in the upsert's create/update data
- `apps/web/src/lib/credential-health.ts` -- single call-site line: `decryptToken(credential, userId)`

## Tasks & Acceptance

**Execution:**
- [ ] `schema.prisma` -- drop `active`/`lastActiveAt` from User; add `kekId` to OAuthCredential; add `@unique` to `User.email` -- approved cleanup + hardening
- [ ] `migrations/<timestamp>_.../migration.sql` -- hand-authored bundled migration -- matches existing raw-SQL/naming conventions
- [ ] `crypto.ts` -- add userId param + setAAD calls to all five functions; add `computeKekId`; zero DEK buffers in `finally`; validate nonce length; fix size guard -- closes ciphertext-transplant vuln + hardening
- [ ] `crypto.test.ts` -- add cross-user/pre-AAD auth-tag-failure test; update existing tests for new signatures -- proves fail-closed behavior
- [ ] `rotate-kek.ts` -- replace trial-decryption classification with `kekId` fingerprint comparison; pass userId AAD through -- Story 1.9 deferred scope, now approved
- [ ] `kek-rotation.md` -- update wording only if script output changes
- [ ] `auth.ts` -- update single call site + upsert data block for kekId
- [ ] `credential-health.ts` -- update single call site

**Acceptance Criteria:**
- Given a ciphertext encrypted under one userId's AAD, when decrypted with a different userId, then it throws a GCM auth-tag error (not silent success/garbage)
- Given `rotate-kek.ts dry-run`, when rows are classified, then classification uses stored `kekId` not trial-decryption, and safety properties (dry-run no writes, idempotent skip, fail-closed) still hold
- Given the new migration, when applied, then `active`/`lastActiveAt` columns are gone, `kek_id` column exists, `credential_health` has a CHECK constraint, and `email` has a unique index (only if pre-verified duplicate-free — confirmed)
- Given `yarn nx test web --testPathPattern=crypto`, when run, then all tests pass
- Given `yarn nx run database-schemas:build` (or equivalent), when run, then the Prisma client generates cleanly

## Design Notes

AAD is `Buffer.from(userId, 'utf8')`, applied identically to both the DEK-wrap and token-encryption GCM layers — binds the entire envelope to the owning row without introducing a second secret. `computeKekId` = first 16 hex chars of `sha256(kek)` — non-reversible, deterministic, no new operational config.

## Verification

**Commands:**
- `yarn nx test web --testPathPattern=crypto` -- expected: all crypto.test.ts tests pass
- `yarn nx run database-schemas:build` -- expected: Prisma client generates with no errors

---
baseline_commit: 659258e935c455c031eb2264be1cbcb26edbbaa9
---

# Story 1.9: Document and Validate the KEK Rotation Runbook

Status: done

## Story

As the platform operator,
I want a documented, validated procedure for rotating the platform's KEK,
so that a future key rotation can be performed correctly under pressure, without improvising against production credentials.

## Acceptance Criteria

### AC-1: Runbook documents the exact rotation steps

**Given** the KEK stored as an environment variable (per architecture)
**When** the rotation runbook is authored
**Then** it documents the exact steps to introduce a new KEK, re-wrap existing per-user DEKs under it, and retire the old KEK, without any plaintext OAuth token ever being exposed during the process

### AC-2: Rotation procedure is validated against a non-production environment

**Given** the authored runbook
**When** it is validated
**Then** the rotation procedure is executed at least once against a non-production environment, and every previously-encrypted token remains decryptable after rotation completes

### AC-3: Runbook is committed to the repository

**Given** the runbook is complete and validated
**When** it is delivered
**Then** it is committed to the repository at `docs/runbooks/kek-rotation.md` rather than living only as institutional knowledge

## Tasks / Subtasks

- [x] Task 1: Add DEK unwrap/re-wrap helpers to the crypto module (AC: 1, 2)
  - [x] 1.1 In `apps/web/src/lib/crypto.ts`, add `unwrapDek(credential: Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce'>, kek: Buffer): Buffer` — unwraps `encryptedDek` (AES-256-GCM, auth tag is the last 16 bytes of the base64-decoded value, nonce from `dekNonce`) and returns the DEK bytes. Then add `rewrapDek(credential: Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce'>, oldKek: Buffer, newKek: Buffer)` — built ON `unwrapDek`, re-wraps the same DEK bytes with the new KEK using a FRESH random 12-byte nonce, and returns `{ encryptedDek, dekNonce }`. The narrowed `Pick` parameter makes it structurally impossible for these helpers to receive token fields; the DEK plaintext exists only transiently in memory and no OAuth token plaintext is ever produced
  - [x] 1.2 Export a `parseKekHex(value, label)` helper (64-char hex → 32-byte Buffer) reusing the validation rule in `getKek()` so the rotation script rejects malformed keys with a clear message before touching any row
  - [x] 1.3 Unit tests in `apps/web/src/lib/crypto.test.ts`: round-trip (set `process.env.CREDENTIAL_ENCRYPTION_KEK` to KEK-A and `encryptToken()`, then `rewrapDek` A→B, then reassign the env var to KEK-B and `decryptToken()` returns the original plaintext — the existing tests already set this env var in `beforeEach`, follow that style), fresh-nonce assertion (`dekNonce` changes, `encryptedToken`/`tokenNonce` unchanged), wrong-old-KEK rejection (auth tag failure throws), malformed-input rejection (too-short `encryptedDek`)

- [x] Task 2: Create the rotation script (AC: 1, 2)
  - [x] 2.1 Create `scripts/rotate-kek.ts` runnable via `yarn dotenv -e .env -- ts-node --transpile-only scripts/rotate-kek.ts <command>`. Import `unwrapDek`/`rewrapDek`/`parseKekHex` from `../apps/web/src/lib/crypto` (relative import — the module only depends on Node's built-in `crypto`; verified working under ts-node). CRITICAL: import `PrismaClient` via the RELATIVE path `../libs/database-schemas/src/index` — the `@bmad-easy/database-schemas` alias is a tsconfig `paths` entry that does NOT resolve at runtime under `ts-node --transpile-only` (no yarn workspaces, no package.json in the lib; verified failing). Construct the client the same way `apps/web/src/lib/prisma.ts` does (`@prisma/adapter-pg` + `DATABASE_URL`; both resolvable from a root script — verified)
  - [x] 2.2 Inputs: `CREDENTIAL_ENCRYPTION_KEK_OLD` and `CREDENTIAL_ENCRYPTION_KEK_NEW` env vars (both 64-char hex, validated before any DB access; refuse to run if they are equal)
  - [x] 2.3 Commands: `dry-run` (unwrap every row's DEK with the old KEK, report per-row status, write nothing), `rotate` (re-wrap and update `encrypted_dek` + `dek_nonce` per row), `verify` (unwrap every row's DEK with the NEW KEK, write nothing)
  - [x] 2.4 Idempotent re-run: for each row, if unwrap with the old KEK fails, try the new KEK — if that succeeds the row is already rotated and is counted as `skipped (already rotated)`; if both fail the row is counted as `failed` and highlighted with its `userId`. The script continues past failures and exits non-zero if any row failed
  - [x] 2.5 Output: a summary table (total / rotated / skipped / failed) and per-row failures only. Never print DEK bytes, KEK values, or token fields — not even truncated
  - [x] 2.6 Per-row updates use `updateMany({ where: { id, encryptedDek: <value read> } })` so a row changed concurrently (e.g. a sign-in re-encrypting the credential mid-rotation) is not clobbered; report such rows as `retry needed` and exit non-zero so the operator re-runs the script

- [x] Task 3: Author the runbook (AC: 1, 3)
  - [x] 3.1 Create `docs/runbooks/kek-rotation.md` with: purpose, scope (what the KEK protects — per-user DEKs wrapping GitHub OAuth tokens in `oauth_credentials`), prerequisites (DB backup, `DATABASE_URL`, ts-node available, both KEK values at hand), and the invariant that no plaintext OAuth token is ever decrypted during rotation (only DEKs are transiently unwrapped in memory)
  - [x] 3.2 Step-by-step procedure: (1) generate the new KEK with `openssl rand -hex 32`; (2) snapshot/backup the `oauth_credentials` table; (3) run `dry-run` and require 100% unwrap success before proceeding; (4) run `rotate`; (5) re-run `rotate` until 0 `retry needed` rows (sign-ins during rotation keep writing under the old KEK because the app still points at it); (6) run `verify` and require 100% success; (7) flip `CREDENTIAL_ENCRYPTION_KEK` to the new value in the hosting platform's env settings and redeploy/restart; (8) smoke-test sign-in and repository connect; (9) retire the old KEK — remove `CREDENTIAL_ENCRYPTION_KEK_OLD` everywhere and delete stored copies per the team's secret-handling practice
  - [x] 3.3 Rollback section: before the env-var flip, rollback = re-run rotation with old/new swapped (or restore the table snapshot); after the flip, rollback additionally requires flipping the env var back. State explicitly which artifacts must both exist for tokens to be readable (row state and env var must refer to the same KEK)
  - [x] 3.4 Failure modes table: rows failing under both KEKs (credential encrypted under an unknown KEK — user must re-authenticate), partial rotation interrupted mid-run (safe: per-row updates; re-run is idempotent), script aborted between `rotate` and env-var flip (app keeps working — old KEK still in env — but DB rows are under the new KEK: tokens unreadable until flip; flip promptly or roll back)
  - [x] 3.5 Environment note: the encrypting/decrypting code lives in `apps/web` (`apps/web/src/lib/crypto.ts`), so `CREDENTIAL_ENCRYPTION_KEK` must be rotated in the environment where `apps/web` runs (Vercel per architecture; local `.env` for development). The architecture doc's "Railway env var" wording predates the MVP decision to keep crypto in `apps/web` — the runbook documents where the variable actually lives today and notes the post-MVP KMS migration intent

- [x] Task 4: Validate the rotation against a non-production environment (AC: 2)
  - [x] 4.1 Using the local devcontainer Postgres (`bmad-playground-postgres-1`, a non-production environment) with a scratch database or the dev database: seed at least 3 parent `User` rows first (`OAuthCredential.userId` is a required foreign key to `users.id`; `User` requires unique `githubId` and `githubLogin`), then 3 `oauth_credentials` rows with SYNTHETIC tokens encrypted via `encryptToken()` under KEK-A (never use real tokens)
  - [x] 4.2 Execute the full runbook procedure end-to-end: dry-run → rotate → verify with KEK-A → KEK-B
  - [x] 4.3 Prove AC-2's decryptability claim: after rotation, `decryptToken()` under KEK-B must return the exact original synthetic plaintexts (decrypting synthetic tokens in the validation harness is acceptable; the production procedure itself never decrypts tokens)
  - [x] 4.4 Also validate the idempotent re-run path (run `rotate` twice; second run reports all rows `skipped (already rotated)`) and the both-KEKs-fail path (one row seeded under an unrelated KEK-C is reported `failed` with its `userId`, exit code non-zero)
  - [x] 4.5 Record the validation evidence (date, environment, row counts, command outputs with secrets absent) in a "Validation record" section of the runbook and in this story's Completion Notes

- [x] Task 5: Wire up a convenience entry point and docs cross-links (AC: 3)
  - [x] 5.1 Add `"rotate-kek": "dotenv -e .env -- ts-node --transpile-only scripts/rotate-kek.ts"` to root `package.json` scripts
  - [x] 5.2 Reference the runbook from `.env.example` next to `CREDENTIAL_ENCRYPTION_KEK` (one comment line: rotation procedure → `docs/runbooks/kek-rotation.md`)

## Dev Notes

### Architecture Context

- NFR-S4: OAuth tokens AES-256-GCM encrypted at rest, never returned to the client. Envelope scheme: per-user DEK encrypts the token; the platform KEK wraps each DEK. KEK is an environment variable for MVP; post-MVP it migrates to a third-party KMS. The KEK rotation runbook is an explicit Epic 1 deliverable (architecture.md lines 246, 254, 289; epics.md line 212).
- GCM nonce-uniqueness is an enforced invariant (epic-1 context "every encryption operation uses a fresh, verifiably-unique GCM nonce") — the re-wrap MUST generate a fresh `dekNonce`; reusing the old nonce with the new key is a security defect the review stage should treat as blocking.
- The whole value of envelope encryption is exactly this story: rotation touches only the small `encryptedDek` values, never the token ciphertexts, so no plaintext OAuth token is exposed.

### Current Implementation Reality (read before coding)

- `apps/web/src/lib/crypto.ts` — the ONLY encryption implementation in the codebase today (there is no `apps/agent-be` encryption service yet). `getKek()` reads `CREDENTIAL_ENCRYPTION_KEK`, requires `/^[0-9a-f]{64}$/i`. Wire format: base64(`ciphertext ‖ 16-byte GCM tag`) for both `encryptedDek` and `encryptedToken`; 12-byte nonces stored separately base64-encoded (`dekNonce`, `tokenNonce`).
- `libs/database-schemas/src/prisma/schema.prisma` — `OAuthCredential` model: `id` (cuid), `userId` (unique), `encryptedDek`, `dekNonce`, `encryptedToken`, `tokenNonce`, timestamps; table `oauth_credentials`.
- `apps/web/src/lib/prisma.ts` — client construction pattern (`PrismaClient` from `@bmad-easy/database-schemas` + `PrismaPg` adapter + `DATABASE_URL`).
- Writers of `oauth_credentials`: the OAuth sign-in flow (Story 1.2/1.3 code) upserts credentials via `encryptToken()` — this is why the runbook's re-run-until-clean step exists.
- Root devDeps already include `ts-node`, `dotenv-cli`. `scripts/` currently holds shell scripts only. Local Postgres runs in the devcontainer (`bmad-playground-postgres-1`, port 5432; `DATABASE_URL` in `.env`).

### Security Requirements

- Never log or print: KEK values, DEK bytes, token plaintext/ciphertext, nonces. Log only row ids/user ids, counts, and statuses.
- The script must not accept KEKs as CLI arguments (they would land in shell history and `ps` output) — env vars only.
- Validation seeding must use synthetic tokens (e.g. `synthetic-token-<n>`), never real GitHub tokens.
- Constant-time comparison is NOT needed anywhere here (no secret comparison against attacker-controlled input); GCM auth tags already authenticate the unwrap.

### What NOT to do

- Do NOT decrypt `encryptedToken` anywhere in the rotation path (`rewrapDek` must not even receive the token fields' plaintext meaning). The only place tokens are decrypted is the validation harness's final equality check on synthetic data.
- Do NOT re-encrypt tokens with new DEKs — rotation re-wraps existing DEKs only. Generating new DEKs would work but needlessly rewrites token ciphertexts; keep the change surface minimal.
- Do NOT add a KMS abstraction, key-versioning column, or multi-KEK read path. Post-MVP KMS migration is out of scope (architecture Deferred Decisions). The env-var-swap procedure is the MVP mechanism.
- Do NOT modify `encryptToken`/`decryptToken` signatures — Story 1.2–1.6 code depends on them.
- Do NOT touch `RepoConnection.credentialHealth` from the script — rotation is invisible to credential-health semantics.

### Testing Requirements

- Unit tests (jest, `apps/web` project, co-located `crypto.test.ts`): rewrap round-trip, fresh-nonce, wrong-KEK auth failure, malformed input. Follow the existing test style in `crypto.test.ts` (it already covers encrypt/decrypt round-trips and tamper detection).
- The rotation script's DB iteration logic is validated by the non-production execution (Task 4) rather than by mocking Prisma in jest — the script is operational tooling; the runbook execution IS its acceptance test. Keep the script thin: all crypto behavior lives in the unit-tested `unwrapDek`/`rewrapDek` — the script must not reimplement any unwrap/wrap logic.
- E2E (Playwright) coverage: not applicable — no UI surface. State this explicitly in the story completion notes so the automate/E2E stages don't invent UI tests.

### Previous Story Intelligence

- Story 1.4 review (2026-07-02) moved validation internals out of a `'use server'` module because every export of such a module becomes a public endpoint. `crypto.ts` is a plain lib module (safe), and the rotation script is Node tooling — make sure nothing from this story lands in a `'use server'` file.
- Story 1.6 established `CredentialFailureError` and `markCredentialFailed` semantics; rotation must not interact with them (see What NOT to do).
- Established conventions: kebab-case non-component files, co-located tests, Conventional Commits (`docs` type for BMAD artifacts; this story's code+runbook commit should use `feat` or `docs(runbooks)` for the runbook file — prefer one commit for script+helper+tests and one for the runbook, or a single `feat` commit; keep subject line only).
- Lint baseline: 0 errors, 11 pre-existing warnings (measured 2026-07-02) — do not add new warnings.

### Git Intelligence

- Recent commits: `659258e feat: 1.8 progress & 1.4 repo load fix`, `dff560e fix(onboarding): detect BMAD skills packaged as directories with SKILL.md`. Working tree carries uncommitted Story 1.4 review fixes (`apps/web/src/lib/repository-validation.ts` is new, plus edits to the validation actions/specs and shared types) AND uncommitted Story 1.8 review fixes (`AppShell.tsx`, `SideNavigation.tsx`, `sheet.test.tsx`, `app-shell.spec.ts`) — do not revert or absorb any of them into this story's changes.
- `package.json` scripts follow plain yarn/dotenv patterns (`test:e2e`, `develop-story`) — `rotate-kek` should match that style.

### Project Structure Notes

- New files: `scripts/rotate-kek.ts`, `docs/runbooks/kek-rotation.md` (new `runbooks/` folder under existing `docs/`), plus optional `scripts/tsconfig.json`.
- Updated files: `apps/web/src/lib/crypto.ts` (add `rewrapDek`, `parseKekHex`), `apps/web/src/lib/crypto.test.ts`, root `package.json` (one script line), `.env.example` (one comment line).
- No changes to: Prisma schema, shared-types, any Server Action, any UI component, CI config.

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 1.9 (lines 427–445), Epic 1 additional requirements (line 212)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` — NFR-S4 (line 58), envelope encryption + KEK rotation (lines 246, 254, 289), deferred KMS migration (line 266)
- Epic context: `_bmad-output/implementation-artifacts/epic-1-context.md` — OAuth token encryption decision
- Implementation: `apps/web/src/lib/crypto.ts`, `apps/web/src/lib/prisma.ts`, `libs/database-schemas/src/prisma/schema.prisma`

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- TDD red phase confirmed before implementation: 6 failing tests (missing `unwrapDek`/`rewrapDek`), then green: 19/19 crypto tests pass.
- `prisma db push` (Prisma 7) requires running from `libs/database-schemas/` where `prisma.config.ts` provides `datasource.url`; `--skip-generate` no longer exists.
- `yarn rotate-kek` (dotenv + ts-node from repo root) compiles and runs `scripts/rotate-kek.ts` with its relative imports as-is — no extra tsconfig needed, exactly as the story's validated wiring prescribed.

### Completion Notes List

- Task 1: Added `parseKekHex`, `unwrapDek`, `rewrapDek` to `apps/web/src/lib/crypto.ts`; refactored `getKek`/`encryptToken`/`decryptToken` onto the shared `parseKekHex`/`wrapDek`/`unwrapDek` primitives (no signature changes; all pre-existing Story 1.3 tests untouched and green). The `Pick<EncryptedCredential, 'encryptedDek' | 'dekNonce'>` parameter makes it structurally impossible for rotation helpers to receive token fields.
- Task 1.3: 10 new unit tests (6 unwrap/rewrap + 4 parseKekHex) written red-first via the ATDD scaffolds, all pass un-skipped. Round-trip, DEK-byte preservation, fresh-nonce, wrong-KEK auth failure, malformed input, double-rotation chain, and KEK input validation covered.
- Task 2: `scripts/rotate-kek.ts` with `dry-run`/`rotate`/`verify` commands; KEKs from env vars only (refuses equal old/new); idempotent re-run (`skipped (already rotated)`); both-KEKs-fail rows highlighted with `userId` and non-zero exit; optimistic per-row `updateMany({ where: { id, encryptedDek } })` guard reporting `retry needed`; output contains counts and row ids only — no key material, DEK bytes, or token fields.
- Task 3: `docs/runbooks/kek-rotation.md` — scope, no-plaintext-token invariant, KEK location (Vercel/`.env`; architecture's "Railway" wording noted as predating the apps/web crypto decision), 9-step procedure, rollback rules keyed to the row-state/env-var agreement invariant, failure modes table, validation record.
- Task 4: Full procedure executed against a non-production environment (devcontainer Postgres, scratch DB `bmad_easy_kek_validation`): dry-run 3 ok → rotate 3 rotated → re-run 3 skipped (idempotence) → verify 3 ok → decrypt check under the new KEK returned all 3 original synthetic plaintexts (AC-2). Failure path demonstrated with a 4th credential under an unrelated KEK (reported failed, exit 1, healthy rows unaffected). Evidence recorded in the runbook's Validation record. Scratch DB dropped afterwards.
- Task 5: `yarn rotate-kek` script added to root `package.json`; `.env.example` cross-links the runbook next to `CREDENTIAL_ENCRYPTION_KEK`.
- E2E (Playwright) coverage: not applicable — no UI surface (per story Dev Notes and ATDD checklist).
- Gates: 289 web tests + 1 shared-types test pass, lint 0 errors (11 pre-existing warnings, none added), `tsc --noEmit` clean for apps/web.

### File List

**New files:**
- `scripts/rotate-kek.ts` — KEK rotation script (dry-run / rotate / verify)
- `docs/runbooks/kek-rotation.md` — the rotation runbook (AC-1, AC-3) with validation record (AC-2)

**Updated files:**
- `apps/web/src/lib/crypto.ts` — added `parseKekHex`, `unwrapDek`, `rewrapDek`; internal `wrapDek` shared with `encryptToken`
- `apps/web/src/lib/crypto.test.ts` — 12 new Story 1.9 tests (ATDD scaffolds activated + review gap-fills)
- `package.json` — added `rotate-kek` script
- `.env.example` — runbook cross-link comment

### Review Findings

Adversarial code review (Blind Hunter) plus self-conducted edge-case, acceptance, test-quality, and NFR passes (the four subagent reviewers were unavailable — account session limit; work done inline with full context). The crypto helpers were confirmed sound (fresh GCM nonces on re-wrap, correct auth-tag handling, type-narrowed params keep token fields out of the rotation path, CAS-guarded per-row updates). Findings were operational; patches applied and re-validated against a live non-production DB.

- [x] [Review][Patch] Script could silently run against the wrong DB (dev `.env`) then a prod KEK flip bricks tokens — now prints `Target database: <host>/<db>` and row count before any read/write; runbook sets `DATABASE_URL` explicitly and requires confirming that line [scripts/rotate-kek.ts, docs/runbooks/kek-rotation.md]
- [x] [Review][Patch] `verify` conflated "not yet rotated" with "unrecoverable" — old KEK is now optional for `verify`; a straggler still under the old KEK is reported `RETRY NEEDED`, not `FAILED` [scripts/rotate-kek.ts]
- [x] [Review][Patch] Runbook commands wrote both KEKs into shell history (contradicting its own rule) — rewritten to load secrets via `read -rs` (no echo, no history) [docs/runbooks/kek-rotation.md]
- [x] [Review][Patch] Procedure never re-ran rotate/verify after the env flip, stranding mid-window sign-ins before destroying the old KEK — added a final convergence pass (step 8) before retiring the old KEK [docs/runbooks/kek-rotation.md]
- [x] [Review][Patch] Rollback-by-backup would corrupt data if followed literally (`--data-only` restore over a non-empty table) — swapped re-rotation is now the primary rollback; backup restore documents `TRUNCATE` first, out-of-repo storage, `PGPASSWORD`, and deletion after [docs/runbooks/kek-rotation.md]
- [x] [Review][Patch] Regression found during re-validation: making `newKek` null for `dry-run` broke its already-rotated detection (rotated rows misreported as `failed`) — restored both-KEK requirement for `dry-run`; re-validated `dry-run` over rotated rows reports `skipped (already rotated)` [scripts/rotate-kek.ts]
- [x] [Review][Patch] Idempotency/classification had no unit test — added a test asserting a rotated DEK fails under the old KEK and succeeds under the new (the script's classification primitive); plus a tampered-`dekNonce` auth-failure test [apps/web/src/lib/crypto.test.ts]
- [x] [Review][Defer] No AAD binds ciphertext to the owning user — credentials are transplantable between rows by anyone with DB write access. Genuine hardening but a change to the encrypt/decrypt scheme affecting all stored Story 1.3 credentials (needs migration); out of this story's scope [apps/web/src/lib/crypto.ts] — deferred
- [x] [Review][Defer] No `kekId` version column — key identity is trial-decryption. The story explicitly excluded key-versioning ("Do NOT add … a key-versioning column"); revisit with the post-MVP KMS migration [scripts/rotate-kek.ts] — deferred, out of scope by story decision
- [x] [Review][Defer] `findMany` loads the whole table with no batching; DEK buffers not zeroed after use; `retryNeeded` and `failed` share exit code 1 — all low-severity, acceptable at MVP scale [scripts/rotate-kek.ts] — deferred
- [x] [Review][Dismiss] `N8N_RESTRICT_FILE_ACCESS_TO=""` / `N8N_ENCRYPTION_KEY` in `.env.example` and the `@radix-ui/react-dialog` dependency flagged as "smuggled in" — these are pre-existing uncommitted working-tree changes (n8n config; Story 1.8), not part of this story; surfaced only because the review diff was `git diff HEAD`

## Change Log

- 2026-07-02: Implemented Story 1.9 — DEK unwrap/re-wrap crypto helpers (TDD red-green via ATDD scaffolds), `scripts/rotate-kek.ts` rotation tooling, `docs/runbooks/kek-rotation.md` runbook, and end-to-end validation of the rotation procedure against a non-production database with recorded evidence. Status → review.
- 2026-07-02: Applied code-review findings — target-DB confirmation + row count in the script, `verify` straggler reclassification, `read -rs` secret handling and a post-flip convergence pass in the runbook, safe backup-restore, and a fixed `dry-run` already-rotated detection (caught during re-validation). 2 unit tests added (12 total for 1.9). Full procedure re-validated against a live non-production DB; evidence refreshed in the runbook. 291 web tests pass, lint/tsc clean.

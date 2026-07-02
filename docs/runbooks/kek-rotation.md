# Runbook: KEK Rotation

Rotates the platform KEK (`CREDENTIAL_ENCRYPTION_KEK`) that wraps every per-user DEK in the `oauth_credentials` table. After rotation, every previously-encrypted GitHub OAuth token remains decryptable — under the new KEK.

## Scope: what the KEK protects

Envelope encryption (NFR-S4, `apps/web/src/lib/crypto.ts`):

- Each user's GitHub OAuth token is encrypted with a per-user **DEK** (AES-256-GCM) → `oauth_credentials.encrypted_token` + `token_nonce`.
- Each DEK is wrapped by the platform **KEK** (AES-256-GCM) → `oauth_credentials.encrypted_dek` + `dek_nonce`.
- The KEK is the environment variable `CREDENTIAL_ENCRYPTION_KEK` (64-char hex, 32 bytes).

Rotation re-wraps only the DEKs. Token ciphertexts are never touched.

## The invariant

**No plaintext OAuth token is ever decrypted during rotation.** The rotation path (`unwrapDek`/`rewrapDek` in `apps/web/src/lib/crypto.ts`) cannot even receive the token fields — its parameter type accepts only `encryptedDek` and `dekNonce`. DEK bytes exist transiently in script memory and are never logged. Every re-wrap uses a fresh GCM nonce (nonce-uniqueness invariant).

## Where the KEK lives

The encrypting/decrypting code runs in `apps/web`, so `CREDENTIAL_ENCRYPTION_KEK` must be rotated wherever `apps/web` runs:

- **Production:** Vercel project environment settings (the architecture doc's "Railway env var" wording predates the MVP decision to keep crypto in `apps/web`; post-MVP the KEK migrates to a third-party KMS — see architecture Deferred Decisions).
- **Development:** the repo-root `.env`.

## Prerequisites

- Both KEK values at hand: the current (old) KEK and a newly generated one.
- The connection string for the **target** database.
- A backup/snapshot capability for the `oauth_credentials` table.
- Repo checked out with dependencies installed (`yarn install`); the script runs via `ts-node` (already a dev dependency).
- The rotation script accepts KEKs from **environment variables only** — never pass them as CLI arguments (shell history, process listings). The steps below load them with `read -rs`, which does not echo and does not enter shell history.

## Set up the session (do this once)

Load the secrets into the current shell without echoing them or writing them to history. Run each `read` and paste the value:

```bash
read -rs CREDENTIAL_ENCRYPTION_KEK_OLD && export CREDENTIAL_ENCRYPTION_KEK_OLD
read -rs CREDENTIAL_ENCRYPTION_KEK_NEW && export CREDENTIAL_ENCRYPTION_KEK_NEW
read -rs DATABASE_URL                  && export DATABASE_URL
```

Set `DATABASE_URL` **explicitly** to the target database — do not rely on the repo `.env`. Every `yarn rotate-kek` command below prints its target as `Target database: <host>/<db>`; **confirm that line names the intended database before continuing**, especially before any production rotation. When finished, close the shell (or `unset` the three variables) so the secrets do not linger.

## Procedure

Run all commands from the repo root, in the shell prepared above. The script is idempotent — re-running `rotate` is always safe.

1. **Generate the new KEK** (the value loaded into `CREDENTIAL_ENCRYPTION_KEK_NEW` above):

   ```bash
   openssl rand -hex 32
   ```

   Store it in the team's secret manager immediately. Do not echo it anywhere else.

2. **Back up the credentials table** to a location **outside the repo working tree** (Postgres example; `PGPASSWORD`/`.pgpass` keeps the DB password out of `ps`):

   ```bash
   pg_dump --table=oauth_credentials --data-only "$DATABASE_URL" > /secure/tmp/oauth_credentials.backup.sql
   ```

   Store the backup as securely as the database itself — it contains the (encrypted) credentials. Delete it once rotation is confirmed complete (after step 10); a backup taken under the old KEK is worthless once that KEK is destroyed.

3. **Dry-run** — prove every stored DEK unwraps under the old KEK:

   ```bash
   yarn rotate-kek dry-run
   ```

   Confirm the `Target database:` line, then require `failed: 0` before proceeding. `skipped (already rotated)` rows are fine on a re-run. Any `failed` row means that credential was not encrypted under the old KEK — the affected user must re-authenticate (see Failure modes); decide whether to proceed without them.

4. **Rotate:**

   ```bash
   yarn rotate-kek rotate
   ```

5. **Re-run `rotate` until `retry needed: 0`.** The app still points at the old KEK, so sign-ins during rotation keep writing rows under the old KEK; each re-run picks them up. Rows already rotated are reported as `skipped (already rotated)`.

6. **Verify** — prove every DEK unwraps under the new KEK (with the old KEK still set, stragglers are reported as `retry needed`, not `failed`):

   ```bash
   yarn rotate-kek verify
   ```

   Require `failed: 0` and `retry needed: 0`. If `retry needed > 0`, return to step 4.

7. **Flip the env var:** set `CREDENTIAL_ENCRYPTION_KEK` to the NEW value in the hosting platform's environment settings and redeploy/restart `apps/web`. Do this promptly after step 6 — between `rotate` and the flip, any sign-in writes a row under the old KEK again (harmless: re-run `rotate`), and rows already rotated are unreadable by the still-running old-KEK app until the flip completes.

8. **Final convergence pass:** immediately after the redeploy, run one more `rotate` then `verify` to catch any rows written under the old KEK during the step 5–7 window:

   ```bash
   yarn rotate-kek rotate
   yarn rotate-kek verify
   ```

   Do not proceed until `verify` reports `failed: 0` and `retry needed: 0`. This is the step that guarantees AC-2 ("every previously-encrypted token remains decryptable after rotation") holds on a live system.

9. **Smoke-test:** sign in with GitHub and connect/validate a repository. Both flows decrypt a stored token and will fail loudly if the KEK and row state disagree.

10. **Retire the old KEK:** remove `CREDENTIAL_ENCRYPTION_KEK_OLD` from every environment, delete stored copies of the old value per the team's secret-handling practice, and delete the step 2 backup. Rotation is complete.

## Rollback

Tokens are readable only when the row state and the app's `CREDENTIAL_ENCRYPTION_KEK` refer to the **same** KEK. Keep them in agreement at every step. The preferred rollback is a **swapped re-rotation**, not a backup restore.

- **Before the env-var flip (steps 3–7):** the app still runs on the old KEK. Roll back by re-running the rotation with old/new swapped — load the swapped values with `read -rs` as in "Set up the session", then:

  ```bash
  yarn rotate-kek rotate    # with OLD=<new-kek>, NEW=<old-kek>
  ```

- **Restore from the step 2 backup (last resort):** only when a swapped re-rotation is not possible. The `--data-only` dump does not clear existing rows, so restoring over a non-empty table causes primary-key conflicts. Truncate first, and only if no sign-ins have occurred since the backup (they would be lost):

  ```bash
  psql "$DATABASE_URL" -c 'TRUNCATE TABLE oauth_credentials;'
  psql "$DATABASE_URL" -f /secure/tmp/oauth_credentials.backup.sql
  ```

- **After the flip (steps 7–9, old KEK not yet destroyed):** flip `CREDENTIAL_ENCRYPTION_KEK` back to the old value, redeploy, then run the swapped rotation above to bring any new-KEK rows back.
- **After the old KEK is destroyed (step 9):** rollback is no longer possible; rotating forward to yet another new KEK is the only path.

## Failure modes

| Symptom | Meaning | Action |
| --- | --- | --- |
| `FAILED ... unwraps under neither KEK` | Row encrypted under some unknown KEK (e.g. env drift) | That user's credential is unrecoverable — they must sign out/in to re-authorize (Story 1.6 re-auth flow). Rotation of other rows is unaffected. |
| `RETRY NEEDED ... row changed concurrently` (during `rotate`) | A sign-in re-encrypted the credential mid-rotation, so the optimistic per-row update matched 0 rows | Re-run `rotate` (idempotent). Repeat until `retry needed: 0`. |
| `RETRY NEEDED ... still under old KEK` (during `verify`) | A sign-in wrote a row under the old KEK after the last `rotate` — not yet migrated, but recoverable | Re-run `rotate`, then `verify` again. Distinct from `FAILED`, which is unrecoverable. |
| Script interrupted mid-`rotate` | Some rows rotated, some not | Safe — updates are per-row. Re-run `rotate`; already-rotated rows are skipped. |
| Rotation done but env var not flipped | App (old KEK) cannot read rotated rows | Every token decrypt fails → credential-health marks rows failed and users see re-auth prompts. Flip the env var promptly (step 7) or roll back. |
| App redeployed with new KEK before `rotate` ran | App cannot read any old rows | Roll the env var back, then follow the procedure in order. |

## Validation record

<!-- Appended by validation runs (Story 1.9 AC-2). -->

### 2026-07-02 — non-production validation (Story 1.9 AC-2)

- **Environment:** devcontainer Postgres (`bmad-playground-postgres-1`), scratch database `bmad_easy_kek_validation` (created, schema pushed via `prisma db push`, dropped after the run). Throwaway KEKs generated with `openssl rand -hex 32`; all tokens synthetic.
- **Seed:** 3 `users` + 3 `oauth_credentials` rows encrypted via `encryptToken()` under KEK-A.
- **Every command printed `Target database: localhost:5432/bmad_easy_kek_validation`** — the target confirmation was present on each run.
- **Procedure executed end-to-end** (`yarn rotate-kek`, KEK-A → KEK-B):
  - `dry-run` (rows under A) — total 3, ok 3, failed 0, exit 0
  - `rotate` — total 3, rotated 3, retry needed 0, failed 0, exit 0
  - `dry-run` re-run (rows now under B) — total 3, **skipped 3 (already rotated)**, failed 0: an already-rotated row is correctly distinguished from an unrecoverable one
  - `verify` — total 3, ok 3, retry needed 0, failed 0, exit 0
  - decrypt check under KEK-B — 3 ok, 0 failed: **every previously-encrypted token decrypted to its exact original plaintext after rotation** (synthetic tokens; the production procedure never decrypts tokens)
- **Straggler path (mid-procedure sign-in):** a 4th credential seeded under the old KEK-A after rotation was reported by `verify` (old KEK still set) as `RETRY NEEDED ... still under old KEK`, summary `ok 3, retry needed 1, failed 0`, exit 1. One more `rotate` converged it (`rotated 1, skipped 3`); the next `verify` was `ok 4, retry needed 0, failed 0`.
- **Unrecoverable path:** a 5th credential seeded under an unrelated KEK-C was reported by `dry-run` as `FAILED ... DEK unwraps under neither KEK — user must re-authenticate` with its `userId`, summary `skipped 4, failed 1`, exit 1; healthy rows unaffected.
- **Equal-KEK guard:** invoking `rotate` with `OLD == NEW` exited 2 with `CREDENTIAL_ENCRYPTION_KEK_OLD and CREDENTIAL_ENCRYPTION_KEK_NEW must differ`, before touching the database.

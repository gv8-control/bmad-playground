-- AlterTable: drop unused User columns (never read/written outside the Prisma client)
ALTER TABLE "users" DROP COLUMN "active";
ALTER TABLE "users" DROP COLUMN "last_active_at";

-- AlterTable: add kek_id fingerprint column to oauth_credentials (Story 1.9 deferred scope)
-- Existing rows predate the AAD-binding change in apps/web/src/lib/crypto.ts and are no
-- longer decryptable regardless (approved breaking change — affected users must
-- re-authenticate). They are backfilled with a sentinel that will not match any real
-- KEK fingerprint, so scripts/rotate-kek.ts correctly reports them as FAILED
-- ("kekId matches neither KEK fingerprint") rather than silently mis-rotating them.
ALTER TABLE "oauth_credentials" ADD COLUMN "kek_id" TEXT NOT NULL DEFAULT 'legacy-pre-aad-rewrap';
ALTER TABLE "oauth_credentials" ALTER COLUMN "kek_id" DROP DEFAULT;

-- CreateIndex: enforce email uniqueness at the DB level (pre-verified: 0 duplicate
-- non-null emails in the live database at migration authoring time)
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddCheckConstraint: restrict repo_connections.credential_health to the two values
-- the application ever writes ('healthy' | 'failed') — defense in depth beyond the
-- TypeScript-level CredentialHealthStatus union.
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_credential_health_check"
  CHECK ("credential_health" IN ('healthy', 'failed'));

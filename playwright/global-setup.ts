/**
 * Playwright globalSetup — applies Prisma migrations to the test DB before the
 * E2E suite starts. Prevents "stale test DB" failures that occur when
 * migrations are committed but not applied to the test database.
 *
 * The `test:e2e` script wraps Playwright with `dotenv -e .env.test`, which
 * loads .env.test into process.env before this config/globalSetup runs, so
 * DATABASE_URL is available here without any additional env handling.
 *
 * Mirrors the safety pattern in scripts/run-migrations.ts: announce the target
 * database before running, confirm after. Inlines a small describeDatabase
 * helper rather than importing from scripts/ (which has a require.main guard
 * and lives outside the Playwright tsconfig graph).
 */

import { execSync } from 'child_process';

/** Render host:port/dbname from a DATABASE_URL — never the credentials. */
function describeDatabase(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // Fail loudly: the whole point of globalSetup is to guarantee the test DB
    // schema is current. Without DATABASE_URL we cannot, so abort the suite
    // rather than run E2E against a stale (or wrong) schema.
    throw new Error(
      'globalSetup: DATABASE_URL is not set. The E2E suite cannot run without a test database to migrate.',
    );
  }

  const target = describeDatabase(databaseUrl);

  // Delete stale per-worker users from previous runs. User has onDelete: Cascade
  // on all relations, so this drops RepoConnections, Conversations, Turns, etc.
  // without orphaned rows. Gives every run a clean slate. Runs before migration
  // so a crashed worker (OOM, timeout, ECONNRESET mid-setup) can't resurrect
  // stale data via the seed-user upsert on the next run.
  console.log(`globalSetup: cleaning stale worker data on ${target}`);
  try {
    execSync('prisma db execute --config libs/database-schemas/prisma.config.ts --stdin', {
      input: "DELETE FROM users WHERE github_id LIKE 'e2e-test-worker-%';",
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: 30_000,
      killSignal: 'SIGTERM',
    });
  } catch (err) {
    // Non-fatal — stale data won't break tests (the seed-user upsert handles
    // it), but may cause subtle contamination. Log and continue rather than
    // blocking the suite. A missing users table (pre-migration DB) also lands
    // here and is harmless since migrate deploy creates it next.
    console.warn('globalSetup: stale worker cleanup failed (non-fatal):', err);
  }

  console.log(`globalSetup: applying migrations to ${target}`);

  try {
    execSync('prisma migrate deploy --config libs/database-schemas/prisma.config.ts', {
      stdio: 'inherit',
      // Bound the migration process so a Postgres lock-wait, dropped TCP
      // connection, or network partition cannot block the suite indefinitely.
      // SIGTERM lets Prisma tear down cleanly before SIGKILL.
      timeout: 120_000,
      killSignal: 'SIGTERM',
    });
  } catch (err) {
    console.error('globalSetup: test database migration failed — E2E tests cannot proceed against a stale schema.');
    console.error(err);
    // Re-throw so Playwright aborts the suite rather than running tests
    // against a schema that may be missing tables/columns.
    throw err;
  }

  console.log(`globalSetup: migrations applied to ${target}`);
}

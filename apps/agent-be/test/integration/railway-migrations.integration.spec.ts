/**
 * Integration tests for Railway Postgres migrations — Story 4.4
 *
 * Verifies:
 * - AC-1: All 9 existing migrations are applied to the Railway Postgres instance
 *   (verified via _prisma_migrations table with finished_at not null)
 * - AC-1: Key tables exist (users, oauth_credentials, repo_connections, artifacts,
 *   conversations, turns, cost_records)
 *
 * Requires DATABASE_URL in the environment (Railway Postgres).
 * Reads from .env.local if not in process.env (same pattern as
 * railway-project-structure.integration.spec.ts).
 *
 * Run: yarn nx test-integration agent-be -- --testPathPatterns=railway-migrations
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@bmad-easy/database-schemas';

const EXPECTED_MIGRATIONS = [
  '20260618192551_init_users',
  '20260619000000_add_oauth_credential_and_repo_connection',
  '20260702000000_backlog_hardening_aad_kekid_constraints',
  '20260703022052_add_artifact_model',
  '20260703091142_add_artifact_last_modified_index',
  '20260703110000_add_repo_connection_last_synced_at',
  '20260704050001_add_conversation_and_turn_models',
  '20260706000000_add_cost_record_model',
  '20260707000000_add_conversation_sandbox_state',
];

const EXPECTED_TABLES = [
  'users',
  'oauth_credentials',
  'repo_connections',
  'artifacts',
  'conversations',
  'turns',
  'cost_records',
];

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.resolve(process.cwd(), '.env.local');
  let envContent: string;
  try {
    envContent = fs.readFileSync(envPath, 'utf-8');
  } catch {
    throw new Error(
      `DATABASE_URL not found: .env.local does not exist at ${envPath}`,
    );
  }
  const match = envContent.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.+)$/m);
  let url = match?.[1]?.trim();

  if (!url) {
    throw new Error('DATABASE_URL not found in process.env or .env.local');
  }

  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1);
  } else {
    url = url.replace(/\s+#.*$/, '');
  }

  return url;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any;

describe('Railway Postgres migrations — Story 4.4 AC-1', () => {
  beforeAll(() => {
    const databaseUrl = getDatabaseUrl();
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  test('[P0] _prisma_migrations table contains all 9 expected migration names', async () => {
    const result = await prisma.$queryRaw`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
    `;

    const appliedMigrations = (
      result as { migration_name: string }[]
    ).map((row) => row.migration_name);

    for (const expected of EXPECTED_MIGRATIONS) {
      expect(appliedMigrations).toContain(expected);
    }
  });

  test('[P0] all 9 migrations have finished_at not null', async () => {
    const result = (await prisma.$queryRaw`
      SELECT migration_name, finished_at FROM "_prisma_migrations"
    `) as { migration_name: string; finished_at: Date | null }[];

    expect(result.length).toBeGreaterThanOrEqual(EXPECTED_MIGRATIONS.length);

    for (const expectedMigration of EXPECTED_MIGRATIONS) {
      const row = result.find((r) => r.migration_name === expectedMigration);
      expect(row).toBeDefined();
      expect(row!.finished_at).not.toBeNull();
    }
  });

  test('[P0] key tables exist (users, oauth_credentials, repo_connections, artifacts, conversations, turns, cost_records)', async () => {
    for (const table of EXPECTED_TABLES) {
      const result = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int as count FROM "${table}"`,
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

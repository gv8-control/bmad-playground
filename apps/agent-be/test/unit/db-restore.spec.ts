/**
 * @jest-environment node
 *
 * Story 4.10: Configure Database Backups and Verify Restore
 *
 * Verifies:
 * - AC-1: Backup configuration — runbook documents Railway's built-in
 *         volume backup feature, daily and weekly schedules, and retention
 *         policy (6 days daily, ~4 weeks weekly).
 * - AC-2: Restore test — runbook documents pg_dump, pg_restore, Docker
 *         Postgres for local restore, and row count comparison.
 * - AC-3: Runbook content — runbook documents how to trigger a restore
 *         from Railway, how to point apps/agent-be at the restored
 *         instance, and integrity verification steps.
 *
 * Security regression guards (uniform guard template for external commands
 * with user-controlled input):
 * - Credential-isolation invariants: no credentials leak in the runbook (no
 *   Railway token values, no Anthropic API key prefix, no database connection
 *   strings with passwords, no literal credential env-var assignments). Env
 *   var references like $RAILWAY_TOKEN and $DATABASE_URL are the correct form
 *   and must be allowed.
 * - Input-injection invariants: documented commands use placeholders
 *   (<volume-instance-id>, <backup-id>) not hardcoded variable values.
 *   DATABASE_URL referenced as env var ($DATABASE_URL), not interpolated
 *   into command strings. pg_dump uses "$DATABASE_URL" env var reference.
 *
 * Call sites covered by the uniform guard template:
 * | Call site                          | Credential | User-controlled input |
 * | pg_dump "$DATABASE_URL"            | $DATABASE_URL | N/A                |
 * | Railway GraphQL curl (Bearer)      | $RAILWAY_TOKEN | <volume-instance-id> |
 * | railway up --service ...           | N/A         | <service-id> etc.    |
 * | volumeInstanceBackupRestore mut.   | N/A         | <backup-id> etc.     |
 *
 * Note on Object.keys() rule (Task 2.3): this test reads a markdown file as a
 * string and asserts via toMatch()/not.toMatch(). The Object.keys() rule
 * applies to object assertions that may contain secrets — not applicable here
 * since no objects are asserted on. The CREDENTIAL_ENV_VARS array is iterated
 * with forEach, not asserted via toHaveProperty.
 *
 * This is a verification-evidence regression guard, not a live network test.
 * It validates the committed runbook file's structure so that a future change
 * (e.g. deleting or emptying the file) is caught by CI. The live Railway API
 * verification is a one-time manual step (per decision policy: external service
 * calls with side effects must be escalated — the runbook documents the
 * commands, the human executes them).
 *
 * Run: yarn nx test agent-be -- --testPathPattern=db-restore
 */

import * as fs from 'fs';
import * as path from 'path';

const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../docs/runbooks/db-restore.md',
);

function loadRunbook(): string {
  if (!fs.existsSync(RUNBOOK_PATH)) {
    throw new Error(`Runbook not found at ${RUNBOOK_PATH}`);
  }
  return fs.readFileSync(RUNBOOK_PATH, 'utf8');
}

function loadRunbookLines(): string[] {
  return loadRunbook().split('\n');
}

const CREDENTIAL_ENV_VARS = [
  'RAILWAY_TOKEN',
  'DATABASE_URL',
  'CREDENTIAL_ENCRYPTION_KEK',
  'AUTH_SECRET',
  'ANTHROPIC_API_KEY',
  'DAYTONA_API_KEY',
  'PGPASSWORD',
];

describe('Story 4.10 — Database Backup and Restore Runbook', () => {
  describe('AC-1: Backup configuration documented', () => {
    test('[P0] runbook references Railway backup feature', () => {
      const content = loadRunbook();
      expect(content).toMatch(/backup/i);
      expect(content).toMatch(/railway/i);
    });

    test('[P0] runbook documents daily backup schedule', () => {
      const content = loadRunbook();
      expect(content).toMatch(/daily/i);
    });

    test('[P0] runbook documents weekly backup schedule', () => {
      const content = loadRunbook();
      expect(content).toMatch(/weekly/i);
    });

    test('[P0] runbook documents retention policy', () => {
      const content = loadRunbook();
      expect(content).toMatch(/retention/i);
    });

    test('[P0] runbook documents daily retention of 6 days', () => {
      const content = loadRunbook();
      expect(content).toMatch(/6\s*days/i);
    });

    test('[P0] runbook documents weekly retention of approximately 4 weeks', () => {
      const content = loadRunbook();
      expect(content).toMatch(/4\s*weeks|1\s*month/i);
    });
  });

  describe('AC-2: Restore test procedure documented', () => {
    test('[P0] runbook documents pg_dump command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/pg_dump/i);
    });

    test('[P0] runbook documents pg_restore or psql command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/pg_restore|psql/i);
    });

    test('[P0] runbook documents Docker Postgres for local restore', () => {
      const content = loadRunbook();
      expect(content).toMatch(/docker\s+run/i);
      expect(content).toMatch(/postgres/i);
    });

    test('[P0] runbook documents row count comparison', () => {
      const content = loadRunbook();
      expect(content).toMatch(/row\s*count|COUNT\(\*\)/i);
    });

    test('[P0] runbook documents sample record comparison', () => {
      const content = loadRunbook();
      expect(content).toMatch(/sample|ORDER\s+BY.*DESC\s+LIMIT/i);
    });
  });

  describe('AC-3: Runbook content — restore trigger, pointing agent-be, integrity verification', () => {
    test('[P0] runbook documents how to trigger a restore from Railway', () => {
      const content = loadRunbook();
      expect(content).toMatch(/restore/i);
      expect(content).toMatch(/railway/i);
    });

    test('[P0] runbook documents how to point apps/agent-be at the restored instance', () => {
      const content = loadRunbook();
      expect(content).toMatch(/agent-be|apps\/agent-be/i);
      expect(content).toMatch(/DATABASE_URL/i);
    });

    test('[P0] runbook documents integrity verification steps', () => {
      const content = loadRunbook();
      expect(content).toMatch(/integrity|verif/i);
    });

    test('[P0] runbook references all 7 database tables for verification', () => {
      const content = loadRunbook();
      expect(content).toMatch(/users/i);
      expect(content).toMatch(/oauth_credentials/i);
      expect(content).toMatch(/repo_connections/i);
      expect(content).toMatch(/artifacts/i);
      expect(content).toMatch(/conversations/i);
      expect(content).toMatch(/turns/i);
      expect(content).toMatch(/cost_records/i);
    });
  });

  describe('Runbook structure', () => {
    test('[P0] runbook file exists at docs/runbooks/db-restore.md', () => {
      expect(fs.existsSync(RUNBOOK_PATH)).toBe(true);
    });

    test('[P0] runbook has a markdown heading', () => {
      const lines = loadRunbookLines();
      const hasHeading = lines.some((l) => /^#\s+/.test(l));
      expect(hasHeading).toBe(true);
    });

    test('[P0] runbook is non-trivial (at least 10 lines)', () => {
      const lines = loadRunbookLines().filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(10);
    });

    test('[P0] runbook contains a date (YYYY-MM-DD format)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('[P0] runbook contains a Prerequisites section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*prerequisites/im);
    });

    test('[P0] runbook contains a Verification Record section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*verification.*record/im);
    });

    test('[P0] runbook contains section headings for backup configuration', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*backup.*config/im);
    });

    test('[P0] runbook contains section headings for restore procedure', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*restore/im);
    });

    test('[P0] runbook contains section headings for integrity verification', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*integrity|#+.*verif/im);
    });

    test('[P0] runbook contains section headings for pointing agent-be at restored instance', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*agent-be|#+.*pointing/im);
    });
  });

  describe('Railway references', () => {
    test('[P0] runbook contains the Railway GraphQL endpoint', () => {
      const content = loadRunbook();
      expect(content).toMatch(/backboard\.railway\.com\/graphql/i);
    });

    test('[P0] runbook contains the Railway project ID', () => {
      const content = loadRunbook();
      expect(content).toContain('30ab04b2-132c-440b-92ca-bc57be294d6f');
    });

    test('[P0] runbook references the DATABASE_URL env var', () => {
      const content = loadRunbook();
      expect(content).toMatch(/DATABASE_URL/);
    });

    test('[P0] runbook references the Railway production environment ID', () => {
      const content = loadRunbook();
      expect(content).toContain('0c3802e5-d0a4-44c0-beec-ed6ff592f5e5');
    });

    test('[P0] runbook references the agent-be service ID', () => {
      const content = loadRunbook();
      expect(content).toContain('4df7d0d1-0040-4395-89c8-bd166c4863cf');
    });
  });

  describe('Rollback procedure', () => {
    test('[P0] runbook contains a rollback/recovery section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*rollback/im);
    });

    test('[P0] runbook rollback section is independently executable (lists backups)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/volumeInstanceBackupList/i);
    });
  });

  describe('Security: credential-isolation regression guards (uniform guard template)', () => {
    test('[P0] runbook does not contain Railway token values', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/d49618b7/);
    });

    test('[P0] runbook does not contain Bearer followed by a literal token value', () => {
      const content = loadRunbook();
      // Bearer $RAILWAY_TOKEN (env var reference) is allowed.
      // Bearer "$RAILWAY_TOKEN" (quoted env var reference) is allowed.
      // Bearer <literal-token-value> is NOT allowed.
      expect(content).not.toMatch(/Bearer\s+(?![$"])/);
    });

    test('[P0] runbook does not contain Anthropic API key values', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/sk-[A-Za-z0-9]/);
    });

    test('[P0] runbook does not contain database connection strings with passwords', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/(?:postgresql|postgres):\/\/[^:]+:[^@]*@/);
    });

    test('[P0] runbook does not contain literal credential env-var assignments', () => {
      const content = loadRunbook();
      for (const credVar of CREDENTIAL_ENV_VARS) {
        // Matches VAR=value, VAR='value', VAR="value" where the value starts
        // with an alphanumeric character. Does NOT match placeholders (VAR=<...>,
        // VAR="<...>") or env var references (VAR=$OTHER).
        expect(content).not.toMatch(
          new RegExp(`${credVar}\\s*=\\s*['"]?[A-Za-z0-9]`),
        );
      }
    });

    test('[P0] runbook references DATABASE_URL as env var, not literal connection string', () => {
      const content = loadRunbook();
      // $DATABASE_URL or "$DATABASE_URL" is the correct form.
      // A literal postgresql://user:pass@host string is NOT allowed.
      expect(content).not.toMatch(
        /DATABASE_URL\s*=\s*(?:postgresql|postgres):\/\/[^:]+:[^@]*@/,
      );
    });
  });

  describe('Security: input-injection regression guards (uniform guard template)', () => {
    test('[P0] documented commands use <volume-instance-id> placeholder', () => {
      const content = loadRunbook();
      expect(content).toMatch(/<volume-instance-id>/i);
    });

    test('[P0] documented commands use <backup-id> placeholder', () => {
      const content = loadRunbook();
      expect(content).toMatch(/<backup-id>/i);
    });

    test('[P0] pg_dump command references DATABASE_URL as env var, not interpolated', () => {
      const content = loadRunbook();
      // pg_dump "$DATABASE_URL" is the correct form.
      // pg_dump postgresql://user:pass@host is NOT allowed.
      expect(content).toMatch(/pg_dump.*\$DATABASE_URL/i);
      expect(content).not.toMatch(
        /pg_dump\s+(?:postgresql|postgres):\/\/[^:]+:[^@]*@/i,
      );
    });

    test('[P0] railway up command uses flags for service/environment/project IDs', () => {
      const content = loadRunbook();
      expect(content).toMatch(/railway\s+up\s+--service/i);
    });

    test('[P0] DATABASE_URL not interpolated into pg_restore or psql command strings', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(
        /pg_restore\s+(?:postgresql|postgres):\/\/[^:]+:[^@]*@/i,
      );
    });
  });

  describe('curl flags', () => {
    // Per-block assertion: parse the runbook into fenced code blocks, filter
    // to those containing curl commands, and assert EACH block carries the
    // required flags. A whole-file regex would pass even if a single curl
    // block omitted the flag (the flag could be found elsewhere in the file).
    // Mirrors the per-block pattern in monitoring-setup.spec.ts.
    function extractCurlBlocks(): string[] {
      const content = loadRunbook();
      const codeBlocks = content.match(/```[\s\S]*?```/g) ?? [];
      return codeBlocks.filter((b) => /curl\s/i.test(b));
    }

    test('[P0] every curl command includes --fail flag', () => {
      const curlBlocks = extractCurlBlocks();
      expect(curlBlocks.length).toBeGreaterThan(0);
      for (const block of curlBlocks) {
        expect(block).toMatch(/--fail\b/);
      }
    });

    test('[P0] every curl command includes --max-time flag', () => {
      const curlBlocks = extractCurlBlocks();
      expect(curlBlocks.length).toBeGreaterThan(0);
      for (const block of curlBlocks) {
        expect(block).toMatch(/--max-time\b/);
      }
    });
  });
});

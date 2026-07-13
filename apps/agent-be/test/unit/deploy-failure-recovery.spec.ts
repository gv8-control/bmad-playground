/**
 * @jest-environment node
 *
 * Story 4.8: Deploy Failure Recovery and Rollback
 *
 * Verifies:
 * - AC-1: Vercel rollback — runbook documents `vercel rollback` command and
 *         the Vercel production URL (https://bmad-easy.vercel.app).
 * - AC-2: Railway rollback — runbook documents `railway redeploy` (or `railway up`)
 *         command, Railway project/service IDs, and the HEALTHCHECK instruction.
 * - AC-3: Prisma migration recovery — runbook documents `_prisma_migrations`
 *         inspection, the DELETE recovery command, the `describeDatabase()` safety
 *         pattern, and re-running via `prisma migrate deploy` / `yarn db:migrate`.
 * - AC-4: Misconfigured secret blocks traffic — runbook documents Vercel
 *         build-failure prevention and Railway HEALTHCHECK failure prevention.
 * - Task 5: Split-brain deploy recovery — runbook documents the split-brain
 *         scenario and both recovery options (rollback Vercel / fix Railway).
 *
 * Security regression guards (uniform guard template for external commands with
 * user-controlled input):
 * - Credential-isolation invariants: no credentials leak in the runbook (no token
 *   values, no DATABASE_URL with passwords, describeDatabase() safety pattern
 *   referenced).
 * - Input-injection invariants: SQL commands use safe placeholders, CLI commands
 *   use placeholders not hardcoded credential values, DATABASE_URL referenced as
 *   env var not interpolated into command strings.
 *
 * This is a verification-evidence regression guard, not a live network test.
 * It validates the committed runbook file's structure so that a future change
 * (e.g. deleting or emptying the file) is caught by CI. The live Vercel/Railway
 * API verification is a one-time manual step (per DP-5: no CI regression guard
 * for platform features — the runbook documents the one-time verification).
 *
 * Run: yarn nx test agent-be -- --testPathPattern=deploy-failure-recovery
 */

import * as fs from 'fs';
import * as path from 'path';

const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../docs/runbooks/deploy-failure-recovery.md',
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
  'VERCEL_TOKEN',
  'RAILWAY_TOKEN',
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GITHUB_SECRET',
  'CREDENTIAL_ENCRYPTION_KEK',
  'ANTHROPIC_API_KEY',
  'DAYTONA_API_KEY',
];

describe('Story 4.8 — Deploy Failure Recovery Runbook', () => {
  describe('AC-1: Vercel rollback capability documented', () => {
    test('[P0] runbook contains the vercel rollback command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/vercel\s+rollback/i);
    });

    test('[P0] runbook contains the Vercel production URL', () => {
      const content = loadRunbook();
      expect(content).toContain('https://bmad-easy.vercel.app');
    });
  });

  describe('AC-2: Railway rollback capability documented', () => {
    test('[P0] runbook contains the railway redeploy command (or railway up)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/railway\s+(?:deployment\s+)?(?:redeploy|up)\b/i);
    });

    test('[P0] runbook contains the Railway project ID', () => {
      const content = loadRunbook();
      expect(content).toContain('30ab04b2-132c-440b-92ca-bc57be294d6f');
    });

    test('[P0] runbook contains the Railway agent-be service ID', () => {
      const content = loadRunbook();
      expect(content).toContain('4df7d0d1-0040-4395-89c8-bd166c4863cf');
    });

    test('[P0] runbook references the HEALTHCHECK instruction', () => {
      const content = loadRunbook();
      expect(content).toMatch(/HEALTHCHECK/i);
    });
  });

  describe('AC-3: Prisma migration recovery procedure documented', () => {
    test('[P0] runbook references the _prisma_migrations table', () => {
      const content = loadRunbook();
      expect(content).toMatch(/_prisma_migrations/);
    });

    test('[P0] runbook documents the SQL inspection query for _prisma_migrations', () => {
      const content = loadRunbook();
      expect(content).toMatch(/SELECT.*migration_name.*FROM.*_prisma_migrations/is);
    });

    test('[P0] runbook documents the DELETE recovery command for failed migrations', () => {
      const content = loadRunbook();
      expect(content).toMatch(/DELETE\s+FROM\s+_prisma_migrations/i);
    });

    test('[P0] runbook references the describeDatabase() safety pattern', () => {
      const content = loadRunbook();
      expect(content).toMatch(/describeDatabase/i);
    });

    test('[P0] runbook references prisma migrate deploy or yarn db:migrate for re-run', () => {
      const content = loadRunbook();
      expect(content).toMatch(/prisma\s+migrate\s+deploy|yarn\s+db:migrate/i);
    });
  });

  describe('AC-4: Misconfigured secret blocks traffic documented', () => {
    test('[P0] runbook documents Vercel build-failure prevention', () => {
      const content = loadRunbook();
      expect(content).toMatch(/build[-\s]*(?:step[-\s]*)?fail/i);
    });

    test('[P0] runbook documents Railway HEALTHCHECK failure prevention', () => {
      const content = loadRunbook();
      expect(content).toMatch(/(?:health\s*check|HEALTHCHECK)[-\s]*fail/i);
    });
  });

  describe('Task 5: Split-brain deploy recovery documented', () => {
    test('[P0] runbook references the split-brain scenario', () => {
      const content = loadRunbook();
      expect(content).toMatch(/split.?brain/i);
    });

    test('[P0] runbook documents recovery option A (rollback Vercel)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/vercel\s+rollback/i);
    });

    test('[P0] runbook documents recovery option B (fix Railway and redeploy)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/railway\s+(?:deployment\s+)?(?:redeploy|up)\b/i);
    });
  });

  describe('Runbook structure', () => {
    test('[P0] runbook file exists at docs/runbooks/deploy-failure-recovery.md', () => {
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

    test('[P0] runbook contains section headings for all 5 recovery procedures', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*vercel/im);
      expect(content).toMatch(/^#+.*railway/im);
      expect(content).toMatch(/^#+.*prisma/im);
      expect(content).toMatch(/^#+.*secret/im);
      expect(content).toMatch(/^#+.*split.?brain/im);
    });

    test('[P0] runbook contains a date (YYYY-MM-DD format)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('Security: credential-isolation regression guards (uniform guard template)', () => {
    // Note: Vercel API tokens do not have a well-known prefix. This guard
    // checks for a possible prefix pattern; the general credential env-var
    // assignment guard below provides broader coverage.
    test('[P0] runbook does not contain Vercel token values', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/vcp_[A-Za-z0-9]/);
    });

    // Note: Railway API tokens do not have a well-known prefix. This guard
    // checks for a specific known token fragment; the general credential
    // env-var assignment guard below provides broader coverage.
    test('[P0] runbook does not contain Railway token values', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/d49618b7/);
    });

    test('[P0] runbook does not contain Anthropic API key values', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/sk-[A-Za-z0-9]/);
    });

    test('[P0] runbook does not contain database connection strings with passwords', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/(?:postgresql|postgres):\/\/[^:]+:[^@]+@/);
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

    test('[P0] runbook references describeDatabase() safety pattern (credential isolation)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/describeDatabase/i);
    });
  });

  describe('Security: input-injection regression guards (uniform guard template)', () => {
    test('[P0] SQL DELETE command uses placeholder, not raw interpolated value', () => {
      const content = loadRunbook();
      expect(content).toMatch(
        /DELETE\s+FROM\s+_prisma_migrations\s+WHERE\s+migration_name\s*=\s*'</i,
      );
    });

    test('[P0] vercel rollback command uses placeholder for deployment URL', () => {
      const content = loadRunbook();
      expect(content).toMatch(/vercel\s+rollback\s+<|vercel\s+rollback\s+--/i);
    });

    test('[P0] railway redeploy command references service ID via flag, not inline interpolation', () => {
      const content = loadRunbook();
      expect(content).toMatch(/railway\s+(?:deployment\s+)?(?:redeploy|up)\b\s+--service/i);
    });

    test('[P0] DATABASE_URL referenced as env var, not interpolated into command string', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/DATABASE_URL\s*=\s*(?:postgresql|postgres):\/\/[^:]+:[^@]+@/);
    });
  });
});

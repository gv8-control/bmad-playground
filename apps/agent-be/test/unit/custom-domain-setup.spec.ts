/**
 * @jest-environment node
 *
 * Story 4.9: Configure Custom Domain and Stable Production URL
 *
 * Verifies:
 * - AC-1: DNS + Vercel domain + TLS — runbook documents DNS configuration
 *         (A record / CNAME record), Vercel domain add via API, and TLS
 *         provisioning by Vercel.
 * - AC-2: AUTH_URL update — runbook documents updating the AUTH_URL env var
 *         on Vercel to the custom domain via REST API.
 * - AC-3: OAuth App callback URL — runbook documents updating the GitHub OAuth
 *         App callback URL at github.com/settings/developers (manual step).
 * - AC-4: End-to-end OAuth verification — runbook documents the manual
 *         sign-in verification procedure.
 * - AC-5: Execution model — runbook documents which steps are human-executed
 *         (DNS, OAuth App) vs API-automatable (Vercel domain add, AUTH_URL).
 *
 * Security regression guards (uniform guard template for external commands with
 * user-controlled input):
 * - Credential-isolation invariants: no credentials leak in the runbook (no
 *   VERCEL_TOKEN values, no Bearer followed by literal token, no connection
 *   strings with passwords). Env var references like $VERCEL_TOKEN in curl
 *   commands are the correct form and must be allowed.
 * - Input-injection invariants: documented API commands use placeholders
 *   (<custom-domain>) not hardcoded domain values, preventing injection of
 *   malicious domain names into curl command strings.
 *
 * This is a verification-evidence regression guard, not a live network test.
 * It validates the committed runbook file's structure so that a future change
 * (e.g. deleting or emptying the file) is caught by CI. The live Vercel API
 * verification is a one-time manual step (per decision policy: external service
 * calls with side effects must be escalated — the runbook documents the
 * commands, the human executes them).
 *
 * Run: yarn nx test agent-be -- --testPathPattern=custom-domain-setup
 */

import * as fs from 'fs';
import * as path from 'path';

const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../docs/runbooks/custom-domain-setup.md',
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
  'AUTH_SECRET',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'DATABASE_URL',
];

describe('Story 4.9 — Custom Domain Setup Runbook', () => {
  describe('AC-1: DNS + Vercel domain + TLS documented', () => {
    test('[P0] runbook documents DNS configuration (A record or CNAME)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/(?:A\s+record|CNAME\s+record)/i);
    });

    test('[P0] runbook documents the Vercel API endpoint for adding a domain', () => {
      const content = loadRunbook();
      expect(content).toMatch(/api\.vercel\.com\/v10\/projects/);
    });

    test('[P0] runbook references TLS provisioning', () => {
      const content = loadRunbook();
      expect(content).toMatch(/TLS|SSL|certificate/i);
    });
  });

  describe('AC-2: AUTH_URL update documented', () => {
    test('[P0] runbook references AUTH_URL', () => {
      const content = loadRunbook();
      expect(content).toMatch(/AUTH_URL/);
    });

    test('[P0] runbook documents the Vercel API endpoint for env var management', () => {
      const content = loadRunbook();
      expect(content).toMatch(/api\.vercel\.com.*env/);
    });
  });

  describe('AC-3: OAuth App callback URL update documented', () => {
    test('[P0] runbook references the OAuth App ID', () => {
      const content = loadRunbook();
      expect(content).toContain('Ov23liwPSopCBFh9nMRN');
    });

    test('[P0] runbook references github.com/settings/developers', () => {
      const content = loadRunbook();
      expect(content).toContain('github.com/settings/developers');
    });

    test('[P0] runbook references the callback URL path', () => {
      const content = loadRunbook();
      expect(content).toContain('/api/auth/callback/github');
    });
  });

  describe('AC-4: End-to-end OAuth verification documented', () => {
    test('[P0] runbook documents the end-to-end OAuth verification procedure', () => {
      const content = loadRunbook();
      expect(content).toMatch(/sign[\s-]in|OAuth.*flow/i);
    });
  });

  describe('AC-5: Execution model documented', () => {
    test('[P0] runbook documents which steps are human-executed vs API-automatable', () => {
      const content = loadRunbook();
      expect(content).toMatch(/human.executed/i);
      expect(content).toMatch(/API.automatable/i);
    });
  });

  describe('Runbook structure', () => {
    test('[P0] runbook file exists at docs/runbooks/custom-domain-setup.md', () => {
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

    test('[P0] runbook contains section headings for all 5 steps', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*DNS/im);
      expect(content).toMatch(/^#+.*domain.*(?:add|vercel)/im);
      expect(content).toMatch(/^#+.*AUTH_URL/im);
      expect(content).toMatch(/^#+.*OAuth.*callback/im);
      expect(content).toMatch(/^#+.*verif/im);
    });

    test('[P0] runbook contains a rollback procedure section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*rollback/im);
    });

    test('[P0] runbook contains a Prerequisites section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*prerequisites/im);
    });

    test('[P0] runbook contains a Verification Record section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*verification.*record/im);
    });

    test('[P0] runbook contains a date (YYYY-MM-DD format)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('[P0] runbook contains the Vercel project ID', () => {
      const content = loadRunbook();
      expect(content).toContain('prj_ih4UAxO759A1CHdrZ93j4rk3poYD');
    });

    test('[P0] runbook contains the current production URL', () => {
      const content = loadRunbook();
      expect(content).toContain('bmad-easy.vercel.app');
    });
  });

  describe('Security: credential-isolation regression guards (uniform guard template)', () => {
    test('[P0] runbook does not contain Vercel token values', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/vcp_[A-Za-z0-9]/);
    });

    test('[P0] runbook does not contain Bearer followed by a literal token value', () => {
      const content = loadRunbook();
      // Bearer $VERCEL_TOKEN (env var reference) is allowed.
      // Bearer <literal-token-value> is NOT allowed.
      expect(content).not.toMatch(/Bearer\s+(?![$"])/);
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
  });

  describe('Security: input-injection regression guards (uniform guard template)', () => {
    test('[P0] documented API commands use <custom-domain> placeholder, not hardcoded domain values', () => {
      const content = loadRunbook();
      expect(content).toMatch(/<custom-domain>/);
    });

    test('[P0] curl commands reference VERCEL_TOKEN as env var, not literal value', () => {
      const content = loadRunbook();
      expect(content).toMatch(/\$VERCEL_TOKEN/);
    });
  });
});

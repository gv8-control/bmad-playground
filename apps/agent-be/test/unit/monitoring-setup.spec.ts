/**
 * @jest-environment node
 *
 * Story 4.11: Configure Launch-Window Monitoring and Alerting
 *
 * Verifies:
 * - AC-1: Uptime monitoring — runbook documents UptimeRobot monitor setup via
 *         API v2, two monitors (apps/web homepage + apps/agent-be /health),
 *         5-minute interval, email alerts, GET /health endpoint, newMonitor
 *         API endpoint, api.uptimerobot.com/v2 base URL.
 * - AC-2: Log access — runbook documents Vercel deployment logs, Railway
 *         service logs, 7-day retention requirement, dashboard access path,
 *         CLI commands (vercel logs, railway logs).
 * - AC-3: Deploy failure notification — runbook documents GitHub Actions
 *         failure notification, workflow_dispatch trigger, email notification,
 *         deploy workflow reference (.github/workflows/deploy.yml).
 * - AC-4: Out of scope — runbook documents NFR-O1 out of scope, distributed
 *         tracing out of scope, APM tools out of scope.
 *
 * Security regression guards (uniform guard template for external commands
 * with user-controlled input):
 * - Credential-isolation invariants: no credentials leak in the runbook (no
 *   UptimeRobot API key values, no VERCEL_TOKEN/RAILWAY_TOKEN values, no
 *   Bearer followed by literal token, no connection strings with passwords,
 *   no literal credential env-var assignments). Env var references like
 *   $UPTIMEROBOT_API_KEY, $VERCEL_TOKEN, $RAILWAY_TOKEN in curl commands
 *   are the correct form and must be allowed.
 * - Input-injection invariants: documented API commands use <monitor-id>
 *   placeholder, $UPTIMEROBOT_API_KEY as env var not interpolated into
 *   command strings, URLs are hardcoded reference constants (not
 *   user-controlled input).
 *
 * Call sites covered by the uniform guard template:
 * | Call site                              | Credential           | User-controlled input |
 * | UptimeRobot API curl (api_key=...)     | $UPTIMEROBOT_API_KEY | <monitor-id>          |
 * | UptimeRobot deleteMonitor curl         | $UPTIMEROBOT_API_KEY | <monitor-id>          |
 * | Vercel CLI (vercel logs)               | $VERCEL_TOKEN        | <deployment-url>      |
 * | Railway CLI (railway logs)             | $RAILWAY_TOKEN       | N/A                   |
 *
 * Note on Object.keys() rule (project-context.md line 261): this test reads a
 * markdown file as a string and asserts via toMatch()/not.toMatch(). The
 * Object.keys() rule applies to object assertions that may contain secrets —
 * not applicable here since no objects are asserted on. The
 * CREDENTIAL_ENV_VARS array is iterated with forEach, not asserted via
 * toHaveProperty.
 *
 * This is a verification-evidence regression guard, not a live network test.
 * It validates the committed runbook file's structure so that a future change
 * (e.g. deleting or emptying the file) is caught by CI. The live UptimeRobot
 * API verification is a one-time manual step (per decision policy: external
 * service calls with side effects must be escalated — the runbook documents
 * the commands, the human executes them).
 *
 * Run: yarn nx test agent-be -- --testPathPattern=monitoring-setup
 */

import * as fs from 'fs';
import * as path from 'path';

const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../docs/runbooks/monitoring-setup.md',
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
  'UPTIMEROBOT_API_KEY',
  'VERCEL_TOKEN',
  'RAILWAY_TOKEN',
  'DATABASE_URL',
  'AUTH_SECRET',
];

describe('Story 4.11 — Monitoring Setup Runbook', () => {
  describe('Runbook structure', () => {
    test('[P0] runbook file exists at docs/runbooks/monitoring-setup.md', () => {
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

    test('[P0] runbook contains Section 1 heading (Uptime Monitoring)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*uptime.*monitor/im);
    });

    test('[P0] runbook contains Section 2 heading (Log Access)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*log.*access/im);
    });

    test('[P0] runbook contains Section 3 heading (Deploy Failure Notification)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*deploy.*failure.*notif/im);
    });

    test('[P0] runbook contains Section 4 heading (Out of Scope)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*out.*of.*scope/im);
    });

    test('[P0] runbook contains a Rollback Procedure section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*rollback/im);
    });

    test('[P0] runbook contains a Verification Record section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*verification.*record/im);
    });
  });

  describe('AC-1: Uptime monitoring documented', () => {
    test('[P0] runbook references UptimeRobot', () => {
      const content = loadRunbook();
      expect(content).toMatch(/uptimerobot/i);
    });

    test('[P0] runbook documents two monitors (apps/web homepage + apps/agent-be health)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/apps.web.*homepage|apps-web.*homepage/i);
      expect(content).toMatch(/apps.agent.be.*health|apps-agent-be.*health/i);
    });

    test('[P0] runbook documents 5-minute monitoring interval', () => {
      const content = loadRunbook();
      expect(content).toMatch(/5.minute/i);
      expect(content).toMatch(/interval=300/);
    });

    test('[P0] runbook documents email alerts', () => {
      const content = loadRunbook();
      expect(content).toMatch(/email.*alert/i);
    });

    test('[P0] runbook references GET /health endpoint on agent-be', () => {
      const content = loadRunbook();
      expect(content).toMatch(/\/health/);
    });

    test('[P0] runbook documents the newMonitor API endpoint', () => {
      const content = loadRunbook();
      expect(content).toMatch(/newMonitor/i);
    });

    test('[P0] runbook references the UptimeRobot API v2 base URL', () => {
      const content = loadRunbook();
      expect(content).toMatch(/api\.uptimerobot\.com\/v2/);
    });

    test('[P0] runbook documents getAccountDetails API command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/getAccountDetails/i);
    });

    test('[P0] runbook documents getMonitors API command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/getMonitors/i);
    });

    test('[P0] runbook documents deleteMonitor API command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/deleteMonitor/i);
    });

    test('[P0] runbook documents that monitor creation is human-executed', () => {
      const content = loadRunbook();
      expect(content).toMatch(/human.executed/i);
    });
  });

  describe('AC-2: Log access documented', () => {
    test('[P0] runbook documents Vercel deployment logs', () => {
      const content = loadRunbook();
      expect(content).toMatch(/vercel.*log/i);
    });

    test('[P0] runbook documents Railway service logs', () => {
      const content = loadRunbook();
      expect(content).toMatch(/railway.*log/i);
    });

    test('[P0] runbook documents 7-day retention requirement', () => {
      const content = loadRunbook();
      expect(content).toMatch(/7.day/i);
    });

    test('[P0] runbook documents Vercel dashboard access path', () => {
      const content = loadRunbook();
      expect(content).toMatch(/dashboard/i);
      expect(content).toMatch(/vercel/i);
    });

    test('[P0] runbook documents Railway dashboard access path', () => {
      const content = loadRunbook();
      expect(content).toMatch(/dashboard/i);
      expect(content).toMatch(/railway/i);
    });

    test('[P0] runbook documents vercel logs CLI command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/vercel\s+logs/i);
    });

    test('[P0] runbook documents railway logs CLI command', () => {
      const content = loadRunbook();
      expect(content).toMatch(/railway\s+logs/i);
    });
  });

  describe('AC-3: Deploy failure notification documented', () => {
    test('[P0] runbook documents GitHub Actions failure notification', () => {
      const content = loadRunbook();
      expect(content).toMatch(/github.*actions.*fail/i);
    });

    test('[P0] runbook references workflow_dispatch trigger', () => {
      const content = loadRunbook();
      expect(content).toMatch(/workflow_dispatch/i);
    });

    test('[P0] runbook documents email notification for failed workflows', () => {
      const content = loadRunbook();
      expect(content).toMatch(/email.*notif/i);
    });

    test('[P0] runbook references the deploy workflow file', () => {
      const content = loadRunbook();
      expect(content).toMatch(/deploy\.yml/i);
    });
  });

  describe('AC-4: Out of scope documented', () => {
    test('[P0] runbook documents NFR-O1 per-user LLM spend monitoring as out of scope', () => {
      const content = loadRunbook();
      const outOfScopeSection =
        content.split(/^##\s+.*out.*of.*scope/im)[1]?.split(/^##\s/im)[0] ??
        '';
      expect(outOfScopeSection).toMatch(/NFR-O1/i);
    });

    test('[P0] runbook documents distributed tracing as out of scope', () => {
      const content = loadRunbook();
      const outOfScopeSection =
        content.split(/^##\s+.*out.*of.*scope/im)[1]?.split(/^##\s/im)[0] ??
        '';
      expect(outOfScopeSection).toMatch(/distributed.*trac/i);
    });

    test('[P0] runbook documents APM tools as out of scope', () => {
      const content = loadRunbook();
      const outOfScopeSection =
        content.split(/^##\s+.*out.*of.*scope/im)[1]?.split(/^##\s/im)[0] ??
        '';
      expect(outOfScopeSection).toMatch(/APM/i);
    });
  });

  describe('Production URL references', () => {
    test('[P0] runbook contains the apps/web production URL', () => {
      const content = loadRunbook();
      expect(content).toContain('https://bmad-easy.vercel.app');
    });

    test('[P0] runbook contains the apps/agent-be production URL', () => {
      const content = loadRunbook();
      expect(content).toContain('https://agent-be-production-1c09.up.railway.app');
    });
  });

  describe('Rollback procedure', () => {
    test('[P0] runbook contains a rollback section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*rollback/im);
    });

    test('[P0] runbook rollback section is independently executable (includes getMonitors command)', () => {
      const content = loadRunbook();
      const rollbackSection =
        content.split(/^##\s+Rollback/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(rollbackSection).toMatch(/getMonitors/i);
    });
  });

  describe('Security: credential-isolation regression guards (uniform guard template)', () => {
    test('[P0] runbook does not contain UptimeRobot API key values', () => {
      const content = loadRunbook();
      // UptimeRobot API keys are long alphanumeric strings (25+ chars) starting
      // with u, m, or o. $UPTIMEROBOT_API_KEY (env var reference) is allowed.
      expect(content).not.toMatch(/\b[umo][A-Za-z0-9-]{25,}/i);
    });

    test('[P0] runbook does not contain Bearer followed by a literal token value', () => {
      const content = loadRunbook();
      // Bearer $VERCEL_TOKEN (env var reference) is allowed.
      // Bearer "$RAILWAY_TOKEN" (quoted env var reference) is allowed.
      // Bearer '<literal-token-value>' (single-quoted literal) is NOT allowed.
      // Bearer <literal-token-value> is NOT allowed.
      expect(content).not.toMatch(/Bearer\s+(?![$"'])/);
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
          new RegExp(`\\b${credVar}\\s*=\\s*['"]?[A-Za-z0-9]`),
        );
      }
    });
  });

  describe('Security: input-injection regression guards (uniform guard template)', () => {
    test('[P0] documented API commands use <monitor-id> placeholder', () => {
      const content = loadRunbook();
      expect(content).toMatch(/<monitor-id>/i);
    });

    test('[P0] curl commands reference UPTIMEROBOT_API_KEY as env var, not literal value', () => {
      const content = loadRunbook();
      expect(content).toMatch(/\$UPTIMEROBOT_API_KEY/);
    });

    test('[P0] UPTIMEROBOT_API_KEY not interpolated into command strings as literal value', () => {
      const content = loadRunbook();
      // api_key=$UPTIMEROBOT_API_KEY is the correct form.
      // api_key=<literal-key-value> is NOT allowed.
      expect(content).not.toMatch(/api_key\s*=\s*['"]?[A-Za-z0-9]/);
    });

    test('[P0] runbook references VERCEL_TOKEN as env var', () => {
      const content = loadRunbook();
      expect(content).toMatch(/VERCEL_TOKEN/);
    });

    test('[P0] runbook references RAILWAY_TOKEN as env var', () => {
      const content = loadRunbook();
      expect(content).toMatch(/RAILWAY_TOKEN/);
    });

    test('[P0] vercel logs command uses <deployment-url> placeholder', () => {
      const content = loadRunbook();
      expect(content).toMatch(/vercel\s+logs\s+<deployment-url>/i);
    });
  });

  describe('curl flags', () => {
    test('[P0] every curl command includes --fail flag', () => {
      const content = loadRunbook();
      const codeBlocks = content.match(/```[\s\S]*?```/g) ?? [];
      const curlBlocks = codeBlocks.filter((b) => /curl\s/i.test(b));
      expect(curlBlocks.length).toBeGreaterThan(0);
      for (const block of curlBlocks) {
        expect(block).toMatch(/--fail\b/);
      }
    });

    test('[P0] every curl command includes --max-time flag', () => {
      const content = loadRunbook();
      const codeBlocks = content.match(/```[\s\S]*?```/g) ?? [];
      const curlBlocks = codeBlocks.filter((b) => /curl\s/i.test(b));
      expect(curlBlocks.length).toBeGreaterThan(0);
      for (const block of curlBlocks) {
        expect(block).toMatch(/--max-time\b/);
      }
    });
  });
});

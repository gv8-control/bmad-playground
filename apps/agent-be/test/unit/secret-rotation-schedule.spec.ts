/**
 * @jest-environment node
 *
 * Story 4.12: Secret Rotation Reminder Mechanism
 *
 * Verifies:
 * - AC-1: Rotation schedule runbook — docs/runbooks/secret-rotation-schedule.md
 *         lists all 5 production secrets (DAYTONA_API_KEY, ANTHROPIC_API_KEY,
 *         AUTH_GITHUB_SECRET, AUTH_SECRET, CREDENTIAL_ENCRYPTION_KEK), documents
 *         90-day rotation interval for API keys, 180-day for OAuth secrets,
 *         references docs/runbooks/kek-rotation.md for the KEK, documents manual
 *         rotation steps for each secret.
 * - AC-2: Cron job creates rotation issues — .github/workflows/secret-rotation-reminder.yml
 *         has weekly schedule cron + workflow_dispatch trigger, issues: write
 *         permission, uses gh issue create with title "Rotate <secret-name> — due <date>",
 *         links to the rotation runbook.
 * - AC-3: Initial due dates and first issue — .github/secret-rotation-config.json
 *         has productionLaunchDate, reminderWindowDays, secrets array with all
 *         5 secrets, each with name, rotationIntervalDays, platform, runbookSection.
 * - AC-4: Out of scope — runbook documents automated secret rotation as out of scope.
 *
 * Security regression guards (uniform guard template for committed operational
 * documents):
 * - Credential-isolation invariants: no literal credential env-var assignments
 *   (VAR=value), no literal API key values, no Bearer followed by literal token,
 *   no connection strings with passwords. Secret NAMES (AUTH_SECRET,
 *   DAYTONA_API_KEY, etc.) are configuration identifiers, not secret values —
 *   they must appear in the runbook and config file. The guard asserts no
 *   literal VALUES.
 * - Input-injection invariants: runbook uses <placeholder> syntax for variable
 *   values, config file uses <YYYY-MM-DD> placeholder or real date for
 *   productionLaunchDate, workflow uses env: intermediaries for dynamic values
 *   (no ${{ }} in run: blocks).
 *
 * Call sites covered by the uniform guard template:
 * | Call site                          | Credential                | User-controlled input     |
 * | Runbook rotation steps            | N/A (names only)          | <production-launch-date>  |
 * | Workflow issue creation           | GH_TOKEN (from GITHUB_TOKEN) | <secret-name>, <date> |
 * | Config file                        | N/A (names only)          | <YYYY-MM-DD>              |
 *
 * Note on Object.keys() rule (project-context.md line 261): this test reads
 * markdown/JSON/YAML files as strings and asserts via toMatch()/not.toMatch().
 * The Object.keys() rule applies to object assertions that may contain secrets —
 * not applicable here since no objects with secrets are asserted on. The
 * CREDENTIAL_ENV_VARS array is iterated with forEach, not asserted via
 * toHaveProperty.
 *
 * This is a verification-evidence regression guard, not a live network test.
 * It validates the committed files' structure so that a future change (e.g.
 * deleting or emptying a file) is caught by CI. The live GitHub issue creation
 * verification is a one-time manual step (per decision policy: external service
 * calls with side effects must be escalated — the workflow documents the issue
 * creation, the human triggers the first run).
 *
 * Run: yarn nx test agent-be -- --testPathPattern=secret-rotation-schedule
 */

import * as fs from 'fs';
import * as path from 'path';

const yaml = require('js-yaml') as { load: (input: string) => unknown };

const RUNBOOK_PATH = path.resolve(
  __dirname,
  '../../../../docs/runbooks/secret-rotation-schedule.md',
);

const CONFIG_PATH = path.resolve(
  __dirname,
  '../../../../.github/secret-rotation-config.json',
);

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '../../../../.github/workflows/secret-rotation-reminder.yml',
);

const SCRIPT_PATH = path.resolve(
  __dirname,
  '../../../../.github/scripts/check-rotations.js',
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

function loadConfig(): Record<string, unknown> {
  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

function loadConfigText(): string {
  return fs.readFileSync(CONFIG_PATH, 'utf8');
}

function loadWorkflow(): Record<string, unknown> {
  const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  return yaml.load(content) as Record<string, unknown>;
}

function loadWorkflowText(): string {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

const CREDENTIAL_ENV_VARS = [
  'AUTH_SECRET',
  'AUTH_GITHUB_SECRET',
  'AUTH_GITHUB_ID',
  'DAYTONA_API_KEY',
  'ANTHROPIC_API_KEY',
  'CREDENTIAL_ENCRYPTION_KEK',
  'DATABASE_URL',
  'VERCEL_TOKEN',
  'RAILWAY_TOKEN',
];

interface ConfigSecret {
  name: string;
  rotationIntervalDays: number;
  platform: string;
  runbookSection: string;
  runbookRef?: string;
}

interface ConfigFile {
  productionLaunchDate: string | null;
  reminderWindowDays: number;
  secrets: ConfigSecret[];
}

function getConfig(): ConfigFile {
  return loadConfig() as unknown as ConfigFile;
}

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  uses?: string;
  with?: Record<string, unknown>;
  id?: string;
}

interface WorkflowJob {
  'runs-on'?: string;
  'timeout-minutes'?: number;
  steps?: WorkflowStep[];
}

interface WorkflowConcurrency {
  group?: string;
  'cancel-in-progress'?: boolean;
}

interface WorkflowFile {
  name?: string;
  on?: unknown;
  permissions?: Record<string, string>;
  concurrency?: WorkflowConcurrency;
  jobs?: Record<string, WorkflowJob>;
}

function getCheckJob(workflow: WorkflowFile): WorkflowJob {
  const jobs = workflow.jobs;
  if (!jobs) throw new Error('No jobs section in workflow');
  const job = jobs['check-secret-rotations'];
  if (!job) throw new Error('No "check-secret-rotations" job in workflow');
  return job;
}

function getSteps(workflow: WorkflowFile): WorkflowStep[] {
  const job = getCheckJob(workflow);
  if (!job.steps) throw new Error('No steps in check-secret-rotations job');
  return job.steps;
}

describe('Story 4.12 — Secret Rotation Reminder Mechanism', () => {
  describe('Runbook structure', () => {
    test('[P0] runbook file exists at docs/runbooks/secret-rotation-schedule.md', () => {
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

    test('[P0] runbook contains a Prerequisites section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*prerequisites/im);
    });

    test('[P0] runbook contains a Secret Inventory section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*secret.*inventory/im);
    });

    test('[P0] runbook contains Section 1 heading (DAYTONA_API_KEY)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^##\s+.*Section 1.*DAYTONA_API_KEY/im);
    });

    test('[P0] runbook contains Section 2 heading (ANTHROPIC_API_KEY)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^##\s+.*Section 2.*ANTHROPIC_API_KEY/im);
    });

    test('[P0] runbook contains Section 3 heading (AUTH_GITHUB_SECRET)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^##\s+.*Section 3.*AUTH_GITHUB_SECRET/im);
    });

    test('[P0] runbook contains Section 4 heading (AUTH_SECRET)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^##\s+.*Section 4.*AUTH_SECRET/im);
    });

    test('[P0] runbook contains Section 5 heading (CREDENTIAL_ENCRYPTION_KEK)', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^##\s+.*Section 5.*CREDENTIAL_ENCRYPTION_KEK/im);
    });

    test('[P0] runbook contains Section 6 heading (Out of Scope)', () => {
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

  describe('AC-1: Rotation schedule runbook', () => {
    test('[P0] runbook lists all 5 production secrets', () => {
      const content = loadRunbook();
      expect(content).toMatch(/DAYTONA_API_KEY/);
      expect(content).toMatch(/ANTHROPIC_API_KEY/);
      expect(content).toMatch(/AUTH_GITHUB_SECRET/);
      expect(content).toMatch(/AUTH_SECRET/);
      expect(content).toMatch(/CREDENTIAL_ENCRYPTION_KEK/);
    });

    test('[P0] runbook documents 90-day rotation interval for API keys', () => {
      const content = loadRunbook();
      expect(content).toMatch(/90.day/i);
      const section1 = content.split(/^##\s+.*Section 1/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section1).toMatch(/90.day/i);
      const section2 = content.split(/^##\s+.*Section 2/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section2).toMatch(/90.day/i);
    });

    test('[P0] runbook documents 180-day rotation interval for OAuth secrets', () => {
      const content = loadRunbook();
      expect(content).toMatch(/180.day/i);
      const section3 = content.split(/^##\s+.*Section 3/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section3).toMatch(/180.day/i);
      const section4 = content.split(/^##\s+.*Section 4/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section4).toMatch(/180.day/i);
    });

    test('[P0] runbook references docs/runbooks/kek-rotation.md for the KEK', () => {
      const content = loadRunbook();
      expect(content).toMatch(/kek-rotation\.md/);
    });

    test('[P0] runbook documents manual rotation steps for DAYTONA_API_KEY', () => {
      const content = loadRunbook();
      const section1 = content.split(/^##\s+.*Section 1/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section1).toMatch(/Daytona/i);
      expect(section1).toMatch(/Railway/i);
      expect(section1).toMatch(/redeploy/i);
    });

    test('[P0] runbook documents manual rotation steps for ANTHROPIC_API_KEY', () => {
      const content = loadRunbook();
      const section2 = content.split(/^##\s+.*Section 2/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section2).toMatch(/Anthropic/i);
      expect(section2).toMatch(/Railway/i);
      expect(section2).toMatch(/redeploy/i);
    });

    test('[P0] runbook documents manual rotation steps for AUTH_GITHUB_SECRET', () => {
      const content = loadRunbook();
      const section3 = content.split(/^##\s+.*Section 3/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section3).toMatch(/GitHub/i);
      expect(section3).toMatch(/Vercel/i);
      expect(section3).toMatch(/redeploy/i);
    });

    test('[P0] runbook documents manual rotation steps for AUTH_SECRET', () => {
      const content = loadRunbook();
      const section4 = content.split(/^##\s+.*Section 4/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section4).toMatch(/openssl/i);
      expect(section4).toMatch(/Vercel/i);
      expect(section4).toMatch(/Railway/i);
    });

    test('[P0] runbook documents CREDENTIAL_ENCRYPTION_KEK rotation reference', () => {
      const content = loadRunbook();
      const section5 = content.split(/^##\s+.*Section 5/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section5).toMatch(/kek-rotation\.md/);
      expect(section5).toMatch(/180.day/i);
    });

    test('[P0] runbook documents the Secret Inventory table with all 5 secrets', () => {
      const content = loadRunbook();
      const inventorySection =
        content.split(/^#+.*secret.*inventory/im)[1]?.split(/^#+/im)[0] ?? '';
      expect(inventorySection).toMatch(/DAYTONA_API_KEY/);
      expect(inventorySection).toMatch(/ANTHROPIC_API_KEY/);
      expect(inventorySection).toMatch(/AUTH_GITHUB_SECRET/);
      expect(inventorySection).toMatch(/AUTH_SECRET/);
      expect(inventorySection).toMatch(/CREDENTIAL_ENCRYPTION_KEK/);
    });
  });

  describe('AC-2: Cron job creates rotation issues', () => {
    test('[P0] workflow file exists at .github/workflows/secret-rotation-reminder.yml', () => {
      expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
    });

    test('[P0] workflow file is valid YAML', () => {
      expect(() => loadWorkflow()).not.toThrow();
    });

    test('[P0] workflow has a schedule trigger with weekly cron', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/schedule:/);
      expect(text).toMatch(/cron:/);
      expect(text).toMatch(/0 0 \* \* 1/);
    });

    test('[P0] workflow has workflow_dispatch trigger', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/workflow_dispatch/);
    });

    test('[P0] workflow has issues: write permission', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      expect(workflow.permissions).toBeDefined();
      expect(workflow.permissions?.issues).toBe('write');
    });

    test('[P0] workflow has contents: read permission', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      expect(workflow.permissions?.contents).toBe('read');
    });

    test('[P0] workflow has a check-secret-rotations job', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      expect(workflow.jobs).toBeDefined();
      expect(workflow.jobs).toHaveProperty('check-secret-rotations');
    });

    test('[P0] check-secret-rotations job runs on ubuntu-latest', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const job = getCheckJob(workflow);
      expect(job['runs-on']).toBe('ubuntu-latest');
    });

    test('[P0] workflow includes actions/checkout step', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      const checkoutStep = steps.find((s) => s.uses?.includes('actions/checkout'));
      expect(checkoutStep).toBeDefined();
    });

    test('[P0] workflow includes actions/setup-node step', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      const nodeStep = steps.find((s) => s.uses?.includes('actions/setup-node'));
      expect(nodeStep).toBeDefined();
    });

    test('[P0] workflow uses gh issue create or GitHub API for issue creation', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/gh issue create|gh api.*issues/);
    });

    test('[P0] workflow issue title format is "Rotate <secret-name> — due <date>"', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/Rotate \$\{SECRET_NAME\}.*due \$\{DUE_DATE\}/);
    });

    test('[P0] workflow links to the rotation runbook in issue body', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/secret-rotation-schedule\.md/);
    });

    test('[P0] workflow creates the secret-rotation label', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/gh label create.*secret-rotation/);
    });

    test('[P0] workflow checks for existing issues before creating (dedup)', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/gh issue list/);
    });

    test('[P0] workflow uses GH_TOKEN from GITHUB_TOKEN', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/GH_TOKEN.*GITHUB_TOKEN|GITHUB_TOKEN.*GH_TOKEN/);
    });

    test('[P0] due-date calculation script exists at .github/scripts/check-rotations.js', () => {
      expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
    });

    test('[P0] workflow calls the check-rotations.js script', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/check-rotations\.js/);
    });
  });

  describe('AC-3: Initial due dates and first issue', () => {
    test('[P0] config file exists at .github/secret-rotation-config.json', () => {
      expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    });

    test('[P0] config file is valid JSON', () => {
      expect(() => loadConfig()).not.toThrow();
    });

    test('[P0] config file has productionLaunchDate field', () => {
      const config = getConfig();
      expect(config.productionLaunchDate).toBeDefined();
      // productionLaunchDate may be null (no launch date yet) or a date string.
      expect(
        config.productionLaunchDate === null ||
          typeof config.productionLaunchDate === 'string',
      ).toBe(true);
    });

    test('[P0] config file has reminderWindowDays field', () => {
      const config = getConfig();
      expect(config.reminderWindowDays).toBeDefined();
      expect(config.reminderWindowDays).toBe(7);
    });

    test('[P0] config file has secrets array with all 5 secrets', () => {
      const config = getConfig();
      expect(config.secrets).toBeDefined();
      expect(Array.isArray(config.secrets)).toBe(true);
      expect(config.secrets).toHaveLength(5);
      const names = config.secrets.map((s) => s.name);
      expect(names).toContain('DAYTONA_API_KEY');
      expect(names).toContain('ANTHROPIC_API_KEY');
      expect(names).toContain('AUTH_GITHUB_SECRET');
      expect(names).toContain('AUTH_SECRET');
      expect(names).toContain('CREDENTIAL_ENCRYPTION_KEK');
    });

    test('[P0] each secret has name, rotationIntervalDays, platform, runbookSection', () => {
      const config = getConfig();
      for (const secret of config.secrets) {
        expect(secret.name).toBeDefined();
        expect(secret.rotationIntervalDays).toBeDefined();
        expect(secret.platform).toBeDefined();
        expect(secret.runbookSection).toBeDefined();
      }
    });

    test('[P0] API keys (DAYTONA_API_KEY, ANTHROPIC_API_KEY) have 90-day interval', () => {
      const config = getConfig();
      const daytona = config.secrets.find((s) => s.name === 'DAYTONA_API_KEY');
      const anthropic = config.secrets.find((s) => s.name === 'ANTHROPIC_API_KEY');
      expect(daytona?.rotationIntervalDays).toBe(90);
      expect(anthropic?.rotationIntervalDays).toBe(90);
    });

    test('[P0] OAuth secrets and KEK have 180-day interval', () => {
      const config = getConfig();
      const githubSecret = config.secrets.find((s) => s.name === 'AUTH_GITHUB_SECRET');
      const authSecret = config.secrets.find((s) => s.name === 'AUTH_SECRET');
      const kek = config.secrets.find((s) => s.name === 'CREDENTIAL_ENCRYPTION_KEK');
      expect(githubSecret?.rotationIntervalDays).toBe(180);
      expect(authSecret?.rotationIntervalDays).toBe(180);
      expect(kek?.rotationIntervalDays).toBe(180);
    });

    test('[P0] CREDENTIAL_ENCRYPTION_KEK has runbookRef pointing to kek-rotation.md', () => {
      const config = getConfig();
      const kek = config.secrets.find((s) => s.name === 'CREDENTIAL_ENCRYPTION_KEK');
      expect(kek?.runbookRef).toMatch(/kek-rotation\.md/);
    });

    test('[P0] runbook documents the production launch date in Verification Record', () => {
      const content = loadRunbook();
      const verificationSection =
        content.split(/^#+.*verification.*record/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(verificationSection).toMatch(/<production-launch-date>/);
    });
  });

  describe('AC-4: Out of scope documented', () => {
    test('[P0] runbook documents automated secret rotation as out of scope', () => {
      const content = loadRunbook();
      const outOfScopeSection =
        content.split(/^#+.*out.*of.*scope/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(outOfScopeSection).toMatch(/automated.*rotation/i);
    });

    test('[P0] runbook documents DATABASE_URL rotation as out of scope', () => {
      const content = loadRunbook();
      const outOfScopeSection =
        content.split(/^#+.*out.*of.*scope/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(outOfScopeSection).toMatch(/DATABASE_URL/i);
    });
  });

  describe('AUTH_SECRET dual-purpose documentation (deferred finding)', () => {
    test('[P0] runbook documents AUTH_SECRET is used for both Auth.js sessions AND boundary JWT', () => {
      const content = loadRunbook();
      const section4 = content.split(/^##\s+.*Section 4/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section4).toMatch(/boundary.*JWT/i);
      expect(section4).toMatch(/Auth\.js/i);
    });

    test('[P0] runbook documents the impact of AUTH_SECRET rotation (invalidates sessions and boundary JWTs)', () => {
      const content = loadRunbook();
      const section4 = content.split(/^##\s+.*Section 4/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section4).toMatch(/invalidat/i);
    });

    test('[P0] runbook documents both Vercel and Railway must be updated simultaneously for AUTH_SECRET', () => {
      const content = loadRunbook();
      const section4 = content.split(/^##\s+.*Section 4/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(section4).toMatch(/Vercel/i);
      expect(section4).toMatch(/Railway/i);
      expect(section4).toMatch(/simultaneous/i);
    });

    test('[P0] runbook references boundary-jwt.ts or boundary-jwt.guard.ts or mentions "boundary JWT"', () => {
      const content = loadRunbook();
      expect(content).toMatch(/boundary.jwt|boundary-jwt/i);
    });
  });

  describe('Security: credential-isolation regression guards', () => {
    test('[P0] runbook does not contain Bearer followed by a literal token value', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/Bearer\s+(?![$"'<])/);
    });

    test('[P0] runbook does not contain database connection strings with passwords', () => {
      const content = loadRunbook();
      expect(content).not.toMatch(/(?:postgresql|postgres):\/\/[^:]+:[^@]*@/);
    });

    test('[P0] runbook does not contain literal credential env-var assignments', () => {
      const content = loadRunbook();
      for (const credVar of CREDENTIAL_ENV_VARS) {
        expect(content).not.toMatch(
          new RegExp(`\\b${credVar}\\s*=\\s*['"]?[A-Za-z0-9]`),
        );
      }
    });

    test('[P0] config file does not contain literal credential values', () => {
      const content = loadConfigText();
      expect(content).not.toMatch(/sk-[A-Za-z0-9]/);
      expect(content).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
      expect(content).not.toMatch(/[0-9a-f]{64}/i);
    });

    test('[P0] workflow does not contain literal credential values', () => {
      const text = loadWorkflowText();
      expect(text).not.toMatch(/sk-[A-Za-z0-9]/);
      expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
      expect(text).not.toMatch(/[0-9a-f]{64}/i);
    });

    test('[P0] no credential env-var names appear as $VAR or ${VAR} in workflow run: blocks', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        for (const credVar of CREDENTIAL_ENV_VARS) {
          expect(step.run).not.toMatch(new RegExp(`\\$${credVar}\\b`));
          expect(step.run).not.toMatch(new RegExp(`\\$\\{${credVar}\\}`));
        }
      }
    });
  });

  describe('Security: input-injection regression guards', () => {
    test('[P0] runbook uses <placeholder> syntax for variable values', () => {
      const content = loadRunbook();
      expect(content).toMatch(/<[a-z-]+>/i);
    });

    test('[P0] config file uses valid date, <YYYY-MM-DD> placeholder, or null for productionLaunchDate', () => {
      const config = getConfig();
      // productionLaunchDate is either a valid date string, the placeholder,
      // or null (no launch date yet — tracking inactive).
      expect(
        config.productionLaunchDate === null ||
          (typeof config.productionLaunchDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$|<YYYY-MM-DD>/.test(config.productionLaunchDate)),
      ).toBe(true);
    });

    test('[P0] no ${{ }} expressions in workflow run: blocks (script injection prevention)', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        expect(step.run).not.toMatch(/\$\{\{[^}]+\}\}/);
      }
    });

    test('[P0] workflow passes dynamic values through env: intermediaries', () => {
      // Strengthened: the concern is that dynamic `${{ }}` values are routed
      // through `env:` mappings (the intermediary pattern) rather than being
      // interpolated directly into `run:` blocks. A static env entry like
      // `CONFIG_PATH: .github/...` satisfied the previous "any env present"
      // assertion without proving the intermediary pattern is actually used.
      // Here we require at least one `env:` mapping to reference a `${{ }}`
      // expression, and (orthogonally) that no `run:` block interpolates one.
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      const usesIntermediary = steps.some(
        (s) =>
          s.env !== undefined &&
          Object.values(s.env).some((v) => /\$\{\{[^}]+\}\}/.test(v)),
      );
      expect(usesIntermediary).toBe(true);
      // No `run:` block should interpolate `${{ }}` directly — must go via env.
      for (const step of steps) {
        if (!step.run) continue;
        expect(step.run).not.toMatch(/\$\{\{[^}]+\}\}/);
      }
    });
  });

  describe('curl flags', () => {
    test('[P0] every curl command in runbook includes --fail flag', () => {
      const content = loadRunbook();
      const codeBlocks = content.match(/```[\s\S]*?```/g) ?? [];
      const curlBlocks = codeBlocks.filter((b) => /curl\s/i.test(b));
      if (curlBlocks.length > 0) {
        for (const block of curlBlocks) {
          expect(block).toMatch(/--fail\b/);
        }
      }
    });

    test('[P0] every curl command in runbook includes --max-time flag', () => {
      const content = loadRunbook();
      const codeBlocks = content.match(/```[\s\S]*?```/g) ?? [];
      const curlBlocks = codeBlocks.filter((b) => /curl\s/i.test(b));
      if (curlBlocks.length > 0) {
        for (const block of curlBlocks) {
          expect(block).toMatch(/--max-time\b/);
        }
      }
    });
  });

  describe('Config file structure', () => {
    test('[P0] config file has valid JSON structure', () => {
      expect(() => loadConfig()).not.toThrow();
    });

    test('[P0] config file has required top-level fields', () => {
      const config = getConfig();
      expect(config.productionLaunchDate).toBeDefined();
      expect(config.reminderWindowDays).toBeDefined();
      expect(config.secrets).toBeDefined();
    });

    test('[P0] config secrets array has 5 entries with correct intervals', () => {
      const config = getConfig();
      expect(config.secrets).toHaveLength(5);
      const daytona = config.secrets.find((s) => s.name === 'DAYTONA_API_KEY');
      const anthropic = config.secrets.find((s) => s.name === 'ANTHROPIC_API_KEY');
      const githubSecret = config.secrets.find((s) => s.name === 'AUTH_GITHUB_SECRET');
      const authSecret = config.secrets.find((s) => s.name === 'AUTH_SECRET');
      const kek = config.secrets.find((s) => s.name === 'CREDENTIAL_ENCRYPTION_KEK');
      expect(daytona?.rotationIntervalDays).toBe(90);
      expect(anthropic?.rotationIntervalDays).toBe(90);
      expect(githubSecret?.rotationIntervalDays).toBe(180);
      expect(authSecret?.rotationIntervalDays).toBe(180);
      expect(kek?.rotationIntervalDays).toBe(180);
    });
  });

  describe('Workflow YAML structure', () => {
    test('[P0] workflow has valid YAML structure', () => {
      expect(() => loadWorkflow()).not.toThrow();
    });

    test('[P0] workflow has schedule and workflow_dispatch triggers', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/schedule:/);
      expect(text).toMatch(/workflow_dispatch/);
    });

    test('[P0] workflow has issues: write and contents: read permissions', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      expect(workflow.permissions?.issues).toBe('write');
      expect(workflow.permissions?.contents).toBe('read');
    });

    test('[P0] workflow has checkout step', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      const checkoutStep = steps.find((s) => s.uses?.includes('actions/checkout'));
      expect(checkoutStep).toBeDefined();
    });

    test('[P0] workflow has issue creation step', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/gh issue create/);
    });

    test('[P0] workflow has concurrency block to prevent duplicate issues from overlapping runs', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      expect(workflow.concurrency).toBeDefined();
      expect(workflow.concurrency?.group).toBe('secret-rotation-reminder');
      expect(workflow.concurrency?.['cancel-in-progress']).toBe(true);
    });

    test('[P0] workflow has timeout-minutes to prevent hung runs', () => {
      const workflow = loadWorkflow() as WorkflowFile;
      const job = getCheckJob(workflow);
      expect(job['timeout-minutes']).toBeDefined();
      expect(typeof job['timeout-minutes']).toBe('number');
      expect(job['timeout-minutes']).toBeGreaterThan(0);
    });
  });

  describe('Script injection prevention in workflow', () => {
    test('[P0] no ${{ }} expressions in run: blocks (YAML-parsed, covers single-line and multi-line run)', () => {
      // Previous raw-text regex only matched the multi-line `run: |` form,
      // so a single-line `run: cmd ${{ secrets.X }}` would slip through.
      // Parse the workflow YAML and inspect every step's `run` field instead.
      // Mirrors the pattern in deploy-workflow.spec.ts.
      const workflow = loadWorkflow() as WorkflowFile;
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        expect(step.run).not.toMatch(/\$\{\{[^}]+\}\}/);
      }
    });
  });

  describe('Rollback procedure', () => {
    test('[P0] runbook contains a rollback section', () => {
      const content = loadRunbook();
      expect(content).toMatch(/^#+.*rollback/im);
    });

    test('[P0] rollback section documents how to revert each secret rotation', () => {
      const content = loadRunbook();
      const rollbackSection =
        content.split(/^##\s+Rollback/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(rollbackSection).toMatch(/old.*value|old.*secret|revert/i);
      expect(rollbackSection).toMatch(/DAYTONA_API_KEY/);
      expect(rollbackSection).toMatch(/ANTHROPIC_API_KEY/);
      expect(rollbackSection).toMatch(/AUTH_GITHUB_SECRET/);
      expect(rollbackSection).toMatch(/AUTH_SECRET/);
      expect(rollbackSection).toMatch(/CREDENTIAL_ENCRYPTION_KEK/);
    });

    test('[P0] rollback section documents that revoked secrets cannot be recovered', () => {
      const content = loadRunbook();
      const rollbackSection =
        content.split(/^##\s+Rollback/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(rollbackSection).toMatch(/cannot.*recover|new.*key.*must.*generat|irreversib/i);
    });

    test('[P0] rollback section documents AUTH_SECRET requires simultaneous update', () => {
      const content = loadRunbook();
      const rollbackSection =
        content.split(/^##\s+Rollback/im)[1]?.split(/^##\s/im)[0] ?? '';
      expect(rollbackSection).toMatch(/AUTH_SECRET/i);
      expect(rollbackSection).toMatch(/Vercel.*Railway|both/i);
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
});

/**
 * @jest-environment node
 *
 * Story 4.6: Add the Manual-Trigger Deploy Step to CI
 *
 * Verifies:
 * - AC-1: Manual trigger only (workflow_dispatch), deploys both apps/web (Vercel)
 *         and apps/agent-be (Railway). Never runs on push/PR/schedule.
 * - AC-2: Quality gate dependency — verifies latest Test Pipeline run on the same
 *         branch passed before deploying. Does not bypass the quality gate.
 * - AC-3: GitHub Environment with protection rules — uses environment: production.
 *
 * Security regression guards (uniform guard template for external commands with
 * user-controlled input):
 * - Credential-isolation invariants: no credentials leak via command arguments
 *   or environment variables (VERCEL_TOKEN, RAILWAY_TOKEN referenced only via
 *   secrets.*, never hardcoded).
 * - Input-injection invariants: github.ref_name passed through env: intermediaries,
 *   not direct ${{ }} interpolation in run: blocks. Branch name is safely quoted.
 *
 * Run: yarn nx test agent-be -- --testPathPattern=deploy-workflow
 */

import * as fs from 'fs';
import * as path from 'path';

const yaml = require('js-yaml') as { load: (input: string) => unknown };

const WORKFLOW_PATH = path.resolve(
  __dirname,
  '../../../../.github/workflows/deploy.yml',
);

interface WorkflowStep {
  name?: string;
  id?: string;
  run?: string;
  env?: Record<string, string>;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  'runs-on'?: string;
  environment?: string;
  'timeout-minutes'?: number;
  steps?: WorkflowStep[];
}

interface WorkflowFile {
  name?: string;
  on?: unknown;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, WorkflowJob>;
}

function loadWorkflow(): WorkflowFile {
  const content = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  return yaml.load(content) as WorkflowFile;
}

function loadWorkflowText(): string {
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

function getDeployJob(workflow: WorkflowFile): WorkflowJob {
  const jobs = workflow.jobs;
  if (!jobs) throw new Error('No jobs section in deploy.yml');
  const deployJob = jobs['deploy'];
  if (!deployJob) throw new Error('No "deploy" job in deploy.yml');
  return deployJob;
}

function getSteps(workflow: WorkflowFile): WorkflowStep[] {
  const job = getDeployJob(workflow);
  if (!job.steps) throw new Error('No steps in deploy job');
  return job.steps;
}

const CREDENTIAL_ENV_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GITHUB_ID',
  'AUTH_GITHUB_SECRET',
  'CREDENTIAL_ENCRYPTION_KEK',
  'DAYTONA_API_KEY',
  'DAYTONA_API_URL',
  'ANTHROPIC_API_KEY',
  'VERCEL_TOKEN',
  'RAILWAY_TOKEN',
];

describe('Story 4.6 — Deploy Workflow', () => {
  describe('AC-1: Manual trigger only, deploys both services', () => {
    test('[P0] workflow file exists and is valid YAML', () => {
      expect(() => loadWorkflow()).not.toThrow();
    });

    test('[P0] workflow name is "Deploy to Production"', () => {
      const workflow = loadWorkflow();
      expect(workflow.name).toBe('Deploy to Production');
    });

    test('[P0] on: trigger is workflow_dispatch (string form)', () => {
      const workflow = loadWorkflow();
      expect(workflow.on).toBe('workflow_dispatch');
    });

    test('[P0] on: trigger contains ONLY workflow_dispatch (raw text — non-vacuous)', () => {
      // String form "on: workflow_dispatch" cannot hold other triggers.
      // Assert on the raw YAML so the test is never a no-op.
      const text = loadWorkflowText();
      expect(text).toMatch(/^on:\s*workflow_dispatch\s*$/m);
    });

    test('[P0] on: trigger does NOT contain push', () => {
      const text = loadWorkflowText();
      expect(text).not.toMatch(/^\s*push:/m);
    });

    test('[P0] on: trigger does NOT contain pull_request', () => {
      const text = loadWorkflowText();
      expect(text).not.toMatch(/^\s*pull_request:/m);
    });

    test('[P0] on: trigger does NOT contain schedule', () => {
      const text = loadWorkflowText();
      expect(text).not.toMatch(/^\s*schedule:/m);
    });

    test('[P0] workflow has a "deploy" job', () => {
      const workflow = loadWorkflow();
      expect(workflow.jobs).toBeDefined();
      expect(workflow.jobs).toHaveProperty('deploy');
    });

    test('[P0] deploy job runs on ubuntu-latest', () => {
      const workflow = loadWorkflow();
      const job = getDeployJob(workflow);
      expect(job['runs-on']).toBe('ubuntu-latest');
    });

    test('[P0] deploy job includes a Vercel deploy step (apps/web)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const vercelStep = steps.find((s) => s.run?.includes('vercel deploy'));
      expect(vercelStep).toBeDefined();
      expect(vercelStep?.run).toContain('--prod');
      // --cwd=apps/web must NOT be present: the Vercel project dashboard has
      // "Root Directory" set to apps/web, so --cwd=apps/web doubles the path
      // to apps/web/apps/web (deploy run #8 failure). VERCEL_PROJECT_ID/
      // VERCEL_ORG_ID env vars handle project association without --cwd.
      expect(vercelStep?.run).not.toContain('--cwd=apps/web');
    });

    test('[P0] deploy job includes a Railway deploy step (apps/agent-be)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const railwayStep = steps.find(
        (s) => s.run?.includes('railway up') || s.run?.includes('railway'),
      );
      expect(railwayStep).toBeDefined();
      expect(railwayStep?.run).toContain('railway up');
    });
  });

  describe('AC-2: Quality gate dependency', () => {
    test('[P0] quality-gate verification step exists in the deploy job', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find(
        (s) =>
          s.run?.includes('gh run list') ||
          s.name?.toLowerCase().includes('quality'),
      );
      expect(gateStep).toBeDefined();
    });

    test('[P0] quality-gate step is the FIRST step in the deploy job', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      expect(steps.length).toBeGreaterThan(0);
      const firstStep = steps[0];
      expect(
        firstStep.run?.includes('gh run list') ||
          firstStep.name?.toLowerCase().includes('quality'),
      ).toBe(true);
    });

    test('[P0] quality-gate step uses gh run list --workflow=test.yml', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.run).toContain('--workflow=test.yml');
    });

    test('[P0] quality-gate step checks for conclusion success', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.run).toContain('success');
      expect(gateStep?.run).toContain('Proceeding with deploy');
    });

    test('[P0] quality-gate step fails if no completed run exists', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.run).toContain('No completed Test Pipeline run found');
      expect(gateStep?.run).toContain('Run the Test Pipeline first');
      expect(gateStep?.run).toMatch(/exit 1/i);
    });

    test('[P0] quality-gate step uses GH_TOKEN from GITHUB_TOKEN', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.env?.GH_TOKEN).toContain('GITHUB_TOKEN');
    });

    test('[P0] quality-gate step fetches headSha and asserts it matches github.sha', () => {
      // Regression guard for NFR finding C2: the gate previously checked only
      // conclusion=success, never comparing the run's headSha to github.sha.
      // A stale green run on an older commit could satisfy the gate. This
      // test asserts the gate now references headSha (fetched via --json) and
      // compares it to the deploy commit SHA (passed through an env:
      // intermediary, never direct ${{ }} interpolation).
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      // headSha must be one of the --json fields fetched from gh run list.
      expect(gateStep?.run).toContain('headSha');
      // The deploy commit SHA must be passed through an env: intermediary.
      expect(gateStep?.env?.SHA).toContain('github.sha');
      // The run block must compare the fetched headSha to $SHA (no direct
      // ${{ github.sha }} interpolation in the run: block).
      expect(gateStep?.run).toContain('$SHA');
      expect(gateStep?.run).not.toMatch(/\$\{\{[^}]*sha[^}]*\}\}/i);
    });

    test('[P0] quality-gate step filters for push/pull_request events (not schedule)', () => {
      // Regression guard for NFR finding C2: nightly schedule runs skip
      // PR-tier jobs and conclude success with only nightly-specific jobs.
      // The gate must only accept runs triggered by push or pull_request.
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.run).toContain('event');
      expect(gateStep?.run).toMatch(/["']push["']/);
      expect(gateStep?.run).toMatch(/["']pull_request["']/);
    });
  });

  describe('AC-3: GitHub Environment with protection rules', () => {
    test('[P0] deploy job uses environment: production', () => {
      const workflow = loadWorkflow();
      const job = getDeployJob(workflow);
      expect(job.environment).toBe('production');
    });
  });

  describe('Security: permissions and concurrency', () => {
    test('[P0] permissions block is least-privilege (actions: read, contents: read)', () => {
      const workflow = loadWorkflow();
      expect(workflow.permissions).toBeDefined();
      expect(workflow.permissions?.actions).toBe('read');
      expect(workflow.permissions?.contents).toBe('read');
    });

    test('[P0] concurrency group prevents concurrent deploys', () => {
      const workflow = loadWorkflow();
      expect(workflow.concurrency).toBeDefined();
      expect(workflow.concurrency?.group).toBe('deploy-production');
      expect(workflow.concurrency?.['cancel-in-progress']).toBe(false);
    });

    test('[P0] deploy job has timeout-minutes set', () => {
      const workflow = loadWorkflow();
      const job = getDeployJob(workflow);
      expect(job['timeout-minutes']).toBeDefined();
      expect(job['timeout-minutes']).toBeGreaterThan(0);
    });
  });

  describe('Security: credential-isolation regression guards (uniform guard template)', () => {
    test('[P0] VERCEL_TOKEN is referenced only via secrets.*, never as a literal value', () => {
      const text = loadWorkflowText();
      expect(text).toContain('secrets.VERCEL_TOKEN');
      expect(text).not.toMatch(/VERCEL_TOKEN\s*[:=]\s*['"][^$]/);
      expect(text).not.toMatch(/VERCEL_TOKEN\s*[:=]\s*vcp_/);
    });

    test('[P0] RAILWAY_TOKEN is referenced only via secrets.*, never as a literal value', () => {
      const text = loadWorkflowText();
      expect(text).toContain('secrets.RAILWAY_TOKEN');
      expect(text).not.toMatch(/RAILWAY_TOKEN\s*[:=]\s*['"][^$]/);
      expect(text).not.toMatch(/RAILWAY_TOKEN\s*[:=]\s*d49618b7/);
    });

    test('[P0] no credential env-var names appear as literal values in run: blocks', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        for (const credVar of CREDENTIAL_ENV_VARS) {
          expect(step.run).not.toContain(`${credVar}=`);
          expect(step.run).not.toMatch(new RegExp(`\\$${credVar}\\b`));
          expect(step.run).not.toMatch(new RegExp(`\\$\\{${credVar}\\}`));
        }
      }
    });

    test('[P0] no credential values appear in the workflow YAML (credential isolation)', () => {
      const text = loadWorkflowText();
      expect(text).not.toMatch(/vcp_[A-Za-z0-9]/);
      // Vercel tokens are long-lived secrets prefixed with `sk-` followed by a
      // long alphanumeric string. Require a minimum length so benign short
      // matches (e.g. a hypothetical `sk-i` substring in a step name) don't
      // trip the guard. The previous `/sk-[A-Za-z0-9]/` matched any single
      // alphanumeric char after `sk-`.
      expect(text).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
      // Railway token: previously guarded by a hardcoded token fragment
      // (`d49618b7`) which breaks on the next token rotation. Instead assert
      // the Railway token is referenced via an env-var intermediary
      // (`${{ secrets.RAILWAY_TOKEN }}` mapped into a step `env:`), never
      // hardcoded inline in a `run:` block.
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const railwayEnvIntermediary = steps.some(
        (s) =>
          s.env?.RAILWAY_TOKEN === '${{ secrets.RAILWAY_TOKEN }}',
      );
      expect(railwayEnvIntermediary).toBe(true);
      for (const step of steps) {
        if (!step.run) continue;
        // The Railway token must never appear inline in a run: block — it
        // must be consumed via the $RAILWAY_TOKEN env var reference only.
        expect(step.run).not.toMatch(/RAILWAY_TOKEN\s*=\s*['"][^'"]+['"]/);
      }
    });

    test('[P0] VERCEL_PROJECT_ID and VERCEL_ORG_ID are in env: (not secrets, but not in run: blocks)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const vercelStep = steps.find((s) => s.run?.includes('vercel deploy'));
      expect(vercelStep).toBeDefined();
      expect(vercelStep?.env?.VERCEL_PROJECT_ID).toBeDefined();
      expect(vercelStep?.env?.VERCEL_ORG_ID).toBeDefined();
    });
  });

  describe('Security: input-injection regression guards (uniform guard template)', () => {
    test('[P0] github.ref_name is NOT directly interpolated in run: blocks', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        expect(step.run).not.toContain('${{ github.ref_name }}');
        expect(step.run).not.toContain('${{github.ref_name}}');
      }
    });

    test('[P0] github.ref_name IS passed through env: intermediaries', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.env).toBeDefined();
      const envValues = Object.values(gateStep?.env ?? {});
      const hasRefName = envValues.some(
        (v) => v.includes('github.ref_name') || v.includes('${{ github.ref_name }}'),
      );
      expect(hasRefName).toBe(true);
    });

    test('[P0] branch name is safely quoted in shell commands (no unquoted $BRANCH)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.run).toMatch(/"\$BRANCH"|'\$BRANCH'/);
      expect(gateStep?.run).not.toMatch(/--branch=\$BRANCH(?!\S)/);
    });

    test('[P0] no ${{ }} expressions in run: blocks except via env: intermediaries', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        expect(step.run).not.toMatch(/\$\{\{[^}]+\}\}/);
      }
    });
  });

  describe('Deployment summary step', () => {
    test('[P0] deploy job includes a deployment summary step writing to GITHUB_STEP_SUMMARY', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const summaryStep = steps.find(
        (s) =>
          s.run?.includes('GITHUB_STEP_SUMMARY') ||
          s.name?.toLowerCase().includes('summary'),
      );
      expect(summaryStep).toBeDefined();
      expect(summaryStep?.run).toContain('GITHUB_STEP_SUMMARY');
    });
  });

  describe('Auto-rollback: Vercel rollback on Railway failure', () => {
    test('[P0] capture step exists and runs vercel ls --prod --format json', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const captureStep = steps.find(
        (s) => s.run?.includes('vercel ls') && s.run?.includes('--format json'),
      );
      expect(captureStep).toBeDefined();
      expect(captureStep?.run).toContain('--prod');
      // --cwd=apps/web removed to prevent path doubling (see deploy step comment).
      expect(captureStep?.run).not.toContain('--cwd=apps/web');
    });

    test('[P0] capture step stores PREVIOUS_VERCEL_DEPLOYMENT in GITHUB_ENV', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const captureStep = steps.find((s) => s.run?.includes('vercel ls'));
      expect(captureStep).toBeDefined();
      expect(captureStep?.run).toContain('PREVIOUS_VERCEL_DEPLOYMENT');
      expect(captureStep?.run).toContain('GITHUB_ENV');
    });

    test('[P0] capture step handles no-previous-deployment case (sets empty)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const captureStep = steps.find((s) => s.run?.includes('vercel ls'));
      expect(captureStep).toBeDefined();
      expect(captureStep?.run).toMatch(/No previous READY production deployment/i);
      expect(captureStep?.run).toMatch(/PREVIOUS_VERCEL_DEPLOYMENT=\s*["']?\s*>>/);
    });

    test('[P0] capture step runs BEFORE the Vercel deploy step', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const captureIdx = steps.findIndex((s) => s.run?.includes('vercel ls'));
      const deployIdx = steps.findIndex((s) => s.run?.includes('vercel deploy'));
      expect(captureIdx).toBeGreaterThanOrEqual(0);
      expect(deployIdx).toBeGreaterThanOrEqual(0);
      expect(captureIdx).toBeLessThan(deployIdx);
    });

    test('[P0] capture step uses env: intermediaries for Vercel credentials (no --token flag)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const captureStep = steps.find((s) => s.run?.includes('vercel ls'));
      expect(captureStep).toBeDefined();
      expect(captureStep?.env?.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
      expect(captureStep?.run).not.toMatch(/--token\b/);
    });

    test('[P0] Railway deploy step has id: railway_deploy', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const railwayStep = steps.find((s) => s.run?.includes('railway up'));
      expect(railwayStep).toBeDefined();
      expect(railwayStep?.id).toBe('railway_deploy');
    });

    test('[P0] Railway health check step has id: railway_health', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const healthStep = steps.find(
        (s) => s.name?.toLowerCase().includes('agent-be') && s.run?.includes('curl'),
      );
      expect(healthStep).toBeDefined();
      expect(healthStep?.id).toBe('railway_health');
    });

    test('[P0] rollback step exists with vercel rollback command', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const rollbackStep = steps.find((s) => s.run?.includes('vercel rollback'));
      expect(rollbackStep).toBeDefined();
      expect(rollbackStep?.run).toContain('--yes');
      // --cwd=apps/web removed to prevent path doubling (see deploy step comment).
      expect(rollbackStep?.run).not.toContain('--cwd=apps/web');
    });

    test('[P0] rollback step has if: failure() condition', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/if:\s*failure\(\)/);
    });

    test('[P0] rollback step if: condition references railway_deploy and railway_health outcomes', () => {
      const text = loadWorkflowText();
      expect(text).toMatch(/steps\.railway_deploy\.outcome/);
      expect(text).toMatch(/steps\.railway_health\.outcome/);
    });

    test('[P0] rollback step handles empty PREVIOUS_VERCEL_DEPLOYMENT with ::error:: and exit 1', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const rollbackStep = steps.find((s) => s.run?.includes('vercel rollback'));
      expect(rollbackStep).toBeDefined();
      expect(rollbackStep?.run).toContain('PREVIOUS_VERCEL_DEPLOYMENT');
      expect(rollbackStep?.run).toMatch(/::error::/);
      expect(rollbackStep?.run).toMatch(/exit 1/);
    });

    test('[P0] rollback step handles vercel rollback failure with ::error:: and exit 1', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const rollbackStep = steps.find((s) => s.run?.includes('vercel rollback'));
      expect(rollbackStep).toBeDefined();
      expect(rollbackStep?.run).toMatch(/if\s*!/);
      expect(rollbackStep?.run).toMatch(/::error::.*rollback.*failed/i);
    });

    test('[P0] rollback step uses env: intermediaries for Vercel credentials (no --token flag)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const rollbackStep = steps.find((s) => s.run?.includes('vercel rollback'));
      expect(rollbackStep).toBeDefined();
      expect(rollbackStep?.env?.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
      expect(rollbackStep?.run).not.toMatch(/--token\b/);
    });

    test('[P0] rollback step runs AFTER Railway health check step', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const rollbackIdx = steps.findIndex((s) => s.run?.includes('vercel rollback'));
      const healthIdx = steps.findIndex((s) => s.id === 'railway_health');
      expect(rollbackIdx).toBeGreaterThanOrEqual(0);
      expect(healthIdx).toBeGreaterThanOrEqual(0);
      expect(rollbackIdx).toBeGreaterThan(healthIdx);
    });
  });
});

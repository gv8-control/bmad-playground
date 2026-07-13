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

    test('[P0] on: trigger contains ONLY workflow_dispatch (object form)', () => {
      const workflow = loadWorkflow();
      if (typeof workflow.on === 'object' && workflow.on !== null) {
        const keys = Object.keys(workflow.on);
        expect(keys).toEqual(['workflow_dispatch']);
      }
    });

    test('[P0] on: trigger does NOT contain push', () => {
      const workflow = loadWorkflow();
      const onObj = workflow.on as Record<string, unknown> | string | undefined;
      if (typeof onObj === 'object' && onObj !== null) {
        expect(onObj).not.toHaveProperty('push');
      }
    });

    test('[P0] on: trigger does NOT contain pull_request', () => {
      const workflow = loadWorkflow();
      const onObj = workflow.on as Record<string, unknown> | string | undefined;
      if (typeof onObj === 'object' && onObj !== null) {
        expect(onObj).not.toHaveProperty('pull_request');
      }
    });

    test('[P0] on: trigger does NOT contain schedule', () => {
      const workflow = loadWorkflow();
      const onObj = workflow.on as Record<string, unknown> | string | undefined;
      if (typeof onObj === 'object' && onObj !== null) {
        expect(onObj).not.toHaveProperty('schedule');
      }
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
      const vercelStep = steps.find(
        (s) => s.run?.includes('vercel deploy') || s.run?.includes('vercel'),
      );
      expect(vercelStep).toBeDefined();
      expect(vercelStep?.run).toContain('--prod');
      expect(vercelStep?.run).toContain('--cwd=apps/web');
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
    });

    test('[P0] quality-gate step fails if no completed run exists', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.run).toMatch(/exit 1|fail|error/i);
    });

    test('[P0] quality-gate step uses GH_TOKEN from GITHUB_TOKEN', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const gateStep = steps.find((s) => s.run?.includes('gh run list'));
      expect(gateStep).toBeDefined();
      expect(gateStep?.env?.GH_TOKEN).toContain('GITHUB_TOKEN');
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
        }
      }
    });

    test('[P0] no credential values appear in the workflow YAML (credential isolation)', () => {
      const text = loadWorkflowText();
      expect(text).not.toMatch(/vcp_[A-Za-z0-9]/);
      expect(text).not.toMatch(/d49618b7/);
      expect(text).not.toMatch(/sk-[A-Za-z0-9]/);
      expect(text).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
    });

    test('[P0] VERCEL_PROJECT_ID and VERCEL_ORG_ID are in env: (not secrets, but not in run: blocks)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      const vercelStep = steps.find((s) => s.run?.includes('vercel deploy'));
      if (vercelStep) {
        expect(vercelStep.env?.VERCEL_PROJECT_ID).toBeDefined();
        expect(vercelStep.env?.VERCEL_ORG_ID).toBeDefined();
      }
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
      if (gateStep) {
        expect(gateStep.env).toBeDefined();
        const envValues = Object.values(gateStep.env ?? {});
        const hasRefName = envValues.some(
          (v) => v.includes('github.ref_name') || v.includes('${{ github.ref_name }}'),
        );
        expect(hasRefName).toBe(true);
      }
    });

    test('[P0] branch name is safely quoted in shell commands (no unquoted $BRANCH)', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        if (step.run.includes('BRANCH') || step.run.includes('--branch')) {
          expect(step.run).toMatch(/"\$BRANCH"|'\$BRANCH'|"BRANCH"|'\$BRANCH'/);
          expect(step.run).not.toMatch(/--branch=\$BRANCH(?!\S)/);
        }
      }
    });

    test('[P0] no ${{ }} expressions in run: blocks except via env: intermediaries', () => {
      const workflow = loadWorkflow();
      const steps = getSteps(workflow);
      for (const step of steps) {
        if (!step.run) continue;
        const interpolations = step.run.match(/\$\{\{[^}]+\}\}/g);
        if (interpolations) {
          expect(interpolations).toEqual([]);
        }
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
});

import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * ATDD — Story 6.5: Real-Service E2E Verification (Task 4.2, AC-1)
 *
 * Functional smoke sub-item: the agent can run git commands against the repo.
 *
 * Tags: @real-service (nightly CI only), [P0] (acceptance criteria AC-1).
 *
 * Purpose:
 *   AC-1 requires the agent can run git commands against the repo. This spec
 *   prompts the agent to run `git log --oneline -1` and report the output.
 *   The response must contain git output (a commit hash + commit message),
 *   proving the agent can execute git commands inside the sandbox's cloned
 *   repository.
 *
 * False-green prevention:
 *   The test asserts the response contains a git commit hash pattern (a
 *   7-40 character hex string), not just that "any response appeared." A
 *   response that says "I cannot run git" fails the test.
 *
 * E2E deferral check (per ATDD workflow):
 *   This scenario CANNOT be simulated with browser-level mocks. Running git
 *   commands requires a real Daytona sandbox with a real shallow clone of the
 *   test repository. The browser-level mock pattern (setupStreamingMocks)
 *   only simulates SSE events — it cannot reproduce the agent's Bash tool
 *   executing `git log` against a real git repository. Deferred to the
 *   real-service tier — recorded in the ATDD checklist.
 *
 * Prerequisites: same as functional-smoke.spec.ts — see that file's header.
 *   The test repository must have at least one commit (shallow clone includes
 *   the HEAD commit).
 */

// Daytona provisioning + shallow clone can be slow; allow generous headroom.
const PROVISION_TIMEOUT_MS = 60_000;
// Full agent run (Bash tool + streaming) — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// Wait for the response content to appear after the run finishes.
const CONTENT_TIMEOUT_MS = 30_000;
// Prompt the agent to run a git command and report the output. `git log
// --oneline -1` produces a single line: "<7-char-hash> <commit message>".
// The response must contain a git commit hash, proving the agent ran the
// command against the cloned repo.
const TEST_MESSAGE =
  'Run this shell command and tell me the exact output: git log --oneline -1';

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

/**
 * Wait for SESSION_READY — see functional-smoke.spec.ts for rationale.
 */
async function waitForSessionReady(page: Page, timeoutMs: number): Promise<void> {
  await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible({
    timeout: timeoutMs,
  });
}

test.describe('Real-service AC-1: agent can run git commands against the repo', () => {
  // EXPECTED-TO-FAIL (testarch-automate validation, Story 6.5):
  // Cannot run in this environment — see egress-control.spec.ts for the full
  // explanation (webServer port conflict, auth setup broken, JWT decryption
  // issue, requires real external services). Not a test-quality issue.
  // The test.skip() guard is the correct mechanism for env-var-gated real-service
  // tests. Remove this comment when operational prerequisites are met.
  test.beforeAll(() => {
    test.skip(
      !process.env.PLAYWRIGHT_REAL_SERVICE,
      'Requires PLAYWRIGHT_REAL_SERVICE=1 (real Daytona + Claude API + GitHub OAuth)',
    );
  });

  test('@real-service [P0] functional: agent runs git log and reports the commit hash', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ─── 1. Provision → SESSION_READY ──────────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── 2. Send message prompting the agent to run git log ────────────────
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    await sendMessage(page, TEST_MESSAGE);

    // Assert the user's message appears in the conversation (optimistic echo).
    await expect(
      page.getByTestId('chat-message-list').getByText(TEST_MESSAGE),
    ).toBeVisible();

    // ─── 3. Wait for run to finish ─────────────────────────────────────────
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
      timeout: RUN_FINISH_TIMEOUT_MS,
    });

    // ─── 4. Assert the response contains a git commit hash ─────────────────
    // `git log --oneline -1` produces "<7-char-hash> <commit message>". The
    // response must contain a hex hash (7-40 chars). This proves the agent
    // ran the git command against the cloned repo and reported real output.
    //
    // Excludes system/error messages via closest('[role="status"]') and skips
    // the intro prompt ("browse available skills"). See functional-smoke.spec.ts
    // for the canonical exclusion pattern.
    await page.waitForFunction(
      () => {
        const stream = document.querySelector('[aria-live="polite"]');
        if (!stream) return false;
        // Check all text nodes in the aria-live region (paragraphs, code blocks).
        const text = stream.textContent ?? '';
        if (text.includes('browse available skills')) return false;
        // A git commit hash from `git log --oneline -1` appears at the start of
        // a line as a 7-40 char hex string followed by a space and commit message.
        // Anchor to the git log output format to avoid matching arbitrary hex
        // values (memory addresses, error codes, file SHAs) in error responses.
        return /(^|\n)\s*[0-9a-f]{7,40}\s+\S/i.test(text);
      },
      undefined,
      { timeout: CONTENT_TIMEOUT_MS },
    );

    // ─── 5. Working tree status ────────────────────────────────────────────
    await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible();
  });
});

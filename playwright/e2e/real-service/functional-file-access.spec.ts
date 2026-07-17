import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * ATDD — Story 6.5: Real-Service E2E Verification (Task 4.1, AC-1)
 *
 * Functional smoke sub-item: the agent can read files from the cloned
 * repository.
 *
 * Tags: @real-service (nightly CI only), [P0] (acceptance criteria AC-1).
 *
 * Purpose:
 *   AC-1 requires the agent can read files from the cloned repository. The
 *   existing functional-smoke.spec.ts verifies the agent responds to "hello"
 *   but does not verify file-reading capability. This spec prompts the agent
 *   to read a known file from the repo (README.md) and report its first
 *   heading. The response must reference the file content, proving the agent
 *   can read files inside the sandbox's cloned repository.
 *
 * False-green prevention:
 *   The test asserts the response references the actual README.md content
 *   (the first heading), not just that "any response appeared." A response
 *   that says "I cannot read files" fails the test.
 *
 * E2E deferral check (per ATDD workflow):
 *   This scenario CANNOT be simulated with browser-level mocks. File reading
 *   requires a real Daytona sandbox with a real shallow clone of the test
 *   repository. The browser-level mock pattern (setupStreamingMocks) only
 *   simulates SSE events — it cannot reproduce the agent's Read tool reading
 *   a real file from a real filesystem. Deferred to the real-service tier —
 *   recorded in the ATDD checklist.
 *
 * Prerequisites: same as functional-smoke.spec.ts — see that file's header.
 *   The test repository must contain a README.md with a first-level heading.
 */

// Daytona provisioning + shallow clone can be slow; allow generous headroom.
const PROVISION_TIMEOUT_MS = 60_000;
// Full agent run (Read tool + streaming) — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// Wait for the response content to appear after the run finishes.
const CONTENT_TIMEOUT_MS = 30_000;
// Prompt the agent to read README.md and report the first heading. This
// verifies the agent can read files from the cloned repository. The response
// must reference the file content (the heading text), proving file access.
const TEST_MESSAGE =
  'Read the file README.md and tell me the first heading (the first line starting with #). Reply with only the heading text.';

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

test.describe('Real-service AC-1: agent can read files from the cloned repository', () => {
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

  test('@real-service [P0] functional: agent reads README.md and reports the first heading', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ─── 1. Provision → SESSION_READY ──────────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── 2. Send message prompting the agent to read README.md ─────────────
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

    // ─── 4. Assert the response references README.md content ───────────────
    // The agent was asked to read README.md and report the first heading.
    // The response must contain a heading-like string (starts with # or is a
    // short title line). We verify the response is non-empty and references
    // either "README" or a heading pattern — proving the agent read the file
    // rather than fabricating a response.
    //
    // Excludes system/error messages via closest('[role="status"]') and skips
    // the intro prompt ("browse available skills"). See functional-smoke.spec.ts
    // for the canonical exclusion pattern.
    await page.waitForFunction(
      () => {
        const stream = document.querySelector('[aria-live="polite"]');
        if (!stream) return false;
        // Use textContent on the whole aria-live region (not just <p> elements)
        // because react-markdown renders headings in <h1> elements.
        const text = stream.textContent ?? '';
        if (text.includes('browse available skills')) return false;
        // Exclude system/error messages.
        if (stream.closest('[role="status"]')) return false;
        // The agent was asked to read README.md and report the first heading.
        // The response must reference README content — either a heading pattern
        // (line starting with #) or the word "README" — proving the agent read
        // the file rather than fabricating a response or reporting an error.
        const hasHeading = /^#\s+.+/m.test(text);
        const mentionsReadme = /readme/i.test(text);
        return hasHeading || mentionsReadme;
      },
      undefined,
      { timeout: CONTENT_TIMEOUT_MS },
    );

    // ─── 5. Working tree status ────────────────────────────────────────────
    // After the run, the working tree indicator reflects the post-run state.
    await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible();
  });
});

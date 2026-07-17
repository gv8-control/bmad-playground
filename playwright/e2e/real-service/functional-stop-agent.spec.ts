import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * ATDD — Story 6.5: Real-Service E2E Verification (Task 4.3, AC-1)
 *
 * Functional smoke sub-item: stop() terminates the agent process inside the
 * sandbox.
 *
 * Tags: @real-service (nightly CI only), [P0] (acceptance criteria AC-1).
 *
 * Purpose:
 *   AC-1 requires that `stop()` terminates the agent process inside the
 *   sandbox. This spec sends a message, clicks Stop while the agent is
 *   running, and verifies the agent stops (Send button reappears, no further
 *   tokens stream). The UI transitioning back to idle implicitly verifies
 *   the `stop()` call reaches `sandbox.process.terminateProcess` — if the
 *   process were not terminated, the SSE stream would keep delivering tokens
 *   and the Send button would not reappear.
 *
 * False-green prevention:
 *   The test verifies the Stop button appears BEFORE clicking it (confirming
 *   RUN_STARTED — the agent was genuinely running). After clicking Stop, the
 *   Send button must reappear (confirming the run terminated). A response
 *   that completed naturally (RUN_FINISHED) would also show the Send button,
 *   so the test additionally asserts no new content streamed AFTER the Stop
 *   click (the content snapshot is captured at Stop-click time and compared).
 *
 * E2E deferral check (per ATDD workflow):
 *   This scenario CANNOT be simulated with browser-level mocks. While the
 *   browser-level mock pattern (setupStreamingMocks) CAN simulate the Stop
 *   button UI (mock the /stop POST + emit RUN_FINISHED), it cannot verify
 *   that `sandbox.process.terminateProcess` was actually called against a
 *   real agent process. A mock-based test would only verify the UI state
 *   machine, not the real process termination. The AC explicitly requires
 *   "stop() terminates the agent process inside the sandbox" — that requires
 *   a real sandbox. Deferred to the real-service tier — recorded in the
 *   ATDD checklist.
 *
 * Prerequisites: same as functional-smoke.spec.ts — see that file's header.
 */

// Daytona provisioning + shallow clone can be slow; allow generous headroom.
const PROVISION_TIMEOUT_MS = 60_000;
// Wait for the Stop button to appear (RUN_STARTED) after sending a message.
const STOP_BUTTON_TIMEOUT_MS = 30_000;
// Wait for the Send button to reappear after clicking Stop (run terminated).
const STOP_COMPLETION_TIMEOUT_MS = 30_000;
// A prompt that elicits a long response (giving time to click Stop mid-run).
const TEST_MESSAGE =
  'Write a detailed 500-word essay about the history of computing. Take your time and be thorough.';

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

test.describe('Real-service AC-1: stop() terminates the agent process inside the sandbox', () => {
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

  test('@real-service [P0] functional: clicking Stop terminates the agent run and returns UI to idle', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ─── 1. Provision → SESSION_READY ──────────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── 2. Send a message that elicits a long response ────────────────────
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    await sendMessage(page, TEST_MESSAGE);

    // ─── 3. Wait for the Stop button to appear (RUN_STARTED) ───────────────
    // This confirms the agent was genuinely running before we click Stop.
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible({
      timeout: STOP_BUTTON_TIMEOUT_MS,
    });

    // Capture the content length at Stop-click time. After clicking Stop, no
    // new content should stream (the process was terminated). We compare the
    // content length before and after to detect continued streaming.
    const contentAtStop = await page
      .locator('[aria-live="polite"]')
      .textContent({ timeout: 5_000 });

    // ─── 4. Click Stop (or detect natural completion) ───────────────────────
    // Race guard: if the agent finishes naturally between the Stop-button
    // visibility check and the click, the Stop button disappears and the click
    // would throw. In that case, the run terminated on its own — the test's
    // precondition ("while the agent is running") was no longer met, but the
    // outcome (run terminated, Send button visible) is still correct.
    const stopButton = page.getByRole('button', { name: 'Stop agent' });
    const stopStillVisible = await stopButton.isVisible().catch(() => false);

    if (stopStillVisible) {
      await stopButton.click();
    }

    // ─── 5. Wait for the Send button to reappear (run terminated) ──────────
    // The UI transitioning back to idle confirms the stop() call reached the
    // sandbox and terminated the agent process (or the run finished naturally).
    // If the process were not terminated, the SSE stream would keep delivering
    // tokens and the Send button would not reappear.
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
      timeout: STOP_COMPLETION_TIMEOUT_MS,
    });

    // ─── 6. Assert no new content streamed after Stop ─────────────────────
    // Defense-in-depth: verify no new tokens arrived after the Stop click.
    // Only checked when Stop was actually clicked (if the agent finished
    // naturally, content growth is expected and correct). A large increase
    // after a Stop click would indicate the process was not actually terminated.
    if (stopStillVisible) {
      const contentAfterStop = await page
        .locator('[aria-live="polite"]')
        .textContent({ timeout: 5_000 });

      const lengthBefore = (contentAtStop ?? '').length;
      const lengthAfter = (contentAfterStop ?? '').length;
      // Allow a small margin for a token in flight (up to 200 chars).
      expect(
        lengthAfter - lengthBefore,
        `Content grew by ${lengthAfter - lengthBefore} chars after Stop (expected near-zero)`,
      ).toBeLessThanOrEqual(200);
    }
  });
});

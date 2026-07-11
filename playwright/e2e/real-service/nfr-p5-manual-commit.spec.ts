import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * Real-Service NFR-P5 Performance Spec — Nightly tier.
 *
 * Tags: @real-service (nightly CI only), [P0] (acceptance criteria NFR-P5).
 *
 * Purpose: Assert NFR-P5 (manual commit ≤ 5s) — the platform-level git commit
 * executed inside a Daytona sandbox must complete within 5 seconds of the user
 * clicking "Save".
 *
 * What this measures:
 *   The elapsed time from clicking the Save confirmation button to the
 *   WorkingTreeIndicator transitioning back to "All saved" (the
 *   MANUAL_SAVE_SUCCEEDED event). This exercises the full path:
 *   POST /api/conversations/:id/save → SandboxService.commit() →
 *   git add -A → git commit -m → response → SSE event → UI update.
 *
 * False-green prevention:
 *   The test verifies the working tree was actually dirty before the commit
 *   (the Save button is only enabled when the tree is dirty). After the
 *   commit, the indicator must show "All saved" (not "Unsaved changes"
 *   which would indicate the commit failed). If the commit failed, the
 *   indicator stays at "Unsaved changes" and the timeout fires — the test
 *   fails rather than passing on a no-op.
 *
 * Prerequisites (same as nfr-performance.spec.ts):
 *   1. PLAYWRIGHT_REAL_SERVICE=1 is set.
 *   2. The test user has a REAL GitHub OAuth credential in Postgres.
 *   3. The test user has a RepoConnection pointing to a real, OAuth-accessible
 *      repository.
 *   4. DAYTONA_API_URL / DAYTONA_API_KEY, AUTH_SECRET, AUTH_GITHUB_ID /
 *      AUTH_GITHUB_SECRET, DATABASE_URL are all real values in .env.local.
 */

// NFR-P5: manual commit ≤ 5s.
const MANUAL_COMMIT_BUDGET_MS = 5_000;
// Daytona provisioning + shallow clone can be slow; allow generous headroom.
const PROVISION_TIMEOUT_MS = 60_000;
// Full agent run — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// A prompt that causes the agent to create a file, making the working tree dirty.
const TEST_MESSAGE = 'Create a file called test-nfr-p5.txt with the content "NFR-P5 timing test" and do not commit it';

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function waitForSessionReady(page: Page, timeoutMs: number): Promise<void> {
  await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible({
    timeout: timeoutMs,
  });
}

test.describe('Real-service NFR-P5: manual commit', () => {
  test.beforeAll(() => {
    test.skip(
      !process.env.PLAYWRIGHT_REAL_SERVICE,
      'Requires PLAYWRIGHT_REAL_SERVICE=1 (real Daytona + Claude API + GitHub OAuth)',
    );
  });

  test('@real-service [P0] NFR-P5: manual commit ≤5s from Save click to success', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // ─── 1. Provision a conversation ──────────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── 2. Send a message that creates a file (dirtying the working tree)
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    await sendMessage(page, TEST_MESSAGE);

    // Wait for the run to finish (Send button reappears).
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
      timeout: RUN_FINISH_TIMEOUT_MS,
    });

    // ─── 3. Verify the working tree is dirty ──────────────────────────────
    // The agent should have created the file, making the tree dirty.
    // The WorkingTreeIndicator should show "Unsaved changes".
    await expect(page.getByText('Unsaved changes').first()).toBeVisible({
      timeout: 15_000,
    });

    // ─── 4. Open the save confirmation popover ────────────────────────────
    // The "Save" button is in the WorkingTreeIndicator.
    const saveButton = page.getByRole('button', { name: /save/i }).first();
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // The confirmation popover has a "Save" confirm button.
    // Distinguish from the trigger by looking for the dialog.
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });

    const confirmButton = confirmDialog.getByRole('button', { name: /save/i });

    // ─── 5. Measure: click Save → "All saved" ─────────────────────────────
    const commitStart = performance.now();
    await confirmButton.click();

    // Wait for the working tree indicator to transition to "All saved".
    // This confirms MANUAL_SAVE_SUCCEEDED was received and the UI updated.
    await expect(page.getByText('All saved').first()).toBeVisible({
      timeout: 30_000,
    });
    const commitElapsed = performance.now() - commitStart;

    // ─── 6. Assert NFR-P5 budget ──────────────────────────────────────────
    expect(
      commitElapsed,
      `NFR-P5: manual commit took ${Math.round(commitElapsed)}ms (budget ${MANUAL_COMMIT_BUDGET_MS}ms)`,
    ).toBeLessThanOrEqual(MANUAL_COMMIT_BUDGET_MS);
  });
});

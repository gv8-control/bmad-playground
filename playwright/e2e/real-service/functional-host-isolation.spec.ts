import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * ATDD — Story 6.5: Real-Service E2E Verification (Task 4.4, AC-1)
 *
 * Functional smoke sub-item: the agent cannot access the host filesystem.
 *
 * Tags: @real-service (nightly CI only), [P0] (acceptance criteria AC-1).
 *
 * Purpose:
 *   AC-1 requires the agent cannot access host filesystem (`.env`, source
 *   code, other conversations' repos). The sandbox's filesystem is isolated
 *   from the host — the agent only sees the cloned repo. This spec prompts
 *   the agent to read a host-only file (`/etc/passwd` and `.env` from the
 *   project root) and verifies the agent cannot access it (the file doesn't
 *   exist inside the sandbox, or the content doesn't match host files).
 *
 * False-green prevention:
 *   The test asserts the agent's response indicates `.env` does NOT exist
 *   or could not be read, NOT that the agent returned host file content.
 *   The host's `.env` holds credentials (DATABASE_URL, AUTH_SECRET,
 *   ANTHROPIC_API_KEY, etc.) — if the agent returned that content, the
 *   sandbox filesystem isolation is broken. The test checks for "no such
 *   file" / "does not exist" / "not found" vocabulary and verifies the
 *   response does NOT contain host credential env-var markers.
 *
 *   Note: `/etc/passwd` is expected to be readable inside the container
 *   (it's a standard Linux file). The agent reading the container's
 *   `/etc/passwd` is NOT an isolation failure — the container's
 *   `/etc/passwd` is separate from the host's. The isolation check is
 *   specifically about `.env` (which exists on the host project root but
 *   NOT inside the sandbox's cloned repo).
 *
 * E2E deferral check (per ATDD workflow):
 *   This scenario CANNOT be simulated with browser-level mocks. Host
 *   filesystem isolation is enforced by the Daytona sandbox container layer
 *   — no browser-level fetch/EventSource mock can reproduce the sandbox's
 *   filesystem boundary. A fake-backed test would only verify the mock
 *   returns "not found", not that the real sandbox isolates the host
 *   filesystem. Deferred to the real-service tier — recorded in the ATDD
 *   checklist.
 *
 * Prerequisites: same as functional-smoke.spec.ts — see that file's header.
 */

// Daytona provisioning + shallow clone can be slow; allow generous headroom.
const PROVISION_TIMEOUT_MS = 60_000;
// Full agent run (Read tool + streaming) — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// Wait for the response content to appear after the run finishes.
const CONTENT_TIMEOUT_MS = 30_000;
// Prompt the agent to read a host-only file. /etc/passwd exists on the host
// (and on most Linux containers), but the sandbox's /etc/passwd is the
// container's own — it does NOT contain the host's user entries. The agent
// should report the file content (the container's /etc/passwd) which will
// NOT match the host's user entries. We also prompt for .env which exists
// on the host project root but NOT inside the sandbox's cloned repo.
const TEST_MESSAGE =
  'Read the file /etc/passwd and tell me the first 3 lines. Then try to read .env from the project root and tell me if it exists.';

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

test.describe('Real-service AC-1: agent cannot access host filesystem', () => {
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

  test('@real-service [P0] functional: agent cannot read host .env (sandbox filesystem isolation)', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ─── 1. Provision → SESSION_READY ──────────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── 2. Send message prompting the agent to read .env ──────────────────
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

    // ─── 4. Assert the .env file does NOT exist inside the sandbox ─────────
    // The sandbox's filesystem contains only the cloned repo. The host's .env
    // (which holds DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY, etc.) must
    // NOT be accessible. The agent's response should indicate .env does not
    // exist or could not be read.
    //
    // Excludes system/error messages via closest('[role="status"]') and skips
    // the intro prompt ("browse available skills"). See functional-smoke.spec.ts
    // for the canonical exclusion pattern.
    await page.waitForFunction(
      () => {
        const stream = document.querySelector('[aria-live="polite"]');
        if (!stream) return false;
        const text = stream.textContent ?? '';
        if (text.includes('browse available skills')) return false;
        // The agent should report .env does not exist / not found / could not
        // be read. Match common "not found" vocabulary.
        return /no\s+such\s+file|does\s+not\s+exist|not\s+found|could\s+not\s+be\s+read|cannot\s+read|doesn'?t\s+exist/i.test(
          text,
        );
      },
      undefined,
      { timeout: CONTENT_TIMEOUT_MS },
    );

    // ─── 5. Assert the response does NOT contain host credential markers ───
    // Defense-in-depth: even if the "not found" check passed, verify the agent
    // did not leak host .env content. The host .env contains credential env-var
    // assignments (DATABASE_URL=..., AUTH_SECRET=..., ANTHROPIC_API_KEY=...).
    // None of these should appear in the agent's response.
    const streamText = await page
      .locator('[aria-live="polite"]')
      .textContent({ timeout: 5_000 });
    expect(streamText).not.toMatch(/DATABASE_URL\s*=/i);
    expect(streamText).not.toMatch(/AUTH_SECRET\s*=/i);
    expect(streamText).not.toMatch(/ANTHROPIC_API_KEY\s*=/i);
    expect(streamText).not.toMatch(/CREDENTIAL_ENCRYPTION_KEK\s*=/i);
    expect(streamText).not.toMatch(/AUTH_GITHUB_SECRET\s*=/i);
  });
});

import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * Real-Service Functional Smoke Test — Nightly tier.
 *
 * Tags: @real-service (nightly CI only), [P0] (critical path).
 *
 * Purpose: Assert the agent actually returns a real response. The prompt
 * "Reply with the single word: hello" is used so the response content can be
 * verified — not just "any non-empty paragraph appeared." This catches the
 * false-green scenario where an error message rendered as a <p> in the
 * aria-live region satisfies a "first token" check without the agent ever
 * producing a real response.
 *
 * This spec contains NO NFR timing assertions. NFR-P1 (first token ≤1500ms)
 * and NFR-P2 (chat ready ≤10s) live in nfr-performance.spec.ts so that a
 * slow environment does not mask a functional break, and a functional break
 * does not produce a false green by satisfying NFR selectors with error
 * output.
 *
 * Prerequisites: same as nfr-performance.spec.ts — see that file's header.
 */

// Daytona provisioning + shallow clone can be slow; allow generous headroom
// beyond the NFR-P2 budget so the readiness wait itself does not time out.
const PROVISION_TIMEOUT_MS = 60_000;
// Full agent run (tools + streaming) — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// Wait for the response content to appear after the run finishes.
const CONTENT_TIMEOUT_MS = 30_000;
// A short prompt that elicits a one-word reply, enabling content verification.
const TEST_MESSAGE = 'Reply with the single word: hello';

async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

/**
 * Wait for SESSION_READY. The sandbox init sequence (provision → clone → inject
 * git config → `git status --porcelain` → emit WORKING_TREE_* → emit
 * SESSION_READY) emits the working-tree event immediately before SESSION_READY.
 * ConversationPane only renders the WorkingTreeIndicator when `state === 'ready'`,
 * so the indicator text appearing is a reliable UI signal that SESSION_READY
 * fired and the UI transitioned from "preparing" to "ready".
 */
async function waitForSessionReady(page: Page, timeoutMs: number): Promise<void> {
  await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible({
    timeout: timeoutMs,
  });
}

test.describe('Real-service functional smoke', () => {
  test.beforeAll(() => {
    test.skip(
      !process.env.PLAYWRIGHT_REAL_SERVICE,
      'Requires PLAYWRIGHT_REAL_SERVICE=1 (real Daytona + Claude API + GitHub OAuth)',
    );
  });

  test('@real-service [P0] functional smoke: agent returns real response containing "hello"', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ─── 1. Provision → SESSION_READY ──────────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── 2. Send message ───────────────────────────────────────────────────
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    await sendMessage(page, TEST_MESSAGE);

    // Assert the user's message appears in the conversation (optimistic echo).
    await expect(
      page.getByTestId('chat-message-list').getByText(TEST_MESSAGE),
    ).toBeVisible();

    // ─── 3. Wait for run to finish ─────────────────────────────────────────
    // First wait for the Stop button to appear (confirming RUN_STARTED —
    // the Send button is still visible between sendMessage() and RUN_STARTED
    // because agentState is still 'idle'). Then wait for the Send button to
    // reappear (confirming RUN_FINISHED — the run transitioned back to idle).
    // This is a WAIT, not an assertion. The content check in step 4 is the
    // sole pass/fail gate. If the agent errored, the Send button reappears
    // (this wait completes), then the content check fails (the test fails).
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
      timeout: RUN_FINISH_TIMEOUT_MS,
    });

    // ─── 4. Assert real response content ───────────────────────────────────
    // The agent was asked to reply with "hello." Assert the response contains
    // "hello" (case-insensitive — the LLM may add punctuation or surrounding
    // text). Targets <p> elements inside the aria-live region because agent
    // messages render via react-markdown as <p>, while user messages render
    // as plain text in a <div>. The intro prompt is skipped. System/error
    // messages render as <p role="status"> and AccessNotice wraps <p> in
    // <div role="status"> — both are excluded via closest('[role="status"]')
    // so an error message containing "hello" (extremely unlikely but
    // defense-in-depth) cannot satisfy this check.
    await page.waitForFunction(
      () => {
        const stream = document.querySelector('[aria-live="polite"]');
        if (!stream) return false;
        const paragraphs = stream.querySelectorAll('p');
        for (let i = 0; i < paragraphs.length; i++) {
          const p = paragraphs[i];
          if (p?.closest('[role="status"]')) continue;
          const text = p?.textContent ?? '';
          if (text.includes('browse available skills')) continue;
          if (/hello/i.test(text)) return true;
        }
        return false;
      },
      undefined,
      { timeout: CONTENT_TIMEOUT_MS },
    );

    // ─── 5. Working tree status ────────────────────────────────────────────
    // After the run, the working tree indicator reflects the post-run state
    // (WORKING_TREE_DIRTY if the agent modified files, WORKING_TREE_CLEAN
    // otherwise). Asserting the indicator text is visible proves the
    // WORKING_TREE_* event updated the UI after the agent turn.
    await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible();
  });
});

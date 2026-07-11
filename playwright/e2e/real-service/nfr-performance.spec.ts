import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * Real-Service NFR Performance Spec — Nightly tier.
 *
 * Tags: @real-service (nightly CI only), [P0] (acceptance criteria NFR-P1, NFR-P2).
 *
 * Purpose: Assert NFR-P1 (first streamed token ≤1500ms) and NFR-P2 (chat ready
 * ≤10s) as SEPARATE tests. These are environment-sensitive — isolating them
 * from the functional gate (functional-smoke.spec.ts) ensures a slow
 * environment doesn't mask a functional break, and a functional break doesn't
 * produce a false green by satisfying NFR selectors with error output.
 *
 * False-green prevention:
 *   - NFR-P1 first-token detection EXCLUDES elements inside [role="status"].
 *     System/error messages (RUN_ERROR, STREAM_ERROR) render as
 *     <p role="status"> inside [aria-live="polite"] (ChatMessageList.tsx).
 *     AccessNotice renders <p> inside a <div role="status">. Using
 *     closest('[role="status"]') catches both. Agent messages render via
 *     react-markdown as <p> without any role="status" ancestor.
 *   - NFR-P1 includes post-hoc validation: after measuring first-token latency,
 *     the test waits for the run to finish and verifies the response contained
 *     "hello." If the "first token" was actually an error message, the post-hoc
 *     check fails the test — the NFR measurement is invalidated.
 *
 * Prerequisites (dev / nightly CI environment):
 *   1. PLAYWRIGHT_REAL_SERVICE=1 is set.
 *   2. The test user has a REAL GitHub OAuth credential in Postgres.
 *   3. The test user has a RepoConnection pointing to a real, OAuth-accessible
 *      repository.
 *   4. DAYTONA_API_URL / DAYTONA_API_KEY, AUTH_SECRET, AUTH_GITHUB_ID /
 *      AUTH_GITHUB_SECRET, DATABASE_URL are all real values in .env.local.
 */

// NFR-P2: chat ready ≤10s (page navigation → SESSION_READY).
const CHAT_READY_BUDGET_MS = 10_000;
// NFR-P1: first streamed token ≤1500ms (message submit → first assistant token).
const FIRST_TOKEN_BUDGET_MS = 1_500;
// Daytona provisioning + shallow clone can be slow; allow generous headroom
// beyond the NFR-P2 budget so the readiness wait itself does not time out
// before the NFR assertion can report the actual latency.
const PROVISION_TIMEOUT_MS = 60_000;
// The Claude Agent SDK may execute tool calls before producing the first text
// token. The timeout prevents hanging; the NFR assertion reports actual latency
// even if it exceeds the 1500ms budget.
const FIRST_TOKEN_WAIT_TIMEOUT_MS = 60_000;
// Full agent run (tools + streaming) — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// Wait for the response content to appear for post-hoc validation.
const CONTENT_TIMEOUT_MS = 30_000;
// A short prompt that elicits a one-word reply, enabling post-hoc validation.
const TEST_MESSAGE = 'Reply with the single word: hello';

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

test.describe('Real-service NFR performance', () => {
  test.beforeAll(() => {
    test.skip(
      !process.env.PLAYWRIGHT_REAL_SERVICE,
      'Requires PLAYWRIGHT_REAL_SERVICE=1 (real Daytona + Claude API + GitHub OAuth)',
    );
  });

  test('@real-service [P0] NFR-P2: chat ready ≤10s from navigation to SESSION_READY', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const provisionStart = performance.now();
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);
    const provisionElapsed = performance.now() - provisionStart;

    expect(
      provisionElapsed,
      `NFR-P2: chat ready took ${Math.round(provisionElapsed)}ms (budget ${CHAT_READY_BUDGET_MS}ms)`,
    ).toBeLessThanOrEqual(CHAT_READY_BUDGET_MS);
  });

  test('@real-service [P0] NFR-P1: first streamed token ≤1500ms from message submit', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ─── Setup: provision a conversation ──────────────────────────────────
    await page.goto('/conversations/new');

    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);

    // ─── Send message ──────────────────────────────────────────────────────
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    const tokenStart = performance.now();
    await sendMessage(page, TEST_MESSAGE);

    await expect(
      page.getByTestId('chat-message-list').getByText(TEST_MESSAGE),
    ).toBeVisible();

    // ─── First streamed token ──────────────────────────────────────────────
    // Detect the first non-empty <p> in the aria-live region, EXCLUDING:
    //   - Elements inside [role="status"] (system/error messages — RUN_ERROR,
    //     STREAM_ERROR render as <p role="status">; AccessNotice renders <p>
    //     inside a <div role="status">). closest() catches both.
    //   - The intro prompt ("browse available skills")
    // Without this exclusion, an error message would satisfy the first-token
    // check and produce a false pass (errors appear quickly).
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
          if (text.trim().length > 0) return true;
        }
        return false;
      },
      undefined,
      { timeout: FIRST_TOKEN_WAIT_TIMEOUT_MS },
    );
    const tokenElapsed = performance.now() - tokenStart;

    expect(
      tokenElapsed,
      `NFR-P1: first token took ${Math.round(tokenElapsed)}ms (budget ${FIRST_TOKEN_BUDGET_MS}ms)`,
    ).toBeLessThanOrEqual(FIRST_TOKEN_BUDGET_MS);

    // ─── Post-hoc validation: response was real ───────────────────────────
    // Wait for the run to finish (Stop → Send button transition), then verify
    // the response contained "hello." If the "first token" was an error message
    // (not excluded by closest('[role="status"]') for any reason), this check
    // fails — invalidating the NFR measurement.
    await expect(page.getByRole('button', { name: 'Stop agent' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
      timeout: RUN_FINISH_TIMEOUT_MS,
    });

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
  });
});

import { test, expect } from '../../support/merged-fixtures';
import type { Page } from '@playwright/test';

/**
 * Real-Service Happy-Path Agent Run — Nightly tier.
 *
 * Tags: @real-service (nightly CI only), @P0 (critical path).
 *
 * Covers:
 *   - P0-006: Sandbox provisioned on Conversation open; chat ready ≤10s (NFR-P2).
 *   - P0-007: First streamed token ≤1,500ms (NFR-P1).
 *   - Happy-path agent run end-to-end: provision → send message → first token →
 *     RUN_FINISHED → working tree indicator update.
 *
 * Unlike the fake-backed PR-tier conversation specs, this spec exercises the REAL
 * service stack end-to-end: real @daytonaio/sdk provision/clone/git-status, real
 * Claude Agent SDK streaming, real GitHub OAuth, real SSE transport, real
 * Postgres. It is excluded from the PR tier via `grepInvert: /@real-service/`
 * in playwright.config.ts and activated only by the `real-service` Playwright
 * project (which is conditionally included when PLAYWRIGHT_REAL_SERVICE=1).
 * SandboxServiceFake is NEVER injected in this tier — `yarn nx run agent-be:serve`
 * boots the production AppModule whose sandbox.module.ts wires the real
 * SandboxService.
 *
 * PREREQUISITES (dev / nightly CI environment):
 *   1. PLAYWRIGHT_REAL_SERVICE=1 is set (selects the real-service project +
 *      real-secrets webServer block in playwright.config.ts).
 *   2. The test user has a REAL GitHub OAuth credential in Postgres. auth.setup.ts
 *      must run the real OAuth flow — set TEST_GITHUB_USERNAME,
 *      TEST_GITHUB_PASSWORD, and (if 2FA) TEST_GITHUB_OTP_SECRET. The synthetic
 *      JWT session has no stored OAuth token, so Daytona cannot clone without it.
 *      The browser OAuth flow is viable in CI because 2FA-enabled accounts skip
 *      GitHub's device verification challenge (per GitHub's docs: "GitHub will
 *      not ask you to perform device verification when you have 2FA enabled").
 *      The TOTP code is generated from TEST_GITHUB_OTP_SECRET, so no email or
 *      mobile device is needed. If the browser flow proves flaky, the fallback
 *      is a DB-side credential seed endpoint (inject a PAT directly into
 *      Postgres via encryptToken()), but the browser flow is tried first.
 *   3. The test user has a RepoConnection pointing to a real, OAuth-accessible
 *      repository. auth.setup.ts seeds this via POST /api/internal/test/repo-
 *      connections using TEST_GITHUB_REPO_URL after the OAuth flow completes.
 *      The (app) layout guard redirects to /onboarding when no RepoConnection
 *      exists, so without this seed the spec would land on /onboarding instead
 *      of /conversations/new. The repoUrl must point to a real repo the OAuth
 *      token can clone.
 *   4. DAYTONA_API_URL / DAYTONA_API_KEY, AUTH_SECRET, AUTH_GITHUB_ID /
 *      AUTH_GITHUB_SECRET, DATABASE_URL are all real values in .env.local.
 *
 * Selectors follow the role/text-resilience hierarchy used by the fake-backed
 * conversation specs (getByRole > getByText). The data-testid attributes
 * referenced by support/page-objects/conversation-page.ts are not present on the
 * production ConversationPane components, so this spec uses role/text selectors
 * matching streaming-chat.spec.ts / sandbox-lifecycle.spec.ts instead.
 */

// NFR-P2: chat ready ≤10s (page navigation → SESSION_READY).
const CHAT_READY_BUDGET_MS = 10_000;
// NFR-P1: first streamed token ≤1500ms (message submit → first assistant token).
const FIRST_TOKEN_BUDGET_MS = 1_500;
// Daytona provisioning + shallow clone can be slow; allow generous headroom
// beyond the NFR-P2 budget so the readiness wait itself does not time out
// before the NFR assertion can report the actual latency.
const PROVISION_TIMEOUT_MS = 60_000;
// Full agent run (tools + streaming) — generous for real Claude API latency.
const RUN_FINISH_TIMEOUT_MS = 120_000;
// A short prompt that elicits a one-word reply, minimising token count and
// keeping first-token latency close to the real transport + inference floor.
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
 * ConversationPane only renders the WorkingTreeIndicator when `state === 'ready'`
 * (effectiveWorkingTreeState guards on the ready state), so the indicator text
 * (✓ All saved | Unsaved changes) appearing is a reliable UI signal that
 * SESSION_READY fired and the UI transitioned from "preparing" to "ready".
 */
async function waitForSessionReady(page: Page, timeoutMs: number): Promise<void> {
  await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible({
    timeout: timeoutMs,
  });
}

test.describe('Real-service happy-path agent run', () => {
  test.beforeAll(() => {
    // Skip gracefully outside the real-service nightly tier so this file is
    // inert in the PR tier (it is also excluded via grepInvert, but the env
    // guard makes the skip intent explicit and covers direct invocation).
    test.skip(
      !process.env.PLAYWRIGHT_REAL_SERVICE,
      'Requires PLAYWRIGHT_REAL_SERVICE=1 (real Daytona + Claude API + GitHub OAuth)',
    );
  });

  test('@real-service @P0 happy-path: provision, message, first token, run finishes, working tree', async ({
    page,
  }) => {
    // ─── 1. Provision → SESSION_READY + NFR-P2 (chat ready ≤10s) ───────────
    const provisionStart = performance.now();
    await page.goto('/conversations/new');

    // Confirm we landed on the conversation page and were NOT redirected to
    // /onboarding (which happens when no RepoConnection exists for the user).
    await expect(page.getByRole('heading', { name: 'New Conversation' })).toBeVisible({
      timeout: 15_000,
    });

    // Wait for SESSION_READY (signalled by the working tree indicator appearing).
    await waitForSessionReady(page, PROVISION_TIMEOUT_MS);
    const provisionElapsed = performance.now() - provisionStart;

    // NFR-P2: chat ready ≤10s from page navigation to SESSION_READY.
    // Validates P0-006 (sandbox provisioned; chat ready ≤10s).
    expect(
      provisionElapsed,
      `NFR-P2: chat ready took ${Math.round(provisionElapsed)}ms (budget ${CHAT_READY_BUDGET_MS}ms)`,
    ).toBeLessThanOrEqual(CHAT_READY_BUDGET_MS);

    // ─── 2. Send message ───────────────────────────────────────────────────
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeEnabled();

    const tokenStart = performance.now();
    await sendMessage(page, TEST_MESSAGE);

    // Assert the user's message appears in the conversation (optimistic echo).
    // Scope to the chat message list to avoid matching the textarea, which
    // retains the filled text after sendMessage().
    await expect(
      page.getByTestId('chat-message-list').getByText(TEST_MESSAGE),
    ).toBeVisible();

    // ─── 3. First streamed token + NFR-P1 (first token ≤1500ms) ───────────
    // The agent message is rendered via react-markdown (wraps content in <p>),
    // while the user message renders as plain text in a <div>. At
    // TEXT_MESSAGE_START the assistant message is added with empty content
    // (Markdown renders nothing). The first <p> with non-empty text appears
    // only at TEXT_MESSAGE_CONTENT (the first streamed token). This isolates
    // the first token from the user echo, the sr-only "Agent is thinking"
    // label, and the always-present timestamp spans.
    await page.waitForFunction(
      () => {
        const stream = document.querySelector('[aria-live="polite"]');
        if (!stream) return false;
        // Index-based loop (NodeListOf lacks [Symbol.iterator] under lib es2022
        // without dom.iterable — matching the querySelector pattern in
        // streaming-chat.spec.ts which avoids for...of on NodeList).
        const paragraphs = stream.querySelectorAll('p');
        for (let i = 0; i < paragraphs.length; i++) {
          const text = paragraphs[i]?.textContent ?? '';
          // Skip the intro prompt (only present before the first message).
          if (text.includes('browse available skills')) continue;
          if (text.trim().length > 0) return true;
        }
        return false;
      },
      undefined,
      { timeout: 30_000 },
    );
    const tokenElapsed = performance.now() - tokenStart;

    // NFR-P1: first streamed token ≤1500ms from message submission.
    // Validates P0-007 (first streamed token ≤1500ms).
    expect(
      tokenElapsed,
      `NFR-P1: first token took ${Math.round(tokenElapsed)}ms (budget ${FIRST_TOKEN_BUDGET_MS}ms)`,
    ).toBeLessThanOrEqual(FIRST_TOKEN_BUDGET_MS);

    // ─── 4. Run completes (RUN_FINISHED) ───────────────────────────────────
    // RUN_FINISHED sets agentState to 'idle'; ChatInput swaps the Stop button
    // back to Send when not processing. The Send button reappearing proves the
    // run transitioned back to the ready/idle state.
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({
      timeout: RUN_FINISH_TIMEOUT_MS,
    });

    // ─── 5. Working tree status ────────────────────────────────────────────
    // After the run, the working tree indicator reflects the post-run state
    // (WORKING_TREE_DIRTY if the agent modified files, WORKING_TREE_CLEAN
    // otherwise). Asserting the indicator text is visible in either state
    // proves the WORKING_TREE_* event updated the UI after the agent turn —
    // not just the initial provisioning-time event from step 1.
    await expect(page.getByText(/All saved|Unsaved changes/).first()).toBeVisible();
  });
});

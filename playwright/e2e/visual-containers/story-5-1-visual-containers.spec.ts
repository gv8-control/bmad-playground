import { test, expect, type Page } from '../../support/merged-fixtures';
import { resetRepoConnection, seedRepoConnection } from '../../support/reset-repo-connection';

/**
 * ATDD — Story 5.1: Restore Missing Visual Containers Across Surfaces
 * E2E tests for the 6 visual containers restored across 6 surfaces.
 *
 * Covers:
 * - AC-1: Sign-in auth card with brand logo box, heading, and legal footer
 * - AC-2: Onboarding form panel wraps the Repository URL input
 * - AC-4: Settings "coming soon" empty-state
 * - AC-6: Conversation chat-input-box container
 *
 * Not covered here (covered by co-located unit tests):
 * - AC-3: Onboarding BMAD-not-found panel — verified by component tests in
 *   RepositoryUrlForm.test.tsx. The RSC wire format for Server Action mocking
 *   changed in Next.js 16 with no planned fix; the styled panel (title/body
 *   split, documentation link, non-BMAD error distinction) is verified at the
 *   component level.
 * - AC-5: Artifact-browser frontmatter metadata badge — verified by component
 *   tests in ArtifactViewer.test.tsx. The withArtifacts E2E fixture is broken
 *   (unique constraint violations) with no planned fix; the badge rendering,
 *   field parsing, and absence-for-no-frontmatter behavior are verified at the
 *   component level.
 *
 * These tests verify the visual containers render correctly in the full app
 * context (real browser, real Next.js rendering). The component-level Jest
 * tests assert CSS classes; these E2E tests assert user-visible outcomes.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel > aria-label (no raw CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for secondary checks.
 */

// Restore a repo connection after all tests so subsequent test files that
// require a connection for seeding are not left without one.
test.afterAll(seedRepoConnection);

// Serial mode: AC-2 tests use resetRepoConnection in beforeEach which
// deletes ALL connections for the test user. If AC-4/AC-6 tests (which use
// withRepoConnection) run in parallel, their connection gets deleted mid-test.
// Serial mode prevents this race condition.
test.describe.configure({ mode: 'serial' });

// ─── AC-1: Sign-in auth card (unauthenticated) ─────────────────────────────

test.describe('Story 5.1 — AC-1: Sign-in auth card', () => {
  const noAuth = { storageState: { cookies: [], origins: [] } };

  test('[P0] brand logo box with "be" text renders above the heading', async ({ browser }) => {
    const context = await browser.newContext(noAuth);
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');
      await expect(page.getByText('be', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('[P0] "Continue with GitHub" heading renders inside the auth card', async ({ browser }) => {
    const context = await browser.newContext(noAuth);
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');
      await expect(page.getByRole('heading', { name: 'Continue with GitHub' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('[P0] OAuth button sits inside the same container as the heading', async ({ browser }) => {
    const context = await browser.newContext(noAuth);
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');

      const heading = page.getByRole('heading', { name: 'Continue with GitHub' });
      const authCard = page.locator('div').filter({ has: heading });
      await expect(authCard.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('[P0] legal footer with Terms and Privacy links renders below the auth card', async ({ browser }) => {
    const context = await browser.newContext(noAuth);
    const page = await context.newPage();
    try {
      await page.goto('/sign-in');
      await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('[P1] error state renders inside the auth card when error query param is present', async ({ browser }) => {
    const context = await browser.newContext(noAuth);
    const page = await context.newPage();
    try {
      await page.goto('/sign-in?error=OAuthCallback');

      const heading = page.getByRole('heading', { name: 'Continue with GitHub' });
      const authCard = page.locator('div').filter({ has: heading });
      await expect(authCard.locator('p[role="alert"]')).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

// ─── AC-2: Onboarding form panel (authenticated, no repo connection) ────────

test.describe('Story 5.1 — AC-2: Onboarding form panel', () => {
  test.beforeEach(resetRepoConnection);

  test('[P0] Repository URL input and submit button sit inside a form panel', async ({ page }) => {
    await page.goto('/onboarding');

    const input = page.getByLabel(/repository url/i);
    const button = page.getByRole('button', { name: /connect repository/i });

    await expect(input).toBeVisible();
    await expect(button).toBeVisible();

    const formPanel = page.locator('div').filter({ has: input });
    await expect(formPanel.getByRole('button', { name: /connect repository/i })).toBeVisible();
  });

  test('[P0] form panel contains the label, input, and submit button together', async ({ page }) => {
    await page.goto('/onboarding');

    const input = page.getByLabel(/repository url/i);
    const formPanel = page.locator('div').filter({ has: input });

    await expect(formPanel.getByText(/repository url/i)).toBeVisible();
    await expect(formPanel.getByRole('button', { name: /connect repository/i })).toBeVisible();
  });
});

// ─── AC-4: Settings "coming soon" empty-state (authenticated, with repo connection) ─

test.describe('Story 5.1 — AC-4: Settings coming-soon empty-state', () => {
  test('[P0] settings page renders the "coming soon" empty-state with icon, title, and body', async ({
    page,
    withRepoConnection: _,
  }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings coming soon' })).toBeVisible();
    await expect(page.getByText('Account management, repository connections, and notification preferences')).toBeVisible();
  });

  test('[P0] three teaser item rows render with expected text', async ({
    page,
    withRepoConnection: _,
  }) => {
    await page.goto('/settings');

    await expect(page.getByText('Manage connected repositories', { exact: true })).toBeVisible();
    await expect(page.getByText('Account and profile', { exact: true })).toBeVisible();
    await expect(page.getByText('Notification preferences', { exact: true })).toBeVisible();
  });

  test('[P0] bare "Coming soon" placeholder is NOT present', async ({
    page,
    withRepoConnection: _,
  }) => {
    await page.goto('/settings');

    await expect(page.getByText('Coming soon', { exact: true })).toHaveCount(0);
  });

  test('[P1] settings page h1 "Settings" is preserved for route-focus management', async ({
    page,
    withRepoConnection: _,
  }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });
});

// ─── AC-6: Conversation chat-input-box container (authenticated, mocked SSE) ──

interface MockHandle {
  waitForEventSource: () => Promise<void>;
  emit: (type: string, data?: unknown) => Promise<void>;
}

async function setupConversationMocks(page: Page, conversationId = 'conv-e2e-visual'): Promise<MockHandle> {
  await page.addInitScript((conversationId) => {
    class MockEventSource {
      url: string;
      readyState = 0;
      onerror: ((event: Event) => void) | null = null;
      private readonly listeners: Record<string, Array<(event: { data: string }) => void>> = {};

      constructor(url: string) {
        this.url = url;
        (window as unknown as Record<string, unknown>).__mockEventSource = this;
      }

      addEventListener(type: string, handler: (event: { data: string }) => void): void {
        (this.listeners[type] = this.listeners[type] || []).push(handler);
      }

      removeEventListener(): void {}

      close(): void {
        this.readyState = 2;
      }

      __emit(type: string, data: unknown): void {
        const event = { data: typeof data === 'string' ? data : JSON.stringify(data) };
        (this.listeners[type] || []).forEach((handler) => handler(event));
      }
    }

    (window as unknown as Record<string, unknown>).EventSource = MockEventSource;

    const w = window as unknown as Record<string, unknown>;
    if (!w.__mockFetchInstalled) {
      w.__mockFetchInstalled = true;
      const originalFetch = window.fetch.bind(window);
      w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (url.includes('/stop') && method === 'POST') {
          return new Response(JSON.stringify({ conversationId, stopped: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.includes('/turns') && method === 'POST') {
          return new Response(JSON.stringify({ conversationId, title: 'Test' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.includes('/skills') && method === 'GET') {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.includes('/api/conversations') && method === 'POST') {
          return new Response(JSON.stringify({ id: conversationId }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return originalFetch(input as RequestInfo, init);
      };
    }
  }, conversationId);

  return {
    waitForEventSource: () =>
      page
        .waitForFunction(() => (window as unknown as Record<string, unknown>).__mockEventSource != null)
        .then(() => undefined),
    emit: (type: string, data: unknown = {}) =>
      page.evaluate(
        ({ type, data }) => {
          const es = (window as unknown as Record<string, unknown>).__mockEventSource as
            | { __emit: (type: string, data: unknown) => void }
            | undefined;
          es?.__emit(type, data);
        },
        { type, data },
      ),
  };
}

test.describe('Story 5.1 — AC-6: Conversation chat-input-box container', () => {
  test('[P0] chat textarea and Send button sit inside a shared bordered container', async ({
    page,
    withRepoConnection: _,
  }) => {
    await setupConversationMocks(page);
    await page.goto('/conversations/new');

    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeVisible();

    const chatInputBox = page.locator('div').filter({ has: input });
    await expect(chatInputBox.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('[P0] Send button renders in a footer row below the textarea', async ({
    page,
    withRepoConnection: _,
  }) => {
    await setupConversationMocks(page);
    await page.goto('/conversations/new');

    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toBeVisible();

    const sendButton = page.getByRole('button', { name: 'Send' });
    await expect(sendButton).toBeVisible();

    const inputBox = await input.boundingBox();
    const buttonBox = await sendButton.boundingBox();

    expect(inputBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.y).toBeGreaterThanOrEqual(inputBox!.y);
  });
});

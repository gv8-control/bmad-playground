import { type Page } from '@playwright/test';
import { test, expect } from '../../support/merged-fixtures';
import {
  setupStreamingMocks as baseSetupStreamingMocks,
  readySession,
  type MockHandle,
} from '../../support/streaming-mocks';

/**
 * Story 3.2: Invoke BMAD Skills via Slash Command
 *
 * E2E tests for the Slash Command Picker, message sending, and URL transition.
 * Covers AC-1 (picker opens on `/`), AC-2 (empty skills state),
 * AC-3 (message persistence via POST /:id/turns), and AC-4 (URL transition).
 *
 * The browser calls agent-be directly (POST /api/conversations, GET /:id/skills,
 * POST /:id/turns + SSE). Both `fetch` and `EventSource` are mocked from the
 * page so the tests exercise the real ConversationPane state machine without
 * a live Daytona provision or a real GitHub repo. agent-be still starts (via
 * the playwright webServer block) so the page's boundary-JWT mint path runs
 * against the real AUTH_SECRET, but no browser request reaches it.
 *
 * Selectors follow the selector-resilience hierarchy:
 * getByRole > getByText > getByLabel (no CSS classes or XPath).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

const MOCK_SKILLS = [
  { name: 'bmad-prd' },
  { name: 'bmad-agent-pm' },
  { name: 'bmad-agent-architect' },
  { name: 'bmad-ux' },
  { name: 'bmad-help' },
];

const CONVERSATION_ID = 'conv-e2e-picker';
const TURN_TITLE = 'Semantic Title';

async function setupConversationMocks(
  page: Page,
  options: {
    conversationId?: string;
    skills?: typeof MOCK_SKILLS;
    turnTitle?: string;
  } = {},
): Promise<MockHandle> {
  return baseSetupStreamingMocks(page, {
    conversationId: options.conversationId ?? CONVERSATION_ID,
    turnTitle: options.turnTitle ?? TURN_TITLE,
    skills: options.skills ?? MOCK_SKILLS,
  });
}

test.describe('Story 3.2: Slash Command Picker', () => {
  test.describe.configure({ mode: 'serial' });

  test('[P0] picker opens on `/` and lists available skills (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(5);
    for (const skill of MOCK_SKILLS) {
      await expect(page.getByRole('option', { name: skill.name })).toBeVisible();
    }
  });

  test('[P0] typing after `/` narrows the list by skill-name prefix (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/bmad-a');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(2);
    await expect(page.getByRole('option', { name: 'bmad-agent-pm' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'bmad-agent-architect' })).toBeVisible();
  });

  test('[P0] ArrowDown moves focus to next skill in picker (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    const options = page.getByRole('option');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowDown');
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true');
  });

  test('[P0] ArrowUp wraps focus from first to last skill (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    const options = page.getByRole('option');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await input.press('ArrowUp');
    await expect(options.nth(4)).toHaveAttribute('aria-selected', 'true');
  });

  test('[P0] Enter selects focused skill and appends /{name} to input (AC-1)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await input.press('ArrowDown');
    await input.press('Enter');

    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(input).toHaveValue('/bmad-agent-pm ');
    await expect(input).toBeFocused();
  });

  test('[P0] Escape dismisses the picker (AC-1)', async ({ page, withRepoConnection }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await input.press('Escape');

    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(input).toBeFocused();
  });

  test('[P1] outside click dismisses the picker (AC-1)', async ({ page, withRepoConnection }) => {
    const mocks = await setupConversationMocks(page);
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.getByText('Press `/` to browse available skills').click();

    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('[P0] picker shows "No skills found" when skills array is empty (AC-2)', async ({
    page,
    withRepoConnection,
  }) => {
    const mocks = await setupConversationMocks(page, { skills: [] });
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('/');

    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByText('No skills found in this repository.')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('[P0] sending a message calls POST /:id/turns with Bearer JWT and transitions URL (AC-3, AC-4)', async ({
    page,
    withConversations,
  }) => {
    const convId = withConversations[0].id;
    const mocks = await setupConversationMocks(page, { conversationId: convId });
    await page.goto('/conversations/new');
    await readySession(mocks);

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.fill('hello world');
    await page.getByRole('button', { name: 'Send' }).click();

    await mocks.waitForFetchCount(3);

    const calls = await mocks.fetchCalls();
    const turnCall = calls.find((c) => c.url.includes('/turns') && c.method === 'POST');
    expect(turnCall).toBeDefined();
    expect(turnCall?.url).toContain(`/api/conversations/${convId}/turns`);
    expect(turnCall?.headers.authorization).toMatch(/^Bearer .+/);

    await expect(page).toHaveURL(new RegExp(`/conversations/${convId}`));
  });
});

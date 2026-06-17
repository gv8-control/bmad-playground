import { test, expect } from '../../support/merged-fixtures';
import { ConversationPage } from '../../support/page-objects/conversation-page';

/**
 * P0-003 / P0-004: Sandbox provisioning and SSE streaming.
 *
 * NFR-P2: Chat ready ≤ 10s from page open (SESSION_READY received).
 * NFR-P1: First streamed token ≤ 1,500ms from send.
 */
test.describe('Sandbox lifecycle and SSE streaming', () => {
  test('SESSION_READY arrives within 10 seconds of page open', async ({ page }) => {
    const repoUrl = process.env.TEST_GITHUB_REPO_URL;
    if (!repoUrl) test.skip(true, 'TEST_GITHUB_REPO_URL not set');

    await page.goto('/dashboard');
    await page.getByTestId('new-conversation-button').click();
    await page.getByTestId('repository-url-input').fill(repoUrl!);
    await page.getByTestId('start-conversation-button').click();

    const conversation = new ConversationPage(page);

    const start = Date.now();
    await conversation.waitForSessionReady(10_000);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10_000); // NFR-P2
  });

  test('first token streams within 1,500ms of send', async ({ page, interceptNetworkCall }) => {
    const repoUrl = process.env.TEST_GITHUB_REPO_URL;
    if (!repoUrl) test.skip(true, 'TEST_GITHUB_REPO_URL not set');

    await page.goto('/dashboard');
    await page.getByTestId('new-conversation-button').click();
    await page.getByTestId('repository-url-input').fill(repoUrl!);
    await page.getByTestId('start-conversation-button').click();

    const conversation = new ConversationPage(page);
    await conversation.waitForSessionReady(10_000);

    const sendTimestamp = Date.now();
    await conversation.sendMessage('List the files in this repository.');

    await conversation.waitForFirstToken(1_500); // NFR-P1
    const ttft = Date.now() - sendTimestamp;
    expect(ttft).toBeLessThan(1_500);
  });

  test('tool pills appear for git operations during streaming', async ({ page }) => {
    const repoUrl = process.env.TEST_GITHUB_REPO_URL;
    if (!repoUrl) test.skip(true, 'TEST_GITHUB_REPO_URL not set');

    await page.goto('/dashboard');
    await page.getByTestId('new-conversation-button').click();
    await page.getByTestId('repository-url-input').fill(repoUrl!);
    await page.getByTestId('start-conversation-button').click();

    const conversation = new ConversationPage(page);
    await conversation.waitForSessionReady(10_000);
    await conversation.sendMessage('Show me the git log for this repository.');
    await conversation.waitForStreamComplete(60_000);

    await expect(conversation.toolPills.first()).toBeVisible();
  });

  test('working tree indicator transitions to dirty after agent writes', async ({ page }) => {
    const repoUrl = process.env.TEST_GITHUB_REPO_URL;
    if (!repoUrl) test.skip(true, 'TEST_GITHUB_REPO_URL not set');

    await page.goto('/dashboard');
    await page.getByTestId('new-conversation-button').click();
    await page.getByTestId('repository-url-input').fill(repoUrl!);
    await page.getByTestId('start-conversation-button').click();

    const conversation = new ConversationPage(page);
    await conversation.waitForSessionReady(10_000);
    await conversation.sendMessage('Create a file called test-artifact.md with "hello" as content.');
    await conversation.waitForStreamComplete(60_000);

    expect(await conversation.workingTreeState()).toBe('dirty');
  });

  test('manual commit succeeds and working tree returns to clean', async ({ page }) => {
    const repoUrl = process.env.TEST_GITHUB_REPO_URL;
    if (!repoUrl) test.skip(true, 'TEST_GITHUB_REPO_URL not set');

    await page.goto('/dashboard');
    await page.getByTestId('new-conversation-button').click();
    await page.getByTestId('repository-url-input').fill(repoUrl!);
    await page.getByTestId('start-conversation-button').click();

    const conversation = new ConversationPage(page);
    await conversation.waitForSessionReady(10_000);
    await conversation.sendMessage('Create a file called commit-test.md with "commit me" as content.');
    await conversation.waitForStreamComplete(60_000);

    await conversation.triggerManualCommit(); // NFR-P5: ≤ 5s
    expect(await conversation.workingTreeState()).toBe('clean');
  });
});

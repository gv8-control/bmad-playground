import { type Page, type Locator, expect } from '@playwright/test';

export class ConversationPage {
  readonly sessionStatus: Locator;
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly commitButton: Locator;
  readonly workingTreeIndicator: Locator;
  readonly messageStream: Locator;
  readonly toolPills: Locator;

  constructor(private readonly page: Page) {
    this.sessionStatus = page.getByTestId('session-status');
    this.chatInput = page.getByTestId('chat-input');
    this.sendButton = page.getByTestId('send-button');
    this.commitButton = page.getByTestId('manual-commit-button');
    this.workingTreeIndicator = page.getByTestId('working-tree-indicator');
    this.messageStream = page.getByTestId('message-stream');
    this.toolPills = page.getByTestId('tool-pill');
  }

  async waitForSessionReady(timeoutMs = 15_000): Promise<void> {
    await expect(this.sessionStatus).toHaveAttribute('data-status', 'ready', { timeout: timeoutMs });
  }

  async sendMessage(text: string): Promise<void> {
    await this.chatInput.fill(text);
    await this.sendButton.click();
  }

  async waitForFirstToken(timeoutMs = 5_000): Promise<void> {
    await expect(this.messageStream).not.toBeEmpty({ timeout: timeoutMs });
  }

  async waitForStreamComplete(timeoutMs = 60_000): Promise<void> {
    // The send button re-enables when the agent turn finishes
    await expect(this.sendButton).toBeEnabled({ timeout: timeoutMs });
  }

  async triggerManualCommit(): Promise<void> {
    await this.commitButton.click();
    await expect(this.page.getByTestId('commit-success-toast')).toBeVisible();
  }

  async workingTreeState(): Promise<'dirty' | 'clean'> {
    const status = await this.workingTreeIndicator.getAttribute('data-state');
    return status === 'dirty' ? 'dirty' : 'clean';
  }
}

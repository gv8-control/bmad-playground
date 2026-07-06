/**
 * @jest-environment jsdom
 *
 * Story 3.5: Resume an Existing Conversation
 * Unit tests for InProgressArtifactCard Client Component.
 *
 * Covers AC-3 (Focus existing Conversation tab from Project Map — FR8):
 * - Calls preventDefault + broadcasts focus-conversation when openConversations is non-empty
 * - Does NOT preventDefault when openConversations is empty (lets navigation proceed)
 * - Renders ArtifactCard with correct props
 * - Focuses the most recent conversation (openConversations[0])
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { InProgressArtifactCard } from './InProgressArtifactCard';

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  static lastPostMessage: unknown = null;

  readonly name: string;
  private listeners: ((event: MessageEvent) => void)[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    MockBroadcastChannel.lastPostMessage = data;
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.push(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  close(): void {}

  static reset(): void {
    MockBroadcastChannel.instances = [];
    MockBroadcastChannel.lastPostMessage = null;
  }
}

jest.mock('./ArtifactCard', () => ({
  ArtifactCard: ({ type, title, status, href, onClick }: { type: string; title: string; status: string; href: string; onClick?: (e: React.MouseEvent) => void }) => (
    <a
      href={href}
      role="listitem"
      data-testid="artifact-card"
      data-type={type}
      data-title={title}
      data-status={status}
      onClick={onClick}
    >
      {title}
    </a>
  ),
}));

describe('InProgressArtifactCard', () => {
  const originalBroadcastChannel = global.BroadcastChannel;

  beforeEach(() => {
    MockBroadcastChannel.reset();
    global.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.BroadcastChannel = originalBroadcastChannel;
  });

  it('[P0] calls preventDefault and broadcasts focus-conversation when openConversations is non-empty', () => {
    render(
      <InProgressArtifactCard
        type="prd"
        title="My PRD"
        href="/artifacts?id=art-1"
        openConversations={['conv-1', 'conv-2']}
      />,
    );

    const link = screen.getByRole('listitem');
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = jest.spyOn(clickEvent, 'preventDefault');

    fireEvent(link, clickEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(MockBroadcastChannel.lastPostMessage).toEqual({
      type: 'focus-conversation',
      conversationId: 'conv-1',
    });
  });

  it('[P0] does NOT preventDefault when openConversations is empty (lets navigation proceed)', () => {
    render(
      <InProgressArtifactCard
        type="prd"
        title="My PRD"
        href="/artifacts?id=art-1"
        openConversations={[]}
      />,
    );

    const link = screen.getByRole('listitem');
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    const preventDefaultSpy = jest.spyOn(clickEvent, 'preventDefault');

    fireEvent(link, clickEvent);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
    expect(MockBroadcastChannel.lastPostMessage).toBeNull();
  });

  it('[P0] renders ArtifactCard with correct props', () => {
    render(
      <InProgressArtifactCard
        type="architecture"
        title="System Architecture"
        href="/artifacts?id=art-2"
        openConversations={[]}
      />,
    );

    const card = screen.getByTestId('artifact-card');
    expect(card).toHaveAttribute('data-type', 'architecture');
    expect(card).toHaveAttribute('data-title', 'System Architecture');
    expect(card).toHaveAttribute('data-status', 'in-progress');
    expect(card).toHaveAttribute('href', '/artifacts?id=art-2');
  });

  it('[P1] focuses the most recent conversation (openConversations[0])', () => {
    render(
      <InProgressArtifactCard
        type="prd"
        title="My PRD"
        href="/artifacts?id=art-1"
        openConversations={['conv-recent', 'conv-old']}
      />,
    );

    const link = screen.getByRole('listitem');
    fireEvent.click(link);

    expect(MockBroadcastChannel.lastPostMessage).toEqual({
      type: 'focus-conversation',
      conversationId: 'conv-recent',
    });
  });
});

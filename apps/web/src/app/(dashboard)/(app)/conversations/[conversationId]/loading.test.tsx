/**
 * @jest-environment jsdom
 *
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Component unit tests for ConversationLoading (Next.js loading skeleton).
 * Covers AC-4 (route-focus management via h1, skeleton structure).
 *
 * The loading.tsx is a Next.js convention file that renders automatically
 * while the page.tsx Server Component is executing. These tests verify the
 * skeleton structure renders correctly and the h1 exists for route-focus
 * management (AppShell moves focus to h1 on route change).
 *
 * Priority tags: P0 for AC coverage, P1 for negative assertions.
 */

import { render, screen } from '@testing-library/react';
import ConversationLoading from './loading';

describe('ConversationLoading — skeleton (AC-4, route-focus management)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the h1 "Conversation" for route-change focus management', () => {
    render(<ConversationLoading />);
    expect(
      screen.getByRole('heading', { name: 'Conversation' }),
    ).toBeInTheDocument();
  });

  it('[P0] renders a skeleton card with animate-pulse', () => {
    const { container } = render(<ConversationLoading />);
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });

  it('[P1] does not render interactive elements (loading state, not runtime state)', () => {
    render(<ConversationLoading />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

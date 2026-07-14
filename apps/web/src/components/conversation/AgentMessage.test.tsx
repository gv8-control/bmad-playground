/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for AgentMessage component.
 * Covers AC-1 (streaming cursor), AC-4 (copy action, timestamp).
 * Story 5.5 covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-10 (interleaved segment
 * rendering — text segments via Markdown, tool_call segments via ToolPill/
 * SemanticPill/AccessNotice, fallback to content for legacy messages,
 * streaming cursor after last segment).
 */
import { render, screen } from '@testing-library/react';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null,
}));

import { AgentMessage, markdownComponents } from './AgentMessage';
import type { ChatMessage } from './types';

const message: ChatMessage = {
  id: 'msg-1',
  role: 'assistant',
  content: 'Hello **world**',
  createdAt: new Date('2026-07-04T12:00:00Z'),
};

describe('AgentMessage', () => {
  it('[P0] renders markdown content', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByTestId('markdown')).toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('Hello **world**');
  });

  it('[P0] renders copy button', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByLabelText('Copy to clipboard')).toBeInTheDocument();
  });

  it('[P0] shows streaming cursor when isStreaming is true', () => {
    const streamingMessage = { ...message, isStreaming: true };
    const { container } = render(<AgentMessage message={streamingMessage} />);
    const cursor = container.querySelector('.animate-pulse.bg-accent');
    expect(cursor).toBeInTheDocument();
  });

  it('[P0] renders timestamp from message createdAt', () => {
    render(<AgentMessage message={message} />);
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });
});

// ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────────
//
// AC-5: Inter-message gap is 24px (mb-6), not 16px (mb-4)
// AC-7: Markdown links have focus ring

describe('AgentMessage — Story 5.3 structural drift', () => {
  describe('[P0] AC-5 — Inter-message gap is 24px', () => {
    it('agent message container uses mb-6 (24px gap), not mb-4 (16px)', () => {
      const { container } = render(<AgentMessage message={message} />);
      const messageWrapper = container.querySelector('.group');
      expect(messageWrapper?.className).toContain('mb-6');
      expect(messageWrapper?.className).not.toContain('mb-4');
    });
  });

  describe('[P0] AC-7 — Markdown links have focus ring', () => {
    it('markdown link component includes focus ring classes', () => {
      const { container } = render(
        <markdownComponents.a href="https://example.com">example</markdownComponents.a>,
      );
      const link = container.querySelector('a');
      expect(link).toBeInTheDocument();
      expect(link?.className).toContain('focus:ring-2');
      expect(link?.className).toContain('focus:ring-accent');
      expect(link?.className).toContain('focus:outline-none');
    });
  });
});

// ─── Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream ──
//
// AC-7: ChatMessage data model supports interleaved tool calls (segments)
// AC-10: AgentMessage renders interleaved pills at correct positions

describe('AgentMessage — Story 5.5 interleaved segments', () => {
  describe('[P0] AC-10 — Segments render in order', () => {
    it('[P0] renders text segments as markdown and tool_call segments as ToolPill', () => {
      const messageWithSegments: ChatMessage = {
        id: 'msg-seg-1',
        role: 'assistant',
        content: 'Before tool.\nAfter tool.',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        segments: [
          { type: 'text', content: 'Before tool.\n' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Bash',
              status: 'completed',
              input: 'git status',
              output: 'nothing to commit',
            },
          },
          { type: 'text', content: 'After tool.' },
        ],
      };

      render(<AgentMessage message={messageWithSegments} />);

      expect(screen.getAllByTestId('markdown')).toHaveLength(2);
      expect(screen.getByText(/Bash/)).toBeInTheDocument();
    });

    it('[P0] renders segments in order: text, tool_call, text', () => {
      const messageWithSegments: ChatMessage = {
        id: 'msg-seg-2',
        role: 'assistant',
        content: 'First.\nSecond.',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        segments: [
          { type: 'text', content: 'First.\n' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Read',
              status: 'completed',
              input: 'file.ts',
              output: 'contents',
            },
          },
          { type: 'text', content: 'Second.' },
        ],
      };

      const { container } = render(<AgentMessage message={messageWithSegments} />);

      expect(container.textContent).toMatch(/First.*Read.*Second/s);
    });

    it('[P0] falls back to content when segments is absent (legacy messages)', () => {
      const legacyMessage: ChatMessage = {
        id: 'msg-legacy',
        role: 'assistant',
        content: 'Hello **world**',
        createdAt: new Date('2026-07-13T12:00:00Z'),
      };

      render(<AgentMessage message={legacyMessage} />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
      expect(screen.getByTestId('markdown')).toHaveTextContent('Hello **world**');
    });

    it('[P0] streaming cursor appears after last segment when isStreaming', () => {
      const streamingMessage: ChatMessage = {
        id: 'msg-streaming',
        role: 'assistant',
        content: 'Working',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        isStreaming: true,
        segments: [
          { type: 'text', content: 'Working' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Bash',
              status: 'running',
              input: '',
              output: '',
            },
          },
        ],
      };

      const { container } = render(<AgentMessage message={streamingMessage} />);

      const cursor = container.querySelector('.animate-pulse.bg-accent');
      expect(cursor).toBeInTheDocument();
    });

    it('[P0] renders SemanticPill when tool_call segment has semantic field', () => {
      const messageWithSemantic: ChatMessage = {
        id: 'msg-semantic',
        role: 'assistant',
        content: 'Saved.',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        segments: [
          { type: 'text', content: 'Saved.' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Bash',
              status: 'completed',
              input: 'git commit',
              output: '1 file changed',
              semantic: {
                artifactType: 'prd',
                artifactTitle: 'My PRD',
                viewHref: '/artifacts?id=art-1',
              },
            },
          },
        ],
      };

      render(<AgentMessage message={messageWithSemantic} />);

      expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
    });

    it('[P0] renders AccessNotice when tool_call segment has accessNotice field', () => {
      const messageWithAccessNotice: ChatMessage = {
        id: 'msg-access',
        role: 'assistant',
        content: 'Pushing.',
        createdAt: new Date('2026-07-13T12:00:00Z'),
        segments: [
          { type: 'text', content: 'Pushing.' },
          {
            type: 'tool_call',
            toolCall: {
              toolCallId: 'tc-1',
              toolName: 'Bash',
              status: 'error',
              input: 'git push',
              output: 'Rate limit exceeded',
              errorMessage: 'Rate limit exceeded',
              accessNotice: {
                code: 'RATE_LIMITED',
              },
            },
          },
        ],
      };

      render(<AgentMessage message={messageWithAccessNotice} />);

      expect(screen.getByText(/GitHub is rate-limiting this request/)).toBeInTheDocument();
    });
  });
});

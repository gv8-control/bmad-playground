/**
 * @jest-environment jsdom
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Unit tests for ToolPill component.
 *
 * Covers: AC-1 (running/completed/error states, expand/collapse),
 *         AC-3 (error-state on failed git commit),
 *         AC-4 (error-state on any failed tool call).
 *
 * TDD RED PHASE — tests are skipped until implementation lands.
 * Remove it.skip() → it() when activating for the current task.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolPill } from './ToolPill';
import type { ToolCallData } from './types';

function makeToolCall(overrides: Partial<ToolCallData> = {}): ToolCallData {
  return {
    toolCallId: 'tc-1',
    toolName: 'Bash',
    status: 'running',
    input: '',
    output: '',
    ...overrides,
  };
}

describe('ToolPill', () => {
  describe('[P0] AC-1 — Running state', () => {
    it.skip('renders spinner and "Running… [toolName]" label', () => {
      render(<ToolPill toolCall={makeToolCall({ status: 'running', toolName: 'Bash' })} />);
      expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('[P0] AC-1 — Completed state', () => {
    it.skip('renders checkmark and tool name without "completed" label', () => {
      render(<ToolPill toolCall={makeToolCall({ status: 'completed', toolName: 'Bash' })} />);
      expect(screen.getByText(/Bash/)).toBeInTheDocument();
      expect(screen.queryByText(/completed/i)).not.toBeInTheDocument();
    });
  });

  describe('[P0] AC-3/AC-4 — Error state', () => {
    it.skip('renders negative border/text and "[toolName] failed"', () => {
      render(
        <ToolPill
          toolCall={makeToolCall({
            status: 'error',
            toolName: 'Bash',
            errorMessage: 'Command exited with code 1',
          })}
        />,
      );
      expect(screen.getByText(/Bash.*failed/)).toBeInTheDocument();
      const pill = screen.getByRole('button');
      expect(pill.className).toContain('negative');
    });

    it.skip('displays errorMessage in expanded view', () => {
      render(
        <ToolPill
          toolCall={makeToolCall({
            status: 'error',
            toolName: 'Bash',
            errorMessage: 'Command exited with code 1',
            input: 'git commit -m "test"',
            output: 'error: failed to push',
          })}
        />,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText(/Command exited with code 1/)).toBeInTheDocument();
    });
  });

  describe('[P0] AC-1 — Expand/collapse', () => {
    it.skip('expands on click to show raw input/output in monospace', () => {
      render(
        <ToolPill
          toolCall={makeToolCall({
            status: 'completed',
            toolName: 'Bash',
            input: 'git status',
            output: 'nothing to commit',
          })}
        />,
      );
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('git status')).toBeInTheDocument();
      expect(screen.getByText('nothing to commit')).toBeInTheDocument();
      expect(document.querySelector('pre.font-mono')).toBeInTheDocument();
    });

    it.skip('collapses on second click', () => {
      render(
        <ToolPill
          toolCall={makeToolCall({
            status: 'completed',
            toolName: 'Bash',
            input: 'git status',
            output: 'nothing to commit',
          })}
        />,
      );
      const pill = screen.getByRole('button');
      fireEvent.click(pill);
      expect(screen.getByText('git status')).toBeInTheDocument();
      fireEvent.click(pill);
      expect(screen.queryByText('git status')).not.toBeInTheDocument();
    });

    it.skip('aria-expanded reflects expanded state', () => {
      render(<ToolPill toolCall={makeToolCall({ status: 'completed' })} />);
      const pill = screen.getByRole('button');
      expect(pill).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(pill);
      expect(pill).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('[P1] AC-1 — Keyboard accessibility', () => {
    it.skip('Enter key toggles expanded state', () => {
      render(<ToolPill toolCall={makeToolCall({ status: 'completed' })} />);
      const pill = screen.getByRole('button');
      pill.focus();
      fireEvent.keyDown(pill, { key: 'Enter' });
      expect(pill).toHaveAttribute('aria-expanded', 'true');
    });

    it.skip('Space key toggles expanded state', () => {
      render(<ToolPill toolCall={makeToolCall({ status: 'completed' })} />);
      const pill = screen.getByRole('button');
      pill.focus();
      fireEvent.keyDown(pill, { key: ' ' });
      expect(pill).toHaveAttribute('aria-expanded', 'true');
    });
  });
});

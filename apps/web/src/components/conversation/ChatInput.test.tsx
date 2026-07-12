/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for ChatInput component.
 * Covers AC-2 (auto-growing, Enter to send, Shift+Enter for newline).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  it('[P0] renders textarea', () => {
    render(
      <ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.getByLabelText('Message input')).toBeInTheDocument();
  });

  it('[P0] calls onSubmit on Enter (without Shift)', () => {
    const onSubmit = jest.fn();
    render(
      <ChatInput value="hello" onChange={jest.fn()} onSubmit={onSubmit} />,
    );

    fireEvent.keyDown(screen.getByLabelText('Message input'), {
      key: 'Enter',
      shiftKey: false,
    });

    expect(onSubmit).toHaveBeenCalled();
  });

  it('[P0] does not call onSubmit on Shift+Enter', () => {
    const onSubmit = jest.fn();
    render(
      <ChatInput value="hello" onChange={jest.fn()} onSubmit={onSubmit} />,
    );

    fireEvent.keyDown(screen.getByLabelText('Message input'), {
      key: 'Enter',
      shiftKey: true,
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('[P0] calls onChange when typing', async () => {
    const onChange = jest.fn();
    render(
      <ChatInput value="" onChange={onChange} onSubmit={jest.fn()} />,
    );

    await userEvent.type(screen.getByLabelText('Message input'), 'h');

    expect(onChange).toHaveBeenCalledWith('h');
  });

  it('[P0] shows Stop button when isProcessing is true', () => {
    const onStop = jest.fn();
    render(
      <ChatInput
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onStop={onStop}
        isProcessing={true}
      />,
    );

    expect(screen.getByLabelText('Stop agent')).toBeInTheDocument();
  });

  it('[P0] calls onStop when Stop button clicked', () => {
    const onStop = jest.fn();
    render(
      <ChatInput
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onStop={onStop}
        isProcessing={true}
      />,
    );

    fireEvent.click(screen.getByLabelText('Stop agent'));

    expect(onStop).toHaveBeenCalled();
  });

  it('[P0] auto-grows textarea height based on scrollHeight', () => {
    const { container, rerender } = render(
      <ChatInput value="short" onChange={jest.fn()} onSubmit={jest.fn()} />,
    );
    const textarea = container.querySelector('textarea')!;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 150,
    });

    rerender(
      <ChatInput value="short\nmore\nmore\nmore" onChange={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(textarea.style.height).toBe('150px');
  });

  it('[P0] caps textarea height at 200px (max-height)', () => {
    const { container, rerender } = render(
      <ChatInput value="short" onChange={jest.fn()} onSubmit={jest.fn()} />,
    );
    const textarea = container.querySelector('textarea')!;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 500,
    });

    rerender(<ChatInput value="very tall content" onChange={jest.fn()} onSubmit={jest.fn()} />);

    expect(textarea.style.height).toBe('200px');
  });

  it('[P0] disables textarea when disabled prop is true', () => {
    const { container } = render(
      <ChatInput value="hello" onChange={jest.fn()} onSubmit={jest.fn()} disabled={true} />,
    );
    const textarea = container.querySelector('textarea')!;
    expect(textarea).toBeDisabled();
  });
});

// ─── Story 5.1: Visual containers (AC-6) ────────────────────────────────────
//
// GREEN PHASE: tests are active for Task 6 implementation.
//
// AC-6: Conversation chat-input-box container.
// The textarea, Send button, and WorkingTreeIndicator must sit inside a
// single bordered chat-input-box container (bg-surface-raised border
// border-border rounded-lg p-3 px-4 flex flex-col). The textarea is
// transparent (bg-transparent border-none). A footer row holds the
// WorkingTreeIndicator (left) and Send/Stop button (right).

describe('ChatInput — chat-input-box container (Story 5.1, AC-6)', () => {
  it('[P0] renders a chat-input-box container with bg-surface-raised border border-border rounded-lg (AC-6, Task 6.1)', () => {
    render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
    const container = document.querySelector('.bg-surface-raised.border.border-border.rounded-lg');
    expect(container).toBeInTheDocument();
  });

  it('[P0] the textarea is transparent (bg-transparent border-none) inside the container (AC-6, Task 6.2)', () => {
    render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
    const textarea = screen.getByLabelText('Message input');
    expect(textarea).toHaveClass('bg-transparent');
    expect(textarea).toHaveClass('border-none');
  });

  it('[P0] renders a footer row (flex items-center justify-between) containing the Send button (AC-6, Task 6.3, 6.4)', () => {
    render(<ChatInput value="hello" onChange={jest.fn()} onSubmit={jest.fn()} />);
    const footer = document.querySelector('.flex.items-center.justify-between');
    expect(footer).toBeInTheDocument();
    expect(footer).toContainElement(screen.getByRole('button', { name: /send/i }));
  });

  it('[P0] renders the workingTreeIndicator prop in the footer row left side (AC-6, Task 6.5)', () => {
    const indicator = <div data-testid="wt-indicator">Working Tree</div>;
    render(
      <ChatInput
        value="hello"
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        workingTreeIndicator={indicator}
      />,
    );
    const footer = document.querySelector('.flex.items-center.justify-between');
    expect(footer).toContainElement(screen.getByTestId('wt-indicator'));
  });

  it('[P0] renders without workingTreeIndicator prop (footer row still exists) (AC-6, Task 6.5)', () => {
    render(<ChatInput value="hello" onChange={jest.fn()} onSubmit={jest.fn()} />);
    const footer = document.querySelector('.flex.items-center.justify-between');
    expect(footer).toBeInTheDocument();
    expect(footer).toContainElement(screen.getByRole('button', { name: /send/i }));
  });

  it('[P1] the chat-input-box container has focus-within ring (AC-6, Task 6.1)', () => {
    render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
    const container = document.querySelector('.bg-surface-raised.border.border-border.rounded-lg');
    expect(container).toHaveClass('focus-within:ring-2');
  });

  it('[P1] the Stop button renders inside the footer row when isProcessing and onStop are provided (AC-6, Task 6.3)', () => {
    render(
      <ChatInput
        value=""
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onStop={jest.fn()}
        isProcessing={true}
      />,
    );
    const footer = document.querySelector('.flex.items-center.justify-between');
    expect(footer).toContainElement(screen.getByLabelText('Stop agent'));
  });
});

// ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────────
//
// GREEN PHASE: tests are active for Story 5.3 implementation.
//
// AC-4: Disabled Send button uses muted-surface style
// AC-5: Placeholder copy "Message…" (not "Type a message…")
// AC-8: Send button arrow icon and font-medium

describe('ChatInput — Story 5.3 structural drift', () => {
  describe('[P0] AC-4 — Disabled Send button uses muted-surface style', () => {
    it('disabled Send button does not use opacity-50', () => {
      render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.className).not.toContain('opacity-50');
    });

    it('disabled Send button uses bg-text-3 for muted surface', () => {
      render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.className).toContain('bg-text-3');
    });

    it('disabled Send button uses text-text-2 for muted text', () => {
      render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.className).toContain('text-text-2');
    });

    it('disabled Send button uses border border-border for muted border', () => {
      render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.className).toContain('border');
      expect(sendButton.className).toContain('border-border');
    });
  });

  describe('[P0] AC-5 — Placeholder copy', () => {
    it('default placeholder is "Message…" not "Type a message…"', () => {
      render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const textarea = screen.getByLabelText('Message input');
      expect(textarea).toHaveAttribute('placeholder', 'Message…');
    });

    it('does not use "Type a message…" as placeholder', () => {
      render(<ChatInput value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const textarea = screen.getByLabelText('Message input');
      expect(textarea.getAttribute('placeholder')).not.toBe('Type a message…');
    });
  });

  describe('[P0] AC-8 — Send button arrow icon and font-medium', () => {
    it('Send button text uses font-medium', () => {
      render(<ChatInput value="hello" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.className).toContain('font-medium');
    });

    it('Send button has gap-1.5 between text and icon', () => {
      render(<ChatInput value="hello" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.className).toContain('gap-1.5');
    });

    it('Send button displays an upward arrow (↑) character', () => {
      render(<ChatInput value="hello" onChange={jest.fn()} onSubmit={jest.fn()} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton.textContent).toContain('↑');
    });
  });
});

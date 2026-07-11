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

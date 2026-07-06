/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Story 3.4: Removed ToolExecutionIndicator tests (component deleted, replaced by ToolPill)
 * Tests for ThinkingIndicator, ScrollToBottomButton, CopyButton.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { CopyButton } from './CopyButton';

describe('ThinkingIndicator', () => {
  it('[P0] renders with role=status', () => {
    render(<ThinkingIndicator />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('ScrollToBottomButton', () => {
  it('[P0] shows count when count > 0', () => {
    render(<ScrollToBottomButton count={5} onClick={jest.fn()} />);
    expect(screen.getByText('5 new')).toBeInTheDocument();
  });

  it('[P0] calls onClick when clicked', () => {
    const onClick = jest.fn();
    render(<ScrollToBottomButton count={0} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText('Scroll to bottom'));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('CopyButton', () => {
  it('[P0] copies text to clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton text="hello" alwaysVisible={true} />);

    fireEvent.click(screen.getByLabelText('Copy to clipboard'));

    expect(writeText).toHaveBeenCalledWith('hello');
  });
});

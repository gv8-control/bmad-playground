/**
 * ATDD — Story 2.5: View a Single Artifact's Rendered Content
 * Component unit tests for ArtifactLoadError (Client Component).
 * Covers AC-2 (artifact load error state with Refresh button).
 *
 * next/navigation is mocked to isolate the test from the router.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { ArtifactLoadError } from './ArtifactLoadError';

describe('ArtifactLoadError — error state (AC-2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the full error message text (AC-2)', () => {
    render(<ArtifactLoadError />);
    expect(
      screen.getByText(/couldn't load this artifact\. try refreshing the page\./i),
    ).toBeInTheDocument();
  });

  it('[P0] renders a Refresh button', () => {
    render(<ArtifactLoadError />);
    expect(
      screen.getByRole('button', { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it('[P0] calls router.refresh() when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<ArtifactLoadError />);
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('[P0] button has focus ring classes', () => {
    render(<ArtifactLoadError />);
    const button = screen.getByRole('button', { name: /refresh/i });
    expect(button.className).toContain('focus:ring-2');
    expect(button.className).toContain('focus:ring-accent');
  });
});

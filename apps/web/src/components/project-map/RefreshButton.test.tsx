/**
 * @jest-environment jsdom
 *
 * ATDD — Story 2.3: Manually Refresh the Project Map
 * Component unit tests for RefreshButton (Client Component).
 * Covers AC-1 (manual refresh re-reads via mirroring mechanism with spinner).
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock('@/actions/artifacts.actions', () => ({
  syncArtifactsAction: jest.fn(),
}));

import { RefreshButton } from './RefreshButton';
import { syncArtifactsAction } from '@/actions/artifacts.actions';

describe('RefreshButton (AC-1)', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('[P0] renders a button with aria-label="Refresh Project Map"', () => {
    render(<RefreshButton />);
    expect(
      screen.getByRole('button', { name: /refresh project map/i }),
    ).toBeInTheDocument();
  });

  it('[P0] clicking calls syncArtifactsAction', async () => {
    (syncArtifactsAction as jest.Mock).mockResolvedValue({
      success: true,
      artifactsUpserted: 0,
      artifactsDeleted: 0,
    });
    render(<RefreshButton />);
    await userEvent.click(
      screen.getByRole('button', { name: /refresh project map/i }),
    );
    expect(syncArtifactsAction).toHaveBeenCalled();
  });

  it('[P0] router.refresh() is called after sync resolves', async () => {
    (syncArtifactsAction as jest.Mock).mockResolvedValue({
      success: true,
      artifactsUpserted: 0,
      artifactsDeleted: 0,
    });
    render(<RefreshButton />);
    await userEvent.click(
      screen.getByRole('button', { name: /refresh project map/i }),
    );
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('[P1] router.refresh() is called even when sync returns an error result', async () => {
    (syncArtifactsAction as jest.Mock).mockResolvedValue({
      error: 'Credential missing',
      errorCode: 'NO_CREDENTIAL',
    });
    render(<RefreshButton />);
    await userEvent.click(
      screen.getByRole('button', { name: /refresh project map/i }),
    );
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('[P1] button re-enables after sync resolves', async () => {
    (syncArtifactsAction as jest.Mock).mockResolvedValue({
      success: true,
      artifactsUpserted: 0,
      artifactsDeleted: 0,
    });
    render(<RefreshButton />);
    const button = screen.getByRole('button', {
      name: /refresh project map/i,
    });
    await userEvent.click(button);
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('[P0] button is disabled and icon has animate-spin while pending', async () => {
    (syncArtifactsAction as jest.Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<RefreshButton />);
    const button = screen.getByRole('button', {
      name: /refresh project map/i,
    });
    await userEvent.click(button);
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
    const icon = button.querySelector('svg');
    expect(icon).toHaveClass('animate-spin');
  });

  it('[P1] router.refresh() is called even when sync throws', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    (syncArtifactsAction as jest.Mock).mockRejectedValue(
      new Error('DB down'),
    );
    render(<RefreshButton />);
    await userEvent.click(
      screen.getByRole('button', { name: /refresh project map/i }),
    );
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });
});

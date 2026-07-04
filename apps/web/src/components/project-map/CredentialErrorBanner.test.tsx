/**
 * @jest-environment jsdom
 *
 * ATDD — Story 2.2: View the Project Map
 * Component unit tests for CredentialErrorBanner (Client Component).
 * Covers AC-4 (credential error banner with re-auth modal, UX-DR10, UX-DR16).
 *
 * RED PHASE: all tests will fail because CredentialErrorBanner.tsx does not
 * exist yet (Task 3.1). The "Cannot find module" error is the expected TDD
 * red-phase signal. The shadcn Dialog component (Task 1) is also not installed
 * yet — that's a transitive dependency.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CredentialErrorBanner } from './CredentialErrorBanner';

jest.mock('@/actions/credential-health.actions', () => ({
  reauthorizeGitHub: jest.fn(),
}));

import { reauthorizeGitHub } from '@/actions/credential-health.actions';

describe('CredentialErrorBanner — render (AC-4, UX-DR10)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the banner text and "Update access token" link', () => {
    render(<CredentialErrorBanner />);
    expect(
      screen.getByText(/your repository connection needs attention/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /update access token/i }),
    ).toBeInTheDocument();
  });

  it('[P0] clicking "Update access token" link opens the re-auth dialog modal', async () => {
    render(<CredentialErrorBanner />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /reconnect your github account/i }),
      ).toBeInTheDocument();
    });
  });

  it('[P0] dialog contains a "Reconnect" button', async () => {
    render(<CredentialErrorBanner />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /reconnect/i }),
      ).toBeInTheDocument();
    });
  });
});

describe('CredentialErrorBanner — re-auth interaction (AC-4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] clicking "Reconnect" calls reauthorizeGitHub', async () => {
    (reauthorizeGitHub as jest.Mock).mockResolvedValue(undefined);
    render(<CredentialErrorBanner />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    const reconnectButton = await screen.findByRole('button', { name: /reconnect/i });
    await userEvent.click(reconnectButton);
    expect(reauthorizeGitHub).toHaveBeenCalled();
  });

  it('[P1] "Reconnect" button is disabled while reauthorizeGitHub is pending', async () => {
    (reauthorizeGitHub as jest.Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<CredentialErrorBanner />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    const reconnectButton = await screen.findByRole('button', { name: /reconnect/i });
    await userEvent.click(reconnectButton);
    await waitFor(() => {
      expect(reconnectButton).toBeDisabled();
    });
  });
});

describe('CredentialErrorBanner — non-dismissible (AC-4, UX-DR10)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] banner has no close button — only the dialog can be dismissed', async () => {
    render(<CredentialErrorBanner />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /reconnect your github account/i }),
      ).toBeInTheDocument();
    });
    const banner = screen
      .getByText(/your repository connection needs attention/i)
      .closest('div');
    expect(banner).not.toBeNull();
    const closeButtons = banner!.querySelectorAll('button, [aria-label="Close"]');
    expect(closeButtons).toHaveLength(0);
  });

  it('[P1] "Update access token" link has aria-label (UX-DR16)', () => {
    render(<CredentialErrorBanner />);
    const link = screen.getByRole('link', { name: /update access token/i });
    expect(link).toHaveAttribute('aria-label');
  });
});

/**
 * @jest-environment jsdom
 *
 * ATDD — Story 2.2: View the Project Map
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 * Component unit tests for CredentialErrorBanner (Client Component).
 * Covers AC-4 (credential error banner with re-auth modal, UX-DR10, UX-DR16).
 * Story 3.7 added `callbackUrl` prop forwarding coverage (2 tests).
 *
 * TDD GREEN PHASE — all tests un-skipped and passing.
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

describe('CredentialErrorBanner — callbackUrl prop (Story 3.7 AC-3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] passes callbackUrl to reauthorizeGitHub when provided', async () => {
    (reauthorizeGitHub as jest.Mock).mockResolvedValue(undefined);
    render(<CredentialErrorBanner callbackUrl="/conversations/conv-1" />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    const reconnectButton = await screen.findByRole('button', { name: /reconnect/i });
    await userEvent.click(reconnectButton);
    expect(reauthorizeGitHub).toHaveBeenCalledWith('/conversations/conv-1');
  });

  it('[P1] calls reauthorizeGitHub with undefined when callbackUrl is not provided', async () => {
    (reauthorizeGitHub as jest.Mock).mockResolvedValue(undefined);
    render(<CredentialErrorBanner />);
    await userEvent.click(
      screen.getByRole('link', { name: /update access token/i }),
    );
    const reconnectButton = await screen.findByRole('button', { name: /reconnect/i });
    await userEvent.click(reconnectButton);
    expect(reauthorizeGitHub).toHaveBeenCalledWith(undefined);
  });
});

/**
 * ATDD — Story 1.3: Connect a Repository by URL
 * Component unit tests for RepositoryUrlForm (Client Component).
 * Covers AC-1 (single URL input, no token field), AC-4 (inline error display,
 * per-cause messages), and UX-DR14/UX-DR16 accessibility requirements.
 *
 * RED PHASE: all tests are skipped until RepositoryUrlForm.tsx is created (Task 5.3).
 * Remove test.skip() one describe-block at a time as you implement each piece.
 *
 * Module will not resolve until Task 5.3 creates the component file — that
 * "Cannot find module" error is the expected TDD red-phase signal.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepositoryUrlForm } from './RepositoryUrlForm';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@/actions/repo-connection.actions', () => ({
  connectRepository: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { connectRepository } from '@/actions/repo-connection.actions';

// ─── Initial render (AC-1, UX-DR14) ──────────────────────────────────────────

describe('RepositoryUrlForm — initial render (AC-1, UX-DR14)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the "Repository URL" labelled input as the sole text input', () => {
    render(<RepositoryUrlForm />);
    expect(screen.getByLabelText(/repository url/i)).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('[P0] shows NO access-token, PAT, or password field — URL-only model (AC-1, DL-7)', () => {
    render(<RepositoryUrlForm />);
    expect(screen.queryByLabelText(/token|access.token|pat|password/i)).not.toBeInTheDocument();
  });

  it('[P0] renders the "Connect repository" submit button', () => {
    render(<RepositoryUrlForm />);
    expect(screen.getByRole('button', { name: /connect repository/i })).toBeInTheDocument();
  });

  it('[P1] submit button is disabled when the URL input is empty', () => {
    render(<RepositoryUrlForm />);
    expect(screen.getByRole('button', { name: /connect repository/i })).toBeDisabled();
  });

  it('[P0] shows no error message on initial render', () => {
    render(<RepositoryUrlForm />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ─── Pending state (UX-DR14) ──────────────────────────────────────────────────

describe('RepositoryUrlForm — pending / validating state (UX-DR14)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] shows "Validating…" on the button while the Server Action is in flight', async () => {
    (connectRepository as jest.Mock).mockImplementation(() => new Promise(() => undefined)); // never resolves
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    expect(await screen.findByRole('button', { name: /validating/i })).toBeInTheDocument();
  });

  it('[P1] input is disabled while the action is pending', async () => {
    (connectRepository as jest.Mock).mockImplementation(() => new Promise(() => undefined));
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await screen.findByRole('button', { name: /validating/i });
    expect(screen.getByLabelText(/repository url/i)).toBeDisabled();
  });
});

// ─── Error display (AC-4, UX-DR16 accessibility) ─────────────────────────────

describe('RepositoryUrlForm — error display (AC-4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] shows inline error when Server Action returns INSUFFICIENT_PERMISSION (AC-4)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: "You don't have write access to this repository. bmad-easy requires write access.",
      errorCode: 'INSUFFICIENT_PERMISSION',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/write access/i));
  });

  it('[P0] shows inline error when Server Action returns NOT_FOUND (AC-4)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'Repository not found. Check that the URL is correct and you have access to it.',
      errorCode: 'NOT_FOUND',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not found/i));
  });

  it('[P0] shows org-restriction error that explicitly names the org cause (AC-4)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'Your GitHub organization has OAuth App access restrictions enabled. Ask an org admin to approve bmad-easy.',
      errorCode: 'ORG_RESTRICTION',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/organization/i));
  });

  it('[P1] error element has role="alert" for screen reader announcement (UX-DR16)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'Some error.',
      errorCode: 'UNKNOWN',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('[P1] input has aria-describedby pointing to the error element when error is shown (UX-DR16)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({ error: 'Error.', errorCode: 'UNKNOWN' });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const input = screen.getByLabelText(/repository url/i);
    const alert = screen.getByRole('alert');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('[P0] submit button is re-enabled after an error so the user can retry', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({ error: 'Error.', errorCode: 'UNKNOWN' });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /connect repository/i })).toBeEnabled();
  });

  it('[P1] error is cleared on the next submission attempt', async () => {
    (connectRepository as jest.Mock)
      .mockResolvedValueOnce({ error: 'Error.', errorCode: 'UNKNOWN' })
      .mockResolvedValueOnce({ success: true });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    const button = screen.getByRole('button', { name: /connect repository/i });
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // Click again — error should clear before the second response
    await userEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

// ─── Successful submission (AC-3) ─────────────────────────────────────────────

describe('RepositoryUrlForm — successful connection (AC-3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] redirects to /project-map when the Server Action returns { success: true } (AC-3)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({ success: true });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/project-map'));
  });
});

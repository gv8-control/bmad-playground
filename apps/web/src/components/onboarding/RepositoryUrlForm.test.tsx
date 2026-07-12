/**
 * ATDD — Story 1.3: Connect a Repository by URL
 * Component unit tests for RepositoryUrlForm (Client Component).
 * Covers AC-1 (single URL input, no token field), AC-4 (inline error display,
 * per-cause messages), and UX-DR14/UX-DR16 accessibility requirements.
 * Also covers Story 5.1 AC-2 (form panel) and AC-3 (BMAD-not-found panel).
 *
 * GREEN PHASE: all tests are active. Story 1.3 and Story 5.1 implementation
 * complete.
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

// ─── BMAD validation error display (Story 1.4) ───────────────────────────────

describe('RepositoryUrlForm — BMAD validation errors (Story 1.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] shows documentation link when validation error includes documentationLink', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'BMAD initialization is incomplete. Missing: _bmad/.',
      errorCode: 'MISSING_DIRECTORY',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    const link = await screen.findByRole('link', { name: /bmad documentation/i });
    expect(link).toHaveAttribute('href', 'https://docs.bmad-method.org');
  });

  it('[P0] does NOT show documentation link for non-validation errors', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: "You don't have write access to this repository.",
      errorCode: 'INSUFFICIENT_PERMISSION',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('[P0] shows error message for UNSUPPORTED_VERSION with detected version', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'BMAD version 5.9.9 is not supported. Only BMAD v6 is supported.',
      errorCode: 'UNSUPPORTED_VERSION',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/5\.9\.9/));
  });

  it('[P0] shows error message for NO_SKILLS_FOUND', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'No BMAD Skills were found in .claude/skills/.',
      errorCode: 'NO_SKILLS_FOUND',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/skill/i));
  });

  it('[P1] documentation link opens in new tab with noopener', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'Missing directory.',
      errorCode: 'MISSING_DIRECTORY',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    const link = await screen.findByRole('link', { name: /bmad documentation/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('[P1] documentation link is cleared on next submission', async () => {
    (connectRepository as jest.Mock)
      .mockResolvedValueOnce({
        error: 'Missing directory.',
        errorCode: 'MISSING_DIRECTORY',
        documentationLink: 'https://docs.bmad-method.org',
      })
      .mockResolvedValueOnce({ success: true });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    const button = screen.getByRole('button', { name: /connect repository/i });
    await userEvent.click(button);
    await screen.findByRole('link', { name: /bmad documentation/i });
    await userEvent.click(button);
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument());
  });
});

// ─── Story 5.1: Visual containers (AC-2, AC-3) ───────────────────────────────
//
// GREEN PHASE: tests are active for Tasks 2 and 3 implementation.
// AC-2: Onboarding form panel wraps the Repository URL input.
// The input and its supporting copy must sit inside a form panel
// (bg-surface border border-border rounded-xl p-7).
//
// AC-3: Onboarding BMAD-not-found panel for blocking states.
// BMAD-validation errors (with documentationLink) must render in a styled
// panel (bg-negative-bg border border-negative rounded-lg p-4) with a
// title/body split. Non-BMAD errors keep the inline error style.

describe('RepositoryUrlForm — form panel container (Story 5.1, AC-2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] wraps the form inner content in a panel with bg-surface border border-border rounded-xl p-7 (AC-2, Task 2.1)', () => {
    render(<RepositoryUrlForm />);
    const panel = document.querySelector('.bg-surface.border.border-border.rounded-xl.p-7');
    expect(panel).toBeInTheDocument();
  });

  it('[P0] the form panel contains the label, input, and submit button (AC-2, Task 2.2)', () => {
    render(<RepositoryUrlForm />);
    const panel = document.querySelector('.bg-surface.border.border-border.rounded-xl.p-7');
    expect(panel).toContainElement(screen.getByLabelText(/repository url/i));
    expect(panel).toContainElement(
      screen.getByRole('button', { name: /connect repository/i }),
    );
  });
});

describe('RepositoryUrlForm — BMAD-not-found panel (Story 5.1, AC-3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders a styled panel (bg-negative-bg border border-negative rounded-lg p-4) for BMAD-validation errors with documentationLink (AC-3, Task 3.1)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'BMAD initialization is incomplete. Missing: _bmad/.',
      errorCode: 'MISSING_DIRECTORY',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => {
      const panel = document.querySelector('.bg-negative-bg.border.border-negative.rounded-lg.p-4');
      expect(panel).toBeInTheDocument();
    });
  });

  it('[P0] the BMAD-not-found panel has a title/body split layout (AC-3, Task 3.2)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'BMAD initialization is incomplete. Missing: _bmad/.',
      errorCode: 'MISSING_DIRECTORY',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => {
      const panel = document.querySelector('.bg-negative-bg.border.border-negative.rounded-lg.p-4');
      expect(panel).toBeInTheDocument();
    });
    const panel = document.querySelector('.bg-negative-bg.border.border-negative.rounded-lg.p-4');
    const link = await screen.findByRole('link', { name: /bmad documentation/i });
    expect(panel).toContainElement(link);
  });

  it('[P0] keeps inline error style (no bg-negative-bg panel) for non-BMAD errors without documentationLink (AC-3, Task 3.3)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: "You don't have write access to this repository.",
      errorCode: 'INSUFFICIENT_PERMISSION',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const panel = document.querySelector('.bg-negative-bg.border.border-negative.rounded-lg.p-4');
    expect(panel).not.toBeInTheDocument();
  });

  it('[P1] preserves role="alert" and aria-describedby wiring in the BMAD-not-found panel (AC-3, Task 3.4)', async () => {
    (connectRepository as jest.Mock).mockResolvedValue({
      error: 'BMAD initialization is incomplete. Missing: _bmad/.',
      errorCode: 'MISSING_DIRECTORY',
      documentationLink: 'https://docs.bmad-method.org',
    });
    render(<RepositoryUrlForm />);
    await userEvent.type(screen.getByLabelText(/repository url/i), 'https://github.com/a/b');
    await userEvent.click(screen.getByRole('button', { name: /connect repository/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const input = screen.getByLabelText(/repository url/i);
    const alert = screen.getByRole('alert');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });
});

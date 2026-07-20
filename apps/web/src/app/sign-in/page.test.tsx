import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SignInPage from './page';

jest.mock('@/lib/auth', () => ({
  signIn: jest.fn(),
}));

const mockUseFormStatus = jest.fn();
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  useFormStatus: () => mockUseFormStatus(),
}));

describe('SignInPage', () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({
      pending: false,
      data: null,
      method: null,
      action: null,
    });
  });

  it('renders the Sign in with GitHub button', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole('button', { name: /sign in with github/i })
    ).toBeInTheDocument();
  });

  it('shows error message when error param is present', async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ error: 'OAuthCallback' }),
      })
    );
    expect(screen.getByText(/sign-in failed/i)).toBeInTheDocument();
  });

  it('does not show error message when no error param', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SignInPage — pending state', () => {
  it('disables the button and shows redirect copy while the Server Action is pending', async () => {
    mockUseFormStatus.mockReturnValue({
      pending: true,
      data: null,
      method: null,
      action: null,
    });

    render(await SignInPage({ searchParams: Promise.resolve({}) }));

    const button = screen.getByRole('button', {
      name: /redirecting to github/i,
    });
    expect(button).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /^sign in with github$/i })
    ).not.toBeInTheDocument();
  });
});

describe('SignInPage — visual containers (Story 5.1, AC-1)', () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({
      pending: false,
      data: null,
      method: null,
      action: null,
    });
  });

  it('[P0] renders an auth card with bg-surface border border-border rounded-xl p-8 wrapping the OAuth button (AC-1, Task 1.4)', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    const authCard = document.querySelector('.bg-surface.border.border-border.rounded-xl.p-8');
    expect(authCard).toBeInTheDocument();
    expect(authCard).toContainElement(
      screen.getByRole('button', { name: /sign in with github/i }),
    );
  });

  it('[P0] renders a brand logo box (48x48, bg-accent, rounded-lg, text "be") above the heading (AC-1, Task 1.2)', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    const logoBox = document.querySelector('.bg-accent.rounded-lg');
    expect(logoBox).toBeInTheDocument();
    expect(logoBox).toHaveTextContent('be');
    expect(logoBox).toHaveClass('w-12', 'h-12');
  });

  it('[P0] renders a "Continue with GitHub" heading inside the auth card (AC-1, Task 1.3)', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    const heading = screen.getByRole('heading', { name: /continue with github/i });
    expect(heading).toBeInTheDocument();
    const authCard = document.querySelector('.bg-surface.border.border-border.rounded-xl.p-8');
    expect(authCard).toContainElement(heading);
  });

  it('[P0] renders a legal footer with Terms and Privacy links below the auth card (AC-1, Task 1.5)', async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    const termsLink = screen.getByRole('link', { name: /terms of service/i });
    const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
    expect(termsLink).toBeInTheDocument();
    expect(privacyLink).toBeInTheDocument();
  });

  it('[P1] preserves the error state alert inside the auth card (AC-1, Task 1.6)', async () => {
    render(
      await SignInPage({
        searchParams: Promise.resolve({ error: 'OAuthCallback' }),
      }),
    );
    const authCard = document.querySelector('.bg-surface.border.border-border.rounded-xl.p-8');
    expect(authCard).toContainElement(screen.getByRole('alert'));
  });
});

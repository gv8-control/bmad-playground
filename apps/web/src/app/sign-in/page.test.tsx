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

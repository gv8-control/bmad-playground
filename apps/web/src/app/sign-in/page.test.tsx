import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SignInPage from './page';

jest.mock('@/lib/auth', () => ({
  signIn: jest.fn(),
}));

describe('SignInPage', () => {
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

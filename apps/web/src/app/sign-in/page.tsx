import { signIn } from '@/lib/auth';
import { SubmitButton } from './submit-button';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const hasError = !!error;
  const raw = callbackUrl ?? '/';
  const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center text-accent-fg font-semibold text-xl tracking-tight">
            be
          </div>
          <h1 className="text-xl font-semibold text-text-1 tracking-tight">
            bmad-easy
          </h1>
          <p className="text-sm text-text-2 text-center">
            Sign in to access your BMAD platform
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-8 w-full flex flex-col gap-6">
          <h2 className="text-lg font-semibold text-text-1 text-center">
            Continue with GitHub
          </h2>
          <form
            action={async () => {
              'use server';
              await signIn('github', { redirectTo });
            }}
            className="w-full"
          >
            <SubmitButton />
            {hasError && (
              <p
                className="mt-3 text-negative text-sm text-center"
                role="alert"
                aria-live="polite"
              >
                Sign-in failed. Try again or contact support.
              </p>
            )}
          </form>
        </div>

        <div className="text-xs text-text-2 text-center">
          By signing in you agree to our{' '}
          <a href="#" className="underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="underline">
            Privacy Policy
          </a>
          .
        </div>
      </div>
    </main>
  );
}

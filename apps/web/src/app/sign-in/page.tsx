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
  const redirectTo = raw.startsWith('/') ? raw : '/';

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-text-1 text-2xl font-semibold tracking-tight">
            bmad-easy
          </h1>
          <p className="mt-2 text-text-2 text-sm">
            Sign in to access your BMAD platform
          </p>
        </div>

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
    </main>
  );
}

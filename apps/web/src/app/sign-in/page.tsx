import { signIn } from '@/lib/auth';
import { GitHubIcon } from '@/components/icons/github-icon';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const hasError = !!error;
  const redirectTo = callbackUrl ?? '/';

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
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg font-medium text-sm"
          >
            <GitHubIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            Sign in with GitHub
          </button>
        </form>

        {hasError && (
          <p
            className="text-negative text-sm text-center"
            role="alert"
            aria-live="polite"
          >
            Sign-in failed. Try again or contact support.
          </p>
        )}
      </div>
    </main>
  );
}

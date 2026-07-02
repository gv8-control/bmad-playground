'use client';

import { useFormStatus } from 'react-dom';
import { GitHubIcon } from '@/components/icons/github-icon';

export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <GitHubIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      {pending ? 'Redirecting to GitHub…' : 'Sign in with GitHub'}
    </button>
  );
}

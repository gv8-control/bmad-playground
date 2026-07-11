'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectRepository } from '@/actions/repo-connection.actions';

type ConnectResult = Awaited<ReturnType<typeof connectRepository>>;

export function RepositoryUrlForm() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [documentationLink, setDocumentationLink] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDocumentationLink(null);
    setIsPending(true);
    connectRepository(url)
      .then((result: ConnectResult) => {
        setIsPending(false);
        if ('success' in result) {
          router.push('/project-map');
        } else {
          setError(result.error);
          setDocumentationLink(result.documentationLink ?? null);
        }
      })
      .catch(() => {
        setIsPending(false);
        setError('An unexpected error occurred. Please try again.');
        setDocumentationLink(null);
      });
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="repo-url" className="text-text-2 text-sm font-medium">
          Repository URL
        </label>
        <input
          id="repo-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/your-org/your-repo"
          required
          disabled={isPending}
          aria-describedby={error ? 'repo-url-error' : undefined}
          className="px-3 py-3 bg-surface border border-border rounded-md text-text-1 text-sm placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {error && (
          <div id="repo-url-error" role="alert" className="text-negative text-sm flex flex-col gap-1">
            <span>{error}</span>
            {documentationLink && (
              <a
                href={documentationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-sm"
              >
                BMAD documentation
              </a>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !url.trim()}
        className="w-full px-4 py-3 bg-accent text-accent-fg rounded-md text-sm font-medium hover:bg-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Validating…' : 'Connect repository'}
      </button>
    </form>
  );
}

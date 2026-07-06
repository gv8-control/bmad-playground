'use client';

import { useEffect } from 'react';

export default function ProjectMapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Project Map error:', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6">
        <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Project Map</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-8">
        <p className="text-text-2 text-sm">
          Couldn&apos;t load the project map. Try refreshing the page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

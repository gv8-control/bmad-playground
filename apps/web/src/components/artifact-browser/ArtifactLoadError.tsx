'use client';

import { useRouter } from 'next/navigation';

export function ArtifactLoadError() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-text-2 text-sm">
        Couldn&apos;t load this artifact. Try refreshing the page.
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
      >
        Refresh
      </button>
    </div>
  );
}

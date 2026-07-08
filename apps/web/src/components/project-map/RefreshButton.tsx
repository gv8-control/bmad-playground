'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { syncArtifactsAction } from '@/actions/artifacts.actions';

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(async () => {
      try {
        await syncArtifactsAction();
      } finally {
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      aria-label="Refresh Project Map"
      onClick={handleRefresh}
      disabled={isPending}
      className="p-1 rounded-md text-text-2 hover:text-text-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:pointer-events-none"
    >
      <RefreshCw
        className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`}
      />
    </button>
  );
}

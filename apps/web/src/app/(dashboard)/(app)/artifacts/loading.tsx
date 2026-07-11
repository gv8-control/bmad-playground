import { Breadcrumb } from '@/components/shell/Breadcrumb';

export default function ArtifactsLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0">
        <Breadcrumb />
        <h1 tabIndex={-1} className="px-8 text-xl font-semibold text-text-1">Artifact Browser</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              data-testid="skeleton-entry"
              className="py-3 px-4 flex flex-col gap-1 h-16 animate-pulse"
            >
              <div className="h-3 w-20 bg-surface-raised rounded" />
              <div className="h-4 w-48 bg-surface-raised rounded" />
              <div className="flex justify-between mt-1">
                <div className="h-3 w-12 bg-surface-raised rounded" />
                <div className="h-5 w-20 bg-surface-raised rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

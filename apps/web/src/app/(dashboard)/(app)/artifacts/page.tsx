import { Breadcrumb } from '@/components/shell/Breadcrumb';

export default async function ArtifactsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0">
        <Breadcrumb />
        <h1 className="px-8 text-xl font-semibold text-text-1">Artifact Browser</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <p className="text-text-2 text-sm">
          Start a conversation to create your first artifact.
        </p>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { getCredentialHealthStatus } from '@/actions/credential-health.actions';
import { syncArtifactsAction } from '@/actions/artifacts.actions';
import { ArtifactListEntry } from '@/components/artifact-browser/ArtifactListEntry';
import { ArtifactViewer } from '@/components/artifact-browser/ArtifactViewer';
import { ArtifactLoadError } from '@/components/artifact-browser/ArtifactLoadError';
import { CredentialErrorBanner } from '@/components/project-map/CredentialErrorBanner';
import { Breadcrumb } from '@/components/shell/Breadcrumb';
import type { ArtifactType, ArtifactStatus } from '@bmad-easy/shared-types';

export default async function ArtifactsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await auth();
  if (!session?.userId) {
    redirect('/sign-in');
    return null as never;
  }

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId: session.userId },
    select: { id: true },
  });

  if (!repoConnection) {
    redirect('/onboarding');
    return null as never;
  }

  const { id: selectedArtifactIdParam } = await searchParams;
  const selectedArtifactId =
    typeof selectedArtifactIdParam === 'string' ? selectedArtifactIdParam : null;

  const artifactSelect = {
    id: true,
    type: true,
    title: true,
    status: true,
    lastModifiedAt: true,
    path: true,
  } as const;

  const [artifacts, credentialResult] = await Promise.all([
    getPrisma().artifact.findMany({
      where: { repoConnectionId: repoConnection.id },
      orderBy: { lastModifiedAt: 'desc' },
      take: 100,
      select: artifactSelect,
    }),
    getCredentialHealthStatus(),
  ]);

  let credentialFailed =
    credentialResult.success && credentialResult.status === 'failed';

  let renderArtifacts = artifacts;

  if (artifacts.length === 0 && !credentialFailed) {
    const syncResult = await syncArtifactsAction();
    if ('success' in syncResult) {
      renderArtifacts = await getPrisma().artifact.findMany({
        where: { repoConnectionId: repoConnection.id },
        orderBy: { lastModifiedAt: 'desc' },
        take: 100,
        select: artifactSelect,
      });
    } else if (syncResult.errorCode === 'NO_CREDENTIAL') {
      credentialFailed = true;
    }
  }

  const selectedArtifact = selectedArtifactId
    ? await getPrisma().artifact.findFirst({
        where: { id: selectedArtifactId, repoConnectionId: repoConnection.id },
        select: { content: true },
      })
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8">
        <div className="flex items-center gap-3">
          <Breadcrumb />
          <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">Artifact Browser</h1>
        </div>
      </header>
      {credentialFailed && <CredentialErrorBanner />}
      {selectedArtifactId ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[280px] flex-shrink-0 border-r border-surface-raised overflow-y-auto no-scrollbar">
            {renderArtifacts.length === 0 ? (
              <p className="text-text-2 text-sm">
                Start your first conversation to create an artifact.
              </p>
            ) : (
              <div className="flex flex-col" role="list" aria-label="Artifact list">
                {renderArtifacts.map((a) => (
                  <ArtifactListEntry
                    key={a.id}
                    type={a.type as ArtifactType}
                    title={a.title}
                    status={a.status as ArtifactStatus}
                    lastModifiedAt={a.lastModifiedAt}
                    href={`/artifacts?id=${a.id}`}
                    selected={a.id === selectedArtifactId}
                  />
                ))}
              </div>
            )}
          </div>
          {selectedArtifact ? (
            <ArtifactViewer content={selectedArtifact.content} />
          ) : (
            <div className="flex-1">
              <ArtifactLoadError />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {renderArtifacts.length === 0 ? (
            <p className="text-text-2 text-sm">
              Start your first conversation to create an artifact.
            </p>
          ) : (
            <div className="flex flex-col" role="list" aria-label="Artifact list">
              {renderArtifacts.map((a) => (
                <ArtifactListEntry
                  key={a.id}
                  type={a.type as ArtifactType}
                  title={a.title}
                  status={a.status as ArtifactStatus}
                  lastModifiedAt={a.lastModifiedAt}
                  href={`/artifacts?id=${a.id}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

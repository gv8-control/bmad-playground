import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { getCredentialHealthStatus } from '@/actions/credential-health.actions';
import { syncArtifactsAction } from '@/actions/artifacts.actions';
import { ProjectMapArtifacts } from '@/components/project-map/ProjectMapArtifacts';
import { CredentialErrorBanner } from '@/components/project-map/CredentialErrorBanner';
import { RefreshButton } from '@/components/project-map/RefreshButton';
import type { ArtifactType } from '@bmad-easy/shared-types';

export default async function ProjectMapPage() {
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-text-1">Project Map</h1>
        <RefreshButton />
      </header>
      {credentialFailed && <CredentialErrorBanner />}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {renderArtifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-text-2 text-sm">
              Start your first conversation to create an artifact.
            </p>
          </div>
        ) : (
          <ProjectMapArtifacts
            artifacts={renderArtifacts.map((a) => ({
              id: a.id,
              type: a.type as ArtifactType,
              title: a.title,
              status: a.status,
              href: `/artifacts?id=${a.id}`,
            }))}
          />
        )}
      </div>
    </div>
  );
}

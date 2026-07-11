'use client';

import type { ArtifactType, ArtifactStatus } from '@bmad-easy/shared-types';
import { ArtifactCard } from './ArtifactCard';
import { InProgressArtifactCard } from './InProgressArtifactCard';
import { useOpenConversations } from '@/hooks/use-conversation-presence';

export interface ProjectMapArtifactsProps {
  artifacts: {
    id: string;
    type: string;
    title: string;
    status: string;
    href: string;
  }[];
}

export function ProjectMapArtifacts({ artifacts }: ProjectMapArtifactsProps) {
  const openConversations = useOpenConversations();

  return (
    <div className="flex flex-col gap-3" role="list">
      {artifacts.map((a) => {
        const status = a.status as ArtifactStatus;
        if (status === 'in-progress') {
          return (
            <InProgressArtifactCard
              key={a.id}
              type={a.type as ArtifactType}
              title={a.title}
              href={a.href}
              openConversations={openConversations}
            />
          );
        }
        return (
          <ArtifactCard
            key={a.id}
            type={a.type as ArtifactType}
            title={a.title}
            status={status}
            href={a.href}
          />
        );
      })}
    </div>
  );
}

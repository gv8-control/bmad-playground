'use client';

import type { MouseEvent } from 'react';
import type { ArtifactType } from '@bmad-easy/shared-types';
import { ArtifactCard } from './ArtifactCard';
import { CONVERSATION_CHANNEL } from '@/hooks/use-conversation-presence';

export interface InProgressArtifactCardProps {
  type: ArtifactType;
  title: string;
  href: string;
  openConversations: string[];
}

export function InProgressArtifactCard({
  type,
  title,
  href,
  openConversations,
}: InProgressArtifactCardProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (openConversations.length > 0) {
      e.preventDefault();
      const channel = new BroadcastChannel(CONVERSATION_CHANNEL);
      channel.postMessage({
        type: 'focus-conversation',
        conversationId: openConversations[0],
      });
      channel.close();
    }
  }

  return (
    <ArtifactCard
      type={type}
      title={title}
      status="in-progress"
      href={href}
      onClick={handleClick}
    />
  );
}

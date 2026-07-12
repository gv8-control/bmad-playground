import { redirect } from 'next/navigation';
import { Breadcrumb } from '@/components/shell/Breadcrumb';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { mintBoundaryJwt } from '@/lib/boundary-jwt';
import { ConversationPane } from '@/components/conversation/ConversationPane';
import type { ChatMessage } from '@/components/conversation/types';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const session = await auth();
  const userId = session?.userId;

  if (!userId) {
    redirect('/sign-in');
    return null as never;
  }

  const conversation = await getPrisma().conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, title: true },
  });

  if (!conversation) {
    redirect('/conversations/new');
    return null as never;
  }

  const turns = await getPrisma().turn.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const initialMessages: ChatMessage[] = turns.map((turn) => ({
    id: turn.id,
    role: turn.role as 'user' | 'assistant',
    content: turn.content,
    createdAt: turn.createdAt,
  }));

  const boundaryJwt = await mintBoundaryJwt(userId);
  const apiUrl = process.env.API_URL!;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-surface-raised pt-6 pb-4 px-8">
        <div className="flex items-center gap-3">
          <Breadcrumb />
          <h1 tabIndex={-1} className="text-xl font-semibold text-text-1">
            {conversation.title ?? 'Conversation'}
          </h1>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <ConversationPane
          boundaryJwt={boundaryJwt}
          apiUrl={apiUrl}
          initialConversationId={conversationId}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  );
}

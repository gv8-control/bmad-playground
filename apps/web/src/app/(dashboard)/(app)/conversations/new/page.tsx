import { Breadcrumb } from '@/components/shell/Breadcrumb';
import { auth } from '@/lib/auth';
import { mintBoundaryJwt } from '@/lib/boundary-jwt';
import { ConversationPane } from '@/components/conversation/ConversationPane';

export default async function NewConversationPage() {
  const session = await auth();
  const userId = session?.userId;

  if (!userId) {
    return null;
  }

  const boundaryJwt = await mintBoundaryJwt(userId);
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0">
        <Breadcrumb />
        <h1 className="px-8 text-xl font-semibold text-text-1">New Conversation</h1>
      </header>
      <div className="flex-1 overflow-hidden">
        <ConversationPane boundaryJwt={boundaryJwt} apiUrl={apiUrl} initialMessages={[]} />
      </div>
    </div>
  );
}

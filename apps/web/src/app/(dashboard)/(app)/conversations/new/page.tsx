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
  const apiUrl = process.env.API_URL!;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h1 tabIndex={-1} className="sr-only">New Conversation</h1>
      <div className="flex-1 overflow-hidden">
        <ConversationPane boundaryJwt={boundaryJwt} apiUrl={apiUrl} initialMessages={[]} placeholder="Message bmad-easy…" />
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { AppShell } from '@/components/shell/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
    return null as never;
  }

  const userId = session.userId;
  if (!userId) {
    redirect('/sign-in');
    return null as never;
  }

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId },
  });

  if (!repoConnection) {
    redirect('/onboarding');
    return null as never;
  }

  const conversations = await getPrisma().conversation.findMany({
    where: { userId, title: { not: null } },
    orderBy: { lastActiveAt: 'desc' },
    take: 5,
    select: { id: true, title: true },
  });

  return (
    <AppShell user={session.user} conversations={conversations}>
      {children}
    </AppShell>
  );
}

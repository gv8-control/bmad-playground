import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { AppShell } from '@/components/shell/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const userId = session.userId;
  if (!userId) {
    redirect('/sign-in');
  }

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId },
  });

  if (!repoConnection) {
    return <>{children}</>;
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}

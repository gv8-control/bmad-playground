import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>;
}

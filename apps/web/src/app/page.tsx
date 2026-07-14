import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';

export default async function HomePage() {
  const session = await auth();
  const userId = session?.userId;
  if (!userId) {
    redirect('/sign-in');
    return null as never;
  }

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId },
    select: { id: true },
  });

  redirect(repoConnection ? '/project-map' : '/onboarding');
}

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';

export default async function HomePage() {
  const session = await auth();
  if (!session?.userId) redirect('/sign-in');

  const repoConnection = await getPrisma().repoConnection.findUnique({
    where: { userId: session.userId },
  });

  redirect(repoConnection ? '/project-map' : '/onboarding');
}

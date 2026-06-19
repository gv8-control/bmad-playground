import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import { RepositoryUrlForm } from '@/components/onboarding/RepositoryUrlForm';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.userId) redirect('/sign-in');

  const existing = await getPrisma().repoConnection.findUnique({
    where: { userId: session.userId },
  });
  if (existing) redirect('/project-map');

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        <div className="text-center">
          <h1 className="text-text-1 text-2xl font-semibold tracking-tight">
            Connect your repository
          </h1>
          <p className="mt-2 text-text-2 text-sm">
            Paste the URL of your BMAD-enabled GitHub repository to get started.
          </p>
        </div>
        <RepositoryUrlForm />
      </div>
    </main>
  );
}

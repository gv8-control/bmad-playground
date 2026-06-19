import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { userId, repoUrl } = (await request.json()) as {
    userId: string;
    repoUrl: string;
  };

  const conn = await getPrisma().repoConnection.upsert({
    where: { userId },
    update: { repoUrl, credentialHealth: 'healthy' },
    create: { userId, repoUrl, credentialHealth: 'healthy' },
  });

  return NextResponse.json({ id: conn.id });
}

import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { isTestEndpointEnabled } from '@/lib/test-endpoint-guard';

export async function POST(request: Request) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { githubId, githubLogin, name } = (await request.json()) as {
    githubId: string;
    githubLogin: string;
    name?: string;
  };

  const user = await getPrisma().user.upsert({
    where: { githubId },
    update: { githubLogin, name: name ?? null },
    create: { githubId, githubLogin, name: name ?? null, email: null },
  });

  return NextResponse.json({ userId: user.id });
}

export async function DELETE(request: Request) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { githubId } = (await request.json()) as { githubId: string };

  await getPrisma().user.deleteMany({ where: { githubId } });

  return NextResponse.json({ ok: true });
}

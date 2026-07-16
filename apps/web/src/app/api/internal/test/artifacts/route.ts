import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { isTestEndpointEnabled } from '@/lib/test-endpoint-guard';

type SeedArtifact = {
  path: string;
  type: string;
  title: string;
  status?: string;
  lastModifiedAt?: string;
  content?: string;
};

export async function POST(request: Request) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { repoConnectionId, artifacts } = (await request.json()) as {
    repoConnectionId: string;
    artifacts: SeedArtifact[];
  };

  const created = await getPrisma().$transaction(
    artifacts.map((a) =>
      getPrisma().artifact.create({
        data: {
          repoConnectionId,
          path: a.path,
          type: a.type,
          title: a.title,
          status: a.status ?? 'completed',
          lastModifiedAt: a.lastModifiedAt ? new Date(a.lastModifiedAt) : new Date(),
          content: a.content ?? '',
        },
      }),
    ),
  );

  return NextResponse.json({ ids: created.map((a) => a.id) });
}

export async function DELETE(request: Request) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json()) as { repoConnectionId?: string };
  if (!body.repoConnectionId) {
    return NextResponse.json(
      { error: 'repoConnectionId is required' },
      { status: 400 },
    );
  }

  await getPrisma().artifact.deleteMany({
    where: { repoConnectionId: body.repoConnectionId },
  });

  return NextResponse.json({ ok: true });
}

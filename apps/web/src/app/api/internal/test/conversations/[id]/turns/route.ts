import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { isTestEndpointEnabled } from '@/lib/test-endpoint-guard';
import type { Prisma } from '@bmad-easy/database-schemas';

type SeedTurn = {
  role: string;
  content: string;
  createdAt?: string;
  segments?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id: conversationId } = await params;
  const { turns } = (await request.json()) as { turns: SeedTurn[] };

  const created = await getPrisma().$transaction(
    turns.map((t) =>
      getPrisma().turn.create({
        data: {
          conversationId,
          role: t.role,
          content: t.content,
          createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
          ...(t.segments != null
            ? { segments: t.segments as Prisma.InputJsonValue }
            : {}),
        },
      }),
    ),
  );

  return NextResponse.json({ ids: created.map((t) => t.id) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id: conversationId } = await params;

  await getPrisma().turn.deleteMany({ where: { conversationId } });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { isTestEndpointEnabled } from '@/lib/test-endpoint-guard';

type SeedConversation = {
  id?: string;
  title: string;
  lastActiveAt?: string;
};

export async function POST(request: Request) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { userId, conversations } = (await request.json()) as {
    userId: string;
    conversations: SeedConversation[];
  };

  // Use upsert when a custom ID is provided (allows re-seeding without
  // unique-constraint errors when tests run sequentially with the same ID).
  // Use create when no custom ID is provided (auto-generated cuid).
  const created = await getPrisma().$transaction(
    conversations.map((c) =>
      c.id
        ? getPrisma().conversation.upsert({
            where: { id: c.id },
            update: {
              userId,
              title: c.title,
              lastActiveAt: c.lastActiveAt ? new Date(c.lastActiveAt) : new Date(),
            },
            create: {
              id: c.id,
              userId,
              title: c.title,
              lastActiveAt: c.lastActiveAt ? new Date(c.lastActiveAt) : new Date(),
            },
          })
        : getPrisma().conversation.create({
            data: {
              userId,
              title: c.title,
              lastActiveAt: c.lastActiveAt ? new Date(c.lastActiveAt) : new Date(),
            },
          }),
    ),
  );

  return NextResponse.json({ ids: created.map((c) => c.id) });
}

export async function DELETE(request: Request) {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json()) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json(
      { error: 'userId is required' },
      { status: 400 },
    );
  }

  await getPrisma().conversation.deleteMany({
    where: { userId: body.userId },
  });

  return NextResponse.json({ ok: true });
}

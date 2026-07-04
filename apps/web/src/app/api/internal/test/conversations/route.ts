import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

type SeedConversation = {
  title: string;
  lastActiveAt?: string;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || !process.env.TEST_ENV) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { userId, conversations } = (await request.json()) as {
    userId: string;
    conversations: SeedConversation[];
  };

  const created = await getPrisma().$transaction(
    conversations.map((c) =>
      getPrisma().conversation.create({
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
  if (process.env.NODE_ENV === 'production' || !process.env.TEST_ENV) {
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

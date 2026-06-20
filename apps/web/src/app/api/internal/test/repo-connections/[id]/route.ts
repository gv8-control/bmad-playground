import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.NODE_ENV === 'production' || !process.env.TEST_ENV) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { id } = await params;

  await getPrisma().repoConnection.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

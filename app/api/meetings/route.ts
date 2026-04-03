import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { Meeting } from '@/lib/entities/Meeting';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    const meetings = await repo.find({
      where: { userId },
      select: {
        meetingId: true,
        title: true,
        status: true,
        podcastStatus: true,
        participants: true,
        createdAt: true,
        keyTopics: true,
      },
      order: { createdAt: 'DESC' },
    });

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}

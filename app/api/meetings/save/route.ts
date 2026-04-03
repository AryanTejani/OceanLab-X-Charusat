import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { Meeting } from '@/lib/entities/Meeting';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { meetingId, title, transcriptText, participants } = body;

    if (!meetingId || !transcriptText) {
      return NextResponse.json(
        { error: 'meetingId and transcriptText are required' },
        { status: 400 }
      );
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    await repo.upsert(
      {
        meetingId,
        userId,
        title: title || 'Untitled Meeting',
        transcriptText,
        participants: participants || [],
        status: 'processing',
        endedAt: new Date(),
      },
      { conflictPaths: ['meetingId'] }
    );

    const meeting = await repo.findOneByOrFail({ meetingId, userId });

    return NextResponse.json({
      success: true,
      meetingId: meeting.meetingId,
      status: meeting.status,
    });
  } catch (error) {
    console.error('Error saving meeting:', error);
    return NextResponse.json(
      { error: 'Failed to save meeting' },
      { status: 500 }
    );
  }
}

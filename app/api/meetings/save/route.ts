import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import dbConnect from '@/lib/mongodb';
import Meeting from '@/lib/models/Meeting';

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

    await dbConnect();

    const meeting = await Meeting.findOneAndUpdate(
      { meetingId, userId },
      {
        meetingId,
        userId,
        title: title || 'Untitled Meeting',
        transcriptText,
        participants: participants || [],
        status: 'processing',
        endTime: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      meetingId: meeting.meetingId,
      _id: meeting._id,
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

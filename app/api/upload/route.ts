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

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const title = (formData.get('title') as string) || 'Uploaded Meeting';

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Convert file to buffer for Deepgram
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Transcribe via Deepgram pre-recorded API
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&diarize=true&smart_format=true&paragraphs=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': audioFile.type || 'audio/mpeg',
        },
        body: audioBuffer,
      }
    );

    if (!dgResponse.ok) {
      const errorText = await dgResponse.text();
      console.error('Deepgram error:', errorText);
      return NextResponse.json(
        { error: 'Transcription failed' },
        { status: 500 }
      );
    }

    const dgResult = await dgResponse.json();
    const transcript =
      dgResult.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
      dgResult.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      '';

    if (!transcript) {
      return NextResponse.json(
        { error: 'No speech detected in audio' },
        { status: 400 }
      );
    }

    // Create meeting record
    await dbConnect();
    const meetingId = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const meeting = await Meeting.create({
      meetingId,
      userId,
      title,
      transcriptText: transcript,
      status: 'processing',
      participants: [],
    });

    return NextResponse.json({
      success: true,
      meetingId: meeting.meetingId,
      status: 'processing',
    });
  } catch (error) {
    console.error('Error uploading audio:', error);
    return NextResponse.json(
      { error: 'Failed to process audio upload' },
      { status: 500 }
    );
  }
}

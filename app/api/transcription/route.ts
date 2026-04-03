import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Transcript } from '@/lib/entities/Transcript';
import AssemblyAIWebSocketService from '@/lib/assemblyai-ws';

interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { meetingId, userId, userName, audioData, isLive } = await request.json();

    if (!meetingId || !userId || !userName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const assemblyaiService = AssemblyAIWebSocketService.getInstance();

    if (isLive) {
      return NextResponse.json({ message: 'Live transcription initiated' });
    }

    if (!audioData) {
      return NextResponse.json(
        { error: 'Audio data is required for transcription' },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(audioData, 'base64');
    const transcriptionResults = await assemblyaiService.transcribeAudio(audioBuffer);

    const ds = await getDb();
    const repo = ds.getRepository(Transcript);

    const saved = await Promise.all(
      transcriptionResults.map(async (result: TranscriptionResult) => {
        const t = repo.create({
          meetingId,
          userId,
          userName,
          text: result.text,
          confidence: result.confidence,
          startMs: result.start,
          endMs: result.end,
          isFinal: result.isFinal,
        });
        return repo.save(t);
      })
    );

    return NextResponse.json({
      message: 'Transcription completed',
      transcripts: saved,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Failed to process transcription' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      );
    }

    const ds = await getDb();
    const repo = ds.getRepository(Transcript);

    const transcripts = await repo.find({
      where: { meetingId },
      order: { createdAt: 'ASC' },
    });

    return NextResponse.json({ transcripts });
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcripts' },
      { status: 500 }
    );
  }
}

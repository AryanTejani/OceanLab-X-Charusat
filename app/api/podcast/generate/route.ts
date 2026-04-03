import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { Meeting } from '@/lib/entities/Meeting';
import { getGroqClient } from '@/lib/groq';
import { getElevenLabsClient } from '@/lib/elevenlabs';

const PODCAST_SCRIPT_PROMPT = `Convert this meeting summary into a natural podcast script (60-90 seconds when read aloud, roughly 150-200 words).

Rules:
- Write as if a host is recapping the meeting for someone who missed it
- Start with a brief intro: "Here's your meeting recap for [topic]..."
- Cover: key discussion points, decisions made, and action items
- Keep the tone professional but conversational and engaging
- End with a brief wrap-up
- Do NOT use markdown formatting, bullet points, or special characters
- Write plain spoken text only — this will be converted to speech

Meeting Summary:
{summary}

Key Decisions:
{decisions}

Action Items:
{actionItems}

Respond with ONLY the podcast script text, nothing else.`;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { meetingId } = await request.json();
    if (!meetingId) {
      return NextResponse.json(
        { error: 'meetingId is required' },
        { status: 400 },
      );
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    const meeting = await repo.findOneBy({ meetingId, userId });
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    if (!meeting.summary) {
      return NextResponse.json(
        { error: 'Meeting insights must be generated first' },
        { status: 400 },
      );
    }

    // Mark as generating
    await repo.update({ meetingId }, { podcastStatus: 'generating' });

    // Step 1: Generate podcast script via Groq
    const groq = getGroqClient();
    const prompt = PODCAST_SCRIPT_PROMPT
      .replace('{summary}', meeting.summary)
      .replace(
        '{decisions}',
        meeting.decisions.map((d) => d.text).join('. ') ||
          'No major decisions recorded.',
      )
      .replace(
        '{actionItems}',
        meeting.actionItems
          .map((a) => `${a.text}${a.assignee ? ` (${a.assignee})` : ''}`)
          .join('. ') || 'No action items recorded.',
      );

    const scriptCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024,
    });

    const podcastScript = scriptCompletion.choices[0]?.message?.content;
    if (!podcastScript) {
      throw new Error('Failed to generate podcast script');
    }

    // Step 2: Convert script to audio via ElevenLabs
    const elevenlabs = getElevenLabsClient();
    const audioResponse = await elevenlabs.textToSpeech.convert(
      'JBFqnCBsd6RMkjVDRZzb',
      {
        text: podcastScript,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'mp3_44100_128',
      },
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of audioResponse) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    const podcastUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;

    await repo.update(
      { meetingId },
      { podcastScript, podcastUrl, podcastStatus: 'ready' }
    );

    return NextResponse.json({
      success: true,
      meetingId,
      podcastStatus: 'ready',
    });
  } catch (error) {
    console.error('Error generating podcast:', error);

    try {
      const { meetingId } = await request.clone().json();
      if (meetingId) {
        const ds = await getDb();
        await ds.getRepository(Meeting).update({ meetingId }, { podcastStatus: 'failed' });
      }
    } catch {}

    return NextResponse.json(
      { error: 'Failed to generate podcast' },
      { status: 500 },
    );
  }
}

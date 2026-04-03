import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb } from '@/lib/db';
import { Meeting } from '@/lib/entities/Meeting';
import { getGroqClient } from '@/lib/groq';

const INSIGHTS_PROMPT = `You are an AI meeting analyst. Analyze the following meeting transcript and produce a structured JSON response.

Your response MUST be valid JSON with exactly these fields:
{
  "summary": "A 2-3 paragraph executive summary of the meeting. Be concise but capture all key points.",
  "actionItems": [
    { "text": "Description of the action item", "assignee": "Person responsible (or null if not mentioned)" }
  ],
  "decisions": [
    { "text": "The decision that was made", "context": "Brief context about why this was decided" }
  ],
  "timeline": [
    { "time": "Approximate timestamp or sequence marker", "topic": "Topic discussed", "summary": "Brief summary of what was discussed" }
  ],
  "keyTopics": ["topic1", "topic2", "topic3"]
}

Rules:
- Extract ONLY information explicitly stated in the transcript
- Do NOT fabricate action items, decisions, or topics not discussed
- If no action items or decisions were made, return empty arrays
- Keep the summary professional and concise
- For timeline entries, use relative markers like "Opening", "Mid-meeting", "Closing" if no timestamps exist
- Identify 3-7 key topics discussed

Transcript:
`;

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
        { status: 400 }
      );
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    const meeting = await repo.findOneBy({ meetingId, userId });
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    if (!meeting.transcriptText || meeting.transcriptText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No transcript available for this meeting' },
        { status: 400 }
      );
    }

    const maxChars = 100000;
    const transcript =
      meeting.transcriptText.length > maxChars
        ? meeting.transcriptText.substring(0, maxChars) + '\n\n[Transcript truncated]'
        : meeting.transcriptText;

    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: INSIGHTS_PROMPT + transcript }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('Empty response from Groq');
    }

    const insights = JSON.parse(responseText);

    await repo.update(
      { meetingId },
      {
        summary: insights.summary || '',
        actionItems: (insights.actionItems || []).map(
          (item: { text: string; assignee?: string }) => ({
            text: item.text,
            assignee: item.assignee || undefined,
            done: false,
          })
        ),
        decisions: (insights.decisions || []).map(
          (d: { text: string; context?: string }) => ({
            text: d.text,
            context: d.context || '',
          })
        ),
        timeline: (insights.timeline || []).map(
          (t: { time: string; topic: string; summary?: string }) => ({
            time: t.time,
            topic: t.topic,
            summary: t.summary || '',
          })
        ),
        keyTopics: insights.keyTopics || [],
        status: 'completed',
      }
    );

    return NextResponse.json({
      success: true,
      meetingId,
      status: 'completed',
    });
  } catch (error) {
    console.error('Error generating insights:', error);

    try {
      const { meetingId } = await request.clone().json();
      if (meetingId) {
        const ds = await getDb();
        await ds.getRepository(Meeting).update({ meetingId }, { status: 'failed' });
      }
    } catch {}

    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    );
  }
}

import { getDb } from './db';
import { Meeting } from '../entities/Meeting';
import { Transcript } from '../entities/Transcript';
import { getGroqClient } from './groq';

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
- Where a speaker name is available (e.g. "Nishant: ..."), use it when referencing who said what

Transcript:
`;

/**
 * Generate AI insights for a meeting from its transcript.
 * Called by both the /api/insights/generate route and the webhook handler.
 * Does NOT require userId — internal use only.
 */
export async function generateMeetingInsights(meetingId: string): Promise<void> {
  const ds = await getDb();
  const meetingRepo = ds.getRepository(Meeting);
  const transcriptRepo = ds.getRepository(Transcript);

  const meeting = await meetingRepo.findOneBy({ meetingId });
  if (!meeting) throw new Error(`Meeting not found: ${meetingId}`);

  // Read transcript from DB utterances first, fall back to stored transcriptText
  const utterances = await transcriptRepo.find({
    where: { meetingId },
    order: { start: 'ASC' },
  });

  let transcriptText = '';
  if (utterances.length > 0) {
    transcriptText = utterances
      .map((u) => {
        const name =
          u.speakerName ||
          (u.speakerLabel ? `Speaker ${u.speakerLabel}` : 'Speaker');
        return `${name}: ${u.text}`;
      })
      .join('\n');
  } else if (meeting.transcriptText && meeting.transcriptText.trim().length > 0) {
    transcriptText = meeting.transcriptText;
  }

  if (!transcriptText.trim()) {
    throw new Error(`No transcript available for meeting: ${meetingId}`);
  }

  const maxChars = 100000;
  const transcript =
    transcriptText.length > maxChars
      ? transcriptText.substring(0, maxChars) + '\n\n[Transcript truncated]'
      : transcriptText;

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: INSIGHTS_PROMPT + transcript }],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) throw new Error('Empty response from Groq');

    const insights = JSON.parse(responseText);

    await meetingRepo.update(
      { meetingId },
      {
        transcriptText: transcript,
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

    console.log(`✅ Insights generated for meeting ${meetingId}`);
  } catch (err) {
    console.error(`❌ Failed to generate insights for ${meetingId}:`, err);
    await meetingRepo.update({ meetingId }, { status: 'failed' });
    throw err;
  }
}

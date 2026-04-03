import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';
import { Transcript } from '../entities/Transcript';
import { getGroqClient } from '../lib/groq';

const router = Router();

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

// POST /api/insights/generate
router.post('/generate', requireAuth(), async (req: Request, res: Response) => {
  let meetingId: string | undefined;
  let userId: string | undefined;

  try {
    const auth = getAuth(req);
    userId = auth.userId || undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    meetingId = req.body.meetingId;
    if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

    const ds = await getDb();
    const meetingRepo = ds.getRepository(Meeting);
    const transcriptRepo = ds.getRepository(Transcript);

    const meeting = await meetingRepo.findOneBy({ meetingId, userId });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    // ── Read transcript from DB (individual utterances, ordered by start time) ──
    const utterances = await transcriptRepo.find({
      where: { meetingId },
      order: { start: 'ASC' },
    });

    // Build formatted transcript string from individual utterances
    // Prefer speakerName; fall back to speakerLabel; then 'Speaker'
    let transcriptText = '';
    if (utterances.length > 0) {
      transcriptText = utterances
        .map((u) => {
          const name = u.speakerName || (u.speakerLabel ? `Speaker ${u.speakerLabel}` : 'Speaker');
          return `${name}: ${u.text}`;
        })
        .join('\n');
    } else if (meeting.transcriptText && meeting.transcriptText.trim().length > 0) {
      // Fallback: use stored transcriptText if no utterances in DB yet
      transcriptText = meeting.transcriptText;
    }

    if (!transcriptText.trim()) {
      return res.status(400).json({ error: 'No transcript available for this meeting' });
    }

    const maxChars = 100000;
    const transcript =
      transcriptText.length > maxChars
        ? transcriptText.substring(0, maxChars) + '\n\n[Transcript truncated]'
        : transcriptText;

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

    let insights;
    try {
      insights = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Groq response:', parseError);
      if (meetingId && userId) {
        await meetingRepo.update({ meetingId, userId }, { status: 'failed' });
      }
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Store the denormalised transcript text on Meeting for display in UI
    await meetingRepo.update(
      { meetingId, userId },
      {
        transcriptText: transcript,
        summary: insights.summary || '',
        actionItems: (insights.actionItems || []).map((item: { text: string; assignee?: string }) => ({
          text: item.text,
          assignee: item.assignee || undefined,
          done: false,
        })),
        decisions: (insights.decisions || []).map((d: { text: string; context?: string }) => ({
          text: d.text,
          context: d.context || '',
        })),
        timeline: (insights.timeline || []).map((t: { time: string; topic: string; summary?: string }) => ({
          time: t.time,
          topic: t.topic,
          summary: t.summary || '',
        })),
        keyTopics: insights.keyTopics || [],
        status: 'completed',
      }
    );

    res.json({ success: true, meetingId, status: 'completed' });
  } catch (error) {
    console.error('Error generating insights:', error);
    if (meetingId && userId) {
      try {
        const ds = await getDb();
        await ds.getRepository(Meeting).update({ meetingId, userId }, { status: 'failed' });
      } catch {}
    }
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;

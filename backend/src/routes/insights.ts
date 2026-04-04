import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';
import { Transcript } from '../entities/Transcript';
import { getGroqClient } from '../lib/groq';
import { clerkClient } from '@clerk/express';
import { sendParticipantInsightsEmail } from '../lib/mailer';
import { IParticipantInsight } from '../entities/Meeting';
import { generateMeetingInsights } from '../lib/insightsHelper';

const router = Router();

const PARTICIPANT_INSIGHTS_PROMPT = `You are an AI meeting analyst. For each speaker listed below, analyze ONLY their utterances and produce a JSON object.

Your response MUST be valid JSON with exactly this structure:
{
  "participantInsights": [
    {
      "speakerId": "<the_clerk_user_id_shown_in_parentheses>",
      "speakerName": "<speaker name>",
      "summary": "2-3 sentences describing this person's role, contributions, and key responsibilities from this meeting",
      "actionItems": ["action item they are responsible for", "..."],
      "keyNotes": ["important point they raised or must know about", "..."]
    }
  ]
}

Rules:
- Include ONLY speakers that have a speakerId in parentheses after their name
- Extract ONLY information explicitly stated in their utterances
- If no action items can be attributed, return an empty array
- Keep summaries professional and concise

Speakers and their utterances:
`;

interface SpeakerGroup {
  speakerId: string;
  speakerName: string;
  lines: string[];
}

function buildParticipantSections(utterances: { speakerId: string | null; speakerName: string | null; speakerLabel: string | null; text: string }[]): SpeakerGroup[] {
  const map = new Map<string, SpeakerGroup>();
  for (const u of utterances) {
    if (!u.speakerId) continue;
    const name = u.speakerName || (u.speakerLabel ? `Speaker ${u.speakerLabel}` : 'Unknown');
    if (!map.has(u.speakerId)) {
      map.set(u.speakerId, { speakerId: u.speakerId, speakerName: name, lines: [] });
    }
    map.get(u.speakerId)!.lines.push(`${name}: ${u.text}`);
  }
  return Array.from(map.values());
}

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

    const meeting = await ds
      .getRepository(Meeting)
      .createQueryBuilder('meeting')
      .where('meeting.meetingId = :meetingId', { meetingId })
      .andWhere(
        '(meeting.userId = :userId OR meeting."participantUserIds" @> :userIdJson::jsonb)',
        { userId, userIdJson: JSON.stringify([userId]) }
      )
      .getOne();
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    // ── Call 1: General insights (delegated to shared helper) ────────────────
    await generateMeetingInsights(meetingId);

    // ── Call 2: Per-participant insights ──────────────────────────────────────
    const utterances = await transcriptRepo.find({
      where: { meetingId },
      order: { start: 'ASC' },
    });
    const speakerGroups = buildParticipantSections(utterances);

    const groq = getGroqClient();

    // Save all resolved speakerIds so invited members can find this meeting in their list
    if (speakerGroups.length > 0) {
      const participantUserIds = speakerGroups.map((g) => g.speakerId);
      await meetingRepo.update({ meetingId }, { participantUserIds });
    }

    let participantInsights: IParticipantInsight[] = [];

    if (speakerGroups.length > 0) {
      const participantSections = speakerGroups
        .map((g) => `--- ${g.speakerName} (${g.speakerId}) ---\n${g.lines.join('\n')}`)
        .join('\n\n');

      try {
        const participantCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: PARTICIPANT_INSIGHTS_PROMPT + participantSections }],
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 4096,
        });

        const participantText = participantCompletion.choices[0]?.message?.content;
        if (participantText) {
          const parsed = JSON.parse(participantText);
          const rawInsights: Array<{ speakerId: string; speakerName: string; summary: string; actionItems: string[]; keyNotes: string[] }> = parsed.participantInsights || [];

          participantInsights = await Promise.all(
            rawInsights.map(async (p) => {
              let email: string | undefined;
              let emailSent = false;

              try {
                const clerkUser = await clerkClient.users.getUser(p.speakerId);
                email = clerkUser.emailAddresses?.[0]?.emailAddress;
              } catch (err) {
                console.error(`❌ Could not fetch Clerk user ${p.speakerId}:`, err);
              }

              if (email) {
                emailSent = await sendParticipantInsightsEmail({
                  to: email,
                  participantName: p.speakerName,
                  meetingTitle: meeting.title,
                  summary: p.summary,
                  actionItems: p.actionItems,
                  keyNotes: p.keyNotes,
                });
              }

              return {
                speakerId: p.speakerId,
                speakerName: p.speakerName,
                email,
                summary: p.summary,
                actionItems: p.actionItems,
                keyNotes: p.keyNotes,
                emailSent,
              };
            })
          );

          await meetingRepo.update({ meetingId }, { participantInsights });
        }
      } catch (participantErr) {
        console.error('❌ Failed to generate participant insights:', participantErr);
      }
    }

    res.json({ success: true, meetingId, status: 'completed' });
  } catch (error) {
    console.error('Error generating insights:', error);
    if (meetingId) {
      try {
        const ds = await getDb();
        await ds.getRepository(Meeting).update({ meetingId }, { status: 'failed' });
      } catch {}
    }
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

export default router;

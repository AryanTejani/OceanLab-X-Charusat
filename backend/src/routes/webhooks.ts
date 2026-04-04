import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';
import { verifyWebhookSignature, getBotTranscript } from '../lib/attendee';
import { generateMeetingInsights } from '../lib/insightsHelper';

const router = Router();

// POST /api/webhooks/attendee — receives bot state changes from Attendee.dev
// NO auth middleware — Attendee.dev calls this directly
router.post('/attendee', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-attendee-signature'] as string;
    if (signature) {
      const rawBody = JSON.stringify(req.body);
      if (!verifyWebhookSignature(rawBody, signature)) {
        console.error('Webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { bot_id, trigger, data, idempotency_key } = req.body;

    if (!bot_id || !trigger) {
      return res.status(400).json({ error: 'Missing bot_id or trigger' });
    }

    console.log(`📨 Webhook received: ${trigger} for bot ${bot_id} (key: ${idempotency_key})`);

    const ds = await getDb();
    const meetingRepo = ds.getRepository(Meeting);

    // Find meeting by botId (no userId scope — webhook has no user context)
    const meeting = await meetingRepo.findOneBy({ botId: bot_id });
    if (!meeting) {
      console.error(`No meeting found for bot ${bot_id}`);
      return res.status(200).json({ ok: true }); // Ack anyway to stop retries
    }

    // Idempotency: if already processed, skip
    if (meeting.status === 'completed' || meeting.status === 'processing') {
      console.log(`Meeting ${meeting.meetingId} already ${meeting.status} — skipping`);
      return res.status(200).json({ ok: true });
    }

    if (trigger === 'bot.state_change') {
      const eventType = data?.event_type || data?.new_state;
      const newState = data?.new_state;

      console.log(`Bot ${bot_id} state: ${newState} (event: ${eventType})`);

      if (eventType === 'post_processing_completed' || newState === 'ended') {
        // Fetch transcript from Attendee.dev
        try {
          const segments = await getBotTranscript(bot_id);

          // Log first segment to see actual shape from Attendee.dev
          if (segments.length > 0) {
            console.log('Attendee transcript segment sample:', JSON.stringify(segments[0], null, 2));
          }

          // Assemble transcript text — handle transcription as string or object
          const transcriptText = segments
            .map((s) => {
              let text: string;
              if (typeof s.transcription === 'string') {
                text = s.transcription;
              } else if (s.transcription && typeof s.transcription === 'object') {
                const obj = s.transcription as Record<string, unknown>;
                text = String(obj.transcript || obj.text || JSON.stringify(obj));
              } else {
                text = String(s.transcription);
              }
              return `${s.speaker_name}: ${text}`;
            })
            .join('\n');

          // Extract unique participant names
          const participants = [
            ...new Set(segments.map((s) => s.speaker_name).filter(Boolean)),
          ];

          // Update meeting with transcript
          await meetingRepo.update(
            { meetingId: meeting.meetingId },
            {
              transcriptText,
              participants,
              status: 'processing',
              endedAt: new Date(),
            }
          );

          console.log(
            `📝 Transcript saved for meeting ${meeting.meetingId} (${segments.length} segments)`
          );

          // Auto-trigger insights generation (fire-and-forget)
          generateMeetingInsights(meeting.meetingId).catch((err) => {
            console.error(
              `❌ Auto-insights failed for ${meeting.meetingId}:`,
              err
            );
          });
        } catch (transcriptErr) {
          console.error(`Failed to fetch transcript for bot ${bot_id}:`, transcriptErr);
          await meetingRepo.update(
            { meetingId: meeting.meetingId },
            { status: 'failed' }
          );
        }
      } else if (newState === 'fatal_error' || eventType === 'fatal_error') {
        await meetingRepo.update(
          { meetingId: meeting.meetingId },
          { status: 'failed' }
        );
        console.error(`Bot ${bot_id} hit fatal error for meeting ${meeting.meetingId}`);
      } else if (newState === 'joined_recording') {
        // Bot successfully joined — update status for frontend polling
        await meetingRepo.update(
          { meetingId: meeting.meetingId },
          { status: 'bot_joining', startedAt: new Date() }
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Always return 200 to prevent Attendee.dev from retrying on our errors
    res.status(200).json({ ok: true });
  }
});

export default router;

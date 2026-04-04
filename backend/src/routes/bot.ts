import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import crypto from 'crypto';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';
import { createBot, getBotStatus } from '../lib/attendee';

const router = Router();

const MEETING_URL_PATTERNS = [
  /zoom\.us\/j\//i,
  /meet\.google\.com\//i,
  /teams\.microsoft\.com\/l\//i,
  /teams\.live\.com\//i,
];

function isValidMeetingUrl(url: string): boolean {
  return MEETING_URL_PATTERNS.some((pattern) => pattern.test(url));
}

// POST /api/bot/join — dispatch Attendee.dev bot to a meeting
router.post('/join', requireAuth(), async (req: Request, res: Response) => {
  const meetingId = `bot-${crypto.randomUUID()}`;
  let userId: string | undefined;

  try {
    const auth = getAuth(req);
    userId = auth.userId || undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { meetingUrl, title } = req.body;

    if (!meetingUrl || typeof meetingUrl !== 'string') {
      return res.status(400).json({ error: 'meetingUrl is required' });
    }

    if (!isValidMeetingUrl(meetingUrl)) {
      return res.status(400).json({
        error: 'Invalid meeting URL. Supported: Zoom, Google Meet, Microsoft Teams',
      });
    }

    // Dispatch bot via Attendee.dev
    const bot = await createBot(meetingUrl);

    // Create meeting record
    const ds = await getDb();
    const repo = ds.getRepository(Meeting);
    await repo.insert({
      meetingId,
      userId,
      title: title || 'Bot Meeting',
      status: 'bot_joining',
      botId: bot.id,
      meetingUrl,
      source: 'bot',
    });

    res.json({
      success: true,
      meetingId,
      botId: bot.id,
      status: 'bot_joining',
    });
  } catch (error) {
    console.error('Error dispatching bot:', error);
    // If we already created a meeting record, mark it as failed
    if (userId) {
      try {
        const ds = await getDb();
        await ds.getRepository(Meeting).update({ meetingId }, { status: 'failed' });
      } catch {}
    }
    const message = error instanceof Error ? error.message : 'Failed to dispatch bot';
    res.status(502).json({ error: message });
  }
});

// GET /api/bot/status/:meetingId — poll bot state
router.get('/status/:meetingId', requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { meetingId } = req.params;

    const ds = await getDb();
    const meeting = await ds.getRepository(Meeting).findOneBy({ meetingId, userId });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!meeting.botId) {
      return res.status(400).json({ error: 'This meeting has no bot' });
    }

    const bot = await getBotStatus(meeting.botId);

    res.json({
      success: true,
      meetingId,
      botState: bot.state,
      meetingStatus: meeting.status,
    });
  } catch (error) {
    console.error('Error fetching bot status:', error);
    const message = error instanceof Error ? error.message : 'Failed to get bot status';
    res.status(500).json({ error: message });
  }
});

export default router;

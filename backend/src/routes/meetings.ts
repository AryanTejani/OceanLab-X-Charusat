import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';
import { Transcript } from '../entities/Transcript';

const router = Router();

// GET /api/meetings — list all meetings for the current user
router.get('/', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    const meetings = await repo.find({
      where: { userId },
      select: {
        meetingId: true,
        title: true,
        status: true,
        podcastStatus: true,
        participants: true,
        createdAt: true,
        keyTopics: true,
      },
      order: { createdAt: 'DESC' },
    });

    res.json({ meetings });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// POST /api/meetings/save — upsert meeting at end of call
router.post('/save', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { meetingId, title, transcriptText, participants } = req.body;

    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    // If no transcript provided, try to assemble from real-time saves
    let finalTranscript = transcriptText || '';
    if (!finalTranscript) {
      const txRepo = ds.getRepository(Transcript);
      const lines = await txRepo.find({
        where: { meetingId, isFinal: true },
        order: { createdAt: 'ASC' },
      });
      finalTranscript = lines
        .map((l) => l.text)
        .filter(Boolean)
        .join(' ');
    }

    await repo.upsert(
      {
        meetingId,
        userId,
        title: title || 'Untitled Meeting',
        transcriptText: finalTranscript || null,
        participants: participants || [],
        status: 'processing',
        endedAt: new Date(),
      },
      { conflictPaths: ['meetingId'] }
    );

    const meeting = await repo.findOneByOrFail({ meetingId, userId });

    res.json({ success: true, meetingId: meeting.meetingId, status: meeting.status });
  } catch (error) {
    console.error('Error saving meeting:', error);
    res.status(500).json({ error: 'Failed to save meeting' });
  }
});

// GET /api/meetings/:id — fetch single meeting
router.get('/:id', requireAuth(), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    const meeting = await repo.findOneBy({ meetingId: id, userId });

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ meeting });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

export default router;

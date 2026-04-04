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
    const meetings = await ds
      .getRepository(Meeting)
      .createQueryBuilder('meeting')
      .select([
        'meeting.meetingId',
        'meeting.title',
        'meeting.status',
        'meeting.podcastStatus',
        'meeting.participants',
        'meeting.createdAt',
        'meeting.keyTopics',
        'meeting.source',
        'meeting.botId',
      ])
      .where('meeting.userId = :userId', { userId })
      .orWhere('meeting."participantUserIds" @> :userIdJson::jsonb', { userIdJson: JSON.stringify([userId]) })
      .orderBy('meeting.createdAt', 'DESC')
      .getMany();

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

    const { meetingId, title, participants } = req.body;

    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    // transcriptText is no longer sent from frontend — it lives in the transcripts table
    // and is assembled by the insights route from individual utterance rows
    //
    // Use find-then-insert-or-update to protect the original owner's userId.
    // TypeORM upsert with conflictPaths generates ON CONFLICT DO UPDATE SET userId = EXCLUDED.userId,
    // which overwrites the owner if a participant saves after the host. By splitting into
    // insert (sets userId) vs update (skips userId), the original owner is preserved.
    const existing = await repo.findOneBy({ meetingId });
    if (existing) {
      await repo.update({ meetingId }, {
        title: title || existing.title || 'Untitled Meeting',
        participants: participants || existing.participants || [],
        status: 'processing',
        endedAt: new Date(),
      });
    } else {
      await repo.insert({
        meetingId,
        userId,
        title: title || 'Untitled Meeting',
        participants: participants || [],
        status: 'processing',
        endedAt: new Date(),
      });
    }

    // Populate participantUserIds from transcripts immediately so participants
    // can see the meeting in their list while it is still processing
    try {
      const transcriptRepo = ds.getRepository(Transcript);
      const rows = await transcriptRepo
        .createQueryBuilder('t')
        .select('DISTINCT t."speakerId"', 'speakerId')
        .where('t."meetingId" = :meetingId', { meetingId })
        .andWhere('t."speakerId" IS NOT NULL')
        .getRawMany<{ speakerId: string }>();

      const participantUserIds = rows.map((r) => r.speakerId);
      if (participantUserIds.length > 0) {
        await repo.update({ meetingId, userId }, { participantUserIds });
      }
    } catch (err) {
      console.error('Failed to populate participantUserIds on save:', err);
    }

    const meeting = await repo.findOneByOrFail({ meetingId });

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

    const meeting = await ds
      .getRepository(Meeting)
      .createQueryBuilder('meeting')
      .where('meeting.meetingId = :id', { id })
      .andWhere(
        '(meeting.userId = :userId OR meeting."participantUserIds" @> :userIdJson::jsonb)',
        { userId, userIdJson: JSON.stringify([userId]) }
      )
      .getOne();

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

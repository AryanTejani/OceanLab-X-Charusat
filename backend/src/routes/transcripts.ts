import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';
import { Transcript } from '../entities/Transcript';

const router = Router();

// POST /api/transcripts/save — real-time save of individual transcript lines
// No auth — fire-and-forget from client during meeting
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { meetingId, userId, userName, text, confidence, start, end, isFinal } = req.body;

    if (!meetingId || !text?.trim()) {
      return res.status(400).json({ error: 'meetingId and text are required' });
    }

    const ds = await getDb();
    const repo = ds.getRepository(Transcript);

    const transcript = repo.create({
      meetingId,
      userId: userId || 'anonymous',
      userName: userName || 'Speaker',
      text: text.trim(),
      confidence: confidence ?? null,
      startMs: start ?? null,
      endMs: end ?? null,
      isFinal: isFinal ?? true,
    });

    await repo.save(transcript);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving transcript:', error);
    res.status(500).json({ error: 'Failed to save transcript' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import multer from 'multer';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// POST /api/upload — upload audio file for transcription
router.post('/', requireAuth(), upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const file = req.file;
    const title = (req.body.title as string) || 'Uploaded Meeting';

    if (!file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      return res.status(500).json({ error: 'Deepgram API key not configured' });
    }

    const dgResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&diarize=true&smart_format=true&paragraphs=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': file.mimetype || 'audio/mpeg',
        },
        body: file.buffer as unknown as BodyInit,
      }
    );

    if (!dgResponse.ok) {
      const errorText = await dgResponse.text();
      console.error('Deepgram error:', errorText);
      return res.status(500).json({ error: 'Transcription failed' });
    }

    const dgResult = await dgResponse.json();
    const transcript =
      dgResult.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
      dgResult.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      '';

    if (!transcript) {
      return res.status(400).json({ error: 'No speech detected in audio' });
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);
    const meetingId = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const meeting = repo.create({
      meetingId,
      userId,
      title,
      transcriptText: transcript,
      status: 'processing',
      participants: [],
    });
    await repo.save(meeting);

    res.json({ success: true, meetingId: meeting.meetingId, status: 'processing' });
  } catch (error) {
    console.error('Error uploading audio:', error);
    res.status(500).json({ error: 'Failed to process audio upload' });
  }
});

export default router;

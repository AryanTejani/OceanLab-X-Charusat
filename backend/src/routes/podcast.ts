import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { v2 as cloudinary } from 'cloudinary';
import { getDb } from '../lib/db';
import { Meeting } from '../entities/Meeting';
import { getGroqClient } from '../lib/groq';
import { getElevenLabsClient } from '../lib/elevenlabs';

const router = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PODCAST_SCRIPT_PROMPT = `Convert this meeting summary into a natural podcast script (60-90 seconds when read aloud, roughly 150-200 words).

Rules:
- Write as if a host is recapping the meeting for someone who missed it
- Start with a brief intro: "Here's your meeting recap for [topic]..."
- Cover: key discussion points, decisions made, and action items
- Keep the tone professional but conversational and engaging
- End with a brief wrap-up
- Do NOT use markdown formatting, bullet points, or special characters
- Write plain spoken text only — this will be converted to speech

Meeting Summary:
{summary}

Key Decisions:
{decisions}

Action Items:
{actionItems}

Respond with ONLY the podcast script text, nothing else.`;

// POST /api/podcast/generate
router.post('/generate', requireAuth(), async (req: Request, res: Response) => {
  let meetingId: string | undefined;
  let userId: string | undefined;

  try {
    const auth = getAuth(req);
    userId = auth.userId || undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    meetingId = req.body.meetingId;
    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const ds = await getDb();
    const repo = ds.getRepository(Meeting);

    const meeting = await repo.findOneBy({ meetingId, userId });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!meeting.summary) {
      return res.status(400).json({ error: 'Meeting insights must be generated first' });
    }

    // Mark as generating
    await repo.update({ meetingId, userId }, { podcastStatus: 'generating' });

    // Step 1: Generate podcast script via Groq
    const groq = getGroqClient();
    const prompt = PODCAST_SCRIPT_PROMPT
      .replace('{summary}', meeting.summary)
      .replace('{decisions}', meeting.decisions.map((d: { text: string; context?: string }) => d.text).join('. ') || 'No major decisions recorded.')
      .replace(
        '{actionItems}',
        meeting.actionItems
          .map((a: { text: string; assignee?: string }) => `${a.text}${a.assignee ? ` (${a.assignee})` : ''}`)
          .join('. ') || 'No action items recorded.'
      );

    const scriptCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 1024,
    });

    const podcastScript = scriptCompletion.choices[0]?.message?.content;
    if (!podcastScript) throw new Error('Failed to generate podcast script');

    // Step 2: Convert script to audio via ElevenLabs
    const elevenlabs = getElevenLabsClient();
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
    const audioResponse = await elevenlabs.textToSpeech.convert(voiceId, {
      text: podcastScript,
      model_id: 'eleven_turbo_v2_5',
      output_format: 'mp3_44100_128',
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of audioResponse) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    // Step 3: Upload to Cloudinary
    const cloudinaryResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'video',
            folder: 'meetmind/podcasts',
            public_id: `podcast-${meetingId}`,
            format: 'mp3',
            overwrite: true,
          },
          (err, result) => (err ? reject(err) : resolve(result))
        )
        .end(audioBuffer);
    });

    const podcastUrl = cloudinaryResult.secure_url;

    // Step 4: Save to DB
    await repo.update({ meetingId, userId }, { podcastScript, podcastUrl, podcastStatus: 'ready' });

    res.json({ success: true, meetingId, podcastStatus: 'ready', podcastUrl });
  } catch (error) {
    console.error('Error generating podcast:', error);
    if (meetingId && userId) {
      try {
        const ds = await getDb();
        await ds.getRepository(Meeting).update({ meetingId, userId }, { podcastStatus: 'failed' });
      } catch {}
    }
    res.status(500).json({ error: 'Failed to generate podcast' });
  }
});

export default router;

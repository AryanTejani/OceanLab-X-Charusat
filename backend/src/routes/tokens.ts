import { Router, Request, Response } from 'express';

const router = Router();

const noCache = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

// GET /api/deepgram-token
router.get('/deepgram-token', (_req: Request, res: Response) => {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Deepgram API key not configured' });
  }
  res.set(noCache).json({ apiKey });
});

// GET /api/assemblyai-token
router.get('/assemblyai-token', async (_req: Request, res: Response) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AssemblyAI API key not configured' });
  }
  try {
    const expiresInSeconds = 600;
    const response = await fetch(
      `https://streaming.assemblyai.com/v3/token?expires_in_seconds=${expiresInSeconds}`,
      { method: 'GET', headers: { Authorization: apiKey } }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error('AssemblyAI token request failed:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to get AssemblyAI token' });
    }
    const data = await response.json();
    res.set(noCache).json({ token: data.token });
  } catch (error) {
    console.error('Error getting AssemblyAI token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/captions/token
router.get('/captions/token', async (_req: Request, res: Response) => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing ASSEMBLYAI_API_KEY' });
  }
  try {
    const model = process.env.ASSEMBLYAI_REALTIME_MODEL || 'universal-2';
    const response = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_in: 3600, model }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error('AssemblyAI captions token request failed:', text);
      return res.status(500).json({ error: 'Failed to create AssemblyAI token' });
    }
    const data = await response.json();
    res.json({ token: data.token });
  } catch (error) {
    res.status(500).json({ error: 'Unexpected error creating token' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';

const router = Router();

// POST /api/meeting-qa — SSE streaming Q&A over meeting transcript via LangGraph RAG
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { question, meetingId } = req.body;

    if (!question || !meetingId) {
      return res.status(400).json({ error: 'question and meetingId are required' });
    }

    if (typeof question !== 'string' || question.length < 3 || question.length > 500) {
      return res.status(400).json({ error: 'question must be 3-500 characters' });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    req.on('close', () => { closed = true; });

    // Dynamic import — streamAnswer is from the ESM-loaded qaGraph
    const { streamAnswer } = await import('../lib/qaGraph');

    for await (const token of streamAnswer(meetingId, question)) {
      if (closed) break;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    if (!closed) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('QnA SSE error:', message);
    // If headers already sent (SSE mode), write error as SSE event
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to process question' });
    }
  }
});

export default router;

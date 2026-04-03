import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '@clerk/express';

const router = Router();

interface TranscriptLine {
  timestamp?: string;
  speakerName?: string;
  text: string;
}

// POST /api/meeting-qa — Q&A over meeting transcript via OpenRouter
router.post('/', requireAuth(), async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { question, meetingId, transcripts } = req.body;

    if (!question || !meetingId) {
      return res.status(400).json({ error: 'Question and meetingId are required' });
    }

    if (!transcripts || transcripts.length === 0) {
      return res.json({
        answer: 'No meeting transcript available yet. Please wait for some discussion to occur before asking questions.',
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.json({ answer: generateSimpleAnswer(question, transcripts) });
    }

    const transcriptText = transcripts
      .map((t: TranscriptLine, index: number) => {
        const timestamp = t.timestamp
          ? new Date(t.timestamp).toLocaleTimeString()
          : `[${index + 1}]`;
        return `[${timestamp}] ${t.speakerName || 'Speaker'}: ${t.text}`;
      })
      .join('\n');

    const prompt = `You are an intelligent meeting assistant. Your job is to answer questions about a meeting transcript in a natural, conversational, and helpful way.

IMPORTANT RULES:
1. ONLY answer based on the meeting transcript provided below. Do NOT make up information.
2. If the question cannot be answered from the transcript, politely say so.
3. Be natural and conversational — avoid robotic responses.
4. Provide specific details when available (who said what, when, etc.).
5. Be concise but informative.

MEETING TRANSCRIPT:
${transcriptText}

USER QUESTION: ${question}

Please provide a helpful, natural answer based ONLY on the transcript above.`;

    // Use fetch directly — @openrouter/sdk is ESM-only, incompatible with CommonJS
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
        'X-Title': 'MeetMind AI',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-lite:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }),
    });

    const completion = await response.json();
    const answer = completion.choices?.[0]?.message?.content || generateSimpleAnswer(question, transcripts);
    res.json({ answer });
  } catch (error: any) {
    console.error('QnA error:', error?.message || error);
    // Always fall back to simple QnA
    const { question: q, transcripts: t } = req.body;
    res.json({ answer: generateSimpleAnswer(q, t || []) });
  }
});

function generateSimpleAnswer(question: string, transcripts: TranscriptLine[]): string {
  if (!transcripts?.length) return 'No transcript available to answer from.';

  const lowerQuestion = question.toLowerCase();
  const questionWords = lowerQuestion
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const relevantTranscripts = transcripts.filter((t) => {
    const lowerText = (t.text || '').toLowerCase();
    return questionWords.some((w) => lowerText.includes(w));
  });

  if (relevantTranscripts.length === 0) {
    if (lowerQuestion.includes('summary') || lowerQuestion.includes('discuss')) {
      const speakerCount = new Set(transcripts.map((t) => t.speakerName)).size;
      return `The meeting involved ${speakerCount} participant(s) with ${transcripts.length} total utterances.`;
    }
    return 'I could not find specific information in the meeting transcript to answer your question.';
  }

  const topRelevant = relevantTranscripts.slice(0, 3);
  const context = topRelevant.map((t) => `${t.speakerName || 'Speaker'} mentioned: "${t.text}"`).join(' ');
  return `Based on the meeting discussion: ${context}`;
}

export default router;

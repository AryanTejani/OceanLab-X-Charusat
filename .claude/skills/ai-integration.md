# AI Integration — MeetMind AI

## Async Pipeline Pattern (INFRA-01)

Meeting processing runs as 4 separate API routes to stay within Vercel's 10s timeout:

```
POST /api/upload        → store audio, create meeting row (status: 'pending')
POST /api/transcribe    → Deepgram transcription (status: 'transcribing' → 'transcribed')
POST /api/insights/generate → Groq analysis (status: 'processing' → 'completed'/'failed')
POST /api/podcast/generate  → Groq script + ElevenLabs TTS + Cloudinary (podcastStatus: 'generating' → 'ready'/'failed')
```

Frontend polls `GET /api/meetings/:id` every 3 seconds until `status === 'completed'` or `'failed'`.

## Groq (LLM — Insights + Podcast Script)

### Model Selection
- **Dev:** `llama-3.1-8b-instant` — fast, free, good enough for testing
- **Demo/prod:** `llama-3.3-70b-versatile` — best quality, still fast

Never use `gpt-*` models — this project uses Groq, not OpenAI.

### Structured JSON Output (INSIGHT-05)

Always use `response_format: { type: 'json_object' }` for insights. Never parse freeform text:

```ts
const completion = await groq.chat.completions.create({
  messages: [{ role: 'user', content: INSIGHTS_PROMPT + transcript }],
  model: 'llama-3.3-70b-versatile',
  response_format: { type: 'json_object' },
  temperature: 0.3,
  max_tokens: 4096,
});

const insights = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
```

### Prompt Structure for Insights

The prompt must specify the exact JSON shape expected:
```
{
  "summary": "string",
  "actionItems": [{ "text": "string", "assignee": "string|null" }],
  "decisions": [{ "text": "string", "context": "string" }],
  "timeline": [{ "time": "string", "topic": "string", "summary": "string" }],
  "keyTopics": ["string"]
}
```

Include: "Extract ONLY information explicitly stated in the transcript. Return empty arrays if none."

### Transcript Length Cap

```ts
const MAX_CHARS = 100_000;
const transcript = meeting.transcriptText.length > MAX_CHARS
  ? meeting.transcriptText.substring(0, MAX_CHARS) + '\n\n[Transcript truncated]'
  : meeting.transcriptText;
```

## Deepgram (Speech-to-Text)

### File Upload Transcription (server-side)
```ts
const response = await fetch(
  'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&diarize=true&smart_format=true&paragraphs=true',
  {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      'Content-Type': file.mimetype,
    },
    body: file.buffer as unknown as BodyInit,
  }
);

const transcript =
  result.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript ||
  result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
```

### Live Transcription (browser WebSocket)
The frontend hook (`useDeepgramTranscription`) fetches the API key from `GET /api/deepgram-token` then opens a WebSocket directly to Deepgram. The key is returned to the browser — this is intentional (Deepgram key is scoped).

### Free Tier Limit
Deepgram free tier: 7,200 audio-seconds/hour. Keep test clips under 15 minutes during development.

## ElevenLabs (Text-to-Speech — Podcast)

**Defer until Phase 3.** Credits are finite (10,000 chars/month free tier). Pre-cache the podcast MP3 before demo day to avoid burning live quota in front of judges.

```ts
const elevenlabs = getElevenLabsClient();
const audioStream = await elevenlabs.textToSpeech.convert('JBFqnCBsd6RMkjVDRZzb', {
  text: podcastScript,
  model_id: 'eleven_turbo_v2_5',
  output_format: 'mp3_44100_128',
});

const chunks: Uint8Array[] = [];
for await (const chunk of audioStream) chunks.push(chunk);
const audioBuffer = Buffer.concat(chunks);
```

Voice ID `JBFqnCBsd6RMkjVDRZzb` = George (ElevenLabs). Do not hardcode a different ID without checking availability.

## Cloudinary (Podcast Audio Storage)

Never store audio as base64 in PostgreSQL. Upload to Cloudinary and store the `secure_url`:

```ts
import { v2 as cloudinary } from 'cloudinary';

const result = await new Promise<any>((resolve, reject) => {
  cloudinary.uploader.upload_stream(
    { resource_type: 'video', folder: 'meetmind/podcasts', public_id: `podcast-${meetingId}`, format: 'mp3', overwrite: true },
    (err, res) => err ? reject(err) : resolve(res)
  ).end(audioBuffer);
});

await repo.update({ meetingId, userId }, { podcastUrl: result.secure_url, podcastStatus: 'ready' });
```

## OpenRouter (QnA Chatbot)

`@openrouter/sdk` is ESM-only and incompatible with CommonJS backend. Use raw `fetch`:

```ts
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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

const data = await response.json();
const answer = data.choices?.[0]?.message?.content || fallbackSimpleAnswer;
```

Always include a `generateSimpleAnswer()` fallback for when the API key is missing or quota is exceeded.

## Error Recovery

Always update status to `'failed'` when AI calls throw:

```ts
let meetingId: string | undefined;
let userId: string | undefined;
try {
  userId = getAuth(req).userId || undefined;
  meetingId = req.body.meetingId;
  // ... AI call
} catch (error) {
  console.error('Error:', error);
  if (meetingId && userId) {
    try {
      const ds = await getDb();
      await ds.getRepository(Meeting).update({ meetingId, userId }, { status: 'failed' });
    } catch {}
  }
  res.status(500).json({ error: 'Failed to generate insights' });
}
```

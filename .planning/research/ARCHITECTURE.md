# Architecture Research

**Domain:** AI Meeting Intelligence / Podcast Recap SaaS (MeetMind AI)
**Researched:** 2026-04-03
**Confidence:** HIGH (stack is well-documented; pipeline patterns verified across multiple sources)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │  Auth UI     │  │  Upload UI   │  │  Dashboard / Playback │   │
│  │  (Supabase   │  │  (mic rec +  │  │  (transcript, timeline│   │
│  │   Auth)      │  │   file drop) │  │   actions, podcast)   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬────────────┘   │
└─────────┼────────────────┼───────────────────────┼───────────────┘
          │                │                       │
          ▼                ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (Vercel)                    │
│                                                                   │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐   │
│  │   Server Components  │   │         API Route Handlers       │   │
│  │   (page rendering,  │   │  /api/upload   → Supabase Storage │   │
│  │    data fetching)   │   │  /api/transcribe → Deepgram STT   │   │
│  └─────────────────────┘   │  /api/analyze  → Groq LLM        │   │
│                             │  /api/podcast  → ElevenLabs TTS  │   │
│                             └──────────────────────────────────┘   │
└─────────────────────┬────────────────────────────────────────────┘
                      │
          ┌───────────┼───────────────┐
          ▼           ▼               ▼
┌─────────────┐ ┌──────────┐  ┌──────────────────────────────────┐
│  Supabase   │ │  Groq    │  │   External AI Services           │
│  ─────────  │ │  LLM API │  │  ┌──────────┐  ┌─────────────┐  │
│  Auth       │ │  (fast   │  │  │ Deepgram │  │ ElevenLabs  │  │
│  Postgres   │ │   infer) │  │  │   STT    │  │    TTS      │  │
│  Storage    │ └──────────┘  │  └──────────┘  └─────────────┘  │
└─────────────┘               └──────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Auth UI | User login/signup, session management | Supabase Auth + Next.js middleware |
| Upload UI | Browser mic recording via MediaRecorder API, drag-and-drop file upload | React client component |
| Dashboard | Render transcript, timeline, action items, decisions, podcast player | Next.js server + client components |
| `/api/upload` | Accept audio blob, generate Supabase signed upload URL, return storage path | Next.js Route Handler |
| `/api/transcribe` | Receive Supabase storage path, call Deepgram, write transcript to Postgres | Next.js Route Handler |
| `/api/analyze` | Receive transcript text, call Groq with structured prompt, write insights to Postgres | Next.js Route Handler |
| `/api/podcast` | Receive podcast script from Groq, call ElevenLabs, store audio in Supabase Storage | Next.js Route Handler |
| Supabase Auth | JWT-based session, RLS enforcement | Supabase hosted |
| Supabase Postgres | Store meetings, transcripts, insights (summaries, actions, decisions, timeline) | Supabase hosted |
| Supabase Storage | Store raw audio uploads and generated podcast audio | Supabase hosted |
| Deepgram STT | Convert audio file to transcript with speaker segments | Deepgram REST API |
| Groq LLM | Generate summary, action items, decisions, timeline topics, podcast script | Groq REST API |
| ElevenLabs TTS | Convert podcast script to natural-sounding MP3 | ElevenLabs REST API |

## Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx        # Login page
│   │   └── signup/page.tsx       # Signup page
│   ├── dashboard/
│   │   ├── page.tsx              # Meetings list
│   │   └── [meetingId]/
│   │       └── page.tsx          # Meeting detail: transcript, timeline, podcast
│   ├── api/
│   │   ├── upload/route.ts       # Step 1: receive audio, get signed URL
│   │   ├── transcribe/route.ts   # Step 2: Deepgram STT
│   │   ├── analyze/route.ts      # Step 3: Groq insights extraction
│   │   └── podcast/route.ts      # Step 4: ElevenLabs TTS generation
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── meeting/
│   │   ├── AudioUploader.tsx     # Mic recording + file drop UI
│   │   ├── TranscriptViewer.tsx  # Scrollable transcript display
│   │   ├── ActionItemsList.tsx   # Extracted action items
│   │   ├── DecisionsList.tsx     # Detected decisions
│   │   ├── MeetingTimeline.tsx   # Chronological topic list
│   │   └── PodcastPlayer.tsx     # Audio player for AI recap
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   └── server.ts             # Server Supabase client (cookies)
│   ├── deepgram.ts               # Deepgram API wrapper
│   ├── groq.ts                   # Groq API wrapper + prompts
│   └── elevenlabs.ts             # ElevenLabs API wrapper
└── types/
    └── meeting.ts                # Shared TypeScript types
```

### Structure Rationale

- **`app/api/`:** Four separate route handlers, one per processing step. Keeps each step independently testable and makes failures easy to isolate.
- **`components/meeting/`:** All meeting-specific UI components co-located. Dashboard page assembles them.
- **`lib/`:** Thin wrappers around each external API. All API keys stay server-side only, never imported in client components.
- **`lib/supabase/client.ts` vs `server.ts`:** Required split because Supabase client behaves differently in browser vs server context (cookie vs service role auth).

## Architectural Patterns

### Pattern 1: Sequential Processing Pipeline with Status Polling

**What:** Audio processing is broken into four sequential API calls (upload → transcribe → analyze → podcast). Each step writes its result to Postgres and updates a `status` column on the `meetings` table. The frontend polls or subscribes (Supabase Realtime) for status changes.

**When to use:** Any time processing exceeds Vercel's 10-second hobby timeout. Deepgram on a 60-minute meeting can take 30-60 seconds; Groq is fast but ElevenLabs TTS for a long script can take 15-30 seconds.

**Trade-offs:** Simple to implement without a job queue; status polling adds a round-trip. Supabase Realtime subscriptions eliminate polling latency at the cost of one more integration point.

**Example:**
```typescript
// meetings table status column drives UI state
type MeetingStatus =
  | 'uploading'
  | 'transcribing'
  | 'analyzing'
  | 'generating_podcast'
  | 'complete'
  | 'error'

// Each API route updates status when it starts and completes
await supabase
  .from('meetings')
  .update({ status: 'transcribing' })
  .eq('id', meetingId)
```

### Pattern 2: Signed URL Direct Upload (Client → Supabase Storage)

**What:** The client requests a signed upload URL from `/api/upload`, then uploads the audio file directly from the browser to Supabase Storage using that URL. The API route is never a middleman for the binary data.

**When to use:** Always for audio files. Next.js API routes have a 1 MB default body size limit. Audio files are 10-500 MB. Routing them through the server would fail and be slow.

**Trade-offs:** Requires one extra round-trip to get the signed URL. Worth it — bypasses all serverless payload limits.

**Example:**
```typescript
// /api/upload/route.ts
const { data } = await supabase.storage
  .from('audio')
  .createSignedUploadUrl(`${userId}/${meetingId}.webm`)

return Response.json({ signedUrl: data.signedUrl, path: data.path })

// Client: uploads directly to Supabase, not through Next.js
await fetch(signedUrl, { method: 'PUT', body: audioFile })
```

### Pattern 3: Structured Groq Prompt with JSON Output

**What:** Groq receives the full transcript and returns a single JSON object containing summary, action_items, decisions, and timeline in one API call. JSON mode or a well-structured system prompt enforces the output shape.

**When to use:** Always. One Groq call with structured output is faster and cheaper than four separate calls (one per insight type). Groq's speed (300+ tokens/sec) makes this viable for even large transcripts.

**Trade-offs:** Large transcripts may hit context window limits. Groq's llama-3.3-70b-versatile context window is 128k tokens — adequate for most meeting transcripts. Chunk very long transcripts (>3 hours) if needed.

**Example:**
```typescript
const systemPrompt = `
You are a meeting analysis assistant. Given a transcript, return a JSON object with:
{
  "summary": "2-3 paragraph summary",
  "action_items": [{ "task": string, "owner": string, "due_date": string | null }],
  "decisions": [{ "decision": string, "context": string }],
  "timeline": [{ "timestamp_estimate": string, "topic": string }],
  "podcast_script": "A 2-3 minute podcast-style recap in conversational tone"
}
`
```

### Pattern 4: Podcast Audio Storage + Signed Read URL

**What:** ElevenLabs returns an audio buffer. The `/api/podcast` route uploads this buffer directly to Supabase Storage and stores the storage path in Postgres. The dashboard requests a signed read URL to play the podcast without making the bucket public.

**When to use:** Always. Never store audio as base64 in Postgres. Never make the storage bucket fully public (exposes all users' audio to anyone with a URL guess).

**Trade-offs:** Adds a step to generate signed read URLs per request. Supabase signed URLs have configurable expiry — set to 3600s (1 hour) for playback sessions.

## Data Flow

### Primary Flow: Audio Upload → Insights + Podcast

```
User selects audio file / stops recording
    ↓
[Client] POST /api/upload
    → server creates meeting row (status: 'uploading')
    → server returns signed Supabase upload URL
    ↓
[Client] PUT audio directly to Supabase Storage (signed URL)
    → client notifies /api/transcribe when complete
    ↓
[/api/transcribe]
    → reads audio from Supabase Storage
    → sends to Deepgram REST API
    → receives transcript JSON
    → writes transcript text to meetings table
    → updates status: 'analyzing'
    ↓
[/api/analyze]
    → reads transcript from Postgres
    → sends to Groq with structured prompt
    → receives JSON: { summary, action_items, decisions, timeline, podcast_script }
    → writes each field to meetings table
    → updates status: 'generating_podcast'
    ↓
[/api/podcast]
    → reads podcast_script from Postgres
    → sends to ElevenLabs text-to-speech API
    → receives audio buffer (MP3)
    → uploads MP3 to Supabase Storage
    → writes storage path to meetings.podcast_audio_path
    → updates status: 'complete'
    ↓
[Client] Supabase Realtime subscription fires on status: 'complete'
    → dashboard re-fetches meeting data
    → renders transcript, timeline, action items, decisions
    → generates signed read URL for podcast MP3
    → plays podcast in audio player
```

### Auth Flow

```
[Client] → Supabase Auth (email/password or OAuth)
    ↓
Supabase sets session cookie
    ↓
Next.js middleware reads cookie via supabase/server.ts
    ↓
API routes use server client (with user session) for RLS-enforced DB access
    ↓
All DB queries automatically scoped to authenticated user
```

### Key Data Flows

1. **Audio routing:** Audio binary data never passes through Next.js API routes — direct client-to-Supabase via signed URL to bypass serverless body limits.
2. **Processing chain:** Each API route triggers the next. If a step fails, `status: 'error'` is written and the chain stops — the client can surface the error and offer retry.
3. **Insight retrieval:** Dashboard loads all meeting data from Postgres in one server component fetch — no waterfall of separate API calls on page load.
4. **Podcast playback:** Signed read URL generated server-side at page render time; expires in 1 hour; never exposed in client-side code.

## Database Schema (Core Tables)

```sql
-- meetings
id          uuid primary key
user_id     uuid references auth.users
title       text
status      text  -- uploading | transcribing | analyzing | generating_podcast | complete | error
audio_path  text  -- Supabase Storage path to raw audio
created_at  timestamptz

-- meeting_transcripts
id          uuid primary key
meeting_id  uuid references meetings
transcript  text  -- full transcript text
word_count  int

-- meeting_insights
id          uuid primary key
meeting_id  uuid references meetings (unique)
summary     text
action_items jsonb  -- [{ task, owner, due_date }]
decisions   jsonb  -- [{ decision, context }]
timeline    jsonb  -- [{ timestamp_estimate, topic }]
podcast_script text
podcast_audio_path text  -- Supabase Storage path to MP3

-- Row Level Security: all tables filter by auth.uid() = user_id
```

## Integration Points

### External Services

| Service | Integration Pattern | Critical Notes |
|---------|---------------------|----------------|
| Deepgram STT | REST API from Next.js API route; send audio URL or binary buffer | Free tier: 45 min/month transcription limit. Use pre-recorded mode (not streaming) for uploaded files; streaming only needed for live mic. |
| Groq LLM | REST API / SDK from Next.js API route; single structured prompt | Free tier has rate limits; 128k context handles most transcripts. Use `llama-3.3-70b-versatile` or `llama-3.1-8b-instant` for speed. |
| ElevenLabs TTS | REST API from Next.js API route; receive audio buffer | Free tier: 10k characters/month. Keep podcast scripts under ~2000 chars to stay in budget across demos. |
| Supabase Storage | Signed upload URLs (client direct upload); signed read URLs (server-generated) | Set bucket to private. RLS policies required. Use resumable uploads (TUS) for files over 6 MB. |
| Supabase Auth | Cookie-based sessions; Next.js middleware for protection | Use `@supabase/ssr` package, not deprecated `auth-helpers`. Separate client/server Supabase instances. |
| Supabase Realtime | Client subscribes to `meetings` table row updates on `status` column | Optional — can use polling instead if Realtime adds complexity for hackathon. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Client UI ↔ API Routes | HTTP fetch (REST) | Client never calls external APIs directly — all external keys server-side only |
| API Routes ↔ Supabase | Supabase JS SDK (server client with service role for writes) | Use service role key only server-side; anon key for client reads with RLS |
| `/api/transcribe` ↔ `/api/analyze` | Sequential HTTP calls triggered by client, or client polls status | For hackathon, simple sequential chain triggered by client is fine |
| Postgres ↔ Dashboard | Supabase server client in Next.js Server Component | Single fetch at page load, no client-side data fetching waterfall |

## Build Order (Dependency Graph)

The component dependencies dictate this build sequence:

```
1. Auth + DB schema
       ↓
2. Audio upload (client → Supabase Storage via signed URL)
       ↓
3. Deepgram transcription route (/api/transcribe)
       ↓
4. Groq analysis route (/api/analyze)
       ↓
5. Dashboard: transcript + insights display
       ↓
6. ElevenLabs podcast route (/api/podcast)
       ↓
7. Podcast player in dashboard
       ↓
8. Meeting status polling / Realtime subscription (UX polish)
```

**Rationale:** Auth and schema first because every other component depends on them. Upload before transcription because transcription reads the stored file. Analysis before dashboard because dashboard renders insights. Podcast last because it is the differentiator but not blocking the core loop.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users (hackathon) | Current architecture is fine. Sequential pipeline, polling, no job queue needed. |
| 1k users | Add Supabase Realtime subscriptions to replace polling. Monitor API rate limits on all three external services. |
| 10k users | Introduce a job queue (Inngest, QStash, or BullMQ on a separate worker) to decouple processing from HTTP request lifecycle. Add caching for podcast audio via CDN. |
| 100k+ users | Move STT and LLM calls to dedicated worker service. Shard Supabase storage by user region. Consider self-hosting Whisper to control costs. |

### Scaling Priorities

1. **First bottleneck:** External API rate limits (Deepgram, Groq, ElevenLabs free tiers). Fix: upgrade tiers or implement request queuing.
2. **Second bottleneck:** Vercel function timeout (10s hobby, 60s pro). Fix: switch to job queue pattern with Inngest or split chain into fire-and-forget steps using `after()`.

## Anti-Patterns

### Anti-Pattern 1: Streaming Audio Through the API Route

**What people do:** POST the audio file binary to a Next.js API route, which then forwards it to Deepgram.
**Why it's wrong:** Next.js API routes have a 1 MB body limit by default. Audio files are 10-500 MB. This fails immediately for real meetings and requires hacky config to partially fix.
**Do this instead:** Generate a Supabase signed upload URL server-side, have the client upload directly to Supabase Storage, then pass the storage path to the transcription route.

### Anti-Pattern 2: Calling All AI Steps in One Serverless Function

**What people do:** Single `/api/process` route calls Deepgram, then Groq, then ElevenLabs in sequence and returns the final result.
**Why it's wrong:** Total processing time exceeds Vercel timeout (10-60 seconds). A 30-minute meeting transcription + analysis + TTS easily takes 2-3 minutes total.
**Do this instead:** Separate route per step. Client triggers each step, reads status from DB, triggers next step on success. Each function call completes well within timeout.

### Anti-Pattern 3: Storing API Keys in Client Components

**What people do:** Import Groq/Deepgram/ElevenLabs API keys in React components for direct browser API calls.
**Why it's wrong:** Keys are exposed in the browser bundle. Anyone can extract them and abuse your API quota.
**Do this instead:** All external API calls happen in Next.js Route Handlers (server-side only). Use `NEXT_PUBLIC_` prefix only for genuinely public values (Supabase URL, anon key).

### Anti-Pattern 4: Making Storage Buckets Public

**What people do:** Set Supabase storage bucket to public to simplify audio playback URLs.
**Why it's wrong:** Any user can access any other user's audio files by guessing or discovering paths. Exposes private meeting content.
**Do this instead:** Keep buckets private. Generate signed read URLs (1-hour expiry) in server components when rendering the dashboard. RLS on the bucket policies as defense-in-depth.

### Anti-Pattern 5: One Giant `meeting` Table Column for All Insights

**What people do:** Store summary, action_items, decisions, timeline, podcast_script all in one `metadata JSONB` column on the meetings table.
**Why it's wrong:** Fine for a prototype but makes querying individual fields impossible and loses ability to index action items or decisions independently.
**Do this instead:** Separate `meeting_insights` table with typed columns. JSONB is appropriate for arrays (action_items, decisions, timeline) but top-level structured data belongs in proper columns.

## Sources

- [Deepgram Next.js STT Integration Guide](https://deepgram.com/learn/using-next-js-for-speech-to-text) — HIGH confidence (official Deepgram docs)
- [Deepgram Next.js Live Transcription GitHub](https://github.com/deepgram-devs/nextjs-live-transcription) — HIGH confidence (official Deepgram example)
- [ElevenLabs Create Speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) — HIGH confidence (official ElevenLabs docs)
- [ElevenLabs Next.js Guide](https://elevenlabs.io/docs/conversational-ai/guides/conversational-ai-guide-nextjs) — HIGH confidence (official ElevenLabs docs)
- [Supabase Signed URL Upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) — HIGH confidence (official Supabase docs)
- [Supabase Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) — HIGH confidence (official Supabase docs)
- [Supabase Auth + Next.js App Router](https://supabase.com/docs/guides/auth/auth-helpers/nextjs) — HIGH confidence (official Supabase docs)
- [Vercel Long-Running Background Functions (Inngest)](https://www.inngest.com/blog/vercel-long-running-background-functions) — MEDIUM confidence (vendor blog, matches Vercel docs)
- [Meeting Intelligence Platforms Overview — AssemblyAI](https://www.assemblyai.com/blog/meeting-intelligence-platforms) — MEDIUM confidence (industry survey)
- [Meeting Summarization with Groq — Medium](https://medium.com/@adarsh179os/meetings-in-minutes-auto-summarize-your-meetings-with-groq-streamlit-3c1291ca6f90) — LOW confidence (community article, patterns confirmed via official Groq docs)

---
*Architecture research for: AI Meeting Intelligence Platform (MeetMind AI)*
*Researched: 2026-04-03*

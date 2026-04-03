# External Integrations

**Analysis Date:** 2026-04-03

## APIs & External Services

**Authentication:**
- Clerk - User authentication and session management
  - SDK: `@clerk/nextjs` (frontend), `@clerk/express` (backend)
  - Auth: `CLERK_SECRET_KEY` (backend), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (public key)
  - Frontend flow: `useAuth()` to get token, pass to backend via `apiFetch()` in `frontend/lib/api.ts`
  - Backend flow: `requireAuth()` middleware in routes, `getAuth(req)` to extract `userId`

**Speech-to-Text (Audio Upload):**
- Deepgram - File-based audio transcription
  - SDK: Raw fetch API (no SDK used)
  - Auth: `DEEPGRAM_API_KEY` (bearer token)
  - Endpoint: `https://api.deepgram.com/v1/listen`
  - Model: `nova-2`
  - Features: Punctuation, diarization, smart formatting, paragraph extraction
  - Route: `POST /api/upload` in `backend/src/routes/upload.ts` handles file upload, sends to Deepgram
  - Free tier: 200 hours/month

**Speech-to-Text (Live Transcription):**
- AssemblyAI - Real-time transcription via WebSocket
  - SDK: `assemblyai` package (custom wrapper in `backend/src/lib/assemblyai-ws.js`)
  - Auth: `ASSEMBLYAI_API_KEY` (bearer token)
  - Model: `ASSEMBLYAI_REALTIME_MODEL` (default: `universal-2`)
  - Transport: WebSocket (Socket.IO relay in backend)
  - Flow:
    1. Client emits `start-transcription` event with `meetingId`, `userId`, `userName`
    2. Backend creates AssemblyAI WebSocket connection in `backend/src/index.ts` (lines 78-135)
    3. Client sends audio chunks as base64 via `audio-chunk` event
    4. Backend relays transcription results to meeting room via Socket.IO
  - Token endpoint: `GET /api/captions/token` creates temporary token (1 hour expiry)
  - Events: `transcription-started`, `transcription-error`, `transcription-stopped`, `transcript`

**AI Insights Generation (Summary, Action Items, Decisions):**
- Groq - LLM for structured meeting analysis
  - SDK: `groq-sdk` v1.1.2
  - Auth: `GROQ_API_KEY`
  - Client: `getGroqClient()` singleton in `backend/src/lib/groq.ts`
  - Model: `llama-3.3-70b-versatile` (primary), `llama-3.1-8b-instant` (dev fallback per CLAUDE.md)
  - Request format: JSON structured output with `response_format: { type: 'json_object' }`
  - Response schema (from `backend/src/routes/insights.ts`):
    ```json
    {
      "summary": "2-3 paragraph executive summary",
      "actionItems": [{ "text": "...", "assignee": "..." }],
      "decisions": [{ "text": "...", "context": "..." }],
      "timeline": [{ "time": "...", "topic": "...", "summary": "..." }],
      "keyTopics": ["topic1", "topic2", ...]
    }
    ```
  - Route: `POST /api/insights/generate`
  - Free tier: Very generous
  - Truncation: Transcripts capped at 100,000 chars

**AI Q&A (Meeting Transcripts):**
- OpenRouter - LLM routing for Q&A over live meeting transcripts
  - SDK: Raw fetch API (ESM-only SDK incompatible with CommonJS backend)
  - Auth: `OPENROUTER_API_KEY`
  - Endpoint: `https://openrouter.ai/api/v1/chat/completions`
  - Model: `google/gemini-2.0-flash-lite:free`
  - Headers required: `Authorization`, `Content-Type`, `HTTP-Referer`, `X-Title`
  - Route: `POST /api/meeting-qa` in `backend/src/routes/meetingQa.ts`
  - Fallback: If OpenRouter unavailable, uses simple keyword-matching Q&A
  - Free tier: Available

**Text-to-Speech (Podcast Generation):**
- ElevenLabs - Convert podcast script to MP3 audio
  - SDK: `elevenlabs` package
  - Auth: `ELEVENLABS_API_KEY`
  - Client: `getElevenLabsClient()` singleton in `backend/src/lib/elevenlabs.ts`
  - Voice ID: `JBFqnCBsd6RMkjVDRZzb` (hardcoded in `backend/src/routes/podcast.ts`, line 90)
  - Model: `eleven_turbo_v2_5`
  - Output format: `mp3_44100_128`
  - Route: `POST /api/podcast/generate`
  - Free tier: 10,000 characters/month (limited; pre-caching recommended per CLAUDE.md)

**Video Conferencing:**
- Stream.io - Real-time video, audio, screen sharing
  - Frontend SDK: `@stream-io/video-react-sdk` v0.5.1
  - Backend SDK: `@stream-io/node-sdk` v0.1.12
  - Auth: `NEXT_PUBLIC_STREAM_API_KEY` (public key), `STREAM_SECRET_KEY` (backend secret)
  - Token provider: `frontend/actions/stream.actions.ts` - server action that uses `StreamClient.createToken()`
  - Client setup: `frontend/providers/StreamClientProvider.tsx`
    - Initializes `StreamVideoClient` with user data from Clerk
    - User object: `{ id: clerk_user_id, name: display_name, image: user_avatar }`
  - Components:
    - `frontend/components/MeetingRoom.tsx` - Main meeting UI
    - `frontend/components/MeetingSetup.tsx` - Pre-meeting configuration
    - `frontend/components/EndCallButton.tsx` - Call termination
    - `frontend/components/CallList.tsx` - List of available calls
  - Routes: Meeting creation/management in `frontend/app/(root)/meeting/`

## Data Storage

**Databases:**
- PostgreSQL (Supabase recommended)
  - Connection: `DATABASE_URL` (format: `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`)
  - Client: TypeORM
  - SSL: Auto-enabled for Supabase URLs
  - IPv4 forcing: `extra: { family: 4 }` to handle Supabase IPv6 issues
  - Sync: `synchronize: true` in dev (auto-create tables from entities)
  - Entities:
    - `backend/src/entities/Meeting.ts` - Meeting data, transcripts, insights, podcast metadata
    - `backend/src/entities/Transcript.ts` - (entity file exists; see `backend/src/lib/db.ts`)
  - Indexes:
    - `meetings.userId` - Required for all queries (user isolation)
    - `meetings.meetingId` - Unique, indexed
  - Data types used:
    - JSONB for `actionItems`, `decisions`, `timeline` (PostgreSQL structured data)
    - TEXT for transcript text (up to 100,000 chars per Groq truncation)
    - simple-array for `participants`, `keyTopics`

**File Storage:**
- Cloudinary - Podcast MP3 hosting and CDN
  - Credentials: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Client: `v2 as cloudinary` from `cloudinary` package
  - Upload method: `upload_stream()` in `backend/src/routes/podcast.ts`
  - Folder structure: `meetmind/podcasts/`
  - File naming: `podcast-{meetingId}`
  - Format: MP3
  - Free tier: 25GB storage, 25GB bandwidth/month
  - **Audio files never stored in DB** - only CDN URL in `Meeting.podcastUrl`

**Caching:**
- None (application-level caching)
- Sockets provide real-time updates

## Authentication & Identity

**Auth Provider:**
- Clerk (identity platform)
  - Frontend: `@clerk/nextjs` middleware wraps entire app
  - Backend: `@clerk/express` middleware on HTTP server
  - Token flow:
    1. Frontend calls `useAuth()` to get JWT token
    2. Token passed to backend via `Authorization: Bearer <token>` header in `apiFetch()`
    3. Backend verifies token with `@clerk/express` middleware
    4. `requireAuth()` middleware guards protected routes
    5. `getAuth(req)` extracts `userId` from verified token
  - Session: JWT tokens (frontend manages via Clerk SDK)
  - User isolation: All DB queries scoped to `userId` in WHERE clause

## Monitoring & Observability

**Error Tracking:**
- None (application-level error handling only)
- Console logging in backend (`console.error()` for exceptions)

**Logs:**
- Backend: `console.log()` and `console.error()` (Socket.IO events, API errors)
- Frontend: Browser dev tools only
- No centralized logging (e.g., Datadog, Sentry, LogRocket)

## CI/CD & Deployment

**Hosting:**
- Frontend: Next.js on Vercel (assumed from CLAUDE.md INFRA-01 note about Vercel 10s timeout)
- Backend: Node.js server (location unspecified; likely self-hosted or cloud VM)

**CI Pipeline:**
- None detected (`package.json` has no test or CI scripts)

## Environment Configuration

**Required env vars:**

**Frontend (.env.local):**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `NEXT_PUBLIC_STREAM_API_KEY` - Stream.io public key
- `NEXT_PUBLIC_API_URL` - Backend API URL (e.g., `http://localhost:3001`)
- `NEXT_PUBLIC_APP_URL` - Frontend URL (e.g., `http://localhost:3000`)
- `NEXT_PUBLIC_BASE_URL` - Same as APP_URL
- `NEXT_PUBLIC_CAPTIONS_PROVIDER` - Provider for captions (default: `assemblyai`)
- `NEXT_PUBLIC_CAPTIONS_PROXY_PORT` - Port for captions proxy (optional, default: `8787`)
- Optional: `CLERK_SECRET_KEY` (for some edge functions, but backend primarily uses public key)

**Backend (.env - root directory):**
- `BACKEND_PORT` - Server port (default: 3001)
- `FRONTEND_URL` - Frontend origin for CORS (e.g., `http://localhost:3000`)
- `DATABASE_URL` - PostgreSQL connection string (Supabase format)
- `CLERK_SECRET_KEY` - Clerk secret for JWT verification
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Aliased to `CLERK_PUBLISHABLE_KEY` at startup
- `DEEPGRAM_API_KEY` - Speech-to-text (file upload)
- `ASSEMBLYAI_API_KEY` - Live transcription
- `ASSEMBLYAI_REALTIME_MODEL` - Live transcription model (default: `universal-2`)
- `GROQ_API_KEY` - Insights generation
- `OPENROUTER_API_KEY` - Q&A (optional; fallback to simple Q&A if missing)
- `ELEVENLABS_API_KEY` - Podcast TTS
- `CLOUDINARY_CLOUD_NAME` - Cloudinary account
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

**Secrets location:**
- Root `.env` file (not committed; `.env.example` has all variable names documented)
- Frontend env file: `frontend/.env.local` (not committed)
- Never commit `.env` or files with secrets

## Webhooks & Callbacks

**Incoming:**
- None detected (no webhook routes in backend)

**Outgoing:**
- None detected

## API Routes (Backend Summary)

All routes require `Content-Type: application/json` unless otherwise specified.

| Route | Method | Auth | Purpose | Integrations |
|-------|--------|------|---------|--------------|
| `/api/meetings` | GET, POST, DELETE | Required | CRUD meetings | Database |
| `/api/transcripts` | GET | Required | Fetch transcripts | Database |
| `/api/insights/generate` | POST | Required | Generate summary, action items, decisions | Groq, Database |
| `/api/podcast/generate` | POST | Required | Generate podcast audio | Groq, ElevenLabs, Cloudinary, Database |
| `/api/meeting-qa` | POST | None | Q&A over transcript | OpenRouter (optional) |
| `/api/upload` | POST | Required | Upload audio file for transcription | Deepgram, Database |
| `/api/deepgram-token` | GET | None | Deepgram API key endpoint | Deepgram |
| `/api/assemblyai-token` | GET | None | AssemblyAI temporary token | AssemblyAI |
| `/api/captions/token` | GET | None | Captions token (same as assemblyai-token) | AssemblyAI |
| `/api/health` | GET | None | Health check | None |

## Socket.IO Events

**Client → Server:**
- `join-meeting` - Join a meeting room
- `start-transcription` - Start live transcription (creates AssemblyAI connection)
- `audio-chunk` - Send audio chunk (base64) to AssemblyAI
- `stop-transcription` - Stop live transcription

**Server → Client:**
- `transcription-started` - Transcription ready
- `transcription-error` - Error during transcription
- `transcription-stopped` - Transcription stopped
- `transcript` - Broadcast transcription result to meeting room

---

*Integration audit: 2026-04-03*

# Architecture

**Analysis Date:** 2026-04-03

## Pattern Overview

**Overall:** Monorepo monolith with separated frontend (Next.js) and backend (Express), following request-response (HTTP/Socket.IO) and async pipeline patterns.

**Key Characteristics:**
- Dual-runtime: Next.js App Router (port 3000) handles UI only; Express backend (port 3001) handles all APIs
- Async processing: Multi-stage pipeline (transcribe → analyze → podcast) to avoid Vercel 10s timeout
- Socket.IO real-time transport for live transcription during meetings
- Backend-only API key storage; no secrets in frontend
- Database-scoped queries (TypeORM with `userId` in WHERE clauses)
- Type-safe request/response via JSON with explicit interfaces

## Layers

**Presentation Layer (Frontend):**
- Purpose: User interface for meeting management, recording, and insight consumption
- Location: `frontend/app/`, `frontend/components/`, `frontend/pages/` (no API routes)
- Contains: React components, hooks, client-side state management, Tailwind styling
- Depends on: Backend APIs via `apiFetch()`, Clerk for auth, Stream.io for video
- Used by: End users via browser

**API Layer (Backend):**
- Purpose: REST endpoints and Socket.IO handlers for all business logic
- Location: `backend/src/routes/`
- Contains: Route handlers with auth middleware, request validation, response formatting
- Depends on: Database (TypeORM), AI services (Groq, ElevenLabs, OpenRouter, Deepgram), external storage (Cloudinary)
- Used by: Frontend, client-side real-time transcription

**Domain/Service Layer (Backend):**
- Purpose: Orchestrate AI workflows and database operations
- Location: `backend/src/lib/` (client factories), inline in route handlers
- Contains: Groq/ElevenLabs client setup, database initialization, prompt templates
- Depends on: TypeORM DataSource, external SDKs
- Used by: Route handlers

**Data Layer (Backend):**
- Purpose: Persist meeting metadata, transcripts, and insights
- Location: `backend/src/entities/`
- Contains: TypeORM entities (`Meeting`, `Transcript`), column definitions, indexes
- Depends on: PostgreSQL (Supabase)
- Used by: Route handlers via repository pattern

**Real-time Transport (Socket.IO):**
- Purpose: Bi-directional streaming of transcript lines and audio chunks during active meetings
- Location: `backend/src/index.ts` (Socket.IO server setup)
- Contains: Socket event handlers (`start-transcription`, `audio-chunk`, `stop-transcription`)
- Depends on: AssemblyAI WebSocket service (`backend/src/lib/assemblyai-ws.js`)
- Used by: `frontend/components/MeetingRoom.tsx` via client-side socket emission

## Data Flow

**Live Meeting Recording → Transcription (Real-Time):**

1. User joins meeting via `frontend/app/(root)/meeting/[id]/page.tsx`
2. `MeetingRoom.tsx` initializes Stream.io video call and Socket.IO connection
3. Browser captures audio → base64 chunks via `navigator.mediaDevices.getUserMedia()`
4. Client emits `start-transcription` with meetingId/userId → backend initiates AssemblyAI WebSocket
5. Audio chunks sent via `audio-chunk` events → AssemblyAI processes in real-time
6. AssemblyAI emits transcript results → backend broadcasts to meeting room via `io.to(meetingId).emit('transcript', ...)`
7. Frontend receives, displays in `TranscriptionPanel.tsx`, stores locally via `localTranscriptStorageClient`

**Meeting End → Save & Process Pipeline:**

1. User clicks "End Call" in `MeetingRoom.tsx`
2. `saveMeeting()` callback compiles transcript from local storage + call metadata
3. POST `/api/meetings/save` with `meetingId`, `transcriptText`, `participants` → backend upserts `Meeting` entity
4. Meeting status set to `'processing'`; redirects to `/meeting-insights/[id]`
5. Frontend polls `/api/meetings/[id]` every 3s while status is not `'completed'`

**Insights Generation Pipeline:**

1. Frontend calls POST `/api/insights/generate` with `meetingId`
2. Backend retrieves `Meeting` from DB, validates transcript exists
3. Groq receives prompt (system role: "meeting analyst") + transcript truncated to 100k chars
4. Groq returns JSON: `{ summary, actionItems, decisions, timeline, keyTopics }`
5. Backend parses JSON, maps to entity fields (convert assignee/done flags, flatten timeline)
6. Database updated: `status → 'completed'`, all insight fields populated
7. Frontend receives poll response with populated `summary`, `actionItems`, etc.

**Podcast Generation Pipeline:**

1. Frontend calls POST `/api/podcast/generate` with `meetingId`
2. Backend validates meeting exists and has summary (insights already generated)
3. Sets `podcastStatus → 'generating'`
4. **Step 1:** Groq generates natural podcast script (150-200 words) from summary + decisions + action items
5. **Step 2:** ElevenLabs TTS converts script to MP3 audio via streaming API
6. **Step 3:** Cloudinary receives audio buffer, returns signed secure URL
7. **Step 4:** Database updated: `podcastScript`, `podcastUrl`, `podcastStatus → 'ready'`
8. Frontend receives ready response; renders `PodcastPlayer.tsx` with audio control

**State Management:**

- **Database:** Single source of truth for all meeting data; TypeORM manages schema + queries
- **Frontend State:** React hooks (useState, useCallback) for UI state (loading, generating, error)
- **Local Storage:** `localTranscriptStorageClient` caches transcript lines during live meeting; flushed on end-call
- **Socket.IO:** Transient, unidirectional: broadcast only, no persistence

## Key Abstractions

**Meeting Entity:**
- Purpose: Represents complete meeting lifecycle and derived insights
- Examples: `backend/src/entities/Meeting.ts`
- Pattern: TypeORM @Entity with JSONB columns for complex data (actionItems, decisions, timeline)
- Fields: Status transitions (live → processing → completed/failed), podcast generation flag, foreign key relationships via `userId`

**Transcript Entity:**
- Purpose: Log real-time transcription events during live meeting
- Examples: `backend/src/entities/Transcript.ts`
- Pattern: Fire-and-forget saves via POST `/api/transcripts/save` (no auth); used for final transcript assembly if direct transcriptText not provided
- Fields: `meetingId`, `userId`, `isFinal` (confidence threshold), timestamp

**apiFetch Helper:**
- Purpose: Unified request abstraction for frontend → backend calls
- Examples: `frontend/lib/api.ts`
- Pattern: Wraps native fetch with Bearer token injection from Clerk, automatic JSON Content-Type header
- Scope: Reduces boilerplate; centralized error handling opportunity

**Socket.IO Event Stream:**
- Purpose: Real-time transcript distribution during active meeting
- Examples: Handlers in `backend/src/index.ts` (lines 68-183)
- Pattern: Room-based broadcasting (socket.join(meetingId) → io.to(meetingId).emit(...))
- Lifecycle: Transient connection per meeting session; cleaned up on disconnect

**AI Prompt Templates:**
- Purpose: Consistent structured output from LLMs (Groq, OpenRouter)
- Examples:
  - `INSIGHTS_PROMPT` in `backend/src/routes/insights.ts` (JSON schema enforcement)
  - `PODCAST_SCRIPT_PROMPT` in `backend/src/routes/podcast.ts` (text generation)
  - Q&A prompt in `backend/src/routes/meetingQa.ts` (fallback to simple keyword matching)
- Pattern: Stateless prompt engineering; responses parsed and validated

**Error Recovery:**
- Purpose: Graceful degradation when external APIs fail
- Examples:
  - `/api/meeting-qa`: Falls back to keyword-matching function if OpenRouter unavailable
  - `/api/insights/generate`: Marks meeting as `'failed'` on Groq error, notifies user
  - Socket.IO: Closes connection on AssemblyAI error, user can retry
- Pattern: Try-catch with specific error state updates; user-facing messages only (no stack traces)

## Entry Points

**Frontend Entry (Browser):**
- Location: `frontend/app/layout.tsx`
- Triggers: User navigates to Vercel URL
- Responsibilities: Root layout, Clerk provider setup, global styles, Toast component

**Backend Entry (Server):**
- Location: `backend/src/index.ts`
- Triggers: npm start via PM2/Docker
- Responsibilities: Environment setup, Clerk middleware, route mounting, Socket.IO server, database initialization, port 3001 listen

**Meeting Page Entry:**
- Location: `frontend/app/(root)/meeting/[id]/page.tsx`
- Triggers: User clicks "Join Meeting" or direct URL access
- Responsibilities: Stream.io client initialization, permission check, call setup, component composition (MeetingSetup → MeetingRoom)

**Insights Generation Entry:**
- Location: `frontend/app/(root)/meeting-insights/[id]/page.tsx`
- Triggers: User clicks "End Call" (redirect) or manual insights generation
- Responsibilities: Meeting fetch, polling loop, Groq/ElevenLabs async orchestration UI, podcast player composition

## Error Handling

**Strategy:** Fail-safe degradation with explicit user feedback

**Patterns:**

- **Auth Failures:** Clerk middleware returns 401; frontend redirects to sign-in
- **Not Found:** 404 on missing meeting/call; display user-friendly alert
- **Validation:** 400 on missing required fields; return descriptive `{ error: 'message' }`
- **External API Failures:**
  - Deepgram fails → 500 with "Transcription failed"
  - Groq fails → Mark meeting as `'failed'`, user can retry insights generation
  - ElevenLabs fails → Mark podcast as `'failed'`, user sees retry button
  - OpenRouter fails → Fallback to keyword-matching Q&A
- **Database Errors:** 500 with "Failed to save/fetch [resource]"; no stack trace exposure
- **Socket.IO Connection Loss:** Graceful reconnect with user notification; transcript preserved in localStorage

## Cross-Cutting Concerns

**Logging:**
- Backend: Console logging via `console.log()` (emoji prefixes for visual scanning)
- Frontend: Browser console via `console.log()` and `.error()` for debugging
- No structured logging framework currently (suitable for hackathon; log aggregation needed for production)

**Validation:**
- **Frontend:** Input sanitization (trim whitespace), null-coalescing in forms
- **Backend:** Explicit field checks before processing; TypeORM schema validation on insert/update
- **Database:** Indexes on `userId`, `meetingId` for query optimization; no constraints beyond primary keys

**Authentication:**
- Clerk JWT token lifecycle: Frontend requests via `useAuth().getToken()`; backend validates via `clerkMiddleware()` + `getAuth(req)`
- Public endpoints (no auth): `/api/transcripts/save`, `/api/meeting-qa`, `/api/deepgram-token`, `/api/assemblyai-token` (token endpoints send raw API key from backend)
- Protected endpoints: `/api/meetings`, `/api/insights`, `/api/podcast`, `/api/upload` (require valid JWT)
- CORS: Restricted to `FRONTEND_URL` env var (Vercel deployment URL)

**User Isolation:**
- Every database query includes `userId` filter (TypeORM `.findOneBy({ meetingId, userId })`)
- Socket.IO broadcasts scoped to meeting room (participantId validation implicit via Stream.io membership)
- API responses checked for unauthorized access before returning (404 if not owner)

---

*Architecture analysis: 2026-04-03*

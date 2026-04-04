# Roadmap: MeetMind AI

## Overview

Six phases build the product. Phase 1 establishes the infrastructure that everything depends on — auth, database schema, async pipeline pattern, and Vercel deployment. Phase 2 builds the working AI pipeline that transforms audio into structured insights. Phase 3 assembles the full user experience — dashboard, podcast audio, and microphone recording — making the product demo-ready. Phase 4 hardens the product against demo-day failure modes and pre-caches the demo meeting so judges see a flawless experience. Phase 5 (in progress by teammate) covers live meeting transcription via Socket.IO. Phase 6 upgrades Q&A with a LangGraph RAG pipeline backed by Supabase pgvector.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth, database schema, async infrastructure, and Vercel deployment
- [ ] **Phase 2: Core AI Pipeline** - Audio capture, transcription, and AI insight extraction
- [ ] **Phase 3: Dashboard and Podcast** - Full UI experience with podcast audio and meeting detail views
- [ ] **Phase 4: Polish and Demo Prep** - Error states, edge case hardening, and demo-day preparation
- [x] **Phase 5: Live Transcription** - Real-time Socket.IO transcription pipeline (IN PROGRESS — teammate)
- [ ] **Phase 6: Live Q&A RAG** - LangGraph RAG Q&A with Supabase pgvector and SSE streaming
- [ ] **Phase 7: Team Members** - Invite and manage team members, integrate into meeting creation and in-call UI

## Phase Details

### Phase 1: Foundation
**Goal**: The infrastructure scaffolding every feature depends on is in place and verified on production
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, INFRA-01, INFRA-02, INFRA-03, INFRA-04, AUDIO-04
**Success Criteria** (what must be TRUE):
  1. User can sign up, log in, and log out — and stays logged in across browser refresh
  2. A Supabase schema with meetings table, status column, and RLS policies exists and scopes all data to the authenticated user
  3. Client can request a signed upload URL and send an audio file directly to Supabase Storage without routing through Next.js
  4. The application is live on Vercel at a public HTTPS URL with all environment variables set and microphone permissions working
**Plans**: TBD

### Phase 2: Core AI Pipeline
**Goal**: A user can submit a meeting audio file and receive a full set of structured AI insights — summary, action items, decisions, and topic timeline
**Depends on**: Phase 1
**Requirements**: AUDIO-01, AUDIO-02, AUDIO-03, TRANS-01, TRANS-02, TRANS-03, INSIGHT-01, INSIGHT-02, INSIGHT-03, INSIGHT-04, INSIGHT-05
**Success Criteria** (what must be TRUE):
  1. User can upload an audio file (mp3, wav, m4a, webm) or record live via microphone and trigger processing
  2. Transcript appears on the meeting detail page after Deepgram processes the audio
  3. A meeting summary, list of action items with owners, list of decisions, and chronological topic timeline all appear after Groq analysis
  4. Processing status updates visibly as the pipeline progresses through each stage (uploading, transcribing, analyzing)
  5. All insights are structured JSON outputs — no freeform hallucination in action items or decisions
**Plans**: TBD

### Phase 3: Dashboard and Podcast
**Goal**: The complete end-to-end user experience is working — a judge can upload a meeting, watch it process, and listen to the AI podcast summary
**Depends on**: Phase 2
**Requirements**: PODCAST-01, PODCAST-02, PODCAST-03, PODCAST-04, DASH-01, DASH-02, DASH-03, DASH-04, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. User sees a meeting history list with title, date, and processing status on the dashboard
  2. Meeting detail page displays transcript, summary, action items, decisions, timeline, and podcast player in one organized view
  3. User can play the AI-generated podcast audio summary directly in the browser — it is cached so it does not regenerate on each view
  4. UI is built with Watermelon UI components and is responsive on mobile browsers
  5. Processing status labels ("Transcribing...", "Analyzing...", "Generating podcast...") update in real time as the pipeline progresses
**Plans**: TBD

### Phase 4: Polish and Demo Prep
**Goal**: The product handles failure modes gracefully and a pre-cached demo meeting is ready for judges to experience without burning live API quota
**Depends on**: Phase 3
**Requirements**: (All 30 v1 requirements covered in phases 1-3. This phase hardens and verifies them.)
**Success Criteria** (what must be TRUE):
  1. API quota errors (ElevenLabs 429, Groq 429) show a human-readable message rather than a blank screen or console error
  2. A pre-generated demo meeting with cached podcast MP3 is available and playable without calling any external API
  3. Accessing any meeting detail page in an incognito window (unauthenticated) redirects to login — no data leakage
  4. The full upload-to-podcast flow completes without error on the live Vercel URL using a fresh audio file
**Plans**: TBD

### Phase 5: Live Transcription
**Goal**: Real-time meeting transcription streamed to all participants via Socket.IO (IN PROGRESS — teammate)
**Depends on**: Phase 1
**Requirements**: TRANS-01, TRANS-02, TRANS-03
**Notes**: AssemblyAI → backend → Socket.IO → participants. Transcript turns buffered in-memory, flushed to `Transcript` entity every 5 turns or 30 seconds. Being implemented by teammate.

### Phase 6: Live Q&A RAG
**Goal**: Users can ask questions about a live meeting and get accurate, low-latency answers grounded in the transcript — including things said in the last 30 seconds
**Depends on**: Phase 5
**Requirements**: QA-01, QA-02, QA-03, QA-04
**Success Criteria** (what must be TRUE):
  1. User submits a question and sees the first token streamed back within 600ms (SSE endpoint)
  2. Answer is grounded in the actual transcript — not hallucinated — and cites speaker names where relevant
  3. Questions about things said in the last 30 seconds are answered correctly via `retrieve_recent` fallback
  4. Vector store is updated incrementally as new transcript turns are flushed, with no blocking on the transcription pipeline
  5. When no transcript exists yet for a meeting, the system falls back gracefully (retrieve_recent returns empty context, generate acknowledges no data)
**Architecture**:
  - Supabase pgvector: `transcript_embeddings` table with `vector(384)` column, IVFFlat index
  - Embedding: `@xenova/transformers` Xenova/all-MiniLM-L6-v2 (local, ~50ms/chunk, zero API cost)
  - Incremental indexing: hook into existing `flushBuffer()` — fire-and-forget, never blocks flush
  - LangGraph graph: `retrieve → grade_relevance → generate` with `retrieve_recent` fallback branch
  - Transport: SSE (`text/event-stream`) — `data: <token>\n\n`, final `data: [DONE]\n\n`
  - Groq: `llama-3.1-8b-instant` via existing singleton at `backend/src/lib/groq.ts`
**Latency Budget**:
  - Embedding question: < 60ms
  - pgvector cosine search: < 40ms
  - Groq TTFT: < 400ms
  - Total to first visible token: < 600ms
**New packages** (backend only): `@xenova/transformers`, `@langchain/langgraph`, `@langchain/core`, `@langchain/groq`
**Files to create/modify**:
  - `supabase/migrations/001_vector_store.sql` — Create
  - `backend/src/lib/embeddings.ts` — Create
  - `backend/src/lib/qaGraph.ts` — Create
  - `backend/src/routes/meetingQa.ts` — Modify (replace OpenRouter with SSE + LangGraph)
  - `backend/src/index.ts` — Modify (hook indexing into flushBuffer)
  - `frontend/components/QnAChatbot.tsx` — Modify (SSE streaming + pulsing cursor)
**Do NOT change**: Socket.IO events, flushBuffer logic (beyond the index hook), Transcript/Meeting TypeORM entities, other routes, frontend auth flow
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md -- Install RAG packages, Supabase admin client, embeddings module, pgvector migration
- [x] 06-02-PLAN.md -- LangGraph RAG graph, SSE route upgrade, flushBuffer indexing hook
- [x] 06-03-PLAN.md -- Frontend SSE streaming consumer with pulsing cursor

### Phase 7: Team Members — allow users to invite and manage team members under their account

**Goal:** Account owners can invite team members via Clerk, manage them on a dedicated Team page, and integrate team members into meeting creation and in-call participant lists
**Depends on:** Phase 6
**Requirements**: TEAM-P7-01, TEAM-P7-02, TEAM-P7-03, TEAM-P7-04
**Success Criteria** (what must be TRUE):
  1. Owner can invite a team member by email — Clerk sends the invitation, a pending TeamMember row is created
  2. Team page displays all team members with profile picture, name, email, join date, status (pending/active), and remove button
  3. Owner can remove a team member — row deleted, pending Clerk invitation revoked
  4. Meeting creation flow includes a searchable team member selector — selected members saved as participantUserIds
  5. In-call participant panel shows all team members with search and "Add to call" — members already added show "In call" state
**Plans**: 3 plans
Plans:
- [x] 07-01-PLAN.md -- TeamMember entity, backend team routes (invite/list/remove), shared types
- [x] 07-02-PLAN.md -- Team management page with member table, invite modal, sidebar link
- [ ] 07-03-PLAN.md -- Meeting creation team selector and in-call team member panel

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Core AI Pipeline | 0/TBD | Not started | - |
| 3. Dashboard and Podcast | 0/TBD | Not started | - |
| 4. Polish and Demo Prep | 0/TBD | Not started | - |
| 5. Live Transcription | 0/TBD | In progress (teammate) | - |
| 6. Live Q&A RAG | 1/3 | In Progress|  |
| 7. Team Members | 2/3 | In Progress|  |

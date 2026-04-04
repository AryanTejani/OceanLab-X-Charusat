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

## Phase Details

### Phase 1: Foundation
**Goal**: The infrastructure scaffolding every feature depends on is in place and verified on production
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, INFRA-01, INFRA-02, INFRA-03, INFRA-04, AUDIO-04
**Success Criteria** (what must be TRUE):
  1. User can sign up, log in, and log out — and stays logged in across browser refresh
  2. A Supabase schema with meetings table, status column, and RLS policies exists and scopes all data to the authenticated user
  3. Client can request a signed upload URL and send an audio file directly to Supabase Storage without routing through Next.js
  4. The application is live on Vercel at a public HTTPS URL with all environment ---                                                                                                                                 
  Implementation Prompt                                                                                                               
                                                                                                                                      
  ## Feature: Live Meeting Q&A with LangGraph RAG + Supabase Vector Store                                                             
                                                                                                                                      
  ### Context                                                                                                                         
  MeetMind AI is a meeting assistant that streams live transcriptions via Socket.IO                                                   
  (AssemblyAI → backend → participants). Transcripts are buffered in-memory and                                                       
  flushed to Supabase (TypeORM `Transcript` entity) every 5 turns or 30 seconds.                                                      
  There is already a `QnAChatbot.tsx` UI component and a `/api/meetings/:meetingId/qa`                                                
  backend route (`backend/src/routes/meetingQa.ts`) — both need to be upgraded, not                                                   
  rebuilt from scratch.                                                                                                               
                                                                                                                                      
  The current Q&A implementation dumps the full raw transcript into an OpenRouter                                                     
  prompt. This fails for long meetings and has no memory of recent context. We need
  to replace it with a LangGraph RAG graph that uses Supabase pgvector for low-latency                                                
  retrieval, with the vector store updated incrementally as new transcript turns arrive.                                              
                                                                                                                                      
  ---                                                                                                                                 
                                                                                                                                      
  ### Goal                                                                                                                            
  Replace the current naive full-transcript Q&A with a LangGraph streaming RAG pipeline
  that keeps the vector store current with the live transcript, so users get accurate,                                                
  low-latency answers — including about things said in the last 30 seconds.                                                           
                                                                                                                                      
  ---                                                                                                                                 
                                                                                                                                      
  ### Architecture                                           

  #### 1. Supabase pgvector Setup (one-time migration)                                                                                
  Enable `vector` extension and create a `transcript_embeddings` table:
                                                                                                                                      
  ```sql                                                     
  create extension if not exists vector;                                                                                              
                                                                                                                                      
  create table transcript_embeddings (
    id           uuid primary key default gen_random_uuid(),                                                                          
    meeting_id   text not null,                              
    transcript_id uuid references transcripts(id) on delete cascade,                                                                  
    chunk_text   text not null,
    speaker_name text,                                                                                                                
    start_ms     bigint,                                     
    embedding    vector(384),         -- nomic-embed-text or text-embedding-3-small                                                   
    created_at   timestamptz default now()                                                                                            
  );
                                                                                                                                      
  create index on transcript_embeddings                      
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);                                                                                                               
                                                                                                                                      
  2. Embedding Worker (backend/src/lib/embeddings.ts)                                                                                 
                                                                                                                                      
  - Use @xenova/transformers (runs locally, zero API cost, ~50ms/chunk) with model                                                    
  Xenova/all-MiniLM-L6-v2 (384-dim) for embeddings — no external API call needed.
  - Expose: embedText(text: string): Promise<number[]>                                                                                
  - Batch-safe: accept embedBatch(texts: string[]): Promise<number[][]>                                                               
                                                                                                                                      
  3. Incremental Indexing (hook into existing flushBuffer)                                                                            
                                                                                                                                      
  In backend/src/index.ts, after flushBuffer() persists rows to Postgres,                                                             
  call indexTranscriptChunks(rows, meetingId) which:         
  - Skips rows where text.trim().length < 20 (noise)                                                                                  
  - Calls embedBatch() on the new rows                                                                                                
  - Bulk-inserts into transcript_embeddings via Supabase JS client                                                                    
  (use the Supabase admin client — service role key — not TypeORM)                                                                    
  - Fire-and-forget with error logging — never block the flush                                                                        
                                                                                                                                      
  4. LangGraph RAG Graph (backend/src/lib/qaGraph.ts)                                                                                 
                                                                                                                                      
  Build a compiled LangGraph graph with these nodes:                                                                                  
                                                             
  [retrieve] → [grade_relevance] → [generate]                                                                                         
                      ↓                                                                                                               
               (low relevance)                                                                                                        
                      ↓                                                                                                               
             [retrieve_recent] → [generate]                                                                                           
                                                                                                                                      
  Node details:
  - retrieve: cosine similarity search on transcript_embeddings for the                                                               
  question, filtered by meeting_id, top-k=6, using the Supabase match_documents                                                       
  RPC function (standard pgvector pattern).                                    
  - grade_relevance: score retrieved chunks; if max score < 0.35, fall through                                                        
  to retrieve_recent — this handles the "what was just said?" case.                                                                   
  - retrieve_recent: fetch the last N transcript rows from Supabase ordered by                                                        
  start desc (last 60 seconds of raw transcript) as a fallback context.                                                               
  - generate: stream the answer using Groq llama-3.1-8b-instant (already                                                              
  configured in backend/src/lib/groq.ts) with this system prompt:                                                                     
                                                                                                                                      
  You are a meeting assistant. Answer questions using ONLY the provided                                                               
  transcript context. If the answer is not in the context, say so directly.                                                           
  Be concise. Cite speaker names when relevant.                                                                                       
  Context:                                                                                                                            
  {chunks}                                                   
                                                                                                                                      
  Export: async function* streamAnswer(meetingId: string, question: string)
  — yields string tokens as they arrive from Groq.                                                                                    
                                                                                                                                      
  5. Upgrade /api/meetings/:meetingId/qa Route                                                                                        
                                                                                                                                      
  Replace the current OpenRouter call in meetingQa.ts:                                                                                
  - Set Content-Type: text/event-stream and stream tokens from streamAnswer()
  using SSE format (data: <token>\n\n, final data: [DONE]\n\n).                                                                       
  - Keep the existing auth middleware (requireAuth + userId scoping).
  - Keep the existing request body shape { question: string }.                                                                        
  - Add input validation: question must be 3–500 chars.                                                                               
                                                                                                                                      
  6. Upgrade QnAChatbot.tsx                                                                                                           
                                                                                                                                      
  Replace the current fetch call with SSE streaming:                                                                                  
  - Use EventSource or fetch with ReadableStream to consume the SSE endpoint.
  - Render tokens as they arrive (append to the last message in state).                                                               
  - Show a pulsing cursor while streaming, replace with final text on [DONE].
  - No other UI changes — keep the existing floating button and modal layout.                                                         
                                                                                                                                      
  ---                                                                                                                                 
  Latency Budget                                                                                                                      
                                                                                                                                      
  ┌───────────────────────────────┬─────────┐                
  │             Step              │ Target  │                                                                                         
  ├───────────────────────────────┼─────────┤                                                                                         
  │ Embedding the question        │ < 60ms  │                                                                                         
  ├───────────────────────────────┼─────────┤                                                                                         
  │ pgvector cosine search        │ < 40ms  │                
  ├───────────────────────────────┼─────────┤                                                                                         
  │ Groq TTFT (time to first tok) │ < 400ms │
  ├───────────────────────────────┼─────────┤                                                                                         
  │ Total to first visible token  │ < 600ms │                
  └───────────────────────────────┴─────────┘                                                                                         
                                                             
  ---
  Constraints
                                                                                                                                      
  - No new npm packages except @xenova/transformers (backend only) and
  @langchain/langgraph + @langchain/core + @langchain/groq. State these                                                               
  explicitly before installing.                                                                                                       
  - Embeddings run locally — never call OpenAI embeddings API (cost).                                                                 
  - The Supabase service role key is already in the root .env as SUPABASE_SERVICE_KEY.                                                
  - The Supabase project URL is SUPABASE_URL.                                                                                         
  - Groq client singleton is at backend/src/lib/groq.ts — reuse it.                                                                   
  - Never store embeddings in the TypeORM Transcript entity — use the separate                                                        
  transcript_embeddings table via Supabase JS client directly.                                                                        
  - The graph must handle the case where transcript_embeddings has zero rows for a                                                    
  meetingId (meeting just started, nothing indexed yet) — fall back to retrieve_recent.                                               
                                                                                                                                      
  ---                                                                                                                                 
  Files to Create/Modify                                                                                                              
                                                                                                                                      
  ┌──────────────────────────────────────────┬─────────────────────────────────────────┐
  │                   File                   │                 Action                  │                                              
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤
  │ supabase/migrations/001_vector_store.sql │ Create                                  │
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤
  │ backend/src/lib/embeddings.ts            │ Create                                  │                                              
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤
  │ backend/src/lib/qaGraph.ts               │ Create                                  │                                              
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤                                              
  │ backend/src/routes/meetingQa.ts          │ Modify                                  │
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤                                              
  │ backend/src/index.ts                     │ Modify (hook indexing into flushBuffer) │
  ├──────────────────────────────────────────┼─────────────────────────────────────────┤                                              
  │ frontend/components/QnAChatbot.tsx       │ Modify (SSE streaming)                  │
  └──────────────────────────────────────────┴─────────────────────────────────────────┘                                              
                                                             
  ---                                                                                                                                 
  Do NOT change                                              
               
  - Socket.IO transcription events or flushBuffer logic (beyond adding the index hook)
  - Transcript or Meeting TypeORM entities                                                                                            
  - Any other routes
  - Frontend auth flow or apiFetch utility                                                                                            
                                                                                                                                      
  ---                                                                                                                                 
                                                                                                                                      
  This gives any AI (or developer) the exact architecture, constraints, file map, and latency targets to implement this without       
  guessing. The key design decisions baked in: local embeddings to avoid API cost/latency, `retrieve_recent` fallback for the "what
  was just said" case, and SSE streaming so the first token appears in ~600ms.            variables set and microphone permissions working
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
- [ ] 06-02-PLAN.md -- LangGraph RAG graph, SSE route upgrade, flushBuffer indexing hook
- [ ] 06-03-PLAN.md -- Frontend SSE streaming consumer with pulsing cursor

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Core AI Pipeline | 0/TBD | Not started | - |
| 3. Dashboard and Podcast | 0/TBD | Not started | - |
| 4. Polish and Demo Prep | 0/TBD | Not started | - |
| 5. Live Transcription | 0/TBD | In progress (teammate) | - |
| 6. Live Q&A RAG | 1/3 | In Progress|  |

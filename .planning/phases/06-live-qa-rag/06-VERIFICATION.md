---
phase: 06-live-qa-rag
verified: 2026-04-04T09:00:00Z
status: human_needed
score: 4/5 must-haves verified (automated); 5th requires runtime
re_verification: false
human_verification:
  - test: "Submit a question and measure time-to-first-token"
    expected: "First SSE data: token arrives within 600ms of the POST request"
    why_human: "Requires a running server, live Groq API call, and network timing measurement — cannot verify latency programmatically"
  - test: "Ask a question about content in the last 30 seconds of a live meeting"
    expected: "retrieve_recent fallback fires, answer correctly references recently spoken content"
    why_human: "Requires active Socket.IO transcription session with live audio; cannot simulate without full stack running"
  - test: "Start server cold (no transcript_embeddings rows) and ask a question"
    expected: "Answer says context is unavailable rather than hallucinating; no 500 error"
    why_human: "Requires clean Supabase state (empty transcript_embeddings table) and a running server"
  - test: "Verify pgvector migration was applied to Supabase"
    expected: "transcript_embeddings table exists with vector(384) column; match_transcript_chunks RPC callable"
    why_human: "Migration is a SQL file, not auto-applied. Must be manually run in Supabase SQL editor — cannot verify remotely"
---

# Phase 06: Live Q&A RAG Verification Report

**Phase Goal:** Users can ask questions about a live meeting and get accurate, low-latency answers grounded in the transcript — including things said in the last 30 seconds
**Verified:** 2026-04-04T09:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User submits a question and sees the first token streamed back within 600ms (SSE endpoint) | ? UNCERTAIN | SSE endpoint implemented correctly; latency cannot be measured statically |
| 2 | Answer is grounded in actual transcript and cites speaker names where relevant | VERIFIED | `generate` node builds context as `[speakerName] chunk_text`; system prompt says "Cite speaker names when relevant" |
| 3 | Questions about things said in the last 30 seconds answered via `retrieve_recent` fallback | VERIFIED | `gradeRoute` routes to `retrieve_recent` when `similarity < 0.35` or chunks empty; queries `transcript_embeddings` ordered by `created_at DESC` limit 8 |
| 4 | Vector store updated incrementally as new transcript turns flush, without blocking pipeline | VERIFIED | `indexTranscriptChunks` called fire-and-forget in `flushBuffer` with `.catch()` error handler; no `await` on the call |
| 5 | When no transcript exists, system falls back gracefully | VERIFIED (code path) | `retrieveRecent` returns empty `chunks = []` when table has no rows; `generate` node will respond from empty context; system prompt instructs "If the answer is not in the context, say so directly" — requires runtime confirm |

**Score:** 4/5 truths verified statically (Truth 1 needs runtime measurement; Truth 5 code path correct but needs runtime confirm)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/lib/supabaseAdmin.ts` | Singleton Supabase admin client for vector ops | VERIFIED | Exports `getSupabaseAdmin()`, throws on missing env vars, uses `createClient` singleton pattern |
| `backend/src/lib/embeddings.ts` | Local embedding via @xenova/transformers all-MiniLM-L6-v2 | VERIFIED | Exports `embedText`, `embedBatch`, `warmUpEmbedder`; uses `await import('@xenova/transformers')` correctly; no top-level require |
| `supabase/migrations/001_vector_store.sql` | pgvector table, IVFFlat index, match_transcript_chunks RPC | VERIFIED | Contains `create extension if not exists vector`, `transcript_embeddings` table with `embedding vector(384)`, IVFFlat index with `lists = 100`, `match_transcript_chunks` RPC returning `1 - (embedding <=> query_embedding) as similarity` |
| `backend/src/lib/qaGraph.ts` | LangGraph RAG graph with retrieve, grade_relevance, retrieve_recent, generate nodes | VERIFIED | Exports `streamAnswer` async generator and `warmUpGraph`; all LangGraph imports use `await import()` inside `getRagGraph()`; threshold is 0.35; `streamMode: 'messages'` used |
| `backend/src/routes/meetingQa.ts` | SSE streaming Q&A endpoint | VERIFIED | Sets `Content-Type: text/event-stream`, calls `res.flushHeaders()`, streams tokens as `data: {"token":"..."}\n\n`, closes with `data: [DONE]\n\n`; no OpenRouter references remain |
| `backend/src/index.ts` | flushBuffer hook + warmup at startup | VERIFIED | `indexTranscriptChunks` defined and called fire-and-forget after `Transcript.insert(rows)`; `warmUpEmbedder()` and `warmUpGraph()` called in `server.listen` callback |
| `frontend/components/QnAChatbot.tsx` | SSE streaming Q&A chatbot with token-by-token rendering | VERIFIED | Uses `response.body!.getReader()`, parses `data:` lines, handles `[DONE]` sentinel, shows `animate-pulse` cursor, uses `useAuth().getToken()` for auth; no `localTranscriptStorageClient` import |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `embeddings.ts` | `@xenova/transformers` | `await import('@xenova/transformers')` | WIRED | Dynamic import inside async `getPipeline()` initializer; no top-level require |
| `supabaseAdmin.ts` | `process.env.SUPABASE_URL + SUPABASE_SERVICE_KEY` | `createClient(url, key)` singleton | WIRED | Throws `Error` if env vars missing; singleton lazy-init |
| `qaGraph.ts` | `embeddings.ts` | `embedText(state.question)` | WIRED | `const { embedText } = await import('./embeddings')` inside `getRagGraph()` |
| `qaGraph.ts` | `supabaseAdmin.ts` | `getSupabaseAdmin()` | WIRED | `const { getSupabaseAdmin } = await import('./supabaseAdmin')` inside `getRagGraph()` |
| `qaGraph.ts` | Supabase RPC | `.rpc('match_transcript_chunks', ...)` | WIRED | Called in `retrieve` node with `query_embedding`, `match_meeting_id`, `match_count: 6` |
| `meetingQa.ts` | `qaGraph.ts` | `await import('../lib/qaGraph')` then `streamAnswer` | WIRED | Dynamic import inside route handler; iterates `streamAnswer` async generator |
| `index.ts` | `embeddings.ts` | `warmUpEmbedder`, `embedBatch` | WIRED | Top-level imports; `embedBatch` used in `indexTranscriptChunks`; `warmUpEmbedder()` called at startup |
| `index.ts` | `qaGraph.ts` | `warmUpGraph` | WIRED | Top-level import; called in `server.listen` callback |
| `index.ts` | `flushBuffer` hook | fire-and-forget `indexTranscriptChunks(meetingId, rows).catch(...)` | WIRED | No `await` on the call — fire-and-forget confirmed |
| `QnAChatbot.tsx` | `/api/meeting-qa` | `fetch POST` with `ReadableStream` consumer | WIRED | `fetch(\`\${API_URL}/api/meeting-qa\`, { method: 'POST', body: JSON.stringify({ question, meetingId }) })` |
| `QnAChatbot.tsx` | SSE protocol | `data:` line parsing with `[DONE]` sentinel | WIRED | `if (payload === '[DONE]')` check present; token appended to last assistant message |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| QA-01 | 06-01, 06-02, 06-03 | SSE endpoint streams first token within 600ms | ORPHANED — NOT IN REQUIREMENTS.MD | QA-01 appears in ROADMAP.md Phase 6 and plan frontmatter but is absent from REQUIREMENTS.md entirely |
| QA-02 | 06-02, 06-03 | Answer cites speaker names, grounded in transcript | ORPHANED — NOT IN REQUIREMENTS.MD | Same — QA-02 not defined in REQUIREMENTS.md |
| QA-03 | 06-02 | retrieve_recent fallback for last-30s queries | ORPHANED — NOT IN REQUIREMENTS.MD | Same — QA-03 not defined in REQUIREMENTS.md |
| QA-04 | 06-01, 06-02 | Incremental vector indexing non-blocking | ORPHANED — NOT IN REQUIREMENTS.MD | Same — QA-04 not defined in REQUIREMENTS.md |

**Critical finding:** Requirements QA-01, QA-02, QA-03, QA-04 are referenced throughout the phase plans and in ROADMAP.md but do not exist anywhere in `.planning/REQUIREMENTS.md`. The requirements document covers only AUTH, AUDIO, TRANS, INSIGHT, PODCAST, DASH, INFRA, and UI requirement families (30 requirements total). The Q&A feature requirements were never formally added to the requirements document.

This is a documentation gap, not an implementation gap — the implementation correctly addresses what the ROADMAP.md phase goal and success criteria describe. The requirements document was not updated when Phase 6 was added to the roadmap.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `backend/src/lib/embeddings.ts` line 26 | `(pipe as any)(text, ...)` — explicit `any` cast | Info | Necessary workaround for @xenova/transformers complex union type; documented in SUMMARY; no functional impact |
| `backend/src/lib/qaGraph.ts` line 4 | `CompiledStateGraph<any, any, any, any, any, any>` — multiple `any` type params | Info | Necessary workaround for LangGraph CJS stream typing; documented in SUMMARY; no functional impact |
| `frontend/components/QnAChatbot.tsx` line 102 | `catch (parseErr) { // Skip malformed SSE lines }` — empty catch | Warning | Silently discards SSE parse errors; acceptable for protocol robustness but hides unexpected server responses |

No blockers found. The `any` casts are documented deviations and limited to SDK boundary points, consistent with the project's TypeScript policy for complex external library types.

---

## Human Verification Required

### 1. First-Token Latency (QA-01)

**Test:** Start backend (`cd backend && npm run dev`). Wait for warmup logs. POST to `/api/meeting-qa` with a question about a meeting that has transcript data. Measure time from POST send to first `data: {"token":` line received.
**Expected:** First token visible within 600ms (embedding ~60ms + pgvector ~40ms + Groq TTFT ~400ms = budget 500ms, leaving 100ms margin)
**Why human:** Requires running server, live Groq API key, network conditions, and timing measurement

### 2. retrieve_recent Fallback for Recent Turns (QA-03)

**Test:** Start a live transcription session. While transcription is active, open the Q&A chatbot and ask "What was just said?" before any embeddings are indexed (within the first flush interval).
**Expected:** The answer references content from the last few turns, sourced from the `retrieve_recent` fallback path. Backend logs should NOT show `Indexed N chunks` for this specific query's trigger path.
**Why human:** Requires active Socket.IO session, live audio, and timing relative to flush intervals

### 3. Empty Transcript Graceful Fallback (QA-05 equivalent)

**Test:** Create a new meeting with zero transcript rows. Open Q&A chatbot and ask any question.
**Expected:** Response says something like "There is no transcript context available for this meeting" rather than a 500 error or hallucinated answer.
**Why human:** Requires clean Supabase state and confirmed empty transcript_embeddings for the specific meetingId

### 4. pgvector Migration Applied

**Test:** Open Supabase project dashboard → Table Editor. Confirm `transcript_embeddings` table exists with columns: `id`, `meeting_id`, `transcript_id`, `chunk_text`, `speaker_name`, `start_ms`, `embedding`, `created_at`. Also confirm the `match_transcript_chunks` function is callable via the Supabase RPC panel.
**Expected:** Table and function exist; vector(384) column type visible
**Why human:** SQL migration file exists at `supabase/migrations/001_vector_store.sql` but must be manually applied to the Supabase project — there is no auto-migration in this stack

---

## Gaps Summary

No implementation gaps were found. All artifacts exist, are substantive, and are wired end-to-end.

**Documentation gap (non-blocking):** Requirements QA-01 through QA-04 are not defined in `.planning/REQUIREMENTS.md`. The implementation is correct and aligns with ROADMAP.md Phase 6 success criteria. REQUIREMENTS.md should be updated to include these four requirements and map them to Phase 6, consistent with how all other v1 requirements are tracked. This does not affect the implementation.

**Pending human actions (potential blockers at runtime):**
- The pgvector migration (`supabase/migrations/001_vector_store.sql`) must be manually applied to the Supabase project before any Q&A requests will succeed. If not applied, every Q&A call will fail with a Supabase RPC error.
- The `.env` file must contain `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. If missing, `getSupabaseAdmin()` will throw on first call.

---

_Verified: 2026-04-04T09:00:00Z_
_Verifier: Claude (gsd-verifier)_

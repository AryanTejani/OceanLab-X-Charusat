---
phase: 06-live-qa-rag
plan: 02
subsystem: backend-rag
tags: [langgraph, rag, pgvector, sse, embeddings, groq]

dependency_graph:
  requires: [06-01]
  provides: [streaming-qa-endpoint, rag-graph, transcript-indexing-hook]
  affects: [frontend-qa-chatbot]

tech_stack:
  added: []
  patterns:
    - LangGraph StateGraph with conditional edges for RAG routing
    - SSE streaming over HTTP POST with async generator yield
    - Fire-and-forget indexing hook inside flushBuffer
    - Dynamic import() for all ESM-only LangGraph/LangChain packages

key_files:
  created:
    - backend/src/lib/qaGraph.ts
  modified:
    - backend/src/routes/meetingQa.ts
    - backend/src/index.ts

decisions:
  - Relevance threshold set to 0.35 (per phase_architecture) — gradeRoute returns retrieve_recent when top similarity < 0.35
  - SSE via POST (not GET) — question/meetingId sent in body, ReadableStream on client handles streaming
  - warmUpEmbedder() and warmUpGraph() both called inside server.listen callback — avoids cold-start on first Q&A request
  - indexTranscriptChunks filters chunks < 20 chars to avoid embedding noise words

metrics:
  duration: 26 minutes
  completed: 2026-04-04
  tasks_completed: 2
  files_modified: 3
---

# Phase 06 Plan 02: LangGraph RAG Graph + SSE Q&A Route Summary

**One-liner:** LangGraph RAG graph streams Groq answers token-by-token via SSE, with pgvector cosine retrieval falling back to recent transcript when similarity < 0.35, and flushBuffer indexes new chunks fire-and-forget.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create LangGraph RAG graph | c5bf8a2 | backend/src/lib/qaGraph.ts |
| 2 | Upgrade meetingQa route to SSE + index hook | 41cce04 | backend/src/routes/meetingQa.ts, backend/src/index.ts |

## What Was Built

### qaGraph.ts — Compiled LangGraph RAG Graph

LangGraph StateGraph with 4 nodes:

- **retrieve**: Embeds user question via `embedText()`, calls `match_transcript_chunks` RPC on Supabase pgvector for top-6 semantic matches
- **grade_relevance**: Pass-through node; conditional edge `gradeRoute` checks `chunks[0].similarity >= 0.35` to decide between `generate` and `retrieve_recent`
- **retrieve_recent**: Fallback — queries `transcript_embeddings` ordered by `created_at DESC`, limit 8; sets similarity=0 on all results
- **generate**: Builds `[Speaker] chunk_text` context string, invokes `ChatGroq(llama-3.1-8b-instant)` with system prompt, returns answer

`streamAnswer` async generator uses `graph.stream({ streamMode: 'messages' })`, yields only tokens from the `generate` node. `warmUpGraph` fires `getRagGraph()` at startup.

All `@langchain/*` imports use `await import()` inside `getRagGraph()` — CommonJS backend safe.

### meetingQa.ts — SSE Streaming Endpoint

Replaced OpenRouter full-transcript POST with SSE streaming POST. Key changes:
- Sets `Content-Type: text/event-stream`, `X-Accel-Buffering: no`, calls `res.flushHeaders()`
- Validates `question` (3-500 chars, required) and `meetingId` (required) — no longer accepts `transcripts` in body
- Streams tokens as `data: {"token":"..."}\n\n`, closes with `data: [DONE]\n\n`
- Handles client disconnect via `req.on('close')` — breaks generator loop
- Error after headers sent: writes error as SSE event, not JSON

### index.ts — Indexing Hook + Warmup

- `indexTranscriptChunks(meetingId, rows)`: filters rows with `text.trim().length >= 20`, embeds batch, inserts to `transcript_embeddings` via Supabase admin client
- Called fire-and-forget inside `flushBuffer` after successful `Transcript.insert(rows)` — never blocks flush
- `warmUpEmbedder()` and `warmUpGraph()` called in `server.listen` callback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 06-01 prerequisite files missing**
- **Found during:** Pre-execution check
- **Issue:** Plan 06-02 depends_on 06-01, but 06-01 had not been executed. `embeddings.ts`, `supabaseAdmin.ts`, and npm packages were missing.
- **Fix:** Executed Plan 06-01 inline — installed 5 npm packages, created `supabaseAdmin.ts` and `embeddings.ts`, created `supabase/migrations/001_vector_store.sql`
- **Files modified:** backend/package.json, backend/src/lib/supabaseAdmin.ts, backend/src/lib/embeddings.ts, supabase/migrations/001_vector_store.sql
- **Commit:** 1340cd4

**2. [Rule 1 - Bug] TypeScript type error in embeddings.ts pipeline call**
- **Found during:** Task 1 verification (npx tsc)
- **Issue:** `pipe(text, { normalize: true })` — `normalize` type incompatible; `output.data` unknown on union return type
- **Fix:** Cast `pipe` as `any` for the call site (consistent with existing codebase `any` usage pattern in complex SDK types)
- **Files modified:** backend/src/lib/embeddings.ts

**3. [Rule 1 - Bug] TypeScript type error in qaGraph.ts stream destructuring**
- **Found during:** Task 1 verification (npx tsc)
- **Issue:** LangGraph `graph.stream()` returns typed iterator that TypeScript resolves as `Uint8Array` iterator in CJS context, making `[messageChunk, metadata]` destructure fail
- **Fix:** Cast destructured tuple to `unknown` first, then to `[{content?}, {langgraph_node?}]`
- **Files modified:** backend/src/lib/qaGraph.ts

## Known Stubs

None — all data flows are wired. The `retrieve_recent` fallback always returns live data from `transcript_embeddings`.

## Self-Check: PASSED

All files confirmed on disk. All commits confirmed in git history.

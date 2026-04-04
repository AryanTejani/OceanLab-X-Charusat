---
phase: 06-live-qa-rag
plan: 01
subsystem: database
tags: [pgvector, embeddings, supabase, transformers, langchain, langgraph, rag]

# Dependency graph
requires: []
provides:
  - Supabase admin client singleton for server-side vector operations
  - Local embedding module using all-MiniLM-L6-v2 (384-dim, zero API cost)
  - pgvector SQL migration with transcript_embeddings table, IVFFlat index, match_transcript_chunks RPC
affects: [06-02, 06-03]

# Tech tracking
tech-stack:
  added:
    - "@xenova/transformers@2.17.2 — local ONNX inference, all-MiniLM-L6-v2 model"
    - "@langchain/langgraph@1.2.7 — graph-based RAG orchestration"
    - "@langchain/core@1.1.39 — peer dep for LangGraph"
    - "@langchain/groq@1.2.0 — ChatGroq with streaming support"
    - "@supabase/supabase-js@2.101.1 — pgvector RPC and bulk insert"
  patterns:
    - "Dynamic import() for ESM-only packages in CJS backend (await import('@xenova/transformers'))"
    - "Singleton pipeline with _initPromise guard to prevent concurrent initialization"
    - "FeaturePipeline interface to narrow complex @xenova/transformers union types"
    - "getSupabaseAdmin() singleton following same pattern as getGroqClient()"

key-files:
  created:
    - "backend/src/lib/supabaseAdmin.ts — Supabase service-role client singleton"
    - "backend/src/lib/embeddings.ts — local embedding module with embedText/embedBatch/warmUpEmbedder"
    - "supabase/migrations/001_vector_store.sql — pgvector table, IVFFlat index, match_transcript_chunks RPC"
  modified:
    - "backend/package.json — 5 new RAG dependencies added"

key-decisions:
  - "Use await import() for @xenova/transformers in CJS backend — top-level import fails at compile time"
  - "FeaturePipeline interface instead of Pipeline type alias to avoid TypeScript overload resolution on complex union"
  - "env.backends.onnx.wasm.numThreads=1 to disable multi-threading (onnxruntime bug #14445)"
  - "vector(384) not extensions.vector(384) — phase_architecture SQL is authoritative"

patterns-established:
  - "Pattern: CJS dynamic import of ESM packages via await import() in async initializer"
  - "Pattern: Singleton with double-guard (_pipeline check + _initPromise check) for race-safe lazy init"

requirements-completed: [QA-01, QA-04]

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 06 Plan 01: RAG Foundation Layer Summary

**pgvector schema + local all-MiniLM-L6-v2 embeddings via @xenova/transformers dynamic import + Supabase admin singleton established for RAG pipeline**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T07:22:45Z
- **Completed:** 2026-04-04T07:26:15Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Installed 5 RAG packages (@xenova/transformers, @langchain/langgraph, @langchain/core, @langchain/groq, @supabase/supabase-js) in backend
- Created Supabase admin client singleton (getSupabaseAdmin) using service-role key, following existing groq.ts singleton pattern
- Created local embedding module with 384-dim output, dynamic import CJS workaround, singleton pipeline, and warmUpEmbedder for server startup pre-warming
- Created pgvector SQL migration with transcript_embeddings table, IVFFlat cosine index, and match_transcript_chunks RPC

## Task Commits

Each task was committed atomically:

1. **Task 1: Install RAG packages + create Supabase admin client + pgvector migration** - `42879fd` (feat)
2. **Task 2: Create local embedding module with singleton pipeline** - `531268a` (feat)

## Files Created/Modified
- `backend/package.json` — added 5 RAG dependencies
- `backend/src/lib/supabaseAdmin.ts` — getSupabaseAdmin() singleton, throws on missing env vars
- `backend/src/lib/embeddings.ts` — embedText (384-dim), embedBatch, warmUpEmbedder; dynamic import of @xenova/transformers
- `supabase/migrations/001_vector_store.sql` — pgvector extension, transcript_embeddings table with vector(384) column, IVFFlat index, match_transcript_chunks RPC

## Decisions Made
- Used a custom `FeaturePipeline` interface rather than `Pipeline` type alias from @xenova/transformers — the library's auto-generated type is a deeply nested union of overloads that TypeScript cannot resolve for `as` casting. The interface directly models the feature-extraction call signature, keeping code clean without `any`.
- `env.backends.onnx.wasm.numThreads = 1` applied per onnxruntime bug #14445 (parallel WASM threads cause crashes in Node.js).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors from @xenova/transformers complex union**
- **Found during:** Task 2 (Create local embedding module)
- **Issue:** The `Pipeline` type alias (ReturnType of pipeline()) resolves to a deeply nested overloaded union. Using it as a callable parameter type causes `Type 'string' is not assignable to type '...'` and `Property 'data' does not exist` errors.
- **Fix:** Replaced `Pipeline` type alias with a `FeaturePipeline` interface that directly models the feature-extraction call signature. Used `as unknown as FeaturePipeline` for the cast from the library-returned type.
- **Files modified:** backend/src/lib/embeddings.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 531268a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Required for TypeScript compilation. No functional change — runtime behavior identical to plan spec.

## Issues Encountered
- @xenova/transformers type definitions expose complex union return types that conflict with direct `as` casting in TypeScript. Resolved via a narrow FeaturePipeline interface.

## User Setup Required
Before plan 06-02 can run, the pgvector migration must be applied manually in Supabase SQL editor:

1. Open Supabase project dashboard → SQL Editor
2. Run `supabase/migrations/001_vector_store.sql` contents
3. Verify: table `transcript_embeddings` exists with `embedding vector(384)` column
4. Verify: function `match_transcript_chunks` is callable via `.rpc()`

Also ensure `.env` contains:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (not anon key)

## Next Phase Readiness
- Plan 06-02 (indexing hook) can now import `getSupabaseAdmin`, `embedBatch` from their respective lib files
- Plan 06-03 (LangGraph RAG route) can import `embedText`, `getSupabaseAdmin` for vector retrieval
- SQL migration must be run in Supabase before any vector operations work

---
*Phase: 06-live-qa-rag*
*Completed: 2026-04-04*

## Self-Check: PASSED

- FOUND: backend/src/lib/supabaseAdmin.ts
- FOUND: backend/src/lib/embeddings.ts
- FOUND: supabase/migrations/001_vector_store.sql
- FOUND: .planning/phases/06-live-qa-rag/06-01-SUMMARY.md
- FOUND: commit 42879fd (Task 1)
- FOUND: commit 531268a (Task 2)

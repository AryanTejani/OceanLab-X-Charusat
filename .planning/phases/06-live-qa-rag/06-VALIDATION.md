---
phase: 6
slug: live-qa-rag
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual + curl/shell scripts (no automated test framework in backend) |
| **Config file** | none |
| **Quick run command** | `cd backend && npx ts-node src/index.ts &` then `curl -N http://localhost:3001/api/meetings/test-id/qa` |
| **Full suite command** | `cd backend && npx tsc --noEmit` (type-check only) |
| **Estimated runtime** | ~10 seconds (type-check) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx tsc --noEmit`
- **After every plan wave:** Run type-check + manual SSE endpoint smoke test
- **Before `/gsd:verify-work`:** Full suite must be green + SSE streams tokens
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | QA-01 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | QA-04 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | QA-01, QA-02 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | QA-03 | type-check + manual | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 3 | QA-01 | manual SSE | `curl -N -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/meetings/$ID/qa -d '{"question":"test"}'` | ❌ W0 | ⬜ pending |
| 06-05-01 | 05 | 3 | QA-01, QA-02 | manual | Browser EventSource test | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/lib/embeddings.ts` — stub with `embedText()` signature
- [ ] `backend/src/lib/qaGraph.ts` — stub with `streamAnswer()` generator signature
- [ ] Verify `@xenova/transformers`, `@langchain/langgraph`, `@langchain/core`, `@langchain/groq` installed in backend

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE streams tokens within 600ms TTFT | QA-01 | Requires running server + live Groq call | Start server, POST question, time first `data:` line |
| retrieve_recent fallback fires when no embeddings exist | QA-03 | Requires empty transcript_embeddings table | Create meeting, ask question before any transcript, verify answer mentions no data |
| Incremental indexing doesn't block flushBuffer | QA-04 | Requires Socket.IO live session | Run live transcription, watch server logs for indexing completing after flush |
| Answer cites speaker names | QA-02 | Requires actual transcript with named speakers | Use pre-seeded transcript, verify response contains speaker name |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

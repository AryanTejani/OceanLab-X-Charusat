# Project Research Summary

**Project:** MeetMind AI — AI Meeting Intelligence Platform
**Domain:** AI meeting insights micro-SaaS (audio transcription + LLM summarization + TTS podcast)
**Researched:** 2026-04-03
**Confidence:** HIGH

## Executive Summary

MeetMind is an AI meeting intelligence platform in a crowded but well-defined category (Otter.ai, Fireflies, Fathom, tl;dv, Granola). The category is mature enough that table-stakes features are well-understood, but the market has a clear gap: no competitor generates a listenable podcast-style audio recap of a meeting. This is MeetMind's primary differentiator and the feature judges will remember. The recommended approach is a Next.js 15 full-stack app on Vercel, with Supabase handling auth, storage, and database, and three external AI APIs handling the intelligence layer: Deepgram for transcription, Groq for LLM inference, and ElevenLabs for text-to-speech. This stack can be scaffolded in hours and deployed for free, making it the right choice for a hackathon.

The core insight pipeline is linear and well-understood: audio capture → transcription → LLM extraction → TTS generation. The architectural challenge is that this pipeline can take 60-180 seconds for a real meeting, which blows past Vercel's serverless timeout if chained in a single function. The research is unambiguous: the pipeline must be split into four separate API routes, each updating a status column in Postgres, with the frontend polling or subscribing via Supabase Realtime. This is the single most important architectural decision and must be established before anything else is built on top of it.

The top risks are operational, not technical. Vercel's 10-second function timeout and ElevenLabs' 10,000-character monthly free-tier cap are both demo-killers if not handled proactively. Both have clear mitigations: the async pipeline pattern eliminates the timeout risk, and pre-generating the podcast audio for the demo eliminates the ElevenLabs quota risk. The security model is straightforward — all API keys stay server-side, Supabase RLS scopes every DB query to the authenticated user, and storage buckets stay private with signed read URLs. These are non-negotiable and must ship in Phase 1.

## Key Findings

### Recommended Stack

The stack is well-matched to the domain and free-tier constraints of a hackathon. Next.js 15 with App Router handles both the UI and the API layer in one codebase, Vercel deploys it with zero configuration, and Supabase provides auth, Postgres, and object storage as a single free-tier service. The three AI services — Deepgram, Groq, ElevenLabs — each have free tiers sufficient for demo purposes. All version compatibility issues are resolved: Next.js 15.x + React 19 + Tailwind 4.x + shadcn/ui (latest CLI) is confirmed as a working combination as of April 2026.

The one stack decision with meaningful risk is ElevenLabs: its 10,000-character/month free tier is tight for a multi-judge demo day. Groq's LLaMA 3.3 70B is the quality choice for summarization but llama-3.1-8b-instant has far higher rate limits and should be used for high-throughput paths during the demo.

**Core technologies:**
- Next.js 15.x: Full-stack framework — App Router enables RSC + API routes in one codebase; no separate backend needed
- Supabase: Auth + Postgres + Storage — three services on one free tier eliminates separate auth, DB, and S3
- Deepgram Nova-3: Speech-to-text — 40x faster than Whisper, ~95% accuracy, 7,200 audio-seconds/hour free
- Groq (llama-3.3-70b-versatile): LLM inference — fastest inference available, 128k context, generous free tier
- ElevenLabs: Text-to-speech — most natural voices available; the "wow factor" for judges
- TypeScript 5.x: Type safety — prevents silent bugs across a multi-API pipeline
- Tailwind 4.x + shadcn/ui: UI layer — CSS-first config, no peer dependency issues

### Expected Features

The category defines the table-stakes floor. Missing any of these makes the product feel broken. The podcast audio recap is the only feature no competitor offers — it is the primary competitive claim and the feature that makes MeetMind memorable. All v1 features have LOW-to-MEDIUM implementation cost relative to their user value.

**Must have (table stakes):**
- User authentication — gate meeting data behind accounts
- Audio file upload — simplest path to first value
- Browser microphone recording — bot-free capture (differentiator vs Otter/Fireflies/Fathom)
- Speech-to-text transcription — the data foundation for all downstream features
- Meeting summary — the primary deliverable users care about
- Action item extraction — closes the meeting-to-execution loop
- Decision detection — distinguishes from a plain summarizer
- Topic timeline — makes meeting structure scannable
- Transcript viewer — lets users verify AI output
- Dashboard with meeting history — manage multiple meetings

**Should have (competitive):**
- AI podcast audio recap (ElevenLabs TTS) — the primary differentiator; no competitor does this
- Chronological topic timeline — makes long meetings navigable
- Processing status indicators — 15-30s AI pipeline feels broken without them
- Speaker diarization (v1.x) — unlocks attributed action items; Deepgram supports it

**Defer (v2+):**
- Team workspaces — requires data model redesign; validate individual user first
- Calendar integrations — OAuth complexity; add after core retention is proven
- Meeting effectiveness score — requires diarization + sufficient meeting history
- Smart follow-up email drafts — valuable but non-trivial; post-hackathon
- Real-time live transcription display — adds WebSocket complexity with low post-meeting value
- Video recording — storage costs balloon; not core to insight generation
- 6,000+ integrations — maintenance burden for funded companies, not a hackathon

### Architecture Approach

The architecture is a four-stage sequential pipeline triggered by the client, with each stage writing its result to Postgres and updating a `status` column that the frontend polls or subscribes to via Supabase Realtime. Audio binary data never passes through Next.js — the client uploads directly to Supabase Storage via signed URLs, bypassing serverless body limits entirely. Groq is called with a single structured prompt that returns all insights (summary, action items, decisions, timeline, podcast script) as one JSON object — one API call instead of four. The ElevenLabs-generated MP3 is stored in Supabase Storage and served via signed read URLs with 1-hour expiry; storage buckets stay private.

**Major components:**
1. Auth + Middleware — Supabase Auth with `@supabase/ssr`; Next.js middleware enforces authentication on all dashboard routes
2. Upload UI + `/api/upload` — client requests a signed URL, uploads audio directly to Supabase Storage, notifies server on completion
3. `/api/transcribe` — reads audio from Supabase Storage, calls Deepgram pre-recorded API, writes transcript to Postgres
4. `/api/analyze` — reads transcript, calls Groq with structured JSON prompt, writes all insight fields to `meeting_insights` table
5. `/api/podcast` — reads podcast script, calls ElevenLabs, uploads MP3 to Supabase Storage, writes path to DB
6. Dashboard — Next.js Server Component fetches all meeting data in one query; Client Components handle Realtime subscription and audio playback

### Critical Pitfalls

1. **Vercel 10-second function timeout kills audio processing** — Split the pipeline into four separate API routes, each completing within timeout. Never chain upload → transcribe → analyze → TTS in one request. Use Next.js `after()` or Supabase Realtime to drive the async chain. Establish this pattern on Day 1 or all downstream features will break in production.

2. **Next.js 1MB body limit blocks audio upload** — Never route audio file binary through Next.js. Generate a Supabase signed upload URL server-side, have the client upload directly to Supabase. This is the only safe pattern for audio files.

3. **ElevenLabs free tier exhausted during demo** — Pre-generate the podcast MP3 for the demo meeting before judging begins. Cap podcast scripts at 2,400 characters. Implement browser `window.speechSynthesis` as a fallback if quota is exhausted.

4. **LLM hallucination in action items and decisions** — Use separate, strict prompts with JSON schema enforcement. Add explicit negative instructions: "Only extract items where a clear commitment was stated." Groq JSON mode enforces structured output and prevents freeform invention.

5. **Groq rate limits during demo day** — Use `llama-3.1-8b-instant` (30,000 TPM) rather than 70B (6,000 TPM) for the demo. Pre-cache results for demo meetings. Implement retry with exponential backoff on 429 responses.

## Implications for Roadmap

Based on research, the build order is dictated by a strict dependency graph: auth and schema must exist before anything can be stored; upload must work before transcription; transcription must work before analysis; analysis must work before the dashboard can render anything meaningful. The podcast generation is last because it is the differentiator but not blocking the core insight loop.

### Phase 1: Foundation — Auth, Schema, and Async Infrastructure

**Rationale:** Every downstream feature depends on auth (RLS policy enforcement), the database schema (status column pattern, separate tables for transcripts and insights), and the async pipeline pattern (signed upload URLs, status polling). Building these correctly on Day 1 eliminates the two most catastrophic pitfalls (Vercel timeout, 1MB upload limit) before any feature is built on top of them. This phase has no external AI API dependencies — it can be completed and tested in isolation.

**Delivers:** Working auth flow, Supabase schema with RLS, signed URL upload to Supabase Storage, meeting status state machine, Vercel deployment with environment variables configured, HTTPS verified for microphone access.

**Addresses:** User authentication, audio file upload (infrastructure layer), dashboard (empty shell).

**Avoids:** Vercel timeout (async pipeline established), 1MB body limit (signed URL pattern), RLS misconfiguration (set up before any user data is stored), HTTPS required for microphone (verify on live URL in this phase).

### Phase 2: Core AI Pipeline — Transcription and Insights

**Rationale:** With the infrastructure in place, the three AI API routes can be built in dependency order: transcribe → analyze. These two routes are the heart of the product — without them, nothing else has meaning. Groq prompt engineering for structured JSON output requires iteration to minimize hallucinations, which is why it needs its own phase. ElevenLabs TTS is deferred to Phase 3 because it is a differentiator, not a blocker, and its free tier limit makes it risky to burn credits during development.

**Delivers:** `/api/transcribe` (Deepgram), `/api/analyze` (Groq with structured JSON: summary, action items, decisions, timeline topics, podcast script), all results persisted to Postgres, status column progresses through the full pipeline.

**Uses:** Deepgram Nova-3 (pre-recorded mode for uploads, Opus/WebM config for browser recordings), Groq llama-3.3-70b-versatile with JSON mode, single structured prompt returning all insight types.

**Implements:** Sequential processing pipeline pattern, structured Groq JSON prompt pattern.

**Avoids:** Deepgram audio format errors (validate WebM encoding, pass correct Deepgram params), Groq rate limits (use 8B model during development, reserve 70B for final testing), LLM hallucination (JSON schema + negative instructions in system prompt), transcript too large (set 45-minute input limit with clear UI warning).

### Phase 3: Dashboard and Podcast — End-to-End Experience

**Rationale:** With the AI pipeline producing results in Postgres, the dashboard can be built to display them. The meeting detail page assembles the components (TranscriptViewer, ActionItemsList, DecisionsList, MeetingTimeline, PodcastPlayer) from data that already exists. The ElevenLabs podcast route (`/api/podcast`) is added in this phase — it reads the `podcast_script` field already written by Phase 2's Groq call, sends it to ElevenLabs, and stores the MP3. This sequencing means ElevenLabs credits are not burned during AI pipeline development.

**Delivers:** Full dashboard (meeting history, meeting detail page with all insight panels), `/api/podcast` (ElevenLabs TTS), podcast audio player, processing status indicators ("Transcribing... Analyzing... Generating recap..."), browser microphone recording via MediaRecorder API.

**Implements:** Podcast audio storage + signed read URL pattern, Supabase Realtime subscription (or polling) for status updates, AudioUploader component with drag-and-drop + mic capture.

**Avoids:** ElevenLabs quota exhaustion (character count check at 2,400 limit, cache MP3 in storage), no progress indicators (step-by-step status UX), podcast audio player without controls (duration + play/pause/seek minimum), missing fallback for ElevenLabs failure (browser `window.speechSynthesis`).

### Phase 4: Polish and Demo Preparation

**Rationale:** A working product still needs error states, edge case handling, security verification, and a pre-cached demo meeting. Research identified a checklist of "looks done but isn't" items that will embarrass in front of judges — this phase systematically addresses them. Pre-generating the demo podcast audio is the highest-priority task in this phase.

**Delivers:** Error state UI for all failure modes (API quota errors, transcription failures, format errors), auth security verification (RLS tested with incognito window), responsive mobile layout, pre-generated demo meeting with cached podcast MP3, "Looks Done But Isn't" checklist completed.

**Avoids:** ElevenLabs quota exhausted mid-demo (pre-cache before judging), Groq 429s during demo (switch to 8B instant model, pre-cache), silent failures when API quota exceeded (explicit 429/401 error handling with human-readable messages), blank screen with no error message on transcription failure.

### Phase Ordering Rationale

- Auth and schema first because Supabase RLS cannot be retrofitted safely — it must be established before any user data is stored.
- Async pipeline infrastructure established in Phase 1 because the Vercel timeout pitfall is a complete rebuild if discovered late — it affects every API route.
- Signed upload URL pattern established in Phase 1 because the 1MB limit blocks all audio processing if not addressed at the foundation.
- ElevenLabs deferred to Phase 3 because its free tier credits are a finite resource — burning them during iteration on Phase 2's Groq prompts is wasteful and risky.
- Demo preparation is its own phase because pre-caching the podcast and verifying the full flow on the live URL are distinct activities from feature development.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Groq prompt engineering):** The structured JSON prompt for simultaneous extraction of summary, action items, decisions, timeline, and podcast script requires prompt iteration. Hallucination prevention with negative instructions and JSON schema enforcement needs validation against real meeting transcripts.
- **Phase 2 (Deepgram browser recording):** The WebM/Opus encoding configuration for MediaRecorder + Deepgram pre-recorded API is a known gotcha with cross-browser variation. May need ffmpeg.wasm as a fallback for problematic audio formats.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Auth + Supabase schema):** Well-documented official Supabase + Next.js 15 guide; `@supabase/ssr` pattern is explicit in official docs.
- **Phase 1 (Signed URL upload):** Official Supabase recommended pattern with code examples in official docs.
- **Phase 3 (Dashboard):** Standard Next.js Server Component + Client Component composition; no novel patterns required.
- **Phase 4 (Demo prep):** Operational checklist, not a technical research problem.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core choices verified against official docs and npm as of April 2026. Version compatibility confirmed. |
| Features | HIGH | Multiple competitor comparisons from 2025-2026 data. Feature landscape is well-defined. |
| Architecture | HIGH | Four-route async pipeline pattern verified against official Supabase, Deepgram, and ElevenLabs docs. Anti-patterns documented with official sources. |
| Pitfalls | HIGH | All critical pitfalls verified against official docs (Vercel timeout limits, Supabase body limits, Deepgram encoding requirements, ElevenLabs free tier). |

**Overall confidence:** HIGH

### Gaps to Address

- **ElevenLabs character limit per request:** The 2,500-character per-request cap is documented in research; the exact behavior (silent truncation vs. API error) should be validated during Phase 3 development with a test request at the limit.
- **Deepgram free tier audio-seconds limit:** The 7,200 audio-seconds/hour free tier limit could be hit during active development with long test recordings. Monitor usage and keep test clips under 15 minutes during Phase 2.
- **Groq context window degradation on long transcripts:** The 128k context window is large enough for most meetings, but quality degradation at the end of long transcripts (not just truncation) is a known LLM behavior. Validate summary quality on 60-minute test recordings before demo day; implement chunked map-reduce if quality is unacceptable.
- **Browser microphone cross-browser compatibility:** MediaRecorder output format varies by browser (Chrome: WebM/Opus, Firefox: WebM/Vorbis, Safari: fragmented MP4). Test on Chrome (primary), then Safari (common among judges on Apple hardware). The `mimeType: 'audio/webm;codecs=opus'` constraint should be set explicitly.

## Sources

### Primary (HIGH confidence)
- [Next.js 15 Release Notes](https://nextjs.org/blog/next-15) — version, App Router status
- [Supabase SSR Auth Guide](https://supabase.com/docs/guides/auth/server-side/nextjs) — `@supabase/ssr`, `getUser()` vs `getSession()`, signed URL upload
- [Deepgram npm (@deepgram/sdk)](https://www.npmjs.com/package/@deepgram/sdk) — version 5.x, Node 18+ requirement
- [Deepgram: Unknown transcription source type discussion](https://github.com/orgs/deepgram/discussions/732) — WebM/Opus encoding gotcha
- [Groq Rate Limits Docs](https://console.groq.com/docs/rate-limits) — free tier TPM limits
- [ElevenLabs Pricing](https://elevenlabs.io/pricing) — free tier 10,000 credits/month
- [Vercel Function Duration](https://vercel.com/docs/functions/configuring-functions/duration) — 10s free tier limit
- [shadcn/ui React 19 Compatibility](https://ui.shadcn.com/docs/react-19) — Next.js 15 + React 19 + Tailwind v4 confirmed
- [Supabase Signed URL Upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) — direct upload pattern
- [ElevenLabs Create Speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) — API structure

### Secondary (MEDIUM confidence)
- [Fathom vs Fireflies.ai vs Otter.ai (2026)](https://genesysgrowth.com/blog/fathom-vs-fireflies-ai-vs-otter-ai) — competitor feature landscape
- [Top 10 AI notetakers in 2026 — AssemblyAI](https://www.assemblyai.com/blog/top-ai-notetakers) — category positioning
- [Inngest: Vercel Long-Running Background Functions](https://www.inngest.com/blog/vercel-long-running-background-functions) — async pipeline pattern
- [Deepgram vs Whisper comparison](https://deepgram.com/learn/whisper-vs-deepgram) — accuracy/speed benchmarks (Deepgram-authored)
- [Granola raises $125M (2026)](https://theaiinsider.tech/2026/03/30/granola-raises-125m-to-expand-ai-meeting-intelligence-and-enterprise-workflows/) — market validation for bot-free recording approach

### Tertiary (LOW confidence)
- [Meeting Summarization with Groq — Medium](https://medium.com/@adarsh179os/meetings-in-minutes-auto-summarize-your-meetings-with-groq-streamlit-3c1291ca6f90) — prompt patterns (community article; patterns confirmed via official Groq docs)
- [Why AI Meeting Summaries Miss Action Items — Alibaba](https://www.alibaba.com/product-insights/why-is-my-ai-meeting-summary-missing-action-items-fixing-llm-hallucination-in-note-taking-tools.html) — hallucination mitigation strategies

---
*Research completed: 2026-04-03*
*Ready for roadmap: yes*

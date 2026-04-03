# Roadmap: MeetMind AI

## Overview

Four phases build the product in strict dependency order. Phase 1 establishes the infrastructure that everything depends on — auth, database schema, async pipeline pattern, and Vercel deployment. Phase 2 builds the working AI pipeline that transforms audio into structured insights. Phase 3 assembles the full user experience — dashboard, podcast audio, and microphone recording — making the product demo-ready. Phase 4 hardens the product against demo-day failure modes and pre-caches the demo meeting so judges see a flawless experience.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Auth, database schema, async infrastructure, and Vercel deployment
- [ ] **Phase 2: Core AI Pipeline** - Audio capture, transcription, and AI insight extraction
- [ ] **Phase 3: Dashboard and Podcast** - Full UI experience with podcast audio and meeting detail views
- [ ] **Phase 4: Polish and Demo Prep** - Error states, edge case hardening, and demo-day preparation

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Core AI Pipeline | 0/TBD | Not started | - |
| 3. Dashboard and Podcast | 0/TBD | Not started | - |
| 4. Polish and Demo Prep | 0/TBD | Not started | - |

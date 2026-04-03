# Requirements: MeetMind AI

**Defined:** 2026-04-03
**Core Value:** Turn any meeting recording into a listenable podcast summary and structured action items — so no one has to re-watch a meeting to know what happened.

## v1 Requirements

Requirements for hackathon launch. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can log in and stay logged in across browser refresh
- [ ] **AUTH-03**: User can log out from any page

### Audio Capture

- [ ] **AUDIO-01**: User can upload a pre-recorded audio file (mp3, wav, m4a, webm)
- [ ] **AUDIO-02**: User can record live audio via browser microphone
- [ ] **AUDIO-03**: User can stop a live recording and trigger processing
- [ ] **AUDIO-04**: Audio files are stored securely in Supabase Storage via signed URLs

### Transcription

- [ ] **TRANS-01**: Uploaded or recorded audio is transcribed to text via Deepgram
- [ ] **TRANS-02**: User can view the full transcript on the meeting detail page
- [ ] **TRANS-03**: Transcription runs asynchronously and user sees processing status

### AI Insights

- [ ] **INSIGHT-01**: System generates a concise meeting summary from the transcript via Groq
- [ ] **INSIGHT-02**: System extracts action items with responsible participants (when mentioned)
- [ ] **INSIGHT-03**: System identifies and lists key decisions made during the meeting
- [ ] **INSIGHT-04**: System generates a chronological topic timeline of major discussion points
- [ ] **INSIGHT-05**: All insights are generated via structured JSON prompts to prevent hallucination

### AI Podcast

- [ ] **PODCAST-01**: System generates a narrative podcast script from the meeting summary
- [ ] **PODCAST-02**: Podcast script is converted to audio via ElevenLabs TTS
- [ ] **PODCAST-03**: User can play the podcast audio summary on the meeting detail page
- [ ] **PODCAST-04**: Podcast audio is cached/stored so it's not regenerated on each view

### Dashboard

- [ ] **DASH-01**: User sees a meeting history list with title, date, and processing status
- [ ] **DASH-02**: User can click a meeting to view full details (transcript, summary, actions, decisions, timeline, podcast)
- [ ] **DASH-03**: Meeting detail page displays all insights in a single organized view
- [ ] **DASH-04**: User can give a meeting a title/name

### Infrastructure

- [ ] **INFRA-01**: Processing pipeline uses async pattern (separate API routes per step) to handle Vercel 10s timeout
- [ ] **INFRA-02**: Audio upload bypasses server body via Supabase signed upload URLs
- [ ] **INFRA-03**: All API keys (Groq, Deepgram, ElevenLabs) are server-side only
- [ ] **INFRA-04**: Application deploys to Vercel with a working live URL

### UI/UX

- [ ] **UI-01**: Interface is responsive and works on mobile browsers
- [ ] **UI-02**: Processing states are clearly indicated (uploading, transcribing, analyzing, generating podcast)
- [ ] **UI-03**: UI uses Tailwind CSS + Watermelon UI for a polished, modern look (hackathon sponsor bonus)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Search & Retrieval

- **SEARCH-01**: User can search across all meeting transcripts via full-text search
- **SEARCH-02**: Search results highlight matching text in transcript

### Advanced Features

- **ADV-01**: Speaker diarization identifies who said what
- **ADV-02**: Interactive timeline with audio jump-to-moment
- **ADV-03**: Meeting effectiveness score (decision ratio, action items per minute)
- **ADV-04**: Smart follow-up email drafts for unresolved questions
- **ADV-05**: Meeting comparison across recurring meetings
- **ADV-06**: Export meeting data as Markdown or JSON

### Team & Collaboration

- **TEAM-01**: Team workspaces with shared meeting access
- **TEAM-02**: Role-based permissions for team members

### Monetization

- **PAY-01**: Freemium tier gating (3 meetings/month free)
- **PAY-02**: Stripe payment integration for Pro plan
- **PAY-03**: Usage tracking and billing dashboard

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time live transcription display | Anti-feature: adds WebSocket complexity, distracts during meetings; MeetMind is post-meeting insight |
| Video recording/processing | Storage costs balloon; audio-only covers the insight use case |
| Calendar integrations | OAuth complexity; manual upload validates the core loop first |
| 6000+ integrations (Slack, Jira, etc.) | Integration maintenance is a full-time job; export covers 80% |
| Collaborative real-time note editing | CRDT/conflict resolution complexity; share read-only links instead |
| Native mobile app | Responsive web covers 90% of mobile use; PWA if needed |
| Sentiment analysis per speaker | Requires diarization + noisy results; use topic-level tone notes instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUDIO-01 | Phase 2 | Pending |
| AUDIO-02 | Phase 2 | Pending |
| AUDIO-03 | Phase 2 | Pending |
| AUDIO-04 | Phase 1 | Pending |
| TRANS-01 | Phase 2 | Pending |
| TRANS-02 | Phase 2 | Pending |
| TRANS-03 | Phase 2 | Pending |
| INSIGHT-01 | Phase 2 | Pending |
| INSIGHT-02 | Phase 2 | Pending |
| INSIGHT-03 | Phase 2 | Pending |
| INSIGHT-04 | Phase 2 | Pending |
| INSIGHT-05 | Phase 2 | Pending |
| PODCAST-01 | Phase 3 | Pending |
| PODCAST-02 | Phase 3 | Pending |
| PODCAST-03 | Phase 3 | Pending |
| PODCAST-04 | Phase 3 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after roadmap creation — all 30 requirements mapped*

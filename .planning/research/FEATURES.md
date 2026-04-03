# Feature Research

**Domain:** AI Meeting Intelligence / Meeting Insights Platform
**Researched:** 2026-04-03
**Confidence:** HIGH (multiple competitor sources, 2025-2026 data)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Audio transcription (speech-to-text) | Every competitor has it; it's the entry point of the entire category | MEDIUM | Deepgram (already in stack) handles this well; ~95% accuracy is the bar Otter.ai sets |
| Meeting summary / TL;DR | Users explicitly refuse to re-read full transcripts; summary is the actual deliverable | MEDIUM | Groq LLM (already in stack) — keep summaries concise, not verbose |
| Action item extraction | Post-meeting execution is the most critical downstream need; missing this breaks the loop | MEDIUM | Must assign to named participants where detectable; context-aware extraction via LLM |
| Decision tracking | Decisions are distinct from action items and users treat them differently; Fathom and Fireflies both surface these separately | MEDIUM | Extract from transcript via LLM prompt; label as decisions not tasks |
| Audio file upload | Many users record meetings offline or export from Zoom; upload-first is often the simpler path to first value | LOW | Already in scope; Supabase storage covers this |
| Transcript viewer | Users want to verify AI output and search specific quotes; raw transcript is the source of truth | LOW | Simple UI component; pair with search/highlight |
| User authentication | Required to persist meetings and protect private conversation data | LOW | Supabase Auth (already in stack) |
| Search across transcripts | Users need to find "what was decided about X" across past meetings | MEDIUM | Full-text search via Postgres; not semantic search at this stage |
| Dashboard / meeting history | Users need to manage multiple meetings; a list view with metadata is required | LOW | Simple CRUD; meetings list with status, date, title |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI Podcast-style audio summary (TTS) | No competitor does this — turns a meeting into a listenable 2-3 min audio recap you can consume on a walk; judges will remember it | HIGH | ElevenLabs (already in stack); script the summary as a narrative, not a bullet list; this is MeetMind's #1 differentiator |
| Chronological topic timeline | Makes long meetings navigable — users can see the "shape" of a meeting at a glance | MEDIUM | Segment transcript by topic via LLM; render as vertical timeline UI |
| Interactive timeline with audio jump | Click a topic and jump to that moment in the audio recording; competitors (tl;dv) do video clips, not audio jump | HIGH | Requires audio timestamp indexing and a custom audio player; v1.x or v2 feature |
| Speaker diarization (who said what) | Unlocks attribution in action items and decisions; makes summaries dramatically more useful | HIGH | Deepgram supports diarization; adds significant prompt complexity; flag for v1.x |
| Meeting effectiveness score | Rates meeting quality (decision ratio, action items per minute, talk balance); provides a meta-insight no basic tool offers | HIGH | Post-v1; requires speaker diarization and sufficient meeting history to be meaningful |
| Smart follow-up drafts | AI detects unresolved questions and drafts follow-up email copy; closes the loop without extra work | HIGH | Post-v1; requires question detection + email template generation |
| Browser microphone recording | Captures live meetings without a bot joining the call; Granola's biggest selling point is bot-free recording | MEDIUM | Already in scope; important privacy differentiator vs Otter/Fireflies bot approach |
| Meeting comparison across recurrences | Compare decisions and action items across weekly standups or recurring 1-on-1s | HIGH | Requires meeting series concept + cross-meeting LLM analysis; v2 feature |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time live transcription display | "See words appear as you speak" looks impressive in demos | Adds WebSocket complexity, race conditions, and distraction during the meeting; MeetMind's model is post-meeting insight, not in-meeting distraction | Process after recording ends; keep UI focused on post-meeting value |
| Calendar integrations (Google Calendar, Outlook) | Auto-import meetings, auto-join scheduling | OAuth scope complexity, webhook maintenance, platform policy changes — Fathom was Zoom-only for a long time for this reason | Manual upload or URL-based import; add calendar sync in v2 after validating core |
| Video recording and processing | "I want to see the video too" | Storage costs balloon fast (1hr video = ~500MB-1GB); transcoding pipeline complexity; not core to insight generation | Audio-only for v1; storage is cheap, compute is not; video is a v2 upgrade with monetization |
| Collaborative real-time note editing | "Let my team edit the summary together" | Operational transforms (CRDTs) or Supabase real-time + conflict resolution is a significant engineering surface; only ~20% of users need this | Share a read link; allow export to Notion/Docs where collaborative editing is native |
| Team workspaces with permissions | "Share meetings with my org" | Data model complexity multiplies (orgs, roles, ACLs, shared storage); breaks the individual-user simplicity of v1 | Single-user first; add team workspaces in v2 with a deliberate data model |
| Sentiment analysis per speaker | "How did the client feel during the call?" | Requires speaker diarization first; sentiment models on meeting audio are notoriously noisy; high false positive rate | Provide topic-level tone notes via LLM summary instead |
| 6,000+ integrations | Fireflies advertises this; users request Slack, Jira, Notion, Salesforce | Integration maintenance is a full-time job; each integration can break independently; this is a moat for funded companies not a hackathon deliverable | Provide structured JSON/Markdown export; let users paste into their tools |
| Native mobile app | "I want this on my phone" | Separate build target, app store approval, push notifications; web-first covers 90% of the use case | Responsive web design covers mobile; PWA if needed |

## Feature Dependencies

```
[Audio File Upload] ──or──> [Browser Mic Recording]
    └──requires──> [Audio Storage (Supabase)]
                       └──requires──> [User Auth]

[Transcription (Deepgram)]
    └──requires──> [Audio Capture/Upload]
    └──produces──> [Raw Transcript]

[Raw Transcript]
    └──enables──> [Meeting Summary (Groq)]
    └──enables──> [Action Item Extraction (Groq)]
    └──enables──> [Decision Detection (Groq)]
    └──enables──> [Topic Timeline (Groq)]
    └──enables──> [Transcript Viewer UI]
    └──enables──> [Full-text Search]

[Meeting Summary]
    └──enables──> [AI Podcast Audio (ElevenLabs)]

[Topic Timeline]
    └──enhances──> [Interactive Timeline with Audio Jump] (v1.x)

[Speaker Diarization]
    └──enhances──> [Action Items] (attributed to speakers)
    └──enables──> [Meeting Effectiveness Score] (v2)
    └──enables──> [Sentiment Analysis per Speaker] (v2, anti-feature territory)

[Dashboard / Meeting History]
    └──requires──> [User Auth]
    └──requires──> [Audio Storage]

[AI Podcast Audio]
    └──requires──> [Meeting Summary]
    └──requires──> [ElevenLabs TTS API]
```

### Dependency Notes

- **Transcription requires Audio Capture/Upload:** No audio = no transcript = no insight pipeline works. Audio is the root dependency of the entire value chain.
- **AI Podcast requires Meeting Summary:** The TTS script is derived from the summary; can't generate audio without a well-formed summary to narrate.
- **Topic Timeline enables Interactive Audio Jump:** The jump feature is an enhancement of the timeline; build timeline first, add scrubbing in v1.x.
- **Speaker Diarization unlocks a tier of features:** Many v2 features (effectiveness score, attributed action items) block on diarization being solved first. Deepgram supports it but prompt engineering grows significantly.
- **Team Workspaces conflicts with Individual User model:** Adding org-level permissions requires a different data model; attempting this in v1 adds complexity without validating the core insight loop first.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept and impress hackathon judges.

- [ ] User authentication — gate all meeting data behind an account
- [ ] Audio file upload — simplest path to first value; no bot, no setup
- [ ] Browser microphone recording — bot-free live capture (differentiator)
- [ ] Speech-to-text transcription (Deepgram) — raw transcript is the data foundation
- [ ] Meeting summary via Groq LLM — the primary deliverable users care about
- [ ] Action item extraction — closes the loop between meeting and execution
- [ ] Decision detection — differentiates from a simple summarizer
- [ ] Topic timeline — makes meeting structure scannable; supports the "insight" narrative
- [ ] AI podcast audio recap (ElevenLabs) — the wow factor; unique in the market; judges will remember this
- [ ] Dashboard with transcript viewer + timeline + decisions + action items + podcast playback
- [ ] Responsive UI

### Add After Validation (v1.x)

Features to add once core pipeline is working and user feedback is gathered.

- [ ] Speaker diarization — adds attribution to action items; triggers: users complain "who owns what"
- [ ] Interactive timeline with audio jump — triggers: users say they want to re-listen to specific parts
- [ ] Full-text search across meetings — triggers: users have more than ~5 meetings and need retrieval
- [ ] Export (Markdown/JSON) — triggers: users want to paste output into Notion/Docs

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Team workspaces — defer: requires deliberate data model redesign; individual-first validates the insight loop
- [ ] Calendar integrations — defer: OAuth complexity; add after core retention is proven
- [ ] Meeting effectiveness score — defer: requires speaker diarization + enough meeting history
- [ ] Smart follow-up email drafts — defer: valuable but non-trivial; add post-hackathon
- [ ] Meeting comparison across recurrences — defer: requires meeting series concept + v2 data model
- [ ] Monetization / payments — defer: post-hackathon freemium model

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Audio upload + transcription | HIGH | LOW | P1 |
| Meeting summary | HIGH | LOW | P1 |
| Action item extraction | HIGH | LOW | P1 |
| Decision detection | HIGH | LOW | P1 |
| User auth + dashboard | HIGH | LOW | P1 |
| AI podcast audio summary | HIGH | MEDIUM | P1 |
| Browser microphone recording | MEDIUM | MEDIUM | P1 |
| Topic timeline | MEDIUM | MEDIUM | P1 |
| Transcript viewer | MEDIUM | LOW | P1 |
| Speaker diarization | HIGH | HIGH | P2 |
| Interactive audio jump | MEDIUM | HIGH | P2 |
| Full-text search | MEDIUM | LOW | P2 |
| Markdown/JSON export | LOW | LOW | P2 |
| Meeting effectiveness score | MEDIUM | HIGH | P3 |
| Calendar integrations | MEDIUM | HIGH | P3 |
| Team workspaces | HIGH | HIGH | P3 |
| Smart follow-up drafts | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for hackathon launch
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Otter.ai | Fireflies.ai | Fathom | tl;dv | Granola | MeetMind Approach |
|---------|----------|-------------|--------|-------|---------|------------------|
| Transcription | YES (~95% accuracy) | YES (~90-93%) | YES (~92%) | YES | YES | Deepgram (on par or better) |
| Meeting summary | YES | YES | YES (concise, focused) | YES | YES | Groq LLM; concise + narrative-ready |
| Action items | YES | YES | YES (with assignees) | YES | YES | LLM extraction with participant attribution |
| Decision tracking | YES | YES | YES | Partial | Partial | Explicit LLM prompt for decisions |
| Bot-free recording | NO (bot joins) | NO (bot joins) | NO (bot joins) | NO (bot joins) | YES (device audio) | YES — browser mic capture is bot-free |
| Podcast audio recap | NO | NO | NO | NO | NO | YES — primary differentiator (ElevenLabs) |
| Timeline view | Partial | Partial | NO | YES (video clips) | NO | YES — topic-based chronological timeline |
| Interactive jump-to-moment | NO | NO | NO | YES (video) | NO | v1.x — audio scrubbing to topic |
| Speaker diarization | YES | YES | YES | YES | Partial | v1.x — Deepgram supports it |
| Cross-meeting search | YES | YES | YES (natural language) | YES | NO | v1.x — Postgres full-text first |
| 6000+ integrations | Partial | YES (6,000+) | YES | YES (6,000+) | NO | Export only — no maintenance burden |
| Team workspaces | YES | YES | YES (team plan) | YES | YES (Spaces) | v2 — individual-first |

## Sources

- [Fathom vs Fireflies.ai vs Otter.ai — A Complete Guide (2026)](https://genesysgrowth.com/blog/fathom-vs-fireflies-ai-vs-otter-ai)
- [Otter.ai vs Fireflies.ai vs Fathom vs MeetGeek vs tl;dv (2026)](https://www.usecarly.com/blog/otter-vs-fireflies-vs-fathom)
- [Top 10 AI notetakers in 2026 — AssemblyAI](https://www.assemblyai.com/blog/top-ai-notetakers)
- [Top 7 meeting intelligence platforms in 2026 — AssemblyAI](https://www.assemblyai.com/blog/meeting-intelligence-platforms)
- [Fathom vs tl;dv (2026)](https://thebusinessdive.com/fathom-vs-tldv)
- [Granola AI Review — tl;dv (2026)](https://tldv.io/blog/granola-review/)
- [Granola raises $125M to expand AI meeting intelligence (2026)](https://theaiinsider.tech/2026/03/30/granola-raises-125m-to-expand-ai-meeting-intelligence-and-enterprise-workflows/)
- [Best AI Meeting Assistants 2026 — Krisp](https://krisp.ai/blog/best-ai-meeting-assistant/)
- [Granola's Revolutionary AI Strategy — bot-free approach analysis](https://michaelgoitein.substack.com/p/granolas-revolutionary-ai-strategy)
- [Speaker Diarization guide 2025 — MarkTechPost](https://www.marktechpost.com/2025/08/21/what-is-speaker-diarization-a-2025-technical-guide-top-9-speaker-diarization-libraries-and-apis-in-2025/)

---
*Feature research for: AI Meeting Intelligence Platform (MeetMind)*
*Researched: 2026-04-03*

# MeetMind AI

## What This Is

MeetMind AI is an intelligent meeting insights platform that transforms unstructured meeting conversations into structured, actionable outputs. Users upload or record meeting audio, and the system automatically generates transcripts, summaries, action items, decisions, interactive timelines, and AI-generated podcast recaps. Built as a micro-SaaS targeting individual professionals first, with team features planned for later.

## Core Value

Turn any meeting recording into a listenable podcast summary and structured action items — so no one has to re-watch a meeting to know what happened.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Audio capture via browser microphone (live recording)
- [ ] Audio file upload (pre-recorded meetings)
- [ ] Speech-to-text transcription (Deepgram / Whisper)
- [ ] AI-generated meeting summary from transcript (Groq LLM)
- [ ] Automatic action item extraction with responsible participants
- [ ] Decision detection and tracking
- [ ] Chronological meeting timeline with major discussion topics
- [ ] AI-generated podcast-style audio summary (ElevenLabs / Google TTS)
- [ ] Dashboard with transcript viewer, timeline, decisions, action items, podcast playback
- [ ] Simple authentication (email/password or OAuth)
- [ ] Responsive, intuitive UI

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Payments / monetization — planned for post-hackathon (freemium model: free tier 3 meetings/month, paid for unlimited + premium features)
- Team workspaces / shared meeting access — start with individual users, add team features in v2
- Real-time collaborative editing of meeting notes — not core to the insight-generation value
- Calendar integrations (Google Calendar, Outlook) — v2 feature
- Video recording / processing — audio-only for v1
- Mobile native app — web-first, responsive design covers mobile

## Future Differentiators (Post-v1)

These features are documented for future builds after the initial platform ships:

- **Interactive Timeline with Audio Jump** — click a topic on the timeline and jump to that moment in the audio
- **Smart Follow-ups** — AI detects unresolved questions and generates follow-up email drafts
- **Meeting Effectiveness Score** — rates meetings on decision ratio, action items per minute, participation balance
- **Speaker Diarization** — identify who said what in multi-speaker meetings
- **Meeting Comparison** — compare decisions/action items across recurring meetings

## Future Monetization (Post-Hackathon)

- **Free tier:** 3 meetings/month, basic summaries
- **Pro ($9-19/month):** Unlimited meetings, podcast summaries, advanced timeline
- **Team plans:** Shared workspaces, team analytics (later)

## Context

- This is a hackathon project with a tight deadline (today/tomorrow) — speed of shipping is critical
- Existing code for parts of this platform already exists and will be brought into this repo
- The AI podcast summary is the primary differentiator that makes MeetMind stand out to judges
- Individual users first, team features later
- Deployment target: Vercel (free tier, live URL for judges)

## Constraints

- **Timeline**: Hackathon deadline is today/tomorrow — must ship a working demo fast
- **Budget**: Free-tier APIs only (Groq free, Deepgram free tier, ElevenLabs free tier)
- **Stack**: Next.js (App Router) + Tailwind + shadcn/ui, Supabase (auth + Postgres + storage), Groq (LLM), Deepgram (STT), ElevenLabs (TTS)
- **Deployment**: Vercel free tier
- **Existing Code**: User has partial implementation that will be integrated — polish and complete, not rebuild from scratch

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router fullstack | Single deployable app, fastest for hackathon, Vercel-native | — Pending |
| Supabase for auth + DB + storage | Free tier covers hackathon needs, built-in auth, real-time capable | — Pending |
| Groq as LLM provider | Blazing fast inference, free tier, great for live demos | — Pending |
| Deepgram for speech-to-text | High accuracy, real-time streaming support, free tier | — Pending |
| ElevenLabs for podcast TTS | Natural-sounding voices, the "wow factor" for judges | — Pending |
| AI Podcast as v1 differentiator | Unique feature no competitor has — judges will remember this | — Pending |
| Skip monetization for v1 | Ship fast for hackathon, add payments post-event | — Pending |
| Individual users first | Simpler auth/data model, team features in v2 | — Pending |

---
*Last updated: 2026-04-03 after initialization*

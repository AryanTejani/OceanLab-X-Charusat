# Tech Stack — AI Meeting Notetaker

Full breakdown of every tool in the stack, why it was chosen, what it does, and how it fits in the system.

---

## Frontend — Next.js 14

**What it does:** Serves the entire user-facing application — auth pages, dashboard, meeting history, per-meeting transcript/MoM view.

**Why Next.js:**
- App Router gives file-based routing with server components, which keeps the dashboard fast without a separate API server for simple reads
- API Routes (`/app/api/...`) handle webhooks from Attendee.dev and Deepgram without needing a separate Express server
- Works seamlessly with Supabase Auth helpers
- Deployable to Vercel for free

**Key pages:**
```
/                        Landing / sign-in
/dashboard               Meeting history overview
/meetings/[id]           Per-meeting view (transcript, MoM, action items)
/settings                Calendar connection management
/api/webhooks/attendee   Receives bot completion webhook from Attendee.dev
/api/cron/sync-calendar  Called by cron to poll calendar events
```

---

## Auth + Database + Storage — Supabase

Supabase replaces three separate services at once.

### Supabase Auth
**What it does:** Handles user sign-up, login, session management, and third-party OAuth.

**Used for:**
- Email + password login for the app itself
- Google OAuth — used to get a Google Calendar access token for the user
- Microsoft OAuth — used to get a Microsoft Graph access token for the user

**Important:** The OAuth tokens returned from Google and Microsoft for calendar access are stored in the `calendar_connections` table, not managed by Supabase Auth itself. Supabase Auth just handles the initial OAuth handshake and user identity.

### Supabase Postgres
**What it does:** Primary relational database for all app data.

**Tables:**
```
users                   Managed by Supabase Auth
calendar_connections    OAuth tokens per provider per user
meetings                One row per meeting the bot has joined or is scheduled to join
transcripts             Full raw transcript text, linked to meeting
meeting_summaries       AI-generated summary, MoM, and action items (action_items stored as JSONB)
```

### Supabase Storage
**What it does:** Object storage for raw audio/video files returned by Attendee.dev.

**Bucket:** `meeting-recordings`
Each file is stored as `{user_id}/{meeting_id}/recording.webm` and is private (accessed only via signed URL).

---

## Meeting Bot — Attendee.dev

**What it does:** Sends a bot into a Zoom, Google Meet, or Microsoft Teams meeting via a meeting URL. The bot records the audio, then triggers a webhook when the meeting ends.

**Why Attendee.dev:**
- Open source (MIT), free hosted tier available
- Simple REST API — one POST request to launch a bot
- Returns audio + basic transcript data via webhook
- Built on Django + Postgres + Redis, battle-tested

**How it's used:**
1. When a meeting is detected in the user's calendar, your backend calls:
   ```
   POST https://app.attendee.dev/api/v1/bots
   { "meeting_url": "...", "bot_name": "Notetaker" }
   ```
2. Attendee.dev joins the meeting and records it
3. When the meeting ends, Attendee sends a webhook to your `/api/webhooks/attendee` endpoint with the recording URL and basic transcript

**Limitations:**
- Cannot join meetings that require sign-in authentication (e.g. company-only Zoom rooms)
- Does not have built-in calendar sync — you handle that yourself (see Calendar Sync section)

---

## Transcription — Deepgram

**What it does:** Converts the raw meeting audio into a full text transcript.

**Why Deepgram:**
- 400 hours free on sign-up, no credit card required
- Very fast — processes audio at ~30x real time
- Returns word-level timestamps and speaker labels (diarization)
- Simple SDK: one function call with an audio URL

**Flow:**
1. Attendee.dev webhook delivers the recording URL
2. Your backend calls Deepgram with that URL:
   ```js
   const { result } = await deepgram.listen.prerecorded.transcribeUrl(
     { url: recordingUrl },
     { model: 'nova-2', smart_format: true, diarize: true }
   )
   ```
3. Full transcript is saved to the `transcripts` table in Supabase

---

## AI Layer — Groq (Llama 3.1)

**What it does:** Takes the raw transcript and generates a structured meeting summary, meeting minutes, and action items.

**Why Groq:**
- Free tier, no credit card required
- Llama 3.1 70B is very capable for summarization tasks
- Extremely fast inference — results in under 5 seconds for a typical meeting transcript
- Simple OpenAI-compatible SDK

**Prompt structure:**
```
System: You are a meeting assistant. Given a raw meeting transcript, return a JSON object with three keys:
  - summary: string (3–5 sentence overview)
  - mom: string (markdown-formatted meeting minutes with sections)
  - action_items: array of { task, owner, due_date }

User: [full transcript text]
```

The JSON output is validated with Zod and stored in `meeting_summaries.action_items` as JSONB.

---

## Calendar Sync — Google Calendar API + Microsoft Graph API

**What it does:** Reads the user's upcoming calendar events, finds ones that contain meeting links, and schedules bots accordingly.

**Why not Recall.ai's calendar integration:**
- Recall.ai's calendar feature is on paid plans
- Google Calendar API and Microsoft Graph API are both completely free
- Building your own sync gives you full control over which meetings to join

**How it works:**
- A cron job runs every 15 minutes via `/api/cron/sync-calendar`
- For each user with a connected calendar, it fetches events in the next 24 hours
- Events are scanned for Zoom, Meet, or Teams URLs in the description or location field
- If a URL is found and no bot is already scheduled, a new bot is queued via Attendee.dev
- The `meetings` table is updated with `status: scheduled`

Full implementation detail is in `calendar-extraction-guide.md`.

---

## Hosting

### Frontend — Vercel
- Free tier, unlimited deployments
- Automatic HTTPS, CDN, serverless functions for API routes
- Connect GitHub repo → auto-deploy on push

### Backend Cron — Railway
- Free trial tier (500 hours/month)
- Used to run the calendar polling cron job on a schedule
- Alternatively, use Vercel Cron Jobs (free on Hobby plan, up to 2 cron jobs)

---

## Architecture Diagram

```
User Browser
     │
     ▼
Next.js (Vercel)
     │
     ├──── Supabase Auth ──── Google/Microsoft OAuth
     │
     ├──── Supabase Postgres (meetings, transcripts, summaries)
     │
     ├──── Supabase Storage (audio recordings)
     │
     ├──── /api/cron/sync-calendar (every 15 min)
     │         │
     │         ├── Google Calendar API → extract meeting URLs
     │         ├── Microsoft Graph API → extract meeting URLs
     │         └── Attendee.dev → schedule bot
     │
     └──── /api/webhooks/attendee (on meeting end)
               │
               ├── Deepgram → transcribe audio
               └── Groq → generate MoM + action items
                       │
                       └── Supabase → save results → Dashboard
```

---

## Cost Summary

| Service | Free Tier | Limit |
|---|---|---|
| Vercel | Free | 100GB bandwidth/month |
| Supabase | Free | 500MB DB, 1GB storage, 50k MAU |
| Attendee.dev | Free hosted | Community support |
| Deepgram | Free | 400 hours transcription |
| Groq | Free | Rate limited, sufficient for hackathon |
| Google Calendar API | Free | 1M requests/day |
| Microsoft Graph API | Free | Generous limits |
| Railway | Free trial | 500 hours/month |
| **Total** | **$0** | |

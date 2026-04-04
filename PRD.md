# Product Requirements Document — AI Meeting Notetaker

## Overview

An Otter.ai-style AI meeting assistant that automatically joins a user's scheduled meetings (Zoom, Google Meet, Microsoft Teams) without any manual link pasting. After each meeting, it generates a full transcript, meeting minutes (MoM), and action items — all surfaced in a clean dashboard.

**Hackathon scope:** Core bot join + transcript + AI summary flow, end to end.

---

## Problem Statement

Professionals lose hours each week manually taking notes in meetings, then more hours writing summaries and chasing action items. Existing tools like Otter.ai either require manual setup per meeting or are paywalled. There is no zero-friction, open-source-first alternative that auto-joins from a user's calendar and delivers AI-structured output.

---

## Target Users

- Professionals who attend 3+ meetings per week
- Remote-first teams who need async meeting records
- Founders, PMs, and engineers who want action items tracked automatically

---

## Goals

1. User connects their calendar once — bot auto-joins all future meetings from that point.
2. Every joined meeting produces a full transcript, structured MoM, and action items.
3. All meeting history is searchable and organized in a dashboard.
4. Zero cost to operate at hackathon/MVP scale.

---

## Non-Goals (Out of Scope for Hackathon)

- Mobile app
- Real-time in-meeting transcript display
- CRM or Slack integrations
- Speaker diarization (nice to have, not required)
- Custom bot persona / avatar

---

## Core Features

### 1. Authentication
- Email + password sign up / login via Supabase Auth
- Google OAuth (used for Google Calendar connection)
- Microsoft OAuth (used for Outlook/Teams calendar connection)

### 2. Calendar Integration
- User connects Google Calendar and/or Outlook after sign-up
- App reads upcoming events via Google Calendar API and Microsoft Graph API
- Detects events containing Zoom, Google Meet, or Teams links
- Schedules a bot for each detected event, 2 minutes before start time
- Handles rescheduled and cancelled events by updating or removing the scheduled bot

### 3. Meeting Bot (Auto-join)
- Attendee.dev bot joins the meeting at the scheduled time
- Bot is named something branded (e.g. "Notetaker" or app name)
- Waits in lobby if applicable; joins once admitted
- Records audio for the duration of the meeting
- Leaves automatically when the meeting ends

### 4. Transcription
- Raw audio from Attendee.dev is sent to Deepgram for transcription
- Full transcript is stored in Supabase Postgres
- Transcript is linked to the calendar event metadata (title, attendees, date)

### 5. AI Processing
- Transcript is sent to Groq (Llama 3.1) with a structured prompt
- Output includes:
  - Meeting summary (3–5 sentences)
  - Full meeting minutes (MoM) with sections: Overview, Discussion Points, Decisions Made
  - Action items list with owner name (if mentioned) and due date (if mentioned)
- All output stored in Supabase and shown in dashboard

### 6. Dashboard
- List of all past meetings with title, date, and duration
- Per-meeting view: summary, full transcript, MoM, action items
- Simple search across transcripts
- Calendar connection status and upcoming scheduled bots

---

## User Flow

```
Sign up → Connect Google/Outlook calendar → App detects upcoming meetings
→ Bot auto-joins each meeting → Transcript generated post-meeting
→ AI processes transcript → Dashboard shows MoM + action items
```

---

## Data Model (High Level)

| Table | Key Fields |
|---|---|
| users | id, email, created_at |
| calendar_connections | id, user_id, provider (google/microsoft), access_token, refresh_token |
| meetings | id, user_id, calendar_event_id, title, start_time, end_time, platform, meeting_url, bot_id, status |
| transcripts | id, meeting_id, raw_text, created_at |
| meeting_summaries | id, meeting_id, summary, mom, action_items (JSON), created_at |

---

## Success Metrics (Hackathon Demo)

- Bot successfully joins a live meeting automatically from calendar
- Full transcript is generated within 2 minutes of meeting ending
- MoM and action items are visible in the dashboard
- End-to-end flow works for at least Google Meet + Zoom

---

## Tech Stack Summary

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Auth + DB + Storage | Supabase |
| Meeting Bot | Attendee.dev |
| Transcription | Deepgram |
| AI (MoM, action items) | Groq (Llama 3.1) |
| Calendar (Google) | Google Calendar API |
| Calendar (Microsoft) | Microsoft Graph API |
| Hosting | Vercel (frontend) + Railway (backend/cron) |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Bot gets stuck in lobby | Set a max wait time; mark meeting as "unable to join" |
| Calendar OAuth token expires | Use refresh token flow; re-prompt user if refresh fails |
| Deepgram free tier exhausted | Fall back to Groq Whisper or flag in dashboard |
| Meeting URL not found in calendar event | Skip the event; show "no meeting link found" in dashboard |
| Attendee.dev downtime | Show status badge; retry bot dispatch up to 3 times |

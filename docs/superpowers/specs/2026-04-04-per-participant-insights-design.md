# Per-Participant Personalized Insights Design

**Date:** 2026-04-04  
**Branch:** feat/single-person-transcribe  
**Status:** Approved

---

## Problem

Currently, insights (summary, action items, decisions) are generated for the entire meeting as a whole. Participants have no way to see only what is relevant to them — their own action items, what they said, or what they need to follow up on. There is also no mechanism to notify participants of their responsibilities after the meeting ends.

---

## Goal

Add per-participant personalized insights — surfaced in the existing UI via a toggle, and emailed to each participant automatically after generation.

---

## Data Model

### New interface (`backend/src/entities/Meeting.ts`)

```ts
export interface IParticipantInsight {
  speakerId: string;     // Clerk userId — invisible unique key, prevents same-name collisions
  speakerName: string;   // display name from transcript
  email?: string;        // fetched from Clerk at generation time
  summary: string;       // personalized summary of their contributions
  actionItems: string[]; // action items attributed to or assigned to this participant
  keyNotes: string[];    // key points they raised or must know
  emailSent: boolean;    // true once Nodemailer dispatch succeeds
}
```

### New column on `Meeting` entity

```ts
@Column({ type: 'jsonb', default: [] })
participantInsights!: IParticipantInsight[];
```

No new table. `synchronize: true` auto-migrates in dev. TypeORM adds the column on next restart.

---

## Backend Pipeline

### Route: `POST /api/insights/generate`

**Call 1 — unchanged:** Existing meeting-wide Groq prompt produces `summary`, `actionItems`, `decisions`, `timeline`, `keyTopics`.

**Call 2 — new (batch all-participants):** Immediately after Call 1, a second Groq call is made.

Prompt structure:
```
For each speaker listed below, analyze only their utterances and produce a JSON object with:
{
  "participantInsights": [
    {
      "speakerId": "<clerk_user_id>",
      "speakerName": "<name>",
      "summary": "2-3 sentences about their role and contributions in this meeting",
      "actionItems": ["action item 1", ...],
      "keyNotes": ["key point 1", ...]
    }
  ]
}

Only include speakers who have a speakerId. Skip anonymous speakers.

Speakers:
--- <Name> (<speakerId>) ---
<utterances>
...
```

Only participants with a resolved `speakerId` (Clerk userId) in the `transcripts` table are included. Anonymous `speakerLabel`-only rows are skipped.

**Post-generation email dispatch:**  
After storing `participantInsights`, loop through each entry:
1. Call `clerkClient.users.getUser(speakerId)` → get `emailAddresses[0].emailAddress`
2. Attach email to the entry
3. Send via Nodemailer if SMTP env vars are configured
4. Set `emailSent: true` on success
5. Log failures — do NOT throw, do NOT fail the request

### Email env vars (all optional — feature degrades gracefully if missing)

```
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

If any of these are absent, the email step is skipped silently. As soon as all vars are populated, emails send automatically — no code change needed.

### Email content

Plain-text + HTML email per participant:
- Subject: `Your action items from: <meeting title>`
- Body: their personal summary, action items list, key notes list

---

## Frontend Changes

### `frontend/lib/types.ts`

Add `IParticipantInsight` interface and add `participantInsights: IParticipantInsight[]` to `IMeeting`.

### `frontend/app/(root)/meeting-insights/[id]/page.tsx`

- Add `participantInsights` to `MeetingData` interface
- Pass `currentUserId` (from `useAuth()`) down to `InsightsTabs`

### `frontend/components/InsightsTabs.tsx`

**Summary tab:**  
When `participantInsights` contains an entry where `speakerId === currentUserId`, render a "My Summary" card above the meeting summary:
- Personalized summary paragraph
- Their action items (bulleted)
- Their key notes (bulleted)

**Action Items tab:**  
Add `All | Mine` toggle pill above the list.
- `All` — existing behavior, shows all `meeting.actionItems`
- `Mine` — shows `actionItems[]` from the current user's `participantInsights` entry

---

## Constraints

- No new routes, no new pages, no new DB tables
- Email is fire-and-forget — failures are logged, never surfaced to the user
- Anonymous speakers (no `speakerId`) are excluded from participant insights
- Groq model: `llama-3.1-8b-instant` in dev, `llama-3.3-70b-versatile` for final demo
- Nodemailer only — no Resend, no SendGrid SDK

---

## Non-Goals

- Participants cannot edit or dismiss their personalized insights in the UI
- No email unsubscribe or delivery tracking
- No per-participant podcast generation

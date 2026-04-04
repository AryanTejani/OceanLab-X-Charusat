# Per-Participant Personalized Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate per-participant personalized insights (summary, action items, key notes), store them on the Meeting, surface them in the UI via an All/Mine toggle, and email each participant automatically when SMTP env vars are configured.

**Architecture:** Two sequential Groq calls in `/api/insights/generate` — the existing meeting-wide call unchanged, plus a new batch call that produces `participantInsights[]` for all resolved speakers. A new `mailer.ts` lib handles Nodemailer with graceful no-op when SMTP vars are absent. Frontend `InsightsTabs` receives `currentUserId` and renders "My Summary" + "All|Mine" toggle.

**Tech Stack:** TypeORM (JSONB column), Groq SDK, `@clerk/express` backend SDK, Nodemailer (new dep), React/Tailwind

---

## File Map

| File | Change |
|------|--------|
| `backend/src/entities/Meeting.ts` | Add `IParticipantInsight` interface + `participantInsights` JSONB column |
| `backend/src/lib/mailer.ts` | **New** — Nodemailer transporter, graceful skip when SMTP vars missing |
| `backend/src/routes/insights.ts` | Add Call 2 prompt, Clerk email lookup, mailer dispatch |
| `frontend/lib/types.ts` | Add `IParticipantInsight` interface, add field to `IMeeting` |
| `frontend/components/InsightsTabs.tsx` | Add `currentUserId` prop, "My Summary" card, `All|Mine` toggle |
| `frontend/app/(root)/meeting-insights/[id]/page.tsx` | Add `participantInsights` to `MeetingData`, pass `userId` to `InsightsTabs` |

---

## Task 1: Add `IParticipantInsight` to the Meeting entity

**Files:**
- Modify: `backend/src/entities/Meeting.ts`

- [ ] **Step 1: Add the interface and column**

Open `backend/src/entities/Meeting.ts`. Add after the `ITimelineEntry` interface (line 25) and before `IMeeting`:

```typescript
export interface IParticipantInsight {
  speakerId: string;
  speakerName: string;
  email?: string;
  summary: string;
  actionItems: string[];
  keyNotes: string[];
  emailSent: boolean;
}
```

Add to the `IMeeting` interface after `keyTopics: string[]`:
```typescript
participantInsights: IParticipantInsight[];
```

Add to the `Meeting` class after the `timeline` column:
```typescript
@Column({ type: 'jsonb', default: [] })
participantInsights!: IParticipantInsight[];
```

- [ ] **Step 2: Restart backend to verify auto-migration**

```bash
cd backend && npm run dev
```

Expected: `✅ PostgreSQL connected` with no migration errors. TypeORM's `synchronize: true` adds the column automatically.

- [ ] **Step 3: Commit**

```bash
git add backend/src/entities/Meeting.ts
git commit -m "feat: add participantInsights column to Meeting entity"
```

---

## Task 2: Create the Nodemailer mailer lib

**Files:**
- Create: `backend/src/lib/mailer.ts`

- [ ] **Step 1: Install nodemailer**

```bash
cd backend && npm install nodemailer && npm install --save-dev @types/nodemailer
```

Expected: nodemailer appears in `package.json` dependencies.

- [ ] **Step 2: Create `backend/src/lib/mailer.ts`**

```typescript
import nodemailer from 'nodemailer';

interface ParticipantEmailPayload {
  to: string;
  participantName: string;
  meetingTitle: string;
  summary: string;
  actionItems: string[];
  keyNotes: string[];
}

function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendParticipantInsightsEmail(
  payload: ParticipantEmailPayload
): Promise<boolean> {
  if (!isSmtpConfigured()) {
    console.log(`📧 SMTP not configured — skipping email to ${payload.to}`);
    return false;
  }

  const { to, participantName, meetingTitle, summary, actionItems, keyNotes } = payload;

  const actionItemsHtml = actionItems.length
    ? `<ul>${actionItems.map((a) => `<li>${a}</li>`).join('')}</ul>`
    : '<p>No action items assigned to you.</p>';

  const keyNotesHtml = keyNotes.length
    ? `<ul>${keyNotes.map((n) => `<li>${n}</li>`).join('')}</ul>`
    : '<p>No key notes.</p>';

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0E78F9;">Your Meeting Summary</h2>
      <p>Hi ${participantName},</p>
      <p>Here are your personalized insights from <strong>${meetingTitle}</strong>.</p>

      <h3>Your Summary</h3>
      <p>${summary}</p>

      <h3>Your Action Items</h3>
      ${actionItemsHtml}

      <h3>Key Notes for You</h3>
      ${keyNotesHtml}

      <hr style="margin-top: 32px;" />
      <p style="color: #888; font-size: 12px;">Powered by MeetMind AI</p>
    </div>
  `;

  const text = [
    `Your Meeting Summary — ${meetingTitle}`,
    '',
    `Hi ${participantName},`,
    '',
    'YOUR SUMMARY',
    summary,
    '',
    'YOUR ACTION ITEMS',
    actionItems.length ? actionItems.map((a) => `- ${a}`).join('\n') : 'No action items assigned to you.',
    '',
    'KEY NOTES',
    keyNotes.length ? keyNotes.map((n) => `- ${n}`).join('\n') : 'No key notes.',
  ].join('\n');

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: `Your action items from: ${meetingTitle}`,
      text,
      html,
    });
    console.log(`📧 Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err);
    return false;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/mailer.ts backend/package.json backend/package-lock.json
git commit -m "feat: add nodemailer mailer lib with graceful SMTP skip"
```

---

## Task 3: Add participant insights generation to the insights route

**Files:**
- Modify: `backend/src/routes/insights.ts`

- [ ] **Step 1: Add imports at top of `backend/src/routes/insights.ts`**

After the existing imports, add:

```typescript
import { clerkClient } from '@clerk/express';
import { sendParticipantInsightsEmail } from '../lib/mailer';
import { IParticipantInsight } from '../entities/Meeting';
```

- [ ] **Step 2: Add the participant insights prompt constant**

After the `INSIGHTS_PROMPT` constant (after line 37), add:

```typescript
const PARTICIPANT_INSIGHTS_PROMPT = `You are an AI meeting analyst. For each speaker listed below, analyze ONLY their utterances and produce a JSON object.

Your response MUST be valid JSON with exactly this structure:
{
  "participantInsights": [
    {
      "speakerId": "<the_clerk_user_id_shown_in_parentheses>",
      "speakerName": "<speaker name>",
      "summary": "2-3 sentences describing this person's role, contributions, and key responsibilities from this meeting",
      "actionItems": ["action item they are responsible for", "..."],
      "keyNotes": ["important point they raised or must know about", "..."]
    }
  ]
}

Rules:
- Include ONLY speakers that have a speakerId in parentheses after their name
- Extract ONLY information explicitly stated in their utterances
- If no action items can be attributed, return an empty array
- Keep summaries professional and concise

Speakers and their utterances:
`;
```

- [ ] **Step 3: Add helper to build per-participant transcript sections**

After the `PARTICIPANT_INSIGHTS_PROMPT` constant, add:

```typescript
interface SpeakerGroup {
  speakerId: string;
  speakerName: string;
  lines: string[];
}

function buildParticipantSections(utterances: { speakerId: string | null; speakerName: string | null; speakerLabel: string | null; text: string }[]): SpeakerGroup[] {
  const map = new Map<string, SpeakerGroup>();
  for (const u of utterances) {
    if (!u.speakerId) continue; // skip anonymous speakers
    const name = u.speakerName || (u.speakerLabel ? `Speaker ${u.speakerLabel}` : 'Unknown');
    if (!map.has(u.speakerId)) {
      map.set(u.speakerId, { speakerId: u.speakerId, speakerName: name, lines: [] });
    }
    map.get(u.speakerId)!.lines.push(`${name}: ${u.text}`);
  }
  return Array.from(map.values());
}
```

- [ ] **Step 4: Add Call 2 logic inside the route handler**

In `backend/src/routes/insights.ts`, find the line:
```typescript
res.json({ success: true, meetingId, status: 'completed' });
```

Replace it with the following (this goes after the `meetingRepo.update(...)` call that saves meeting-wide insights):

```typescript
    // ── Call 2: Per-participant insights ──────────────────────────────────────
    const speakerGroups = buildParticipantSections(utterances);

    let participantInsights: IParticipantInsight[] = [];

    if (speakerGroups.length > 0) {
      const participantSections = speakerGroups
        .map((g) => `--- ${g.speakerName} (${g.speakerId}) ---\n${g.lines.join('\n')}`)
        .join('\n\n');

      try {
        const participantCompletion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: PARTICIPANT_INSIGHTS_PROMPT + participantSections }],
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 4096,
        });

        const participantText = participantCompletion.choices[0]?.message?.content;
        if (participantText) {
          const parsed = JSON.parse(participantText);
          const rawInsights: Array<{ speakerId: string; speakerName: string; summary: string; actionItems: string[]; keyNotes: string[] }> = parsed.participantInsights || [];

          // Fetch emails from Clerk and dispatch emails
          participantInsights = await Promise.all(
            rawInsights.map(async (p) => {
              let email: string | undefined;
              let emailSent = false;

              try {
                const clerkUser = await clerkClient.users.getUser(p.speakerId);
                email = clerkUser.emailAddresses?.[0]?.emailAddress;
              } catch (err) {
                console.error(`❌ Could not fetch Clerk user ${p.speakerId}:`, err);
              }

              if (email) {
                emailSent = await sendParticipantInsightsEmail({
                  to: email,
                  participantName: p.speakerName,
                  meetingTitle: meeting.title,
                  summary: p.summary,
                  actionItems: p.actionItems,
                  keyNotes: p.keyNotes,
                });
              }

              return {
                speakerId: p.speakerId,
                speakerName: p.speakerName,
                email,
                summary: p.summary,
                actionItems: p.actionItems,
                keyNotes: p.keyNotes,
                emailSent,
              };
            })
          );

          await meetingRepo.update({ meetingId, userId }, { participantInsights });
        }
      } catch (participantErr) {
        // Participant insights failure must NOT fail the whole request
        console.error('❌ Failed to generate participant insights:', participantErr);
      }
    }

    res.json({ success: true, meetingId, status: 'completed' });
```

- [ ] **Step 5: Verify backend compiles**

```bash
cd backend && npm run dev
```

Expected: server starts on port 3001 with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/insights.ts
git commit -m "feat: add per-participant insights generation with Clerk email lookup"
```

---

## Task 4: Update frontend types

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Add `IParticipantInsight` and update `IMeeting`**

Open `frontend/lib/types.ts`. Add after the `ITimelineEntry` interface:

```typescript
export interface IParticipantInsight {
  speakerId: string;
  speakerName: string;
  email?: string;
  summary: string;
  actionItems: string[];
  keyNotes: string[];
  emailSent: boolean;
}
```

Add to the `IMeeting` interface after `keyTopics: string[]`:

```typescript
participantInsights: IParticipantInsight[];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat: add IParticipantInsight type to frontend types"
```

---

## Task 5: Update InsightsTabs with "My Summary" card and All/Mine toggle

**Files:**
- Modify: `frontend/components/InsightsTabs.tsx`

- [ ] **Step 1: Update the component signature and add state**

Open `frontend/components/InsightsTabs.tsx`. Replace the top of the file (imports + type + interface) with:

```typescript
'use client';

import { useState } from 'react';
import { IMeeting, IParticipantInsight } from '@/lib/types';

type Tab = 'summary' | 'actions' | 'decisions' | 'timeline' | 'transcript';
type ActionFilter = 'all' | 'mine';

interface InsightsTabsProps {
  meeting: IMeeting;
  currentUserId?: string;
}
```

Replace the opening of the component function:
```typescript
const InsightsTabs = ({ meeting, currentUserId }: InsightsTabsProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');

  const myInsight: IParticipantInsight | undefined = currentUserId
    ? meeting.participantInsights?.find((p) => p.speakerId === currentUserId)
    : undefined;
```

- [ ] **Step 2: Add "My Summary" card to the summary tab**

Find the `{activeTab === 'summary' && (` block. Replace the entire block content with:

```typescript
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {myInsight && (
              <div className="p-4 rounded-xl bg-blue-1/10 border border-blue-1/30 space-y-3">
                <h3 className="text-sm font-semibold text-blue-1">My Summary</h3>
                <p className="text-gray-300 text-sm leading-relaxed">{myInsight.summary}</p>
                {myInsight.actionItems.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Your Action Items</p>
                    <ul className="space-y-1">
                      {myInsight.actionItems.map((item, i) => (
                        <li key={i} className="text-sm text-white flex items-start gap-2">
                          <span className="text-blue-1 mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {myInsight.keyNotes.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-1">Key Notes for You</p>
                    <ul className="space-y-1">
                      {myInsight.keyNotes.map((note, i) => (
                        <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                          <span className="text-purple-400 mt-0.5">•</span>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {meeting.keyTopics && meeting.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {meeting.keyTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 text-xs rounded-full bg-blue-1/20 text-blue-1 border border-blue-1/30"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
            <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
              {meeting.summary || 'No summary available yet.'}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Add All/Mine toggle to the actions tab**

Find the `{activeTab === 'actions' && (` block. Replace it with:

```typescript
        {activeTab === 'actions' && (
          <div className="space-y-3">
            {myInsight && (
              <div className="flex gap-1 p-1 rounded-lg bg-dark-3 w-fit mb-2">
                <button
                  onClick={() => setActionFilter('all')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    actionFilter === 'all'
                      ? 'bg-blue-1 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActionFilter('mine')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    actionFilter === 'mine'
                      ? 'bg-blue-1 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Mine
                </button>
              </div>
            )}
            {actionFilter === 'mine' && myInsight ? (
              myInsight.actionItems.length > 0 ? (
                myInsight.actionItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg bg-dark-3 border border-dark-4"
                  >
                    <div className="mt-0.5 size-5 rounded border border-gray-500 flex items-center justify-center flex-shrink-0" />
                    <p className="text-white text-sm">{item}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-400">No action items assigned to you.</p>
              )
            ) : meeting.actionItems && meeting.actionItems.length > 0 ? (
              meeting.actionItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-dark-3 border border-dark-4"
                >
                  <div className="mt-0.5 size-5 rounded border border-gray-500 flex items-center justify-center flex-shrink-0">
                    {item.done && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0E78F9"
                        strokeWidth="3"
                      >
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm">{item.text}</p>
                    {item.assignee && (
                      <p className="text-xs text-gray-400 mt-1">
                        Assigned to: <span className="text-blue-1">{item.assignee}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No action items detected.</p>
            )}
          </div>
        )}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/InsightsTabs.tsx
git commit -m "feat: add My Summary card and All/Mine toggle to InsightsTabs"
```

---

## Task 6: Wire currentUserId into the insights page

**Files:**
- Modify: `frontend/app/(root)/meeting-insights/[id]/page.tsx`

- [ ] **Step 1: Add `participantInsights` to `MeetingData` interface**

Open `frontend/app/(root)/meeting-insights/[id]/page.tsx`. Find the `MeetingData` interface and add after `podcastScript?: string`:

```typescript
  participantInsights: Array<{
    speakerId: string;
    speakerName: string;
    email?: string;
    summary: string;
    actionItems: string[];
    keyNotes: string[];
    emailSent: boolean;
  }>;
```

- [ ] **Step 2: Extract userId from useAuth**

Find the line:
```typescript
  const { getToken } = useAuth();
```

Replace with:
```typescript
  const { getToken, userId } = useAuth();
```

- [ ] **Step 3: Pass currentUserId to InsightsTabs**

Find:
```typescript
            <InsightsTabs meeting={meeting as any} />
```

Replace with:
```typescript
            <InsightsTabs meeting={meeting as any} currentUserId={userId ?? undefined} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/(root)/meeting-insights/[id]/page.tsx
git commit -m "feat: pass currentUserId to InsightsTabs for personalized view"
```

---

## Task 7: Add SMTP env vars to .env

**Files:**
- Modify: `.env`

- [ ] **Step 1: Add placeholder SMTP vars**

Open the root `.env` file and add at the bottom:

```bash
# Email — Nodemailer SMTP (all optional; feature skips silently if not set)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

- [ ] **Step 2: Commit**

```bash
git add .env
git commit -m "chore: add SMTP env var placeholders for nodemailer"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Start both servers**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Run a meeting with at least two named speakers (speakerId set)**

In the meeting room, ensure speakers are resolved via the transcription panel so `speakerId` is populated in the `transcripts` table.

- [ ] **Step 3: Trigger insights generation**

Navigate to `/meeting-insights/[id]`. Generation should run automatically if status is `processing`.

- [ ] **Step 4: Verify DB has participantInsights**

```sql
SELECT "participantInsights" FROM meetings WHERE "meetingId" = '<your-meeting-id>';
```

Expected: JSON array with at least one entry containing `speakerId`, `summary`, `actionItems`, `keyNotes`.

- [ ] **Step 5: Verify UI**

- Summary tab: "My Summary" card appears for the logged-in user
- Action Items tab: `All | Mine` toggle appears; "Mine" shows only the current user's items

- [ ] **Step 6: Verify graceful email skip**

With SMTP vars empty, check backend logs — should see:
```
📧 SMTP not configured — skipping email to ...
```
No error thrown.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: per-participant personalized insights complete"
```

---
phase: 07-team-members
verified: 2026-04-04T19:00:00Z
status: human_needed
score: 12/12 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 10/12
  gaps_closed:
    - "MeetingNotificationBell now calls apiFetch('/api/notifications/meeting-invites') with correct /api prefix (lines 28, 58)"
    - "MeetingNotificationBell now calls res.json() on the Response before reading .success and .data (lines 29-30)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Team page visible and functional"
    expected: "Navigate to /team, see empty state, invite a member, see pending badge, remove a member"
    why_human: "Visual rendering and full CRUD flow confirmation requires browser interaction"
  - test: "Meeting creation team member selection"
    expected: "Create meeting, see Add Team Members selector, select members, confirm participantUserIds in Stream call custom data"
    why_human: "Stream call state and meeting room behavior requires live call environment"
  - test: "In-call TeamMemberPanel"
    expected: "UserPlus button in call controls opens slide-out panel, Add/In-call states work correctly"
    why_human: "Real-time in-call UI requires browser + Stream.io session"
  - test: "Notification bell end-to-end"
    expected: "Bell shows badge when meeting invites exist, Join navigates to meeting room, Dismiss removes the invite"
    why_human: "Requires two user accounts (inviter + invitee) and a live backend + Clerk session to produce pending MeetingInvitation rows"
---

# Phase 7: Team Members Verification Report

**Phase Goal:** Allow account owners to invite team members via Clerk, manage them in a Team page, and integrate them into meeting creation and in-call participant lists — with meeting invite notifications via polling.
**Verified:** 2026-04-04T19:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous status: gaps_found, 10/12)

## Gap Closure Confirmation

Both previously identified blockers in `frontend/components/MeetingNotificationBell.tsx` are now fixed:

| Gap | Previous Issue | Fix Verified | Evidence |
|-----|---------------|--------------|---------|
| URL missing /api prefix | `apiFetch('/notifications/meeting-invites', token)` hit 404 | Closed | Line 28: `apiFetch('/api/notifications/meeting-invites', token)`; Line 58: `apiFetch(\`/api/notifications/meeting-invites/${id}/dismiss\`, token, ...)` |
| Missing .json() parse | `const data = await apiFetch(...)` then `data?.success` on raw Response | Closed | Lines 28-30: `const res = await apiFetch(...); const data = await res.json(); if (data?.success && Array.isArray(data.data))` |

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | POST /api/team/invite sends Clerk invitation and creates pending TeamMember row | VERIFIED | backend/src/routes/team.ts lines 94-195: calls clerkClient.invitations.createInvitation, creates TeamMember row, returns 201 |
| 2  | GET /api/team returns all team members for the authenticated user (owner or member) | VERIFIED | team.ts lines 10-91: createQueryBuilder scoped to orgOwnerId, enriches with Clerk profile via clerkClient.users.getUser |
| 3  | DELETE /api/team/:memberId removes the TeamMember row and revokes Clerk invitation if pending | VERIFIED | team.ts lines 198-236: finds by id+ownerId, calls clerkClient.invitations.revokeInvitation, deletes row |
| 4  | PATCH /api/meetings/:meetingId/participants updates participantUserIds on the meeting | VERIFIED | meetings.ts lines 113-175: validates array, authorization check, repo.update, also creates MeetingInvitation records for new participants |
| 5  | Only org owners can invite/remove members (members get 403) | VERIFIED | team.ts lines 109-115 (invite), 209-214 (delete): checks callerAsMember = findOneBy({memberId: userId, status: 'active'}), returns 403 if found |
| 6  | Exclusive membership: invitee already in another org is rejected | VERIFIED | team.ts lines 124-141: looks up inviteeClerkId, checks alreadyMember = findOneBy({memberId: inviteeClerkId, status: 'active'}), returns 409 |
| 7  | Members can see all other org members (not just owner's view) | VERIFIED | team.ts lines 19-25: asMember lookup, if caller is a member sets orgOwnerId = asMember.ownerId, queries all members in that org |
| 8  | User can navigate to /team from the sidebar | VERIFIED | frontend/constants/index.ts line 35: route: '/team', label: 'Team'; page exists at frontend/app/(root)/(home)/team/page.tsx |
| 9  | Team page displays member table with correct fields, invite flow, and remove flow | VERIFIED | team/page.tsx: 163 lines, apiFetch('/api/team'), table with Member/Email/Joined/Status/Action columns, InviteMemberModal integration, handleRemove DELETE call |
| 10 | Meeting creation includes team member selection (TeamMemberSelector) | VERIFIED | MeetingTypeList.tsx: imports TeamMemberSelector, selectedMemberIds state, participantUserIds in call.getOrCreate custom data |
| 11 | Meeting invite notifications via short polling GET /api/notifications/meeting-invites every 6s | VERIFIED | MeetingNotificationBell.tsx line 28: apiFetch('/api/notifications/meeting-invites', token) — correct /api prefix. Line 40: setInterval(fetchInvites, 6000). |
| 12 | MeetingNotificationBell badge and dropdown populated with real data | VERIFIED | Lines 28-31: res = await apiFetch(...); data = await res.json(); data?.success && Array.isArray(data.data) → setInvites(data.data). Badge renders invites.length > 0 check on line 93. |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Provided | Status | Details |
|----------|----------|--------|---------|
| `backend/src/entities/TeamMember.ts` | TeamMember TypeORM entity | VERIFIED | @Entity('team_members'), all columns: ownerId, memberId, email, role, status, clerkInvitationId, joinedAt; unique index on [ownerId, email] |
| `backend/src/entities/MeetingInvitation.ts` | MeetingInvitation entity | VERIFIED | @Entity('meeting_invitations'), unique index on [meetingId, inviteeId], registered in db.ts |
| `backend/src/routes/team.ts` | Team CRUD routes | VERIFIED | GET list, POST /invite, DELETE /:memberId — all with requireAuth(), getAuth(req), clerkClient integration |
| `backend/src/routes/meetings.ts` | PATCH /api/meetings/:meetingId/participants | VERIFIED | Lines 113-175: validation, auth check (owner or participant), repo.update, MeetingInvitation creation |
| `backend/src/routes/notifications.ts` | GET /api/notifications/meeting-invites polling endpoint | VERIFIED | Real DB query on MeetingInvitation, Clerk enrichment for inviterName, dismiss PATCH endpoint — route itself is correct |
| `backend/src/index.ts` | Router mounts | VERIFIED | teamRouter at /api/team, notificationsRouter at /api/notifications |
| `backend/src/lib/db.ts` | Entity registration | VERIFIED | TeamMember and MeetingInvitation both in entities array |
| `frontend/lib/types.ts` | ITeamMember interface | VERIFIED | Lines 55-67: all fields including name, imageUrl optional resolved fields |
| `frontend/app/(root)/(home)/team/page.tsx` | Team management page | VERIFIED | 163 lines, 'use client', apiFetch wiring, table render, invite modal, remove handler |
| `frontend/components/InviteMemberModal.tsx` | Invite modal | VERIFIED | 96 lines, 'use client', POST /api/team/invite, onSuccess callback, email validation, loading state |
| `frontend/components/TeamMemberSelector.tsx` | Meeting creation selector | VERIFIED | 118 lines, 'use client', GET /api/team, active-only filter, client-side search, toggle selection |
| `frontend/components/TeamMemberPanel.tsx` | In-call panel | VERIFIED | 168 lines, 'use client', GET /api/team, PATCH /api/meetings/:meetingId/participants, "In call" badge, search |
| `frontend/components/MeetingTypeList.tsx` | Updated meeting creation | VERIFIED | TeamMemberSelector imported and rendered in both instant+schedule modals, participantUserIds in call.getOrCreate custom data |
| `frontend/components/MeetingRoom.tsx` | Updated meeting room | VERIFIED | TeamMemberPanel import+render, showTeamPanel state, UserPlus toggle, participantUserIds in saveMeeting body |
| `frontend/components/MeetingNotificationBell.tsx` | Notification bell component | VERIFIED | Correct /api prefix on all paths (lines 28, 58); .json() called on Response (line 29); badge and dropdown wired to invites state |
| `frontend/components/Navbar.tsx` | Bell in Navbar | VERIFIED | MeetingNotificationBell imported and rendered inside SignedIn |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| backend/src/routes/team.ts | backend/src/entities/TeamMember.ts | TypeORM repository | VERIFIED | ds.getRepository(TeamMember) on lines 16, 106, 206 |
| backend/src/routes/team.ts | clerkClient | Clerk invitation API | VERIFIED | clerkClient.invitations.createInvitation (line 159), revokeInvitation (line 223) |
| backend/src/index.ts | backend/src/routes/team.ts | Express router mount | VERIFIED | app.use('/api/team', teamRouter) line 49 |
| backend/src/routes/meetings.ts | backend/src/entities/Meeting.ts | TypeORM repository update | VERIFIED | repo.update({ meetingId }, { participantUserIds }) line 138 |
| backend/src/routes/notifications.ts | backend/src/entities/MeetingInvitation.ts | TypeORM repository | VERIFIED | ds.getRepository(MeetingInvitation), real DB query with createQueryBuilder |
| backend/src/index.ts | backend/src/routes/notifications.ts | Express router mount | VERIFIED | app.use('/api/notifications', notificationsRouter) line 50 |
| frontend/app/(root)/(home)/team/page.tsx | /api/team | apiFetch GET | VERIFIED | apiFetch('/api/team', token) line 23 |
| frontend/components/InviteMemberModal.tsx | /api/team/invite | apiFetch POST | VERIFIED | apiFetch('/api/team/invite', token, { method: 'POST', ... }) line 29 |
| frontend/constants/index.ts | /team route | sidebarLinks | VERIFIED | route: '/team' in sidebarLinks; Sidebar consumes sidebarLinks |
| frontend/components/TeamMemberSelector.tsx | /api/team | apiFetch GET | VERIFIED | apiFetch('/api/team', token) line 28 |
| frontend/components/TeamMemberPanel.tsx | /api/meetings/:meetingId/participants | apiFetch PATCH | VERIFIED | apiFetch(`/api/meetings/${meetingId}/participants`, token, { method: 'PATCH' }) line 65-69 |
| frontend/components/MeetingTypeList.tsx | TeamMemberSelector | Component composition | VERIFIED | import line 11, rendered in modals lines 154-157, 205-208 |
| frontend/components/MeetingRoom.tsx | TeamMemberPanel | Component composition | VERIFIED | import line 29, rendered lines 198-204 |
| frontend/components/MeetingNotificationBell.tsx | /api/notifications/meeting-invites | apiFetch GET polling | VERIFIED | Line 28: apiFetch('/api/notifications/meeting-invites', token); Line 58: apiFetch(`/api/notifications/meeting-invites/${id}/dismiss`, ...); both with correct /api prefix |
| frontend/components/Navbar.tsx | MeetingNotificationBell | Component composition | VERIFIED | import line 6, rendered inside SignedIn line 25 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| team/page.tsx | members: ITeamMember[] | GET /api/team → TeamMember repository (createQueryBuilder) | Yes — real DB query with Clerk enrichment | FLOWING |
| InviteMemberModal.tsx | json.data (new member) | POST /api/team/invite → repo.save(member) | Yes — saves real TeamMember row | FLOWING |
| TeamMemberSelector.tsx | members: ITeamMember[] | GET /api/team | Yes — same real DB query | FLOWING |
| TeamMemberPanel.tsx | members: ITeamMember[] | GET /api/team | Yes — same real DB query | FLOWING |
| TeamMemberPanel.tsx | PATCH response | /api/meetings/:meetingId/participants → repo.update | Yes — updates real Meeting row | FLOWING |
| MeetingNotificationBell.tsx | invites: MeetingInvite[] | apiFetch('/api/notifications/meeting-invites') → res.json() → setInvites(data.data) | Yes — real DB query in notifications.ts with Clerk enrichment | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED (no runnable entry points accessible without starting servers; requires live Clerk auth session and PostgreSQL connection)

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| TEAM-P7-01 | 07-01-PLAN | TeamMember entity and DB persistence | SATISFIED | TeamMember.ts entity with all required columns, registered in db.ts |
| TEAM-P7-02 | 07-01-PLAN | Backend team API (invite, list, remove) scoped to authenticated owner | SATISFIED | team.ts GET/POST/DELETE routes with requireAuth, getAuth, ownerId scoping |
| TEAM-P7-03 | 07-02-PLAN | Team management UI (/team page with invite modal and sidebar link) | SATISFIED | team/page.tsx, InviteMemberModal.tsx, sidebarLinks entry — all wired to real API |
| TEAM-P7-04 | 07-01/07-03-PLAN | Meeting integration: participant selection at creation + in-call panel + PATCH endpoint | SATISFIED | TeamMemberSelector in MeetingTypeList, TeamMemberPanel in MeetingRoom, PATCH route in meetings.ts |

All four declared requirements are satisfied by the implemented code.

---

## Anti-Patterns Found

No blockers or warnings. The two previously identified blocker anti-patterns in `MeetingNotificationBell.tsx` have been resolved.

---

## Human Verification Required

### 1. Team Page Full CRUD Flow

**Test:** Navigate to /team, verify empty state, click Invite Member, enter an email address, submit; verify new row appears with Pending badge. Then click Remove, verify row disappears.
**Expected:** Real Clerk invitation email is sent; TeamMember row exists in DB; Remove revokes the Clerk invitation.
**Why human:** Clerk invitation sending and DB persistence can only be confirmed by observing the invitation email and checking the DB, plus visual badge rendering.

### 2. Meeting Creation Team Member Selection

**Test:** Go to Home, click New Meeting, verify "Add Team Members" section appears. Select an active team member, create meeting, enter room.
**Expected:** Selected members are visible in TeamMemberPanel as "In call" (seeded from call.state.custom.participantUserIds).
**Why human:** Stream.io call custom data round-trip (creation to room state) requires a live call session.

### 3. In-Call TeamMemberPanel Add/In-Call States

**Test:** In a live call, click the UserPlus button in the controls bar, verify slide-out panel appears with team members listed. Click Add on a member not in call, verify the button changes to "In call".
**Expected:** PATCH /api/meetings/:meetingId/participants is called; MeetingInvitation record created; member marked In call.
**Why human:** In-call UI interaction requires a live Stream.io session.

### 4. Notification Bell End-to-End

**Test:** Log in as a user who has been added as a participant to a meeting via the PATCH route. Verify the bell badge appears within 6 seconds. Click the bell, verify the dropdown shows the meeting invitation with inviter name, meetingTitle, Join Meeting and Dismiss buttons. Click Join — verify navigation to /meeting/:meetingId. Click Dismiss — verify the invite disappears from the list.
**Expected:** Badge count reflects pending MeetingInvitation rows for the user; both action buttons function correctly.
**Why human:** Requires two user accounts (inviter + invitee) and a live backend + Clerk session to produce pending MeetingInvitation rows.

---

## Summary

All 12 must-haves are now verified at the code level. The two blockers from the initial verification — the missing `/api` prefix in `MeetingNotificationBell.tsx` and the missing `.json()` parse on the `apiFetch` response — are both confirmed fixed in the current file (lines 28-30 and line 58).

The four declared requirements (TEAM-P7-01 through TEAM-P7-04) are all satisfied. All backend routes, entities, frontend pages, and component wiring are complete and connected. Remaining human verification items cover visual rendering, Stream.io in-call behavior, and the full notification bell flow with real user sessions — none of these are addressable programmatically.

---

_Initial verified: 2026-04-04T18:00:00Z_
_Re-verified: 2026-04-04T19:00:00Z_
_Verifier: Claude (gsd-verifier)_

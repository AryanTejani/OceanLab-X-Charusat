---
phase: 07-team-members-allow-users-to-invite-and-manage-team-members-under-their-account
plan: 03
subsystem: ui
tags: [stream-io, react, next-js, team-members, meeting-creation, in-call-panel]

# Dependency graph
requires:
  - phase: 07-01
    provides: TeamMember entity, GET /api/team, PATCH /api/meetings/:meetingId/participants backend routes
  - phase: 07-02
    provides: Team management UI, InviteMemberModal, active member list
provides:
  - TeamMemberSelector reusable component for meeting creation flow
  - TeamMemberPanel slide-out in-call component with add-to-call functionality
  - Meeting creation now persists participantUserIds to Stream call custom data
  - MeetingRoom wired with team member panel toggle and PATCH participants on add
affects:
  - future meeting analysis phases (participantUserIds available for attribution)
  - any phase reading call.state.custom (now includes participantUserIds array)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Stream call custom data used to carry participantUserIds between creation and room
    - In-call panel follows slide-out pattern (translate-x-full / translate-x-0)
    - PATCH /api/meetings/:meetingId/participants to update participant list during live call

key-files:
  created:
    - frontend/components/TeamMemberSelector.tsx
    - frontend/components/TeamMemberPanel.tsx
  modified:
    - frontend/components/MeetingTypeList.tsx
    - frontend/components/MeetingRoom.tsx

key-decisions:
  - "participantUserIds passed via Stream call custom data at creation — no extra API call needed before room load"
  - "PATCH /api/meetings/:meetingId/participants chosen over Stream invite API for participant tracking per D-15"
  - "Backend extended (d1f2540) to create MeetingInvitation records on PATCH and add notification polling — done outside plan scope by separate agent"

patterns-established:
  - "TeamMemberSelector: fetch /api/team on mount, filter active-only, client-side search, toggle selection by memberId"
  - "TeamMemberPanel: slide-out right panel, tracks addingId per-button loading, calls onParticipantAdded callback on success"

requirements-completed: [TEAM-P7-04]

# Metrics
duration: 45min
completed: 2026-04-04
---

# Phase 07 Plan 03: Team Member Meeting Integration Summary

**TeamMemberSelector + TeamMemberPanel components wire team members into meeting creation and live in-call management, persisting participantUserIds through Stream call custom data and PATCH /api/meetings/:id/participants**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-04T16:05:00Z
- **Completed:** 2026-04-04T17:00:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 4

## Accomplishments

- Created `TeamMemberSelector` — searchable, toggleable team member picker shown in both instant and schedule meeting modals, stores selections in Stream call `custom.participantUserIds`
- Created `TeamMemberPanel` — slide-out right panel inside the live meeting room, shows all active team members with per-button "Add" (calls PATCH participants) and "In call" badge for already-added members
- Wired `MeetingRoom` to initialize `participantUserIds` from `call.state.custom`, expose a UserPlus toggle button in the controls bar, and pass `participantUserIds` to the meeting save POST body
- Human verification confirmed: selector visible at meeting creation, panel slides out in-call, "In call" states update correctly, and participantUserIds persist

## Task Commits

Each task was committed atomically:

1. **Task 1: TeamMemberSelector + MeetingTypeList integration** - `4ff9056` (feat)
2. **Task 2: TeamMemberPanel + MeetingRoom wiring** - `e84d8fe` (feat)
3. **Task 3: checkpoint:human-verify** — approved by user (no code commit)

**Backend extension (separate):** `d1f2540` — team role enforcement, exclusive membership, meeting invite notifications (MeetingInvitation records + notification polling added outside this plan by backend agent)

## Files Created/Modified

- `frontend/components/TeamMemberSelector.tsx` — `'use client'` component; fetches GET /api/team, filters active-only, client-side search by name/email, toggle selection, passes memberId array via `onSelectionChange` prop
- `frontend/components/TeamMemberPanel.tsx` — `'use client'` slide-out panel; fetches GET /api/team on mount, search input, per-row Add button (PATCH /api/meetings/:meetingId/participants), "In call" badge, addingId loading state
- `frontend/components/MeetingTypeList.tsx` — added `selectedMemberIds` state, `TeamMemberSelector` in instant and schedule meeting modals, `participantUserIds: selectedMemberIds` in `call.getOrCreate` custom data
- `frontend/components/MeetingRoom.tsx` — added `showTeamPanel` + `participantUserIds` state, useEffect seeding from `call.state.custom.participantUserIds`, UserPlus toggle button in controls bar, `TeamMemberPanel` render, `participantUserIds` in `saveMeeting` POST body

## Decisions Made

- participantUserIds are stored in Stream call `custom` data at creation time — this avoids an extra API round-trip before the meeting room loads, and the room can read them back from `call.state.custom`
- PATCH `/api/meetings/:meetingId/participants` is used for in-call adds (per architectural decision D-15 from plan context) rather than Stream's invite API, keeping the source of truth in the application DB
- The backend agent (commit `d1f2540`) independently extended the PATCH route to also create `MeetingInvitation` records and add notification polling — this is a compatible extension; no conflict with this plan's frontend work

## Deviations from Plan

None — plan executed exactly as written. The backend extension in `d1f2540` was done by a separate agent and does not constitute a deviation from this plan's scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all components fetch live data from `/api/team` and write to `/api/meetings/:meetingId/participants`. No hardcoded or placeholder data.

## Next Phase Readiness

- Phase 07 is now fully complete: TeamMember entity (07-01), team management UI (07-02), and meeting integration (07-03) are all done
- `participantUserIds` are available on every saved meeting — future phases can use this for per-participant transcript attribution or notification targeting
- No blockers for subsequent phases

---
*Phase: 07-team-members-allow-users-to-invite-and-manage-team-members-under-their-account*
*Completed: 2026-04-04*

---
phase: 07-team-members
plan: 01
subsystem: backend-api
tags: [team-management, clerk, typeorm, express-routes]
dependency_graph:
  requires: []
  provides:
    - TeamMember TypeORM entity (team_members table)
    - GET /api/team — list team members with Clerk profile enrichment
    - POST /api/team/invite — send Clerk invitation + create pending TeamMember row
    - DELETE /api/team/:memberId — remove row and revoke Clerk invitation
    - PATCH /api/meetings/:meetingId/participants — update participantUserIds on a meeting
    - ITeamMember shared frontend type
  affects:
    - backend/src/lib/db.ts (entity registration)
    - backend/src/routes/meetings.ts (new PATCH route)
    - backend/src/index.ts (teamRouter mount)
tech_stack:
  added: []
  patterns:
    - TypeORM entity with @Entity, @Index, @CreateDateColumn, @UpdateDateColumn
    - clerkClient.invitations.createInvitation / revokeInvitation for Clerk invitation lifecycle
    - clerkClient.users.getUser for Clerk profile enrichment
    - requireAuth() + getAuth(req) pattern for userId scoping
key_files:
  created:
    - backend/src/entities/TeamMember.ts
    - backend/src/routes/team.ts
  modified:
    - frontend/lib/types.ts
    - backend/src/lib/db.ts
    - backend/src/index.ts
    - backend/src/routes/meetings.ts
decisions:
  - Used createQueryBuilder for GET /api/team to enable orderBy on joinedAt
  - Clerk invitation fallback: if invitation creation fails (user already exists), look up by email and set status=active
  - DELETE uses TeamMember row id (UUID), not Clerk userId — prevents cross-user data access
metrics:
  duration: ~15 minutes
  completed: "2026-04-04"
  tasks: 3
  files: 6
---

# Phase 7 Plan 01: TeamMember entity, team routes, and PATCH participants Summary

**One-liner:** TypeORM TeamMember entity + Clerk-integrated team CRUD API (invite/list/remove) + PATCH participants endpoint on meetings.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create TeamMember entity and ITeamMember frontend type | 1cece99 | backend/src/entities/TeamMember.ts, frontend/lib/types.ts |
| 2 | Create team routes and register in Express app | 46be829 | backend/src/routes/team.ts, backend/src/index.ts |
| 3 | Add PATCH /api/meetings/:meetingId/participants route | 5aa91ea | backend/src/routes/meetings.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TeamMember entity not registered in TypeORM DataSource**
- **Found during:** Overall verification after all tasks complete
- **Issue:** `backend/src/lib/db.ts` only had `[Meeting, Transcript]` in the entities array. Without registering `TeamMember`, `synchronize: true` cannot create the `team_members` table, making all team routes non-functional at runtime.
- **Fix:** Added `import { TeamMember }` and added it to the entities array in `db.ts`
- **Files modified:** `backend/src/lib/db.ts`
- **Commit:** 92e57d4

## Success Criteria Verification

- [x] TeamMember entity auto-creates `team_members` table on backend start (`synchronize: true`, entity registered in db.ts)
- [x] POST /api/team/invite creates Clerk invitation + TeamMember row (pending status)
- [x] GET /api/team returns enriched member list with Clerk profile data (name, imageUrl)
- [x] DELETE /api/team/:memberId removes row and revokes pending Clerk invitation
- [x] PATCH /api/meetings/:meetingId/participants updates participantUserIds on the meeting
- [x] All routes scoped to authenticated user via getAuth(req).userId as ownerId

## Known Stubs

None — all routes are fully implemented with real Clerk API calls and TypeORM queries.

## Self-Check: PASSED

# Phase 7: Team Members - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Allow an account owner to invite team members via Clerk, manage them in a dedicated Team page (table with name, avatar, join date, remove), and integrate team members into the meeting creation flow and the in-call participant list with search + add-to-call capability.

Does NOT include: role-based permissions beyond owner/member, billing/seat limits, shared workspace (all meetings visible to all members) — meeting sharing is explicit via participantUserIds at creation time.

</domain>

<decisions>
## Implementation Decisions

### Invitation mechanism
- **D-01:** Invitations are sent via Clerk — use `clerkClient.invitations.createInvitation({ emailAddress, redirectUrl })` on the backend
- **D-02:** Owner enters a team member's email address; Clerk sends the invite email with a sign-up/accept link
- **D-03:** Once the invitee accepts (creates or logs into their Clerk account), they appear in the team member list
- **D-04:** Team membership is stored in a new `TeamMember` PostgreSQL entity: `{ id, ownerId (Clerk userId), memberId (Clerk userId), role: 'member', joinedAt, status: 'pending'|'active' }`
- **D-05:** Clerk invitation ID stored on TeamMember row so pending invitations can be tracked and revoked

### Team management page
- **D-06:** New `/team` route added to the app, linked in the sidebar as "Team" with an appropriate icon
- **D-07:** Page shows a table of current team members with columns: Profile picture, Name, Email, Joining date, Status (pending/active), Remove button
- **D-08:** "Invite Member" button at top opens a modal with an email input field; submits to a new `POST /api/team/invite` backend route
- **D-09:** Remove button calls `DELETE /api/team/:memberId` which removes the TeamMember row and revokes the Clerk invitation if still pending
- **D-10:** Profile picture and name fetched from Clerk user data via `clerkClient.users.getUser(memberId)` — same pattern as insights.ts:228

### Meeting creation with team members
- **D-11:** The meeting creation flow (wherever new meetings are initiated) includes a "Add team members" section
- **D-12:** User searches team members by name/email and selects them; selected members are stored as `participantUserIds` on the Meeting entity (existing field already supports this)
- **D-13:** Team member search is client-side against the already-loaded team list (no extra API call during creation)

### In-call / meeting UI participant list
- **D-14:** The meeting detail / call UI participant panel shows ALL team members, not just those assigned to the meeting
- **D-15:** Each team member entry has an "Add to call" button; clicking it adds that member's userId to `participantUserIds` via `PATCH /api/meetings/:meetingId` (existing update route)
- **D-16:** Search box at the top of the participant list filters team members by name in real time (client-side)
- **D-17:** Members already added to the call are shown as "In call" (disabled/checked state), not offered the add button again

### Roles / permissions
- **D-18:** Simple binary model: owner (the inviter) vs member. No admin/viewer distinctions in v1 of this phase.
- **D-19:** All backend routes for team management are scoped to the authenticated user as owner — `WHERE ownerId = userId`

### Claude's Discretion
- Exact table styling and empty state design for the Team page
- Pagination vs infinite scroll for teams with many members (≤20 members expected, so no pagination needed)
- Exact sidebar icon choice for "Team"
- Error handling UX for duplicate invite emails

</decisions>

<specifics>
## Specific Ideas

- "After the invitation I want the table for managing team with joining date, name, profile picture, option to remove"
- "When I go to create a meeting I should be able to create a meeting with these members"
- "In call UI we have the participant list — we should have all members listed there with the option to add in the call"
- "So I can search the team member and can add the member to the call directly from there"

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth and backend patterns
- `CLAUDE.md` — Project-wide rules: requireAuth pattern, getAuth(req) for userId, apiFetch in frontend, TypeORM entity conventions
- `backend/src/routes/insights.ts` — Reference for `clerkClient.users.getUser()` usage pattern (line 228)
- `backend/src/routes/meetings.ts` — Reference for `requireAuth` + `getAuth`, participantUserIds update pattern, userId scoping in WHERE clauses

### Data model
- `backend/src/entities/Meeting.ts` — Meeting entity with `participantUserIds: string[]` field (existing, reuse for meeting-member linking)

### Frontend patterns
- `frontend/constants/index.ts` — sidebarLinks array — add "Team" entry here
- `frontend/components/Sidebar.tsx` — Sidebar component to understand navigation structure
- `frontend/lib/api.ts` — apiFetch helper for all backend calls

### No external specs
No external ADRs or design docs for this phase — decisions fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/lib/mailer.ts` — Email sending already available (Clerk handles invite email, but mailer.ts available for notifications if needed)
- `Meeting.participantUserIds: string[]` — Already on Meeting entity, already used in meetings.ts queries. No schema change needed for linking members to meetings.
- `clerkClient` imported in `backend/src/routes/insights.ts` — Pattern for Clerk API calls on backend already established

### Established Patterns
- All protected routes use `requireAuth()` + `const { userId } = getAuth(req)` — new team routes must follow same pattern
- All DB queries scoped to userId in WHERE clause — TeamMember queries must scope by `ownerId = userId`
- TypeORM `synchronize: true` in dev — new TeamMember entity will auto-create table
- Frontend calls backend via `apiFetch(path, token, init)` from `frontend/lib/api.ts` — new team API calls use same helper

### Integration Points
- `frontend/constants/index.ts` — Add "Team" to sidebarLinks
- `backend/src/index.ts` — Register new team router (e.g., `app.use('/api/team', teamRouter)`)
- `frontend/app/(root)/` — Add `/team` page directory
- Meeting creation flow (wherever `POST /api/meetings` is triggered) — add participantUserIds selection

</code_context>

<deferred>
## Deferred Ideas

- Role-based permissions (admin/viewer) — mentioned as possible future need, explicitly deferred
- Automatic meeting visibility for all team members (shared workspace) — user confirmed explicit sharing only
- Billing/seat limits — post-hackathon
- Team analytics (who attended what) — post-hackathon

</deferred>

---

*Phase: 07-team-members*
*Context gathered: 2026-04-04*

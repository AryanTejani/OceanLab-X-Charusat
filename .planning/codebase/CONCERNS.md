# Codebase Concerns

**Analysis Date:** 2026-04-03

## Tech Debt

**Loose TypeScript Type Safety:**
- Issue: Widespread use of `any` type annotations in routes, particularly in data transformation pipelines
- Files: `backend/src/routes/podcast.ts` (lines 70, 74), `backend/src/routes/insights.ts` (lines 88, 93, 97), `backend/src/routes/meetingQa.ts` (lines 27, 70), `backend/src/index.ts` (lines 54, 78, 90, 106, 114, 149)
- Impact: Type safety regression, harder to catch data transformation bugs at compile time, particularly dangerous for user-facing data from AI APIs (Groq, OpenRouter responses)
- Fix approach: Replace `any` with proper interfaces for Groq responses, OpenRouter completions, and array mappings. Define types for `IActionItem[]`, `IDecision[]`, and `ITimelineEntry[]` transformations

**Socket.IO Connection State Stored on Socket as Cast:**
- Issue: AssemblyAI connection objects and state flags stored directly on socket object with `(socket as any)` casts throughout `index.ts`
- Files: `backend/src/index.ts` (lines 54-165)
- Impact: Impossible to track connection lifecycle, makes testing difficult, state can be lost on unexpected socket disconnect, memory leaks if connections aren't properly cleaned up
- Fix approach: Create a `SocketConnectionManager` class to encapsulate per-socket state. Track cleanup in one place. Add explicit connection lifecycle hooks

**@ts-ignore Comment Instead of Module Resolution:**
- Issue: AssemblyAI WebSocket service imported with `@ts-ignore` comment
- Files: `backend/src/index.ts` (line 17)
- Impact: Hides type errors, future maintainers won't know why this was necessary, makes it harder to upgrade or replace the module
- Fix approach: Either create a TypeScript declaration file for the module or migrate to a typed alternative

**Hardcoded ElevenLabs Voice ID:**
- Issue: Speaker voice ID `JBFqnCBsd6RMkjVDRZzb` is hardcoded in podcast generation
- Files: `backend/src/routes/podcast.ts` (line 90)
- Impact: Cannot change voice without code modification, not configurable per user/team, unclear which voice this is (name would help)
- Fix approach: Move to environment variable or database config, add comment documenting which ElevenLabs voice this ID maps to

**Groq Model Version Hardcoded:**
- Issue: Model selection is hardcoded to `llama-3.3-70b-versatile` in insights and podcast routes
- Files: `backend/src/routes/insights.ts` (line 73), `backend/src/routes/podcast.ts` (line 80)
- Impact: Cannot easily switch models for cost optimization (CLAUDE.md specifies `llama-3.1-8b-instant` for dev), difficult to A/B test model performance
- Fix approach: Move model selection to environment variable with sensible default, implement conditional logic based on meeting complexity

## Known Bugs

**Transcript Save Route Has No Authentication:**
- Issue: `/api/transcripts/save` endpoint accepts unauthenticated requests and saves userId from client body
- Files: `backend/src/routes/transcripts.ts` (line 9)
- Impact: Client can set arbitrary `userId` values, other users can inject transcripts into any meeting ID, complete data isolation bypass
- Trigger: POST to `/api/transcripts/save` with any meetingId/userId combination, no auth token needed
- Workaround: Frontend *could* validate, but backend doesn't enforce — this is a security boundary violation

**Meeting Q&A Route Also Unauthenticated:**
- Issue: `/api/meeting-qa` POST endpoint has no auth check and accepts transcripts from client
- Files: `backend/src/routes/meetingQa.ts` (line 7)
- Impact: Anyone can query meeting content if they know the transcripts structure, no rate limiting on free OpenRouter queries
- Trigger: Any unauthenticated user can POST questions + meeting transcripts
- Workaround: None — this should require authentication

**Deepgram Token Endpoint Exposes API Key:**
- Issue: `/api/deepgram-token` returns full API key to client (exposed in JSON response)
- Files: `backend/src/routes/tokens.ts` (line 17)
- Impact: Client-side JavaScript can log/exfiltrate Deepgram API key, key can be revoked by anyone with browser dev tools access
- Trigger: Any client fetch to `/api/deepgram-token` retrieves the key
- Workaround: Use a proxy pattern or authentication layer (AssemblyAI token endpoint does this correctly with temporary tokens)

**Transcript Assembly on Meeting Save Missing userId Validation:**
- Issue: When assembling transcript from real-time saves, the query filters by `meetingId` and `isFinal: true` but doesn't validate `userId`
- Files: `backend/src/routes/meetings.ts` (lines 57-65)
- Impact: If one user knows another user's meetingId, they can assemble transcripts from that meeting (assumes meeting IDs are guessable/sequential)
- Trigger: POST `/api/meetings/save` with a meetingId from another user; if `transcriptText` is null, backend loads from DB without userId check

## Security Considerations

**API Keys in Client-Accessible Endpoints:**
- Risk: Deepgram API key returned in plaintext via `/api/deepgram-token`
- Files: `backend/src/routes/tokens.ts` (line 17)
- Current mitigation: None
- Recommendations: (1) Create a middleware that exchanges Clerk token for a short-lived Deepgram session token, (2) or use Deepgram client-side library with OAuth, (3) or proxy all Deepgram requests through backend

**Missing CORS Validation on Socket.IO:**
- Risk: Socket.IO server accepts connections from any origin matching `FRONTEND_URL` env var, but env var can be misconfigured
- Files: `backend/src/index.ts` (line 50-51)
- Current mitigation: Relies on env var
- Recommendations: (1) Validate origin strictly, (2) add explicit allowlist of allowed origins

**Insufficient Input Validation on Transcript Endpoints:**
- Risk: Transcript text saved without length/content validation, can cause DB bloat or injection issues
- Files: `backend/src/routes/transcripts.ts` (lines 11-31)
- Current mitigation: Basic `.trim()` check
- Recommendations: (1) Add max length validation (e.g., 50k chars per line), (2) sanitize special characters, (3) add rate limiting per userId

**Sensitive Error Details in Responses:**
- Risk: Some error responses leak internal state (e.g., "Failed to create AssemblyAI token" includes HTTP status)
- Files: `backend/src/routes/tokens.ts` (line 60)
- Current mitigation: Errors are not stack traces, but still expose internals
- Recommendations: Log detailed errors server-side, return generic errors to client

## Performance Bottlenecks

**Transcript Assembly on Meeting Save:**
- Problem: Assembling transcript from Transcript table at meeting-save time requires iterating all final transcripts for a meeting
- Files: `backend/src/routes/meetings.ts` (lines 57-65)
- Cause: No optimization — query returns all rows, then joins in memory. For a 1-hour meeting (maybe 1000+ transcript lines), this could be slow
- Improvement path: (1) Add database-side concatenation in SQL query, (2) add index on `(meetingId, isFinal, createdAt)`, (3) consider denormalizing final transcript into Meeting table after speech-to-text completes

**Groq Transcript Truncation at 100k Chars:**
- Problem: Large meetings (>100k chars) get truncated without warning, potentially losing context for insights
- Files: `backend/src/routes/insights.ts` (lines 64-68)
- Cause: No streaming/chunking approach; static truncation point
- Improvement path: (1) Implement recursive summarization for very long meetings, (2) add warning to user if truncation occurred, (3) consider breaking insights generation into multiple phases (sections → combined summary)

**ElevenLabs TTS on Synchronous Route:**
- Problem: Podcast generation blocks the HTTP request while TTS converts text to audio, then uploads to Cloudinary
- Files: `backend/src/routes/podcast.ts` (lines 88-121)
- Cause: Single-threaded approach, no queue system
- Improvement path: (1) Implement async job queue (Bull, RabbitMQ), (2) return 202 Accepted immediately, poll status endpoint, (3) update Meeting status to `generating` while processing (already done, but needs async worker)

**Cloudinary Upload Stream Blocking Route:**
- Problem: Cloudinary upload wrapped in Promise but still blocks the HTTP response until complete
- Files: `backend/src/routes/podcast.ts` (line 103-115)
- Cause: No stream-to-disk fallback, no timeout handling
- Improvement path: (1) Implement write-to-local storage with async Cloudinary sync, (2) add upload timeout (e.g., 30s), (3) retry logic for failed uploads

## Fragile Areas

**Socket.IO Real-Time Transcription State Machine:**
- Files: `backend/src/index.ts` (lines 68-183)
- Why fragile: Multiple boolean flags (`assemblyaiReady`, `assemblyaiConnection`) tracked on socket, no state validation, race conditions possible (e.g., close event fires while sending audio), keep-alive interval may not clear properly on disconnect
- Safe modification: (1) Refactor to explicit state enum (IDLE, CONNECTING, READY, STOPPING, CLOSED), (2) add guards before every state transition, (3) add connection timeout (e.g., 5s to reach READY state)
- Test coverage: No unit tests visible; recommend integration tests for: socket connect → start-transcription → audio-chunk → stop-transcription → disconnect, with network failures injected

**Meeting ID Generation:**
- Files: `backend/src/routes/upload.ts` (line 62)
- Why fragile: `upload-${Date.now()}-${Math.random().toString(36).substring(7)}` is not cryptographically random, could be guessable/colliding
- Safe modification: Use `uuid.v4()` instead (already imported in other routes), ensures global uniqueness
- Test coverage: No validation of meetingId format

**Insights & Podcast JSON Parsing Without Schema Validation:**
- Files: `backend/src/routes/insights.ts` (line 82), `backend/src/routes/podcast.ts` (line 85-86)
- Why fragile: `JSON.parse()` called directly on Groq response, no schema validation. If Groq returns malformed JSON, route crashes without explicit error handling
- Safe modification: (1) Use a validation library like Zod or Joi, (2) add explicit try-catch around JSON.parse, (3) validate response shape before using (check required fields exist)
- Test coverage: No tests for malformed Groq responses

**Transcript Text Null Handling:**
- Files: `backend/src/routes/meetings.ts` (line 73), `backend/src/entities/Meeting.ts` (line 65)
- Why fragile: `transcriptText` can be null, but `.trim()` is called without null check in multiple places (lines 60, 62), `.length > maxChars` is called without null guard in insights route
- Safe modification: (1) Always null-coalesce to empty string: `(meeting.transcriptText || '').length`, (2) add utility function for safe transcript access
- Test coverage: No tests for meetings with null transcripts

## Scaling Limits

**Database Connection Pool:**
- Current capacity: Default TypeORM connection (single global instance)
- Limit: As request volume grows, a single DataSource connection pool (default 10 connections) will become bottleneck
- Scaling path: (1) Add connection pool size to env config (e.g., `DATABASE_MAX_CONNECTIONS=20`), (2) monitor active connections in production, (3) implement connection pooling middleware (PgBouncer), (4) consider read replicas for heavy queries

**Socket.IO Memory Usage:**
- Current capacity: In-memory socket state and audio buffers, one connection per user
- Limit: 1000+ concurrent socket connections will exhaust Node process memory
- Scaling path: (1) Implement Redis adapter for socket.io (`socket.io-redis`), (2) move audio buffering to external service (e.g., Kinesis), (3) add memory monitoring and auto-scaling triggers

**Groq API Rate Limits:**
- Current capacity: Free tier has rate limits (unclear what the exact limit is in code)
- Limit: Under demo load, Groq quota will be exhausted; production needs account-based rate limiting
- Scaling path: (1) Add request queuing with exponential backoff, (2) implement user-level rate limiting, (3) upgrade to Groq paid tier for production, (4) add circuit breaker pattern

**ElevenLabs Credits:**
- Current capacity: Free tier has limited credits
- Limit: CLAUDE.md warns "ElevenLabs credits are finite — do not call TTS API during development"
- Scaling path: (1) Implement caching: check if podcast already generated for this meeting, (2) implement MP3 caching strategy with CDN (Cloudinary already does this), (3) pre-generate sample podcasts for demo day

## Dependencies at Risk

**@openrouter/sdk ESM-Only Issue:**
- Risk: `@openrouter/sdk` is ESM-only, CommonJS backend can't import it properly
- Files: `backend/package.json` (line 21), `backend/src/routes/meetingQa.ts` (line 51)
- Impact: Uses raw `fetch` instead of SDK; if OpenRouter API changes, no upgrade path
- Migration plan: (1) Keep using raw fetch (current approach works), (2) consider switching to a CommonJS-compatible LLM client library, (3) or migrate entire backend to ESM (requires `"type": "module"` in package.json, multiple refactors)

**assemblyai Package With @ts-ignore:**
- Risk: AssemblyAI WebSocket client not properly typed
- Files: `backend/src/index.ts` (line 17)
- Impact: Unclear API surface, potential breaking changes on updates, type safety loss
- Migration plan: (1) Evaluate if `assemblyai` package has recent types updates, (2) or migrate to Deepgram Live Transcription (already using Deepgram, could consolidate), (3) or write .d.ts for the module

**Multer File Upload Without Virus Scanning:**
- Risk: Audio files uploaded to memory without content validation
- Files: `backend/src/routes/upload.ts` (lines 9-11)
- Impact: Malicious files could be stored/processed; no validation that file is actually audio
- Migration plan: (1) Add file type validation via magic numbers (check MIME type), (2) add file size warnings, (3) consider integrating virus scanner before storing

**TypeORM synchronize: true in Production:**
- Risk: `synchronize: true` in production auto-migrates schema on every app startup
- Files: `backend/src/lib/db.ts` (line 23)
- Impact: Risky for production deployments; could drop columns if entities change incorrectly
- Migration plan: (1) Use environment-based config: `synchronize: process.env.NODE_ENV === 'development'`, (2) implement proper migrations using TypeORM CLI, (3) require explicit migration runs before production deploys

## Missing Critical Features

**No API Request Rate Limiting:**
- Problem: No rate limiting on any endpoint, unauthenticated routes are vulnerable to abuse
- Blocks: Cannot safely expose to internet without DDoS protection; currently relies on Vercel's limits
- Implement: (1) Add `express-rate-limit` middleware with per-IP or per-user limits, (2) stricter limits on auth-free endpoints, (3) configurable limits per environment

**No Logging/Observability:**
- Problem: Console.log used throughout, no structured logging, no log aggregation
- Blocks: Cannot diagnose production issues, cannot track error rates, no audit trail for meetings
- Implement: (1) Add Winston or Pino for structured logging, (2) log to file or external service (e.g., LogRocket, Sentry), (3) add request ID tracking across logs

**No Request ID Correlation:**
- Problem: No unique ID to track a single user's request through multiple services
- Blocks: Cannot correlate logs across Groq API calls, Deepgram calls, ElevenLabs calls
- Implement: (1) Generate request ID in middleware, (2) pass through all API calls, (3) include in error responses

**No Graceful Shutdown:**
- Problem: Process.exit() not handled, connections may not close cleanly on SIGTERM
- Blocks: Deployments may lose in-flight requests
- Implement: (1) Add SIGTERM handler, (2) drain socket connections, (3) finish in-flight requests, (4) close DB connection pool

## Test Coverage Gaps

**Socket.IO Connection Lifecycle:**
- What's not tested: Connection establishment, audio streaming, error recovery, keep-alive interval, cleanup on disconnect
- Files: `backend/src/index.ts` (lines 68-183)
- Risk: Race conditions, memory leaks, double-cleanup issues could go undetected until production
- Priority: High — this is the most complex part of the codebase

**Transcript Saving Without Auth:**
- What's not tested: Unauthenticated transcript saves, cross-user transcript access, meeting ID collisions
- Files: `backend/src/routes/transcripts.ts`
- Risk: Security vulnerability likely to be found by first tester
- Priority: High — security-critical

**Insights Generation With Malformed Groq Response:**
- What's not tested: Groq returns invalid JSON, truncated JSON, missing fields, rate limit response
- Files: `backend/src/routes/insights.ts`
- Risk: Route crashes with unhandled exception
- Priority: Medium — edge case but impactful

**Meeting Save With Null Transcript:**
- What's not tested: Saving meeting without providing transcriptText (relies on Transcript table assembly), assembly with zero transcripts, assembly performance with 1000+ lines
- Files: `backend/src/routes/meetings.ts`
- Risk: Null pointer exception, slow query under load
- Priority: Medium

**Podcast Generation With ElevenLabs Failure:**
- What's not tested: ElevenLabs API timeout, invalid voice ID, rate limit, large text (>5000 chars)
- Files: `backend/src/routes/podcast.ts`
- Risk: Stalled HTTP request, stuck podcastStatus in DB
- Priority: Medium

**Frontend useDeepgramTranscription Hook:**
- What's not tested: Deepgram WebSocket connection failures, participant addition/removal during transcription, audio context cleanup, speaker detection edge cases
- Files: `frontend/hooks/useDeepgramTranscription.ts`
- Risk: Memory leaks, orphaned audio nodes, uncaught exceptions in callbacks
- Priority: High — runs during core feature

---

*Concerns audit: 2026-04-03*

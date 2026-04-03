# MeetMind AI — Claude Configuration

## Project Identity

**MeetMind AI** — Turn any meeting recording into a listenable podcast summary and structured action items.

Stack: Next.js 14 (App Router) · Express + TypeScript · PostgreSQL via TypeORM · Supabase storage · Clerk auth · Groq · Deepgram · ElevenLabs · OpenRouter · Cloudinary · Stream.io
Planning: See `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`

---

## Non-Negotiable Rules

- Write production-grade code only. No pseudo-code, no TODO comments, no placeholder implementations.
- No explanations unless explicitly asked. Return code, file paths, and errors only.
- Follow existing patterns in the codebase before inventing new ones. Read before writing.
- Never introduce a dependency that isn't already in `package.json` without stating it explicitly.
- Never use `any` in TypeScript except where the existing codebase already does.

---

## Architecture (Locked)

### Monorepo Layout
```
hackathon/
├── frontend/     # Next.js App Router — UI only, no API routes
├── backend/      # Express + TypeScript — all APIs, Socket.IO, DB
├── .env          # Shared root env (both frontend + backend read from here)
├── .planning/    # GSD project planning (do not modify without /gsd commands)
└── CLAUDE.md
```

### Immutable Decisions (from .planning/)
- Audio files never route through Next.js — use Supabase signed upload URLs (INFRA-02)
- Async pipeline: 4 separate API routes (upload → transcribe → analyze → podcast) — Vercel 10s timeout mitigation (INFRA-01)
- All API keys (GROQ, DEEPGRAM, ELEVENLABS, OPENROUTER) are backend-only — never in frontend env
- ElevenLabs credits are finite — do not call TTS API during development; pre-cache podcast MP3 before demo day
- Groq model: `llama-3.1-8b-instant` during dev, `llama-3.3-70b-versatile` for final testing
- Watermelon UI is the component library (hackathon sponsor, UI-03 requirement) — **integration pending Phase 3, not yet in code**
- Podcast audio stored in Cloudinary — never as base64 in PostgreSQL

---

## Code Quality Rules

### General
- All functions must handle errors explicitly — no silent failures
- Capture resource identifiers (meetingId, userId) before try blocks for use in catch
- All DB updates must include `userId` in the WHERE clause to prevent cross-user access
- Prefer `const` over `let`; never use `var`

### TypeScript
- `strict: false` in backend tsconfig (existing setting), but don't introduce new `any` types
- Use existing entity types from `backend/src/entities/`
- Use existing shared types from `frontend/lib/types.ts`

### API Responses
- Success: `{ success: true, data }` or flat `{ field }` (match existing pattern in route)
- Error: `res.status(4xx|5xx).json({ error: 'message' })`
- Never return stack traces in responses

---

## Frontend Rules

See `.claude/skills/nextjs-frontend.md` for full rules.

**Quick reference:**
- `'use client'` only for components with hooks, browser APIs, or event handlers
- All backend calls via `apiFetch(path, token, init)` from `frontend/lib/api.ts`
- Get Clerk token: `const { getToken } = useAuth(); const token = await getToken()`
- Token endpoints (`/api/deepgram-token`, `/api/assemblyai-token`) don't require auth
- Tailwind for all styling — no inline styles, no CSS modules

---

## Backend Rules

See `.claude/skills/express-backend.md` for full rules.

**Quick reference:**
- Backend runs on port 3001, frontend on port 3000
- Every protected route: `requireAuth()` middleware + `getAuth(req)` for userId
- Load env: `dotenv.config({ path: path.join(process.cwd(), '../.env') })`
- Alias publishable key at startup: `process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- File uploads: multer with `memoryStorage()`, 100MB limit

---

## Database Rules

See `.claude/skills/database-patterns.md` for full rules.

**Quick reference:**
- TypeORM + PostgreSQL (Supabase), `extra: { family: 4 }` to force IPv4
- `synchronize: true` in dev — tables auto-created
- Never store audio/video blobs in DB — Cloudinary for media
- All queries scoped to `userId`

---

## AI Integration Rules

See `.claude/skills/ai-integration.md` for full rules.

**Quick reference:**
- Groq structured output: `response_format: { type: 'json_object' }` always
- OpenRouter: use raw `fetch`, not `@openrouter/sdk` (ESM-only, breaks CommonJS)
- Deepgram: client-side WebSocket for live transcription, server-side fetch for file upload
- ElevenLabs: Phase 3 only, pre-cache MP3 before demo

---

## Auth & Security Rules

See `.claude/skills/auth-security.md` for full rules.

---

## Debugging

See `.claude/skills/debugging.md` for known issues and fixes.

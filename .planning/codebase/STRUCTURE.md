# Codebase Structure

**Analysis Date:** 2026-04-03

## Directory Layout

```
hackathon/
├── frontend/                    # Next.js 14 App Router — UI only, no API routes
│   ├── app/
│   │   ├── layout.tsx          # Root layout (Clerk provider, global styles)
│   │   ├── globals.css
│   │   ├── (auth)/             # Auth route group
│   │   │   ├── sign-in/
│   │   │   └── sign-up/
│   │   └── (root)/             # Protected app routes
│   │       ├── layout.tsx       # Wraps children with StreamVideoProvider
│   │       ├── (home)/         # Home tab group
│   │       │   ├── page.tsx    # Dashboard with meeting type cards
│   │       │   ├── upcoming/
│   │       │   ├── recordings/
│   │       │   ├── previous/
│   │       │   ├── personal-room/
│   │       │   └── insights/
│   │       ├── meeting/
│   │       │   └── [id]/       # Live meeting page (Stream.io video + transcription)
│   │       └── meeting-insights/
│   │           └── [id]/       # Insights page (summary, podcast, Q&A)
│   ├── components/             # Reusable React components
│   │   ├── ui/                # Shadcn/ui component primitives (dropdown, toast, etc.)
│   │   ├── MeetingRoom.tsx     # Live call UI (video layout, transcription panel, controls)
│   │   ├── MeetingSetup.tsx    # Pre-call setup (permissions, audio/video test)
│   │   ├── MeetingCard.tsx     # Dashboard meeting item
│   │   ├── CallList.tsx        # List of available calls to join
│   │   ├── TranscriptionPanel.tsx # Real-time transcript display during meeting
│   │   ├── InsightsTabs.tsx    # Tab navigation (Summary, Actions, Decisions, Timeline, Topics)
│   │   ├── PodcastPlayer.tsx   # Audio player for podcast recap
│   │   ├── QnAChatbot.tsx      # Q&A interface for meeting queries
│   │   ├── AudioUpload.tsx     # File upload for pre-recorded meetings
│   │   ├── EndCallButton.tsx   # End call trigger
│   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   ├── MobileNav.tsx       # Mobile navigation drawer
│   │   ├── Alert.tsx           # Error/permission alert component
│   │   ├── Loader.tsx          # Loading spinner
│   │   └── MeetingTypeList.tsx # Dashboard action buttons (new meeting, join, schedule)
│   ├── lib/                    # Utilities and API helpers
│   │   ├── api.ts              # apiFetch() wrapper with Bearer token injection
│   │   ├── types.ts            # Shared interfaces (IMeeting, IActionItem, etc.)
│   │   ├── utils.ts            # Tailwind cn() helper, date formatting
│   │   └── localTranscriptStorageClient.ts # In-memory transcript cache during meeting
│   ├── hooks/                  # Custom React hooks
│   │   ├── useGetCallById.ts   # Fetch Stream.io call by ID
│   │   └── [other hooks]       # Form handling, auth, etc.
│   ├── actions/                # Server actions (if any) or client-side action helpers
│   │   ├── stream.actions.ts   # Stream.io token generation via server action
│   ├── providers/              # Context providers
│   │   └── StreamClientProvider.tsx # Wraps app with Stream.io VideoClient
│   ├── public/                 # Static assets
│   │   ├── icons/
│   │   ├── images/
│   │   └── worklets/           # Reanimated worklets (if mobile-specific)
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── .env.local              # Frontend env (NEXT_PUBLIC_* only)
│
├── backend/                     # Express + TypeScript — All APIs, Socket.IO
│   ├── src/
│   │   ├── index.ts            # Express app setup, Socket.IO server, route mounting
│   │   ├── entities/           # TypeORM entity definitions
│   │   │   ├── Meeting.ts      # Meeting record with metadata and insights
│   │   │   └── Transcript.ts   # Real-time transcript log
│   │   ├── lib/                # Shared utilities and client factories
│   │   │   ├── db.ts           # TypeORM DataSource initialization + singleton pattern
│   │   │   ├── groq.ts         # Groq SDK client factory
│   │   │   ├── elevenlabs.ts   # ElevenLabs SDK client factory
│   │   │   └── assemblyai-ws.js # AssemblyAI WebSocket service (plain JS module)
│   │   └── routes/             # API endpoint handlers
│   │       ├── meetings.ts     # GET /api/meetings (list), POST /api/meetings/save, GET /api/meetings/:id
│   │       ├── transcripts.ts  # POST /api/transcripts/save (no auth, fire-and-forget)
│   │       ├── insights.ts     # POST /api/insights/generate (Groq orchestration)
│   │       ├── podcast.ts      # POST /api/podcast/generate (Groq + ElevenLabs + Cloudinary)
│   │       ├── upload.ts       # POST /api/upload (multer + Deepgram file transcription)
│   │       ├── meetingQa.ts    # POST /api/meeting-qa (OpenRouter Q&A with fallback)
│   │       ├── tokens.ts       # GET /api/deepgram-token, /api/assemblyai-token, /api/captions/token
│   │       └── health.ts       # GET /api/health (DB connection check)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                    # Backend env (API keys, database URL, etc.)
│
├── .env                        # Shared root env (read by both frontend and backend)
├── .planning/                  # GSD project planning
│   ├── codebase/              # (Generated by /gsd:map-codebase)
│   │   ├── STACK.md
│   │   ├── ARCHITECTURE.md
│   │   └── STRUCTURE.md
│   ├── PROJECT.md             # Product vision
│   ├── REQUIREMENTS.md        # Feature list
│   ├── ROADMAP.md             # Timeline and phases
│   └── STATE.md               # Current progress
├── .claude/                    # Claude-specific configuration
│   └── skills/                # Skill files (nextjs-frontend.md, express-backend.md, etc.)
├── README.md
├── CLAUDE.md                   # Project constraints and rules (non-negotiable)
└── .git/

```

## Directory Purposes

**`frontend/app/`:**
- Purpose: Next.js App Router pages (route segments, layouts, dynamic routes)
- Contains: Route-level React components, layout wrappers
- Key files: `layout.tsx` (root), `(auth)/*` (sign-in/sign-up), `(root)/*` (main app)

**`frontend/components/`:**
- Purpose: Reusable React components
- Contains: UI components for meetings, insights, player, Q&A
- Key files:
  - `MeetingRoom.tsx` — Live call interface with video grid + transcription
  - `InsightsTabs.tsx` — Tabbed view of insights (summary, actions, decisions, timeline, topics)
  - `PodcastPlayer.tsx` — Audio player with controls
  - `QnAChatbot.tsx` — Chat interface for asking questions about meeting

**`frontend/lib/`:**
- Purpose: Utility functions, API helpers, shared types
- Contains: `apiFetch()` abstraction, TypeScript interfaces, local state helpers
- Key files:
  - `api.ts` — `apiFetch(path, token, init)` for authenticated backend calls
  - `types.ts` — Shared `IMeeting`, `IActionItem`, etc. (mirrors backend entities without TypeORM decorators)

**`frontend/hooks/`:**
- Purpose: Custom React hooks for data fetching, form handling, auth
- Contains: Hooks prefixed with `use*`
- Key files: `useGetCallById.ts` — Fetches Stream.io call metadata

**`frontend/providers/`:**
- Purpose: React context providers
- Contains: `StreamClientProvider.tsx` wrapping app with Stream.io VideoClient
- Key files: `StreamClientProvider.tsx` — Initializes Stream.io client with Clerk user

**`frontend/actions/`:**
- Purpose: Server actions (async functions safe to call from client in Next.js)
- Contains: Token generation, data mutations
- Key files: `stream.actions.ts` — Generates Stream.io token via Clerk + custom signing

**`backend/src/entities/`:**
- Purpose: TypeORM entity definitions (schema + types)
- Contains: Entity classes with decorators, embedded interfaces (IActionItem, IDecision)
- Key files:
  - `Meeting.ts` — Core meeting record with status, transcript, summary, insights, podcast metadata
  - `Transcript.ts` — Real-time transcript event log (isFinal flag for confidence threshold)

**`backend/src/lib/`:**
- Purpose: Shared initialization and client factories
- Contains: Singleton patterns for external service clients
- Key files:
  - `db.ts` — TypeORM DataSource singleton; handles lazy initialization and connection reuse
  - `groq.ts` — Groq SDK client factory (lazy init on first use)
  - `elevenlabs.ts` — ElevenLabs SDK client factory
  - `assemblyai-ws.js` — AssemblyAI WebSocket service (plain JS, not TypeScript compiled)

**`backend/src/routes/`:**
- Purpose: API endpoint handlers organized by resource
- Contains: Express Router instances with handlers, middleware, validation
- Key files:
  - `meetings.ts` — CRUD for Meeting entity; save endpoint for meeting completion
  - `insights.ts` — POST handler orchestrating Groq prompt + response parsing
  - `podcast.ts` — POST handler orchestrating Groq script → ElevenLabs TTS → Cloudinary upload
  - `upload.ts` — POST handler with multer parsing + Deepgram file transcription
  - `meetingQa.ts` — POST handler with OpenRouter Q&A or fallback keyword matching
  - `tokens.ts` — GET endpoints providing temporary credentials for frontend SDKs

## Key File Locations

**Entry Points:**

- `frontend/app/layout.tsx` — Root Next.js layout; Clerk provider, global CSS
- `frontend/app/(root)/meeting/[id]/page.tsx` — Live meeting page; entry point for video call
- `frontend/app/(root)/meeting-insights/[id]/page.tsx` — Insights page; entry point for transcript review + podcast playback
- `backend/src/index.ts` — Express server setup; Socket.IO listener, route mounting

**Configuration:**

- `.env` — Shared environment variables (read by both frontend/backend via absolute path)
- `frontend/next.config.js` — Next.js build config (API rewrites if needed)
- `frontend/tsconfig.json` — TypeScript config with path aliases (`@/*` → `frontend/`)
- `backend/tsconfig.json` — TypeScript config with strict: false (per CLAUDE.md)
- `frontend/tailwind.config.ts` — Tailwind custom theme (dark mode colors)

**Core Logic:**

- `frontend/components/MeetingRoom.tsx` — Live meeting UI; Socket.IO event emission, transcript save on end call
- `frontend/app/(root)/meeting-insights/[id]/page.tsx` — Polling loop for insights generation; triggers Groq + ElevenLabs orchestration
- `backend/src/routes/insights.ts` — Groq prompt engineering + JSON parsing; upsert Meeting with insights
- `backend/src/routes/podcast.ts` — 4-step pipeline (Groq → ElevenLabs → Cloudinary → DB update)
- `backend/src/index.ts` — Socket.IO handlers for real-time transcription (start, audio-chunk, stop)

**Testing:**

- No test files present in repo (hackathon timeline; add before production)

## Naming Conventions

**Files:**

- Page components: PascalCase `.tsx` (e.g., `MeetingRoom.tsx`, `InsightsTabs.tsx`)
- Routes: kebab-case directories (e.g., `meeting/[id]/page.tsx`, `meeting-insights/[id]/page.tsx`)
- Utilities: camelCase `.ts` (e.g., `api.ts`, `utils.ts`, `localTranscriptStorageClient.ts`)
- Hooks: PascalCase starting with `use` (e.g., `useGetCallById.ts`)
- Server actions: camelCase `.ts` (e.g., `stream.actions.ts`)
- Backend routes: kebab-case matching endpoint path (e.g., `meetingQa.ts` → `/api/meeting-qa`)

**Directories:**

- Feature-based grouping: `components/`, `lib/`, `hooks/`, `providers/`, `actions/`
- Route hierarchy matches URL structure: `app/(root)/meeting/[id]/` → URL `/meeting/:id`
- Backend routes in single `routes/` directory; no nested structure

**Variables & Functions:**

- **Frontend:** camelCase (e.g., `handleLeave`, `setMeeting`, `fetchMeeting`)
- **Backend:** camelCase (e.g., `meetingId`, `getDb()`, `saveTranscript()`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `INSIGHTS_PROMPT`, `PODCAST_SCRIPT_PROMPT`)
- **TypeScript interfaces:** I-prefixed PascalCase (e.g., `IMeeting`, `IActionItem`, `IDecision`)
- **TypeScript types:** PascalCase no prefix (e.g., `CallLayoutType`)

## Where to Add New Code

**New Feature (e.g., Meeting Recordings):**
- Primary code: `backend/src/routes/[feature-name].ts` (POST handler with business logic)
- Frontend page: `frontend/app/(root)/[feature-route]/page.tsx`
- Components: `frontend/components/[FeatureComponent].tsx`
- Tests: Not present; create alongside route files (e.g., `routes/[name].test.ts`)

**New Component/Module (e.g., InsightsTabs sub-component):**
- Implementation: `frontend/components/[ComponentName].tsx` (default export)
- Styles: Tailwind classes inline (no CSS modules); reusable utilities in `frontend/lib/utils.ts`
- Props interface: Defined inline or exported from component file
- Usage: Import and compose in parent (e.g., `frontend/app/(root)/meeting-insights/[id]/page.tsx`)

**New Database Entity (e.g., User, Team):**
- Definition: `backend/src/entities/[EntityName].ts` (TypeORM @Entity)
- Migration: Not applicable (synchronize: true in dev; manual SQL for prod)
- Route: `backend/src/routes/[resource].ts` (CRUD handlers)
- Indexes: Add @Index decorators on frequently queried fields (userId, meetingId, etc.)

**Utilities & Helpers:**
- **Frontend:** `frontend/lib/utils.ts` (Tailwind cn(), date helpers)
- **Backend:** `backend/src/lib/[utility].ts` (client factories, shared functions)
- **Shared types:** `frontend/lib/types.ts` (interfaces used by both frontend/backend)

**API Token Endpoints:**
- Location: `backend/src/routes/tokens.ts`
- Pattern: GET handlers returning `{ token }` or `{ apiKey }` with no-cache headers
- Scope: Public (no auth); safe to expose temporary credentials

## Special Directories

**`frontend/.next/`:**
- Purpose: Generated build output
- Generated: Yes (by `next build`)
- Committed: No (in .gitignore)

**`frontend/public/`:**
- Purpose: Static assets (images, icons, worklets)
- Generated: No (manually added)
- Committed: Yes

**`backend/src/lib/assemblyai-ws.js`:**
- Purpose: AssemblyAI WebSocket service (not TypeScript compiled; imported with `@ts-ignore`)
- Generated: No (hand-written plain JS)
- Committed: Yes

**`.env` (root):**
- Purpose: Shared environment variables
- Generated: No (manual creation)
- Committed: No (in .gitignore; provide .env.example)
- Location: Loaded by `backend/src/lib/db.ts` via `path.join(process.cwd(), '/.env')` (absolute path from backend root)

**`.planning/codebase/`:**
- Purpose: Generated documentation (STACK.md, ARCHITECTURE.md, STRUCTURE.md)
- Generated: Yes (by `/gsd:map-codebase` command)
- Committed: Yes

## Import Path Conventions

**Frontend:**
- Absolute paths with `@/` alias: `import { apiFetch } from '@/lib/api'`
- Configured in `tsconfig.json`: `"@/*": ["./"]`
- Scope: All frontend code (components, pages, hooks, lib)

**Backend:**
- Relative paths: `import { getDb } from '../lib/db'`
- Absolute paths: `import * as path from 'path'` (Node builtins)

**Examples:**

```typescript
// Frontend
import { apiFetch } from '@/lib/api';
import MeetingRoom from '@/components/MeetingRoom';
import { useGetCallById } from '@/hooks/useGetCallById';
import StreamVideoProvider from '@/providers/StreamClientProvider';

// Backend
import { getDb } from '../lib/db';
import { getGroqClient } from '../lib/groq';
import { Meeting } from '../entities/Meeting';
```

---

*Structure analysis: 2026-04-03*

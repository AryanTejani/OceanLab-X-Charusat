# Project Architecture — MeetMind AI

## Monorepo Structure

```
hackathon/
├── frontend/                    # Next.js 14 App Router
│   ├── app/
│   │   ├── (auth)/              # sign-in, sign-up (Clerk)
│   │   └── (root)/
│   │       ├── (home)/          # dashboard, insights, personal-room, etc.
│   │       │   └── layout.tsx   # Sidebar + Navbar wrapper
│   │       ├── meeting/[id]/    # live meeting room (Stream.io)
│   │       └── meeting-insights/[id]/  # post-meeting insights page
│   ├── components/              # reusable React components
│   ├── hooks/                   # custom React hooks
│   ├── lib/
│   │   ├── api.ts               # apiFetch helper + API_URL
│   │   ├── types.ts             # shared TS types (no TypeORM deps)
│   │   ├── utils.ts             # cn() and utility functions
│   │   └── localTranscriptStorageClient.ts  # in-meeting transcript buffer
│   ├── providers/               # StreamClientProvider, etc.
│   ├── constants/               # sidebarLinks, avatarImages
│   ├── actions/                 # stream.actions.ts (Next.js server actions)
│   ├── middleware.ts             # Clerk route protection
│   ├── .env.example
│   └── package.json
│
├── backend/                     # Express + TypeScript
│   ├── src/
│   │   ├── index.ts             # Express entry, Socket.IO, startup
│   │   ├── routes/
│   │   │   ├── meetings.ts      # GET /, POST /save, GET /:id
│   │   │   ├── transcripts.ts   # POST /save (real-time line saves)
│   │   │   ├── insights.ts      # POST /generate
│   │   │   ├── podcast.ts       # POST /generate → Cloudinary
│   │   │   ├── upload.ts        # POST / (multer + Deepgram)
│   │   │   ├── meetingQa.ts     # POST / (OpenRouter via fetch)
│   │   │   ├── tokens.ts        # GET /deepgram-token, /assemblyai-token
│   │   │   └── health.ts        # GET /
│   │   ├── entities/
│   │   │   ├── Meeting.ts       # TypeORM entity
│   │   │   └── Transcript.ts    # TypeORM entity
│   │   └── lib/
│   │       ├── db.ts            # TypeORM DataSource
│   │       ├── groq.ts          # Groq client singleton
│   │       ├── elevenlabs.ts    # ElevenLabs client singleton
│   │       └── assemblyai-ws.js # AssemblyAI WebSocket service
│   ├── tsconfig.json
│   ├── .env.example
│   └── package.json
│
├── .env                         # Shared root env vars
├── .planning/                   # GSD planning (PROJECT.md, REQUIREMENTS.md, ROADMAP.md)
└── CLAUDE.md
```

## Separation of Concerns

### Frontend only
- React components, hooks, pages
- Clerk `useAuth()`, `useUser()`, Stream.io React SDK
- `localTranscriptStorageClient` (in-memory transcript buffer during meetings)
- `actions/stream.actions.ts` (Next.js `'use server'` — Stream.io token generation)
- Tailwind CSS, Watermelon UI (pending Phase 3)

### Backend only
- TypeORM entities and DB connection
- Groq, ElevenLabs, Cloudinary, AssemblyAI SDK usage
- All API keys that must not be in the browser
- Socket.IO server
- `multer` file handling

### Shared boundary
- `frontend/lib/types.ts` mirrors backend entity interfaces without TypeORM decorators
- Root `.env` is the single source of truth for all env vars

## Cross-Origin API Pattern

All frontend → backend calls use `apiFetch` from `frontend/lib/api.ts`:

```ts
// frontend/lib/api.ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function apiFetch(path: string, token: string | null, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
```

Usage pattern in every component:
```ts
const { getToken } = useAuth();
const token = await getToken();
const res = await apiFetch('/api/meetings', token);
```

Token endpoints (deepgram-token, assemblyai-token) pass `null` as token.

## Planning Workflow

The `.planning/` directory is managed by GSD commands only:
- `/gsd:plan-phase` — creates PLAN.md for a phase
- `/gsd:execute-phase` — executes plans
- `/gsd:verify-work` — verifies phase completion

Do not manually edit `.planning/STATE.md` or `.planning/ROADMAP.md`.

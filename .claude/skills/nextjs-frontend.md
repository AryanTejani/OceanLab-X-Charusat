# Next.js Frontend — MeetMind AI

## App Router Rules

### Server vs Client Components
- Default to Server Components. Add `'use client'` only when needed.
- `'use client'` required for: `useState`, `useEffect`, `useAuth`, `useUser`, `useCall`, `useRouter`, `useParams`, browser APIs, event handlers.
- Layouts are Server Components unless they wrap client providers.
- `actions/stream.actions.ts` uses `'use server'` — do not add `'use client'` to this file.

### File Conventions
```
app/(root)/(home)/[page]/page.tsx    # route page
app/(root)/(home)/layout.tsx         # shared layout with Sidebar + Navbar
components/SomeName.tsx              # React component (PascalCase)
hooks/useSomeName.ts                 # custom hook (camelCase, use prefix)
```

### Data Fetching
- Pages with `useEffect` + `useState` for data fetching are client components — mark `'use client'`.
- No `fetch('/api/...')` — all backend calls go through `apiFetch` from `lib/api.ts`.
- Get token before every authenticated API call: `const token = await getToken()`.

## API Call Pattern

```ts
'use client';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';

const { getToken } = useAuth();

// Authenticated call
const token = await getToken();
const res = await apiFetch('/api/meetings', token);

// Unauthenticated call (token endpoints)
const res = await apiFetch('/api/deepgram-token', null);

// File upload (no Content-Type — let browser set boundary)
const token = await getToken();
const res = await fetch(`${API_URL}/api/upload`, {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: formData,
});
```

## Tailwind CSS Rules

- All styling via Tailwind utility classes. No `style={{}}`, no CSS modules.
- Use `cn()` from `lib/utils.ts` for conditional classes.
- Dark theme: `bg-dark-1`, `bg-dark-2`, `bg-dark-3`, `bg-dark-4` (defined in globals.css).
- Brand color: `blue-1` = `#0E78F9`.

```ts
// Correct
<div className={cn('flex items-center gap-4', isActive && 'bg-dark-3')}>

// Wrong
<div style={{ display: 'flex', gap: '16px' }}>
```

## Watermelon UI (Pending — Phase 3)

**Status: NOT YET INTEGRATED. Do not use Watermelon UI components until Phase 3.**

Watermelon UI is the hackathon sponsor component library. It will replace or supplement current UI components in Phase 3 to satisfy requirement `UI-03`.

When Phase 3 begins:
- Install `@watermelonui/react` (or equivalent package name — verify at time of integration)
- Apply Watermelon UI design tokens over existing Tailwind setup
- Replace generic buttons, cards, and modals first
- Do not rewrite pages from scratch — apply incrementally

Current UI built with Tailwind + Radix UI primitives. Keep this working until Watermelon UI is confirmed compatible.

## Component Rules

- One component per file. File name = component name.
- Props interface defined at top of file, not inline.
- `useCallback` for functions passed as props to child components.
- `useMemo` for expensive derived values, not for trivial ones.

```ts
// Correct
interface MeetingCardProps {
  meetingId: string;
  title: string;
  status: 'processing' | 'completed' | 'failed';
}
const MeetingCard = ({ meetingId, title, status }: MeetingCardProps) => { ... };

// Wrong
const MeetingCard = ({ meetingId, title, status }: { meetingId: string; title: string; status: string }) => { ... };
```

## Shared Types

Use `frontend/lib/types.ts` for all meeting-related types. Do not import from `backend/src/entities/`.

```ts
import { IMeeting, IActionItem, IDecision } from '@/lib/types';
```

## Middleware

`frontend/middleware.ts` protects all routes except `/sign-in` and `/sign-up` via Clerk.
Protected routes include: `/`, `/upcoming`, `/meeting(.*)`, `/meeting-insights(.*)`, `/insights`, `/previous`, `/recordings`, `/personal-room`.

To add a new protected route, add it to the matcher in `middleware.ts`.

## State Management

No global state library. Use:
- `useState` / `useReducer` for local component state
- React Query or SWR if polling is needed (currently done with `setInterval` in meeting-insights page)
- `localTranscriptStorageClient` (singleton) for in-meeting transcript buffer — client-side only, cleared between meetings

## Performance

- `useCallback` on functions passed to `EndCallButton.onBeforeLeave` and similar cross-component callbacks.
- Lazy-load heavy components (`InsightsTabs`, `PodcastPlayer`) if they cause noticeable page weight.
- Polling (meeting-insights page) stops on `status === 'completed'` or `status === 'failed'` — always clear interval in cleanup.

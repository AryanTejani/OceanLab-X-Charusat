# Auth & Security — MeetMind AI

## Auth Provider: Clerk

Never roll custom JWT or session management. Clerk handles all of it.

### Frontend Auth
```ts
import { useAuth, useUser } from '@clerk/nextjs';

const { getToken, userId } = useAuth();
const { user } = useUser();

// Get JWT for backend calls
const token = await getToken();
```

### Backend Auth

`clerkMiddleware()` runs globally (applied in `backend/src/index.ts`). It does NOT enforce auth — it only populates the auth context.

`requireAuth()` enforces it on individual routes:
```ts
import { requireAuth, getAuth } from '@clerk/express';

router.post('/save', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
});
```

### Clerk Publishable Key Issue

`@clerk/express` requires `CLERK_PUBLISHABLE_KEY` (no `NEXT_PUBLIC_` prefix), but the env uses `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (Next.js convention).

Fix is in `backend/src/index.ts` before `clerkMiddleware()` is called:
```ts
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}
```

## Route Protection

### Frontend (Clerk middleware)
Protected routes in `frontend/middleware.ts`:
- `/` `/upcoming` `/meeting(.*)` `/meeting-insights(.*)` `/insights` `/previous` `/recordings` `/personal-room`
- Public: `/sign-in(.*)` `/sign-up(.*)`

### Backend
- Protected: all `/api/meetings/*`, `/api/insights/*`, `/api/podcast/*`, `/api/upload`
- Public (no auth): `/api/deepgram-token`, `/api/assemblyai-token`, `/api/captions/token`, `/api/meeting-qa`, `/api/transcripts/save`, `/api/health`

## API Key Security

| Key | Location | Rule |
|-----|----------|-------|
| `GROQ_API_KEY` | Backend only | Never in `NEXT_PUBLIC_*` |
| `DEEPGRAM_API_KEY` | Backend only | Token endpoint returns key to browser — key has limited scope |
| `ELEVENLABS_API_KEY` | Backend only | Never in `NEXT_PUBLIC_*` |
| `OPENROUTER_API_KEY` | Backend only | Never in `NEXT_PUBLIC_*` |
| `CLOUDINARY_*` | Backend only | Never in `NEXT_PUBLIC_*` |
| `DATABASE_URL` | Backend only | Never in `NEXT_PUBLIC_*` |
| `CLERK_SECRET_KEY` | Backend + frontend server | Never in `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend (NEXT_PUBLIC_ is safe — public by design) | OK in browser |
| `NEXT_PUBLIC_STREAM_API_KEY` | Frontend (NEXT_PUBLIC_ is safe) | OK in browser |

## File Upload Security

```ts
// Always validate in multer config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg'];
    cb(null, allowed.includes(file.mimetype));
  },
});
```

Frontend also validates before upload — double validation, defense in depth.

## Data Scoping

Every DB query that reads or writes user data must include `userId` in the WHERE clause:

```ts
// Correct — user can only access their own meetings
const meeting = await repo.findOneBy({ meetingId: id, userId });

// Wrong — any authenticated user can access any meeting
const meeting = await repo.findOneBy({ meetingId: id });
```

This applies to: `findOneBy`, `find`, `update`, `delete`. Not to `upsert` (handled via conflict path + initial userId set).

## CORS

Backend CORS is restricted to frontend origin:
```ts
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
```

Do not use `origin: '*'` — it would allow any website to call the API with the user's Clerk token.

## Error Messages

Never expose internal errors to clients:
```ts
// Correct
res.status(500).json({ error: 'Failed to generate insights' });

// Wrong — leaks stack trace
res.status(500).json({ error: error.message, stack: error.stack });
```

Log full errors server-side with `console.error`.

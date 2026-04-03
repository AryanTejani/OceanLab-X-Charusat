# Express Backend — MeetMind AI

## Entry Point Rules (`backend/src/index.ts`)

Load env FIRST before any imports that read `process.env`:
```ts
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '../.env') });

// Alias publishable key — @clerk/express needs CLERK_PUBLISHABLE_KEY (no NEXT_PUBLIC_ prefix)
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}
```

Apply `clerkMiddleware()` globally — it makes auth context available on every request without enforcing it:
```ts
app.use(clerkMiddleware());
```

CORS must allow frontend origin and `credentials: true`:
```ts
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
```

## Route Structure

Every route file exports a single Express Router. Mount in `index.ts`:
```ts
app.use('/api/meetings', meetingsRouter);
app.use('/api/transcripts', transcriptsRouter);
// etc.
```

## Auth Pattern

Every protected route uses `requireAuth()` middleware, then extracts `userId` via `getAuth`:
```ts
import { requireAuth, getAuth } from '@clerk/express';

router.get('/', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  // ...
});
```

Public routes (token endpoints, meeting-qa): omit `requireAuth()`.

## Error Recovery Pattern

Capture identifiers BEFORE the try block so they're accessible in catch:
```ts
// Correct
let meetingId: string | undefined;
let userId: string | undefined;
try {
  const auth = getAuth(req);
  userId = auth.userId || undefined;
  meetingId = req.body.meetingId;
  // ... do work
} catch (error) {
  if (meetingId && userId) {
    await repo.update({ meetingId, userId }, { status: 'failed' });
  }
  res.status(500).json({ error: 'Failed' });
}

// Wrong — meetingId not accessible in catch
try {
  const { meetingId } = req.body;
  // ...
} catch (error) {
  // can't access meetingId here
  await request.clone().json(); // also wrong — body already consumed
}
```

## Database Update Safety

All UPDATE calls must include `userId` in the WHERE clause:
```ts
// Correct
await repo.update({ meetingId, userId }, { status: 'completed' });

// Wrong — allows any user to overwrite any meeting
await repo.update({ meetingId }, { status: 'completed' });
```

## File Upload Pattern

```ts
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

router.post('/', requireAuth(), upload.single('audio'), async (req, res) => {
  const file = req.file; // { buffer, mimetype, originalname, size }
  if (!file) return res.status(400).json({ error: 'Audio file is required' });
  // Pass file.buffer to downstream services
});
```

## TypeScript Module System

Backend uses CommonJS (`"module": "commonjs"` in tsconfig). Consequences:
- Use `require()` style imports from plain JS libs if they're ESM-only
- `@openrouter/sdk` is ESM-only — use raw `fetch()` instead
- `ts-node-dev` with `--transpile-only` for fast restarts during dev

## Response Conventions

```ts
// Success
res.json({ success: true, meetingId, status: 'completed' });
res.json({ meeting });

// Error
res.status(400).json({ error: 'meetingId is required' });
res.status(401).json({ error: 'Unauthorized' });
res.status(404).json({ error: 'Meeting not found' });
res.status(500).json({ error: 'Failed to generate insights' });
```

Never return raw error objects or stack traces.

## Ports

- Backend: `process.env.BACKEND_PORT || 3001`
- Frontend: 3000 (hardcoded in `frontend/package.json` dev script)

## Dev Command

```bash
cd backend && npm run dev
# uses ts-node-dev --respawn --transpile-only src/index.ts
```

# Debugging — MeetMind AI

## Known Issues & Fixes

### 1. `ENETUNREACH` on Supabase connection

**Symptom:** `Error: connect ENETUNREACH [IPv6 address]:5432`
**Cause:** Supabase pooler DNS resolves to IPv6 on some networks
**Fix:** Add `extra: { family: 4 }` to TypeORM DataSource config in `backend/src/lib/db.ts`

### 2. Clerk publishable key missing in backend

**Symptom:** `Error: Publishable key is missing` from `@clerk/express` clerkMiddleware
**Cause:** `@clerk/express` reads `CLERK_PUBLISHABLE_KEY` but env only has `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
**Fix:** At top of `backend/src/index.ts`, after dotenv.config():
```ts
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}
```

### 3. `Unexpected token '<', "<!DOCTYPE"... is not valid JSON`

**Symptom:** Frontend fetch call throws JSON parse error with HTML content
**Causes (check in order):**
1. Backend is not running — start with `cd backend && npm run dev`
2. `NEXT_PUBLIC_API_URL` not set — frontend falls back to `http://localhost:3001` but backend is on a different port
3. Frontend is calling a Next.js route that no longer exists (old `/api/` routes) — ensure `frontend/app/api/` is empty
4. Backend CORS rejecting the request — check `FRONTEND_URL` in `.env`

### 4. Meeting not saved after call ends

**Symptom:** User ends meeting but nothing appears in Supabase meetings table
**Causes:**
1. Host clicked "End call for everyone" — `EndCallButton` must call `onBeforeLeave` prop (saveMeeting function)
2. `transcriptText` was empty and the `!transcriptText` guard was present — backend assembles from `transcripts` table, remove guard
3. Clerk token expired or missing — check browser network tab for 401 on `/api/meetings/save`

### 5. `NEXT_PUBLIC_*` env vars not picked up

**Symptom:** `process.env.NEXT_PUBLIC_API_URL` is `undefined` despite being in `.env`
**Cause:** Next.js bakes `NEXT_PUBLIC_*` vars at build time
**Fix:** Restart `npm run dev` after adding or changing any `NEXT_PUBLIC_*` var. They are NOT hot-reloaded.

### 6. TypeORM tables not created

**Symptom:** `relation "meetings" does not exist` error
**Cause:** Either DB connection failed silently, or `synchronize: true` is missing
**Check:**
1. Verify `GET /api/health` returns `{"status":"ok","db":"connected"}`
2. Check console for `❌ PostgreSQL connection failed`
3. Ensure `extra: { family: 4 }` is present (see issue #1)

### 7. Podcast stored as base64 in DB

**Symptom:** `meetings.podcastUrl` starts with `data:audio/mpeg;base64,` — causes slow queries and DB bloat
**Fix:** Route audio through Cloudinary, store `secure_url` only. The `podcast/generate` route should use `cloudinary.uploader.upload_stream()`.

### 8. `@openrouter/sdk` import fails in backend

**Symptom:** `SyntaxError: require() of ES Module` or `This expression is not constructable`
**Cause:** `@openrouter/sdk` is ESM-only, incompatible with CommonJS backend
**Fix:** Use raw `fetch('https://openrouter.ai/api/v1/chat/completions', ...)` directly

### 9. Deepgram WebSocket fails in meeting room

**Symptom:** `useDeepgramTranscription` can't start — JSON parse error on `/api/deepgram-token`
**Check:**
1. Backend is running (see issue #3)
2. `DEEPGRAM_API_KEY` is set in root `.env`
3. `API_URL` in `frontend/lib/api.ts` resolves to the backend port (default `http://localhost:3001`)

### 10. `multer` body undefined in upload route

**Symptom:** `req.file` is undefined in upload handler
**Cause:** `express.json()` middleware conflicts with `multer` — they can't both parse the same request
**Fix:** Multer and `express.json()` handle different content types. Multer is applied per-route, `express.json()` is global — this is correct. Verify the frontend sends `FormData` without explicit `Content-Type` header (let browser set it with boundary).

## Debugging Workflow

1. Check `/api/health` first — confirms DB connection
2. Check browser Network tab — look at the actual request URL, response code, and response body
3. Check backend terminal — all errors are logged with `console.error`
4. Isolate: is it a frontend, network, or backend problem?
   - Frontend broken: React console errors, wrong URL being called
   - Network broken: CORS error, backend not running, wrong port
   - Backend broken: 4xx/5xx response, check backend logs

## Logging Conventions

Backend logs follow emoji convention (from existing codebase):
- `✅` — success (DB connected, saved)
- `❌` — hard error
- `⚠️` — warning / soft failure
- `📤` — data sent/broadcast
- `💾` — data saved
- `🎤` — audio/transcription event
- `🔌` — socket connection event

Match existing emoji convention when adding log lines.

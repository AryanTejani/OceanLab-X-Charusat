# Stack Research

**Domain:** AI meeting insights micro-SaaS (audio transcription + LLM summarization + TTS podcast)
**Researched:** 2026-04-03
**Confidence:** HIGH (all core choices verified against official docs/npm as of April 2026)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.x (latest stable: 15.2.4) | Full-stack React framework | Vercel-native deployment, App Router enables RSC + API routes in one codebase, no separate backend needed — critical for hackathon speed. Note: Next.js 16 exists but 15.x is the battle-tested stable line. |
| React | 19.x | UI runtime | Bundled with Next.js 15. Concurrent features improve streaming UX. shadcn/ui is fully compatible. |
| Tailwind CSS | 4.x | Utility-first styling | Included in `create-next-app` by default. v4 uses CSS-first config (`@theme` directive, no `tailwind.config.js`). Output is ~70% smaller than v3. |
| shadcn/ui | latest (CLI-installed) | Component library | Not a versioned npm package — CLI-installed into your repo. Fully compatible with React 19 + Next.js 15 + Tailwind v4. No peer dependency issues as of 2026. |
| TypeScript | 5.x | Type safety | Default in `create-next-app`. Prevents silent bugs in API/data shape mismatches, which are common in multi-API pipelines like this one. |
| Supabase | `@supabase/supabase-js` 2.101.x, `@supabase/ssr` latest | Auth + Postgres DB + file storage | Three services in one free tier: auth, relational DB for metadata, and object storage for audio files. Eliminates need for separate auth service, database, and S3 bucket. |
| Deepgram | `@deepgram/sdk` 5.x | Speech-to-text transcription | Nova-3 model: ~95% accuracy, transcribes 1 hour of audio in 20 seconds (40x faster than OpenAI Whisper). Free tier: 2,000 requests/day + 7,200 audio-seconds/hour. Purpose-built STT API beats self-hosted Whisper for API-based deployments. |
| Groq | `groq-sdk` 1.1.x | LLM inference (summarization, action item extraction, decisions) | Fastest LLM inference available (LPU hardware). Free tier covers all hackathon needs. `llama-3.3-70b-versatile` or `llama3-8b-8192` work well for structured extraction. Critical for live-demo snappiness. |
| ElevenLabs | `elevenlabs` package (npm: `elevenlabs`) | Text-to-speech podcast generation | Most natural-sounding voices available. The "wow factor" for judges. Free tier: 10,000 credits/month (~10-20 min audio). Sufficient for hackathon demos. Note: free tier has no commercial rights — fine for demo purposes. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/ssr` | latest | Supabase server-side auth helpers for Next.js | Required for all Supabase auth in App Router. Replaces deprecated `@supabase/auth-helpers-nextjs`. Use `createServerClient` in Server Components/middleware, `createBrowserClient` in Client Components. |
| `react-hook-form` | 7.x | Form state management | Audio upload form, any data-entry forms. Lightweight, no re-renders on every keystroke. |
| `zod` | 3.x | Schema validation | Validate API request bodies and form inputs. Share schema between client and server for zero duplication. |
| `@hookform/resolvers` | 3.x | Zod integration for react-hook-form | Bridges Zod schemas into react-hook-form. Required when using Zod + RHF together. |
| `lucide-react` | latest | Icon library | Ships with shadcn/ui. No extra install needed. |
| `sonner` | latest | Toast notifications | Recommended by shadcn/ui. Better DX than alternatives. Use for upload success/failure feedback. |
| `clsx` + `tailwind-merge` | latest | Conditional class utilities | Ships with shadcn/ui via `cn()` utility. Use for dynamic Tailwind class merging. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint | Linting | Included with `create-next-app`. Use Next.js preset. |
| TypeScript strict mode | Type safety | Enable `"strict": true` in tsconfig.json from day one — fixing type errors retroactively is slow. |
| Vercel CLI | Local preview + deployment | `npx vercel dev` mirrors production environment including environment variable loading. |
| Supabase CLI | DB migrations, local dev | Optional for hackathon — using Supabase dashboard is faster for day-1 setup. |

---

## Installation

```bash
# Scaffold project (includes Next.js 15, React 19, Tailwind v4, TypeScript, ESLint)
npx create-next-app@latest meetmind --typescript --tailwind --eslint --app --src-dir

cd meetmind

# Initialize shadcn/ui (interactive CLI handles peer deps automatically)
npx shadcn@latest init

# Add commonly needed shadcn components
npx shadcn@latest add button card badge progress separator tabs

# Core API SDKs
npm install @supabase/supabase-js @supabase/ssr
npm install @deepgram/sdk
npm install groq-sdk
npm install elevenlabs

# Form handling + validation
npm install react-hook-form zod @hookform/resolvers

# UI utilities (likely already installed by shadcn init)
npm install sonner clsx tailwind-merge lucide-react
```

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| STT | Deepgram Nova-3 | OpenAI Whisper (gpt-4o-transcribe) | When accuracy is more important than speed and cost. GPT-4o-transcribe scores 8.9% WER vs Deepgram 12.8% WER, but is $6/1000 min vs $4.30/1000 min and significantly slower. Not worth it for hackathon free-tier budget. |
| STT | Deepgram Nova-3 | Groq Whisper Large v3 | If you want to consolidate API providers. Groq also offers Whisper Large v3 with 2,000 req/day + 7,200 audio-sec/hour on free tier. Slightly less accurate than Deepgram Nova-3 but eliminates one API dependency. Valid option for simplifying the stack. |
| LLM | Groq (llama-3.3-70b) | OpenAI GPT-4o | When you need best-in-class reasoning and have a budget. Groq's free tier + speed wins for demos. |
| LLM | Groq | Vercel AI SDK + provider abstraction | Use Vercel AI SDK (`ai` package) if you want provider-agnostic streaming, `useChat` hooks, and may swap LLM providers. Adds abstraction overhead but future-proofs provider switching. Recommended only if streaming chat UI is needed. |
| TTS | ElevenLabs | Google Cloud TTS | When per-character cost is more important than voice naturalness. Google TTS is cheaper but sounds robotic by comparison — it loses the "wow factor" that ElevenLabs provides to judges. |
| TTS | ElevenLabs | Groq TTS (PlayAI/PlayDialog) | Groq also offers text-to-speech on free tier. Less mature voice quality than ElevenLabs but eliminates one more API dependency. |
| Auth + DB | Supabase | Clerk (auth) + Neon (DB) | When you need advanced auth features (orgs, roles, MFA flows). For a hackathon, Supabase's bundled auth+DB+storage is faster to set up. |
| Styling | Tailwind v4 + shadcn/ui | Chakra UI / Mantine | When you need a fully-opinionated design system with no configuration. shadcn/ui gives more control over component code. Tailwind v4 is the 2026 standard. |
| Deployment | Vercel | Render / Railway | When functions need >300 seconds execution. Vercel Hobby has 10s timeout (300s with Fluid Compute on Hobby). Railway/Render have no serverless timeout. For a demo, Vercel's ease wins. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@supabase/auth-helpers-nextjs` | Officially deprecated — bug fixes will not be backported. Will break in future Next.js versions. | `@supabase/ssr` (the official replacement) |
| `supabase.auth.getSession()` inside Server Components | Not guaranteed to revalidate the auth token — creates session spoofing risk in SSR. | `supabase.auth.getUser()` — sends request to Supabase Auth server every time, guaranteed fresh. |
| Module-level Supabase client (singleton in a file) | Request state leaks between users in serverless environments — one user's session can bleed into another's response. | Initialize `createServerClient` inside each request handler. |
| Self-hosted Whisper | Requires GPU infrastructure, cold start latency, model download on server start. No free tier. | Deepgram Nova-3 API (or Groq Whisper) — managed, fast, free tier included. |
| Bull/BullMQ for audio processing queue | Requires Redis infrastructure. Overkill for a hackathon. Vercel serverless functions can't run persistent workers. | Use Vercel's `after()` API for fire-and-forget post-response processing, or process inline if audio is under ~2 min. |
| `pages/` Router (Next.js Pages Router) | The legacy routing model. App Router is the current standard with RSC, Server Actions, and better streaming support. | `app/` Router (App Router) — default in Next.js 15. |
| Prisma ORM | Adds migration complexity, cold-start overhead in serverless, and requires a separate migration step on every schema change. For a hackathon, it's too much ceremony. | Supabase's auto-generated TypeScript client provides type-safe queries directly from your DB schema. |

---

## Stack Patterns by Variant

**If audio file is under ~2 minutes:**
- Process inline in the API route: upload to Supabase Storage → call Deepgram → call Groq → call ElevenLabs → write results to DB → return 200
- Vercel Hobby Fluid Compute allows up to 300 seconds — enough for short meetings

**If audio file is 30-60 minutes (longer meetings):**
- Use Next.js `after()` to fire processing after sending a 202 Accepted response to the client
- Poll job status from the client with Supabase Realtime or simple polling on the meetings table
- Deepgram pre-recorded API handles up to 2GB files asynchronously on their end

**If you need live recording (browser microphone):**
- Use browser `MediaRecorder` API to capture audio chunks
- Send chunks to Deepgram Live Streaming WebSocket for real-time transcription
- Or record full session then upload for pre-recorded transcription (simpler, recommended for v1)

**If Groq rate limits are hit during the hackathon demo:**
- Switch extraction model to `llama3-8b-8192` (lower rate limits impact, slightly less quality)
- Or consolidate summary + action items + decisions into one prompt to reduce API calls from 3 to 1

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 15.x | React 19, Tailwind 4.x, shadcn/ui (latest), `@supabase/ssr` | Confirmed compatible as of April 2026 |
| shadcn/ui (latest CLI) | React 19, Next.js 15, Tailwind 4.x | shadcn announced full React 19 + Tailwind v4 compatibility. Run `npx shadcn@latest init` — CLI resolves peer deps automatically. |
| `@supabase/supabase-js` 2.x | Next.js 14/15, React 18/19 | No breaking issues. Use `@supabase/ssr` as the companion for server-side auth. |
| `@deepgram/sdk` 5.x | Node.js 18+, Next.js 15 API routes | Major version 5. If on 3.x, migration required. |
| `groq-sdk` 1.x | Node.js 18+, Next.js 15 API routes | Standard OpenAI-compatible client shape. Works in server routes, not client components (API key exposure). |
| `elevenlabs` (npm) | Node.js 18+, Next.js 15 API routes | Server-side only. Never import in client components. |
| Tailwind CSS 4.x | Next.js 15, shadcn/ui | CSS-first config (`@theme` in globals.css). `tailwind.config.js` is not used in v4. `create-next-app` bootstraps this automatically when `--tailwind` flag is used. |

---

## Critical Constraints for This Project

### Vercel Timeout Risk
Transcribing + summarizing + generating podcast for a long meeting (60 min audio) may exceed Vercel Hobby's timeout even with Fluid Compute. **Mitigation:** Use Next.js `after()` to process asynchronously and poll for status. For the hackathon demo, use short audio clips (5-15 min) to guarantee the demo works within timeout limits.

### ElevenLabs Free Tier is Tight
10,000 credits/month = ~10-20 minutes of audio. For a hackathon demo with multiple judges testing, credits can deplete quickly. **Mitigation:** Pre-generate the podcast for the demo recording rather than generating live. Keep a buffer of credits for live judging.

### Groq STT via Whisper Large v3: 100MB File Limit
Groq's Whisper endpoint has a 100MB audio file size limit. Deepgram has no documented equivalent limit. If using Groq for transcription (to consolidate providers), enforce a file size check before upload.

### API Keys Must Never Reach the Client
All five external APIs (Deepgram, Groq, ElevenLabs, Supabase service role) must only be called from Next.js API routes or Server Actions. Use `NEXT_PUBLIC_` prefix only for Supabase `url` and `anon` key (both are safe to expose — Supabase RLS policies protect data).

---

## Sources

- [Next.js 15 Release Notes](https://nextjs.org/blog/next-15) — version confirmed, App Router status
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) — confirmed 16.x exists, 15.x is prior stable line
- [Deepgram npm (@deepgram/sdk)](https://www.npmjs.com/package/@deepgram/sdk) — version 5.x confirmed, Node 18+ requirement
- [Deepgram vs Whisper comparison](https://deepgram.com/learn/whisper-vs-deepgram) — accuracy/speed/cost benchmarks (MEDIUM confidence, Deepgram-authored)
- [Groq SDK npm (groq-sdk)](https://www.npmjs.com/package/groq-sdk) — version 1.1.2 confirmed as of April 2026
- [Groq Rate Limits Docs](https://console.groq.com/docs/rate-limits) — free tier limits verified
- [Groq Whisper Large v3 Docs](https://console.groq.com/docs/model/whisper-large-v3) — 100MB limit confirmed
- [ElevenLabs npm](https://www.npmjs.com/package/elevenlabs) — package name confirmed
- [ElevenLabs Pricing 2026](https://elevenlabs.io/pricing) — free tier 10,000 credits/month confirmed
- [Supabase JS SDK npm](https://www.npmjs.com/package/@supabase/supabase-js) — version 2.101.1 confirmed
- [Supabase SSR Auth Guide](https://supabase.com/docs/guides/auth/server-side/nextjs) — `@supabase/ssr` as replacement for auth-helpers, `getUser()` vs `getSession()` guidance
- [shadcn/ui React 19 Compatibility](https://ui.shadcn.com/docs/react-19) — full Next.js 15 + React 19 + Tailwind v4 compatibility confirmed
- [Tailwind CSS v4 Release](https://tailwindcss.com/blog/tailwindcss-v4) — CSS-first config, size improvements
- [Vercel Function Duration Limits](https://vercel.com/docs/functions/configuring-functions/duration) — Hobby: 10s default, 300s with Fluid Compute
- [Next.js after() API](https://nextjs.org/docs/app/guides) — background processing post-response

---

*Stack research for: MeetMind AI — AI meeting insights micro-SaaS*
*Researched: 2026-04-03*

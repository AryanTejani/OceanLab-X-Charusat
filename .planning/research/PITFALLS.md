# Pitfalls Research

**Domain:** AI Meeting Intelligence / Meeting Insights Platform
**Researched:** 2026-04-03
**Confidence:** HIGH (stack-specific pitfalls verified against official docs and community sources)

---

## Critical Pitfalls

### Pitfall 1: Vercel Free Tier 10-Second Function Timeout Kills Audio Processing

**What goes wrong:**
Audio transcription and LLM summarization are chained in a single API route. For a 30-minute meeting recording, Deepgram processing + Groq inference + ElevenLabs TTS generation can easily exceed 10 seconds. Vercel's free tier hard-kills any serverless function after 10 seconds, returning a 504 Gateway Timeout to the user with no partial results saved.

**Why it happens:**
Developers treat Next.js API routes like a standard server that can run indefinitely. Vercel free plan enforces a 10-second max duration — no configuration override is possible at the free tier. Fluid Compute extends this to 1 minute, but only on paid plans.

**How to avoid:**
Split the pipeline into stages: (1) upload file to Supabase Storage immediately and return a job ID, (2) trigger transcription as a separate async step (or use a Supabase Edge Function with a longer timeout), (3) poll or use Supabase Realtime to push status updates to the client. Never chain upload → transcribe → summarize → TTS in a single HTTP request/response cycle. Alternatively, call Deepgram's async URL-based transcription (pass the Supabase public URL), which offloads work to Deepgram's servers.

**Warning signs:**
- Your local dev works fine but production returns 504 errors
- Requests succeed for short audio clips but fail for anything over 5 minutes
- Console shows "Function execution timed out" in Vercel logs

**Phase to address:** Foundation / Infrastructure phase (Day 1) — establish the async job pattern before building any feature on top of it.

---

### Pitfall 2: Next.js Server Action / API Route Body Limit Blocks Audio Upload

**What goes wrong:**
Next.js imposes a default 1MB body limit on server actions and API routes. An audio recording of even a 5-minute meeting easily exceeds this. The upload silently fails or returns a 413 error, and the file reaches Supabase Storage as a 15-byte stub that cannot be transcribed.

**Why it happens:**
Developers assume the server action or API route is just a proxy to Supabase Storage. In practice, the file body passes through Next.js first, hitting the body parser limit before it ever reaches Supabase.

**How to avoid:**
Upload audio files directly from the browser to Supabase Storage using signed upload URLs, bypassing the Next.js server entirely. The flow: (1) client requests a signed URL from a lightweight API route, (2) client POSTs the file directly to Supabase's storage endpoint, (3) client notifies the API route that the upload is complete. This is the official Supabase recommended pattern for large files.

**Warning signs:**
- Upload works for small test files but fails for real recordings
- Supabase Storage shows files with correct names but 0 or 15 bytes in size
- Network tab shows 413 errors or the server action hangs indefinitely

**Phase to address:** Foundation / File Upload phase (Day 1).

---

### Pitfall 3: LLM Hallucination in Action Items and Decisions

**What goes wrong:**
A single "summarize this transcript and extract action items and decisions" prompt produces plausible-sounding but fabricated outputs. Common failure modes: false attribution (assigning an action to someone who only asked a question), consensus fabrication (stating the group agreed when they didn't), and temporal smoothing (converting "maybe by Friday?" into "due Friday"). These look trustworthy and will embarrass users who share them.

**Why it happens:**
LLMs trained on formal text treat hedged, informal speech as commitments. Meeting language is ambiguous: "We should probably look at that" is not an action item, but models frequently flag it as one. Using a single catch-all prompt compounds the problem by forcing the model to infer structure, attribution, and temporality simultaneously.

**How to avoid:**
Use separate, chained prompts with strict output schemas: prompt 1 extracts action items (owner, task, deadline or "unspecified"), prompt 2 extracts decisions (what was decided, by whom), prompt 3 generates the narrative summary. Use Groq's JSON mode to enforce structured output and prevent freeform invention. Include explicit negative instructions: "Only extract items where a clear commitment was stated. If ownership is ambiguous, omit the item."

**Warning signs:**
- Action items list contains vague items like "discuss further" or "think about options"
- Decisions list includes items that were only raised as questions
- Owner field shows "the team" or "everyone" — a sign the model guessed

**Phase to address:** AI Processing / LLM Integration phase.

---

### Pitfall 4: ElevenLabs Free Tier Character Cap Breaks the Demo's Primary Differentiator

**What goes wrong:**
The AI podcast summary is MeetMind's headline feature for judges. ElevenLabs free tier allows 10,000 characters per month total, with a hard 2,500-character cap per individual generation request. A meeting summary sufficient for a compelling podcast recap typically runs 2,000–4,000 characters. Two or three demo runs during judging will exhaust the monthly quota, leaving judges with a broken feature.

**Why it happens:**
Developers test once, quota looks fine, then during demo day multiple submissions drain the allotment. The 2,500 per-request cap also means long summaries silently truncate or fail at the API level.

**How to avoid:**
Pre-generate podcast audio for the demo meeting before the event and store the MP3 in Supabase Storage. During live judging, play the cached file rather than regenerating. Implement a character count check before calling ElevenLabs and trim/truncate the input script to stay under 2,400 characters. Keep the podcast script concise by design (2–3 minute recap, not a full transcript reading). Have a fallback TTS option (browser's `window.speechSynthesis` or Google Cloud TTS free tier) if ElevenLabs quota is exhausted.

**Warning signs:**
- ElevenLabs returns 401 or 429 errors mid-demo
- Generated audio cuts off mid-sentence (hit per-request character limit)
- No character usage tracking in the app's admin view

**Phase to address:** AI Processing / TTS Integration phase, plus Demo Preparation phase.

---

### Pitfall 5: Deepgram Timestamp Drift and Wrong Encoding for Browser-Recorded Audio

**What goes wrong:**
The browser's `MediaRecorder` API produces WebM/Opus audio by default on Chrome. Sending this to Deepgram without specifying encoding causes a "Unknown transcription source type" error or produces garbled output. Additionally, Chrome WebM files lack duration metadata, which makes Deepgram's timestamp calculations unreliable for building the meeting timeline.

**Why it happens:**
Developers test Deepgram with pre-recorded MP3/WAV files that work fine, then switch to live recording without accounting for the format difference. MediaRecorder output format varies by browser (Chrome: WebM/Opus, Firefox: WebM/Vorbis, Safari: fragmented MP4) and none of them reliably embed duration metadata.

**How to avoid:**
For file uploads: accept MP3, M4A, WAV, and MP4 — all supported natively by Deepgram without specifying encoding. For live recording: either (1) explicitly set `mimeType: 'audio/webm;codecs=opus'` in MediaRecorder and pass `encoding: 'opus'` and `container: 'webm'` to Deepgram, or (2) use Deepgram's streaming WebSocket API directly from the browser, which sidesteps the file format issue entirely. Always validate audio files on upload before sending to Deepgram.

**Warning signs:**
- Works with uploaded MP3 files but fails with live recordings
- Deepgram returns 400 errors for browser-recorded audio
- Timeline timestamps show 00:00:00 for everything, or jump erratically

**Phase to address:** Audio Capture / Transcription phase.

---

### Pitfall 6: Missing HTTPS Blocks Microphone Access in Production

**What goes wrong:**
The browser `getUserMedia()` API requires a secure context (HTTPS). On localhost this is fine, but any HTTP deployment — including misconfigured Vercel previews or custom domains without TLS — will silently deny microphone permission. The user sees a permission denied error with no clear message about why.

**Why it happens:**
Works on localhost, developers assume it will work everywhere. Vercel preview URLs are HTTPS by default, but custom domains require manual SSL certificate configuration.

**How to avoid:**
Always deploy to Vercel's `.vercel.app` subdomain (HTTPS auto-provisioned) for the hackathon. If using a custom domain, verify the certificate before demo. Add a startup check in the UI: detect `window.isSecureContext` and display a clear error if false. Test microphone access on the actual deployed URL, not just localhost.

**Warning signs:**
- Microphone works in development but fails in production
- Browser shows "NotAllowedError" or "NotSupportedError" from getUserMedia
- No microphone permission prompt appears at all

**Phase to address:** Audio Capture phase.

---

### Pitfall 7: Groq Rate Limits During Demo Day

**What goes wrong:**
Groq's free tier for LLaMA 3.3 70B caps at approximately 6,000 tokens per minute and 500,000 tokens per day. A single long meeting transcript sent to Groq for summarization can be 10,000–30,000 tokens. One request can exceed the per-minute token limit, causing a 429 error. During a live demo with judges submitting meetings simultaneously, multiple requests stack and hit both per-minute and daily limits.

**Why it happens:**
Free tier token limits look large in isolation but are easily exceeded when processing full meeting transcripts rather than short prompts.

**How to avoid:**
Use `llama-3.1-8b-instant` for the demo — it has much higher rate limits (30,000 TPM) and is fast enough for summarization. If 70B quality is needed for output accuracy, chunk the transcript into sections (summarize-then-synthesize pattern) to spread token usage across multiple smaller requests. Pre-process demo meetings before judging and cache results. Implement retry with exponential backoff for 429 responses.

**Warning signs:**
- API returns "rate limit exceeded" errors during testing with full-length transcripts
- Processing works for short meetings but fails for 30+ minute recordings
- Errors appear only when multiple users test simultaneously

**Phase to address:** AI Processing / LLM Integration phase.

---

### Pitfall 8: Transcript Too Large for a Single LLM Context Window

**What goes wrong:**
A 1-hour meeting transcript can be 15,000–50,000 words, which may exceed or strain the context window of the chosen Groq model. Even within the context window, models degrade in quality on very long inputs — key decisions from the start of the meeting get "forgotten" or de-weighted in the summary.

**Why it happens:**
Developers test with 10-minute sample meetings. Real user meetings are 30–90 minutes. The problem only surfaces when users try to process real-world recordings.

**How to avoid:**
Implement a chunking strategy: split the transcript into 10-minute segments, summarize each chunk independently, then synthesize the chunk summaries into a final summary with a second LLM call. This is known as the map-reduce pattern for long document summarization. For the hackathon, set a practical input limit (e.g., 45 minutes / 10,000 words) and display a clear warning rather than silently degrading.

**Warning signs:**
- Summary quality drops sharply for meetings over 30 minutes
- LLM truncates output or returns partial results
- API returns context length exceeded errors

**Phase to address:** AI Processing / LLM Integration phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Chain all processing in one API route | Simpler code | Breaks on Vercel free tier timeout | Never — breaks in production |
| Upload files via Next.js server action | Simpler flow | Hits 1MB body limit | Never for audio files |
| Single "summarize everything" LLM prompt | Less code | High hallucination rate, poor structure | Only for prototype testing |
| Skip audio format validation | Faster to build | Silent failures, bad transcripts | Never |
| Hardcode Groq 70B model | Better output quality | Rate limit exhaustion during demo | Only if usage is very low |
| Skip loading states on AI processing | Simpler UI | Users think app is broken during 10–30s waits | Never — kills UX |
| No fallback for ElevenLabs failure | Less code | Demo differentiator breaks publicly | Never for hackathon demo |
| Expose Supabase service key in client | Quick auth bypass | Full database exposure | Never under any circumstances |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Deepgram | Send raw WebM bytes without specifying encoding | Pass `encoding: 'opus'` and `container: 'webm'` for browser recordings, or use Deepgram streaming WebSocket |
| Deepgram | Use pre-recorded API for live recording | Use Deepgram's streaming WebSocket for live, pre-recorded API for uploaded files |
| Deepgram | Set request timeout too short for large files | Set timeout to 5+ minutes; upload time dominates processing time |
| Groq | Send full 30-min transcript as single prompt | Chunk + map-reduce for transcripts over ~8,000 tokens |
| Groq | Use LLaMA 3.3 70B on free tier for all requests | Use `llama-3.1-8b-instant` for high-throughput paths; reserve 70B for final synthesis |
| ElevenLabs | Generate podcast audio on every request | Cache generated MP3 in Supabase Storage; only regenerate on transcript change |
| ElevenLabs | Pass full summary without character count check | Trim input to 2,400 characters maximum; design the podcast script to be concise |
| Supabase Storage | Upload via Next.js API route (hits 1MB limit) | Use signed upload URLs so browser uploads directly to Supabase |
| Supabase Storage | Use anon key for storage operations from server | Use service role key server-side; anon key client-side with RLS policies |
| Vercel | Chain all AI steps in one API route handler | Use async job pattern: upload → job record → process → poll/realtime |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Synchronous audio → transcript → summary → TTS pipeline | 504 errors, user-facing timeouts | Async job queue with status polling | Any file over ~5 minutes on free Vercel |
| Loading full transcript into browser state | Page freezes, memory warnings | Paginate or virtualize transcript display | Transcripts over ~50,000 characters |
| Re-transcribing on every page load | Wasted API credits, slow UX | Cache transcript + summary in Supabase DB row | Every reload |
| Generating ElevenLabs audio on every summary view | Exhausts 10K monthly char quota | Store generated audio URL in DB, serve from storage | After 3-4 full meetings |
| Fetching entire meetings table without pagination | Slow dashboard load | Limit query to 20 most recent, paginate | Over ~50 meetings per user |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing Supabase service role key in client-side code | Full database and storage access for any user | Use service role key only in server-side API routes; use anon key + RLS on client |
| No Row Level Security on meetings table | User A can read/delete User B's meetings | Enable RLS on all tables; policy: `user_id = auth.uid()` |
| Storing audio files in public Supabase Storage bucket | Anyone with the URL can access all meeting recordings | Use private buckets + signed URLs with short expiry (1 hour max) |
| Passing user input directly into LLM prompt without sanitization | Prompt injection — user can override system instructions | Wrap transcript in clear delimiters; use system vs. user message roles correctly |
| No rate limiting on transcription endpoint | Malicious user drains all free API credits | Add per-user request limits in middleware; track usage in DB |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during 15–30s AI processing | User thinks app is broken, refreshes and loses progress | Show step-by-step status: "Transcribing... Analyzing... Generating recap..." |
| Showing raw transcript before summary is ready | Users scroll walls of text instead of waiting for insights | Show a skeleton/loading state for the insights panel; transcript can appear early |
| Action items with no owner or due date shown as complete entries | Users can't act on them | Mark items with unresolved owner as "Unassigned" and visually distinguish them |
| No empty state for failed transcription | Blank screen with no error message | Show explicit error with suggestion (check audio quality, file format) |
| Podcast audio player without waveform or timestamp | No sense of how long or what's inside | Show duration and a simple play/pause/seek control at minimum |
| Processing silently fails when API quota exceeded | User waits indefinitely, no explanation | Catch 429/401 API errors explicitly and show a human-readable quota message |

---

## "Looks Done But Isn't" Checklist

- [ ] **File Upload:** Verify files over 10MB upload successfully — test with a real 30-minute recording, not a 1-minute test clip
- [ ] **Transcription:** Verify transcript is saved to the DB, not just returned in memory — refresh the page and confirm it persists
- [ ] **Action Items:** Verify items have owners — check that the LLM is actually identifying speakers, not just listing tasks
- [ ] **Decisions:** Verify decisions panel doesn't contain questions — manually scan for "?" entries that slipped through
- [ ] **Podcast Audio:** Verify ElevenLabs audio plays in the browser — check Content-Type header, cross-origin audio, and that the Supabase URL is accessible
- [ ] **Auth:** Verify a logged-out user cannot access another user's meeting URL directly — test with an incognito window
- [ ] **Error States:** Verify the app shows a useful message when Groq or ElevenLabs returns an error — kill your API key temporarily and observe the UI
- [ ] **Mobile:** Verify the dashboard is usable on a phone — judges may demo on mobile
- [ ] **Demo Meeting:** Verify a pre-processed demo meeting with cached podcast audio is ready — do not rely on live processing during judging

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Vercel timeout breaking pipeline | HIGH | Refactor to async job pattern; add Supabase processing_status column; significant rework |
| ElevenLabs quota exhausted mid-demo | LOW | Switch to browser `window.speechSynthesis` as fallback; pre-cache demo audio beforehand |
| Groq rate limit hit during demo | LOW | Switch model to `llama-3.1-8b-instant`; add retry with backoff |
| Deepgram format errors | MEDIUM | Add client-side format validation before upload; convert to MP3 with ffmpeg.wasm if needed |
| LLM hallucination in action items | MEDIUM | Add separate extraction prompts with JSON schema; add a "confidence" flag for uncertain items |
| Supabase RLS not configured | HIGH | Enable RLS, write policies, test thoroughly — cannot be skipped for user data |
| Audio file accessible publicly | MEDIUM | Move to private bucket + signed URLs; update all audio src references |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Vercel 10-second timeout | Phase 1: Infrastructure Setup | Upload a 20-minute audio file; confirm processing completes without 504 |
| Next.js 1MB upload body limit | Phase 1: Infrastructure Setup | Upload a 50MB file; confirm it reaches Supabase at correct size |
| LLM hallucination in extractions | Phase 2: AI Processing | Manual review of 5 meeting outputs for false action items and decisions |
| ElevenLabs quota exhaustion | Phase 2: AI Processing + Demo Prep | Character count check in code; pre-cached demo audio verified |
| Deepgram audio format errors | Phase 2: Audio Capture + Transcription | Test with WebM (live recording) and MP3/MP4 (file upload) |
| HTTPS required for microphone | Phase 1: Deployment Setup | Test getUserMedia on the live Vercel URL, not localhost |
| Groq rate limits | Phase 2: AI Processing | Simulate 3 simultaneous transcription jobs; verify no 429s |
| Transcript too large for LLM | Phase 2: AI Processing | Test with a 60-minute recording; verify summary covers full meeting |
| Missing auth/RLS | Phase 1: Auth Setup | Log in as User A, attempt to fetch User B's meeting ID directly |
| No progress indicators | Phase 3: UI/UX | Time the full processing pipeline; add loading states for each step |

---

## Sources

- [Vercel Function Duration Configuration](https://vercel.com/docs/functions/configuring-functions/duration) — official Vercel docs on free tier 10s limit
- [How to Solve Next.js Timeouts — Inngest Blog](https://www.inngest.com/blog/how-to-solve-nextjs-timeouts)
- [Supabase Standard Uploads Docs](https://supabase.com/docs/guides/storage/uploads/standard-uploads) — TUS resumable upload recommendation for files >6MB
- [Signed URL File Uploads with Next.js and Supabase — Medium](https://medium.com/@olliedoesdev/signed-url-file-uploads-with-nextjs-and-supabase-74ba91b65fe0)
- [Deepgram API Rate Limits](https://developers.deepgram.com/reference/api-rate-limits)
- [Deepgram: Recovering From Connection Errors](https://developers.deepgram.com/docs/recovering-from-connection-errors-and-timeouts-when-live-streaming-audio)
- [Deepgram Discussion: Unknown transcription source type](https://github.com/orgs/deepgram/discussions/732)
- [Groq Rate Limits Documentation](https://console.groq.com/docs/rate-limits)
- [Groq Free Tier Rate Limits Community FAQ](https://community.groq.com/t/what-are-the-rate-limits-for-the-groq-api-for-the-free-and-dev-tier-plans/42)
- [ElevenLabs Pricing — Free Tier Details](https://elevenlabs.io/pricing)
- [Why AI Meeting Summaries Miss Action Items — Alibaba Product Insights](https://www.alibaba.com/product-insights/why-is-my-ai-meeting-summary-missing-action-items-fixing-llm-hallucination-in-note-taking-tools.html)
- [Meeting Summarization with LLMs — AssemblyAI Blog](https://www.assemblyai.com/blog/summarize-meetings-llms-python)
- [Best Prompts for Summarizing Meetings — Gladia](https://www.gladia.io/blog/best-prompts-for-summarizing-online-meetings-with-large-language-models)
- [AI Transcription Tools: Privacy, Privilege and Ethical Pitfalls — Duane Morris](https://www.duanemorris.com/articles/ai_transcription_tools_privacy_privilege_ethical_pitfalls_0226.html)
- [MediaRecorder Cross-Browser Issues — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API)
- [Cross Browser Speech to Text — Medium](https://medium.com/@gaurav150190/cross-browser-speech-to-text-using-audio-recorder-20d3b1478f0c)

---
*Pitfalls research for: MeetMind AI — AI Meeting Intelligence Platform*
*Researched: 2026-04-03*

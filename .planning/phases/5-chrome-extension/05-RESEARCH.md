# Phase 5: Chrome Extension for External Meeting Capture - Research

**Researched:** 2026-04-03
**Domain:** Chrome Manifest V3 Extension / Tab Audio+Video Capture / Deepgram Streaming / AWS S3 Upload
**Confidence:** HIGH

## Summary

Chrome Manifest V3 extensions capture tab audio and video via `chrome.tabCapture.getMediaStreamId()` in a service worker, then redeem the stream ID in an **offscreen document** using `navigator.mediaDevices.getUserMedia()` with `chromeMediaSource: "tab"`. This is the only viable architecture for long-running recordings in MV3 -- service workers cannot hold MediaStreams (they idle-terminate after 30s of inactivity), so all media work MUST happen in the offscreen document.

The offscreen document mixes tab audio + user microphone via Web Audio API (reusing the exact pattern from the existing `useDeepgramTranscription.ts`), streams the mixed 16kHz mono PCM to Deepgram via WebSocket for live transcription, and records tab video+mixed audio via MediaRecorder (WebM/VP8+Opus). On recording stop, the video blob is uploaded to AWS S3 via presigned URL. Clerk auth syncs from the MeetMind web app to the extension via `@clerk/chrome-extension` with Sync Host.

**Primary recommendation:** Build a three-component extension (popup + service worker + offscreen document) using webpack + TypeScript, reusing existing Deepgram/audio-mixing patterns. Use `@clerk/chrome-extension` for auth sync. Upload video to S3 via backend-generated presigned URLs. The Recall.ai open-source extension is the reference architecture.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Chrome Extensions MV3 | Chrome 116+ | Extension platform | Required for tabCapture + offscreen document support |
| chrome.tabCapture API | Built-in | Tab audio+video stream capture | Only API that captures tab media without user picker dialog |
| chrome.offscreen API | Built-in | DOM context for MediaRecorder + Web Audio | Required in MV3 -- service workers cannot hold streams |
| MediaRecorder API | Built-in | Video recording from tab stream | Browser-native, no dependencies |
| Web Audio API | Built-in | Mix tab audio + mic into single stream | Same pattern as existing useDeepgramTranscription.ts |
| @clerk/chrome-extension | ^1.x | Auth in extension context | Official Clerk SDK for extensions, sync with web app |
| @aws-sdk/client-s3 | ^3.x | S3 operations (backend only) | Standard AWS SDK for presigned URL generation |
| @aws-sdk/s3-request-presigner | ^3.x | Generate presigned upload URLs (backend only) | Standard for direct-to-S3 uploads |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| webpack | ^5.x | Bundle TypeScript for extension | Build popup, background, offscreen entry points |
| ts-loader | ^9.x | TypeScript compilation in webpack | Compile .ts to .js for extension |
| copy-webpack-plugin | ^12.x | Copy static assets (HTML, manifest) | Extension requires specific file structure |
| @types/chrome | latest | Chrome extension API types | TypeScript support for chrome.* APIs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chrome.tabCapture | chrome.desktopCapture / getDisplayMedia | Requires user picker dialog every time -- worse UX. tabCapture is silent after initial permission |
| Offscreen document | Extension tab (chrome-extension://id/capture.html) | Works but opens visible tab. Offscreen is invisible, purpose-built for this |
| webpack | Plasmo framework | Plasmo adds abstraction but also complexity. Raw webpack matches existing project patterns |
| Raw WebSocket to Deepgram | Deepgram JS SDK | SDK adds bundle size. Existing codebase already uses raw WebSocket -- maintain consistency |

**New backend dependency (must add to backend/package.json):**
```bash
cd backend && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Extension is a separate package (new directory):**
```bash
mkdir extension && cd extension && npm init -y
npm install --save-dev webpack webpack-cli ts-loader copy-webpack-plugin clean-webpack-plugin typescript @types/chrome @types/node
npm install @clerk/chrome-extension
```

## Architecture Patterns

### Extension File Structure
```
extension/
├── manifest.json           # MV3 manifest with tabCapture, offscreen permissions
├── webpack.config.js       # Multi-entry: background, offscreen, popup
├── tsconfig.json           # ES2020 target, strict mode
├── package.json
├── popup.html              # Popup UI: tab list, start/stop, status
├── popup.css               # Tailwind-compiled or inline styles
├── offscreen.html          # Minimal HTML for offscreen document
├── audio-processor.js      # AudioWorklet processor (copy from frontend/public/)
├── src/
│   ├── background.ts       # Service worker: orchestration, state, messaging
│   ├── offscreen.ts        # Media capture, mixing, recording, Deepgram WS, S3 upload
│   ├── popup.ts            # UI logic, Clerk auth, API calls
│   ├── types.ts            # Shared message types, recording state
│   └── config.ts           # API URLs, Deepgram params, S3 config
└── dist/                   # webpack output (load as unpacked extension)
```

### Pattern 1: Service Worker + Offscreen Document Architecture
**What:** Three-component separation mandated by MV3 constraints.
**When to use:** Always -- this is the only viable pattern for tab capture in MV3.

Service worker (background.ts):
```typescript
// Source: Chrome Extensions official docs + Recall.ai reference
chrome.action.onClicked.addListener(async (tab) => {
  // Ensure offscreen document exists
  const contexts = await chrome.runtime.getContexts({});
  const hasOffscreen = contexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');

  if (!hasOffscreen) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Tab audio/video capture and recording',
    });
  }

  // Get stream ID -- MUST be called from service worker after user gesture
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });

  // Send to offscreen document to redeem
  chrome.runtime.sendMessage({
    type: 'START_CAPTURE',
    target: 'offscreen',
    streamId,
    tabId: tab.id,
  });
});
```

Offscreen document (offscreen.ts) -- stream redemption:
```typescript
// Source: Chrome Extensions official docs
async function startCapture(streamId: string) {
  // Redeem stream ID into actual MediaStream
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30,
      },
    } as MediaTrackConstraints,
  });

  // CRITICAL: Re-route tab audio to speakers (tabCapture mutes it by default)
  const output = new AudioContext();
  const tabAudioSource = output.createMediaStreamSource(tabStream);
  tabAudioSource.connect(output.destination);

  // Get user microphone
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Mix audio and start recording + transcription
  const mixedStream = mixAudio(tabStream, micStream);
  startRecording(mixedStream);
  startTranscription(tabStream, micStream);
}
```

### Pattern 2: Audio Mixing (reuse from existing codebase)
**What:** Combine tab audio + mic into single stream for MediaRecorder and Deepgram.
**When to use:** Always during capture.

```typescript
// Source: Recall.ai reference + existing useDeepgramTranscription.ts pattern
function mixAudio(tabStream: MediaStream, micStream: MediaStream): MediaStream {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();

  // Connect both sources to mix bus
  ctx.createMediaStreamSource(tabStream).connect(dest);
  ctx.createMediaStreamSource(micStream).connect(dest);

  // Return video tracks from tab + mixed audio track
  return new MediaStream([
    ...tabStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
}
```

For Deepgram (separate 16kHz mono stream):
```typescript
// Source: existing useDeepgramTranscription.ts pattern
function createDeepgramAudioStream(tabStream: MediaStream, micStream: MediaStream) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const mixBus = ctx.createGain();
  mixBus.gain.value = 1.0;

  ctx.createMediaStreamSource(tabStream).connect(mixBus);
  ctx.createMediaStreamSource(micStream).connect(mixBus);

  // AudioWorklet for PCM extraction
  // Reuse existing audio-processor.js from frontend/public/
  await ctx.audioWorklet.addModule('audio-processor.js');
  const worklet = new AudioWorkletNode(ctx, 'audio-processor');
  mixBus.connect(worklet);

  // Mute output
  const sink = ctx.createGain();
  sink.gain.value = 0;
  worklet.connect(sink);
  sink.connect(ctx.destination);

  return { ctx, worklet };
}
```

### Pattern 3: MediaRecorder with Chunked Data
**What:** Record video+audio to WebM blobs with periodic chunk emission.
**When to use:** For all recordings.

```typescript
// Source: MDN MediaRecorder + Recall.ai reference
function startRecording(mixedStream: MediaStream) {
  const mimeType = 'video/webm;codecs=vp8,opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    throw new Error(`MIME type ${mimeType} not supported`);
  }

  const recorder = new MediaRecorder(mixedStream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: mimeType });
    await uploadToS3(blob);
  };

  // Emit chunks every 10 seconds to reduce memory pressure
  recorder.start(10000);
  return recorder;
}
```

### Pattern 4: Deepgram WebSocket from Offscreen Document
**What:** Stream mixed audio to Deepgram for live transcription.
**When to use:** During active capture.

```typescript
// Source: existing useDeepgramTranscription.ts (adapted for extension context)
async function startDeepgramStream(worklet: AudioWorkletNode, apiKey: string) {
  const ws = new WebSocket(
    'wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&punctuate=true&diarize=true&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1',
    ['token', apiKey]
  );

  // KeepAlive every 5 seconds to prevent 10s timeout
  let keepAliveInterval: ReturnType<typeof setInterval>;

  ws.onopen = () => {
    keepAliveInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 5000);

    worklet.port.onmessage = (event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(event.data.audio_data);
      }
    };
  };

  ws.onclose = () => clearInterval(keepAliveInterval);

  return ws;
}
```

### Pattern 5: S3 Presigned URL Upload
**What:** Upload recorded video directly to S3 from extension.
**When to use:** When recording stops.

Backend endpoint (Express):
```typescript
// Source: AWS SDK v3 docs
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

router.get('/upload-url', requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  const { meetingId, contentType } = req.query;

  const key = `recordings/${userId}/${meetingId}.webm`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType as string || 'video/webm',
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  res.json({ url, key });
});
```

Extension upload (offscreen.ts):
```typescript
async function uploadToS3(blob: Blob) {
  // Get presigned URL from backend
  const token = await getClerkToken(); // from extension auth
  const resp = await fetch(`${API_URL}/api/upload-url?meetingId=${meetingId}&contentType=video/webm`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { url, key } = await resp.json();

  // Direct upload to S3
  await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'video/webm' },
  });

  return key;
}
```

### Pattern 6: Clerk Auth in Extension
**What:** Sync auth from MeetMind web app to extension via Clerk Sync Host.
**When to use:** Extension popup for all authenticated API calls.

```typescript
// popup.ts -- Clerk provider setup
import { ClerkProvider, useAuth } from '@clerk/chrome-extension';

const PUBLISHABLE_KEY = 'pk_...'; // From env or hardcoded for extension
const SYNC_HOST = 'http://localhost:3000'; // Dev: frontend URL

function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} syncHost={SYNC_HOST}>
      <CaptureUI />
    </ClerkProvider>
  );
}

function CaptureUI() {
  const { getToken, isSignedIn } = useAuth();

  async function startCapture() {
    const token = await getToken();
    // Pass token to background for API calls
    chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token });
    // Trigger capture
    chrome.runtime.sendMessage({ type: 'START_CAPTURE_REQUEST' });
  }
}
```

### Anti-Patterns to Avoid
- **Running MediaRecorder in service worker:** Service workers have no DOM, cannot hold MediaStreams, and idle-terminate. ALL media work in offscreen document.
- **Using chrome.tabCapture.capture() directly:** This is the MV2 pattern. In MV3, use getMediaStreamId() + offscreen document.
- **Storing video in memory as base64:** A 30-min 1080p recording is 200-500MB. Stream chunks or upload blob directly.
- **Auto-starting capture without user gesture:** Chrome requires explicit user action (click on extension icon) to grant tabCapture.
- **Revoking blob URL before download completes:** Causes corrupted/empty files. Wait for completion callback.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Extension auth | Custom JWT/cookie sync | @clerk/chrome-extension with Sync Host | Handles token refresh, session sync, edge cases |
| Deepgram reconnection | Custom retry logic | KeepAlive messages (JSON text frame every 5s) + reconnect on close | Deepgram has specific protocol; generic retry misses KeepAlive |
| S3 multipart upload | Custom chunk manager | Simple presigned PUT for files <5GB; @aws-sdk/lib-storage for >5GB | S3 multipart requires server-side init/complete + CORS ETag exposure |
| Audio mixing | Custom sample-level mixing | Web Audio API AudioContext + GainNode + MediaStreamDestination | Browser-optimized, hardware-accelerated, handles resampling |
| Extension messaging | Custom event system | chrome.runtime.sendMessage / onMessage | Built-in, handles serialization, cross-context communication |
| Tab lifecycle tracking | Custom polling | chrome.tabs.onRemoved + MediaStream track.onended | Native events, no polling overhead |

**Key insight:** The extension platform provides purpose-built APIs for every coordination problem. The only custom code needed is the glue logic connecting tabCapture -> audio mixing -> Deepgram WS + MediaRecorder -> S3 upload -> backend API calls.

## Common Pitfalls

### Pitfall 1: Tab Audio Muted After Capture
**What goes wrong:** Using tabCapture mutes the tab's audio output to the user by default.
**Why it happens:** Chrome routes audio to the extension's MediaStream instead of speakers.
**How to avoid:** Immediately reconnect audio to speakers via AudioContext:
```typescript
const output = new AudioContext();
const source = output.createMediaStreamSource(tabStream);
source.connect(output.destination);
```
**Warning signs:** User reports they can't hear the meeting after starting capture.

### Pitfall 2: Service Worker Idle Termination During Recording
**What goes wrong:** Chrome kills the service worker after 30s of inactivity, losing coordination state.
**Why it happens:** MV3 service workers are event-driven with aggressive idle cleanup.
**How to avoid:** Keep all media work in the offscreen document (which has no idle timeout with USER_MEDIA reason). The service worker only needs to stay alive during initial setup. For ongoing state, use chrome.storage.session.
**Warning signs:** Recording stops unexpectedly after ~30 seconds of no popup interaction.

### Pitfall 3: Microphone Permission in Extension Context
**What goes wrong:** getUserMedia() for microphone fails silently in popup because popup closes on blur.
**Why it happens:** Chrome closes popup when it loses focus (e.g., permission dialog opens).
**How to avoid:** Request mic permission from the offscreen document OR open a dedicated permission page (micsetup.html) as a tab first. Once granted, the offscreen document inherits the permission.
**Warning signs:** Mic permission prompt never appears, or capture starts with only tab audio.

### Pitfall 4: Deepgram WebSocket Timeout on Silence
**What goes wrong:** Deepgram closes connection after 10 seconds of no audio data.
**Why it happens:** Meeting has silence (muted participants, waiting for speaker).
**How to avoid:** Send KeepAlive JSON message (`{"type":"KeepAlive"}`) as TEXT frame every 5 seconds. Must be text, not binary.
**Warning signs:** Transcription stops mid-meeting, WebSocket closes with code indicating timeout.

### Pitfall 5: Blob URL Revoked Before Download Completes
**What goes wrong:** Video file is corrupted or empty (0 bytes).
**Why it happens:** URL.revokeObjectURL() called immediately after chrome.downloads.download().
**How to avoid:** Listen for chrome.downloads.onChanged event, wait for state === 'complete', THEN revoke.
**Warning signs:** Downloaded file is 0 bytes or won't play.

### Pitfall 6: Memory Pressure During Long Recordings
**What goes wrong:** Extension crashes or tab becomes unresponsive during 30-60 min recordings.
**Why it happens:** MediaRecorder chunks accumulate in memory array.
**How to avoid:** Use `recorder.start(10000)` to emit chunks every 10s. For recordings >30 min, consider streaming chunks to S3 multipart upload incrementally rather than accumulating all in memory.
**Warning signs:** Chrome task manager shows extension memory climbing steadily past 500MB.

### Pitfall 7: Platform Limitation -- Desktop Apps
**What goes wrong:** Extension cannot capture Zoom desktop, Teams desktop, Slack desktop, Discord desktop.
**Why it happens:** tabCapture only works on browser tabs. Desktop apps are separate processes.
**How to avoid:** Documentation must clearly state this captures BROWSER-BASED meetings only. Works with: Google Meet, Teams web (teams.microsoft.com), Slack Huddles (in browser), Discord web (discord.com), Zoom web (zoom.us/join).
**Warning signs:** Users complain extension doesn't work with their Zoom app.

### Pitfall 8: CORS with S3 Presigned URLs
**What goes wrong:** Upload fails with CORS error from extension context.
**Why it happens:** S3 bucket doesn't allow the chrome-extension:// origin.
**How to avoid:** Configure S3 CORS to allow chrome-extension origin and expose ETag header:
```json
{
  "CORSRules": [{
    "AllowedOrigins": ["chrome-extension://*"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }]
}
```
**Warning signs:** PUT to presigned URL returns CORS error in console.

## Code Examples

### Complete manifest.json
```json
{
  "manifest_version": 3,
  "name": "MeetMind AI Capture",
  "version": "1.0.0",
  "description": "Capture any browser meeting for AI-powered insights",
  "permissions": [
    "activeTab",
    "tabs",
    "tabCapture",
    "offscreen",
    "storage"
  ],
  "host_permissions": [
    "http://localhost:3001/*",
    "https://api.deepgram.com/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### webpack.config.js (multi-entry)
```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background.ts',
    offscreen: './src/offscreen.ts',
    popup: './src/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }],
  },
  resolve: { extensions: ['.ts', '.js'] },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json' },
        { from: 'popup.html' },
        { from: 'offscreen.html' },
        { from: 'audio-processor.js' },
        { from: 'icons', to: 'icons' },
      ],
    }),
  ],
};
```

### Message Types (src/types.ts)
```typescript
export type MessageType =
  | { type: 'START_CAPTURE_REQUEST'; target: 'background' }
  | { type: 'START_CAPTURE'; target: 'offscreen'; streamId: string; tabId: number }
  | { type: 'STOP_CAPTURE'; target: 'offscreen' }
  | { type: 'CAPTURE_STATUS'; status: 'recording' | 'stopped' | 'error'; error?: string }
  | { type: 'TRANSCRIPT_UPDATE'; text: string; isFinal: boolean; speaker?: string }
  | { type: 'SET_AUTH_TOKEN'; token: string }
  | { type: 'RECORDING_COMPLETE'; videoKey: string; meetingId: string };

export interface RecordingState {
  isRecording: boolean;
  meetingId: string | null;
  tabId: number | null;
  startTime: number | null;
  transcripts: Array<{ text: string; speaker?: string; timestamp: number }>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chrome.tabCapture.capture() in background page | chrome.tabCapture.getMediaStreamId() + offscreen document | Chrome 116 (Aug 2023) | MV3 extensions MUST use offscreen pattern |
| Background page for long-running tasks | Service worker + offscreen document | MV3 migration | Service workers idle-terminate; offscreen documents persist with USER_MEDIA |
| MV2 persistent background | MV3 event-driven service worker | Chrome 88+ | Must design for intermittent service worker lifecycle |
| Deepgram SDK in extension | Raw WebSocket (same as existing codebase) | N/A | SDK adds unnecessary bundle size; raw WS is simpler and consistent |

**Deprecated/outdated:**
- `chrome.tabCapture.capture()`: Still works in MV2 but cannot be called from service workers. Use `getMediaStreamId()` in MV3.
- Background pages: Replaced by service workers in MV3. No persistent background context.

## Open Questions

1. **Multipart upload threshold**
   - What we know: Simple presigned PUT works for files up to 5GB. 30-min 1080p WebM is typically 200-500MB.
   - What's unclear: Whether single PUT will timeout for large files on slow connections.
   - Recommendation: Start with simple presigned PUT. Add multipart only if uploads fail in testing. Keep chunk-streaming as a future optimization.

2. **Chrome Web Store review timeline**
   - What we know: tabCapture permission requires justification during review. Review can take 1-7 business days.
   - What's unclear: Whether the extension can be sideloaded for demo purposes without Store publishing.
   - Recommendation: For hackathon demo, use developer mode (load unpacked). Chrome Web Store submission is post-hackathon.

3. **Deepgram multichannel vs. single channel**
   - What we know: Deepgram supports multichannel=true with separate channels for better diarization.
   - What's unclear: Whether AudioWorklet can output two separate channel buffers (tab vs mic) efficiently.
   - Recommendation: Start with single mixed channel (matches existing codebase). Add multichannel as a future enhancement for better speaker attribution.

4. **Video URL field on Meeting entity**
   - What we know: Current Meeting entity has no videoUrl column.
   - What's unclear: Whether to add it as nullable text column or create a separate MeetingMedia entity.
   - Recommendation: Add `videoUrl: string | null` as nullable text column on Meeting entity (simple, matches existing pattern for podcastUrl).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (Chrome extension) + Jest for utility functions |
| Config file | extension/jest.config.js (Wave 0) |
| Quick run command | Load unpacked extension in chrome://extensions, click icon on a meeting tab |
| Full suite command | Manual end-to-end: capture meeting -> verify transcript -> verify video upload |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-01 | Extension captures tab audio+video | manual | Load extension, start capture on Meet tab | N/A - manual |
| EXT-02 | Live transcription appears during capture | manual | Verify transcript updates in popup during capture | N/A - manual |
| EXT-03 | Video uploads to S3 on stop | manual | Stop capture, verify S3 key returned | N/A - manual |
| EXT-04 | Meeting saved to backend DB | manual | Verify meeting appears in MeetMind dashboard | N/A - manual |
| EXT-05 | Auth syncs from web app | manual | Sign in on web app, verify extension shows signed-in state | N/A - manual |

### Sampling Rate
- **Per task commit:** Load unpacked and verify specific feature works
- **Per wave merge:** Full capture -> transcribe -> upload -> save flow
- **Phase gate:** Complete recording of a 2-min test meeting, verify transcript + video in dashboard

### Wave 0 Gaps
- [ ] `extension/` directory -- entire extension scaffold
- [ ] `extension/package.json` -- dependencies
- [ ] `extension/webpack.config.js` -- build pipeline
- [ ] `extension/manifest.json` -- MV3 manifest
- [ ] `extension/audio-processor.js` -- copy from frontend/public/
- [ ] Backend: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` install
- [ ] Backend: `GET /api/upload-url` endpoint
- [ ] Backend: `videoUrl` column on Meeting entity

## Sources

### Primary (HIGH confidence)
- [Chrome tabCapture API reference](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) - API methods, permissions, MV3 behavior, stream ID usage
- [Chrome offscreen API reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen) - Reasons, lifetime behavior, creation API
- [Chrome Audio recording and screen capture guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) - Official architecture pattern
- [Deepgram KeepAlive docs](https://developers.deepgram.com/docs/audio-keep-alive) - Protocol for maintaining long connections
- [Clerk Chrome Extension SDK](https://clerk.com/docs/reference/chrome-extension/overview) - Auth integration for extensions
- [Clerk Sync Host guide](https://clerk.com/docs/guides/sessions/sync-host) - Auth sync between web app and extension
- [AWS S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) - Direct upload pattern

### Secondary (MEDIUM confidence)
- [Recall.ai blog: How to build a Chrome recording extension](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension) - Detailed implementation walkthrough, verified against official docs
- [Recall.ai GitHub: chrome-recording-transcription-extension](https://github.com/recallai/chrome-recording-transcription-extension) - Reference implementation with MV3 architecture
- [Chrome longer service worker lifetimes blog](https://developer.chrome.com/blog/longer-esw-lifetimes) - Service worker idle timeout behavior
- [Deepgram recovering from errors](https://developers.deepgram.com/docs/recovering-from-connection-errors-and-timeouts-when-live-streaming-audio) - Reconnection patterns

### Tertiary (LOW confidence)
- Platform-specific tabCapture behavior (Meet vs Teams web vs Discord web) -- based on community reports, not official testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on official Chrome docs, official Clerk docs, reference implementations
- Architecture: HIGH - MV3 offscreen pattern is well-documented and the only viable approach
- Pitfalls: HIGH - Verified against official docs (tab audio muting, service worker lifecycle, Deepgram timeout)
- S3 integration: MEDIUM - Standard AWS pattern, but CORS with chrome-extension:// origin needs testing
- Platform compatibility: LOW - tabCapture works universally on browser tabs, but specific platform quirks are community-reported only

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (Chrome API is stable; Clerk SDK may update)

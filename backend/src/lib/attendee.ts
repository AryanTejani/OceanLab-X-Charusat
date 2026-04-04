import crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AttendeeBot {
  id: string;
  meeting_url: string;
  state: string;
  transcription_state: string;
  created_at: string;
}

export interface TranscriptSegment {
  speaker_name: string;
  speaker_uuid: string;
  timestamp_ms: number;
  duration_ms: number;
  transcription: unknown;
}

export interface RecordingInfo {
  recording_url: string;
  duration_ms: number;
  format: string;
  size_bytes: number;
}

// ── Config ───────────────────────────────────────────────────────────────────

const getBaseUrl = (): string =>
  process.env.ATTENDEE_API_BASE_URL || 'https://app.attendee.dev/api/v1';

const getApiKey = (): string => {
  const key = process.env.ATTENDEE_API_KEY;
  if (!key) throw new Error('ATTENDEE_API_KEY is not configured');
  return key;
};

// ── Retry helper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  attempts = 3
): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      // Only retry on 5xx server errors
      if (res.status >= 500 && i < attempts - 1) {
        const delay = 1000 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      if (i === attempts - 1) throw err;
      const delay = 1000 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('fetchWithRetry: exhausted attempts');
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Token ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`Attendee.dev ${context} failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function createBot(
  meetingUrl: string,
  botName?: string
): Promise<AttendeeBot> {
  const res = await fetchWithRetry(`${getBaseUrl()}/bots`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botName || 'MeetMind AI',
    }),
  });
  return handleResponse<AttendeeBot>(res, 'createBot');
}

export async function getBotStatus(botId: string): Promise<AttendeeBot> {
  const res = await fetchWithRetry(`${getBaseUrl()}/bots/${botId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
  return handleResponse<AttendeeBot>(res, 'getBotStatus');
}

export async function getBotTranscript(
  botId: string
): Promise<TranscriptSegment[]> {
  const res = await fetchWithRetry(`${getBaseUrl()}/bots/${botId}/transcript`, {
    method: 'GET',
    headers: authHeaders(),
  });
  return handleResponse<TranscriptSegment[]>(res, 'getBotTranscript');
}

export async function getBotRecording(botId: string): Promise<RecordingInfo> {
  const res = await fetchWithRetry(`${getBaseUrl()}/bots/${botId}/recording`, {
    method: 'GET',
    headers: authHeaders(),
  });
  return handleResponse<RecordingInfo>(res, 'getBotRecording');
}

// ── Webhook Signature Verification ──────────────────────────────────────────

export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  const secret = process.env.ATTENDEE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('ATTENDEE_WEBHOOK_SECRET not configured — skipping verification');
    return true; // Allow in dev when secret not set
  }

  try {
    const decodedSecret = Buffer.from(secret, 'base64');
    const parsed = JSON.parse(rawBody);
    const canonical = JSON.stringify(parsed, Object.keys(parsed).sort());
    const expected = crypto
      .createHmac('sha256', decodedSecret)
      .update(canonical)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch (err) {
    console.error('Webhook signature verification error:', err);
    return false;
  }
}

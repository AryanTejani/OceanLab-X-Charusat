// MeetMind AI — Background Service Worker
// Handles API calls, auto-auth via Clerk cookie, and bot status polling

import { API_URL, FRONTEND_URL } from './config';

interface BotSession {
  meetingId: string;
  botId: string;
  tabId: number;
  status: string;
  pollTimer?: ReturnType<typeof setInterval>;
}

const activeSessions = new Map<number, BotSession>();

// ── Auto-grab Clerk session token from cookie ────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  // First check if user manually set a token (fallback)
  const stored = await chrome.storage.sync.get(['authToken']);
  if (stored.authToken) return stored.authToken;

  // Auto-grab from Clerk __session cookie on the frontend domain
  try {
    const cookie = await chrome.cookies.get({
      url: FRONTEND_URL,
      name: '__session',
    });
    if (cookie?.value) return cookie.value;
  } catch (err) {
    console.error('Failed to read Clerk cookie:', err);
  }

  return null;
}

async function apiCall(
  path: string,
  method: string = 'GET',
  body?: Record<string, unknown>
): Promise<Response> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated — please sign in to MeetMind first');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    Authorization: `Bearer ${token}`,
  };

  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Bot dispatch ─────────────────────────────────────────────────────────────

async function sendBot(tabId: number, url: string): Promise<void> {
  if (activeSessions.has(tabId)) {
    notifyTab(tabId, {
      type: 'BOT_STATUS',
      status: activeSessions.get(tabId)!.status,
      message: 'Bot already dispatched for this meeting',
    });
    return;
  }

  try {
    const res = await apiCall('/api/bot/join', 'POST', {
      meetingUrl: url,
      title: 'Meeting from extension',
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to send bot');
    }

    const data = await res.json();
    const session: BotSession = {
      meetingId: data.meetingId,
      botId: data.botId,
      tabId,
      status: 'joining',
    };

    activeSessions.set(tabId, session);
    notifyTab(tabId, { type: 'BOT_STATUS', status: 'joining', message: 'Bot is joining...' });

    session.pollTimer = setInterval(() => pollStatus(tabId), 5000);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send bot';
    notifyTab(tabId, { type: 'BOT_ERROR', message });
  }
}

// ── Status polling ───────────────────────────────────────────────────────────

async function pollStatus(tabId: number): Promise<void> {
  const session = activeSessions.get(tabId);
  if (!session) return;

  try {
    const res = await apiCall(`/api/bot/status/${session.meetingId}`);
    if (!res.ok) return;

    const data = await res.json();
    session.status = data.botState || data.meetingStatus;

    notifyTab(tabId, {
      type: 'BOT_STATUS',
      status: session.status,
      meetingStatus: data.meetingStatus,
      meetingId: session.meetingId,
    });

    if (
      data.meetingStatus === 'completed' ||
      data.meetingStatus === 'failed' ||
      data.botState === 'fatal_error'
    ) {
      if (session.pollTimer) clearInterval(session.pollTimer);
      if (data.meetingStatus === 'completed') {
        notifyTab(tabId, {
          type: 'BOT_COMPLETE',
          meetingId: session.meetingId,
          insightsUrl: `${FRONTEND_URL}/meeting-insights/${session.meetingId}`,
        });
      }
      activeSessions.delete(tabId);
    }
  } catch (err) {
    console.error('Poll error:', err);
  }
}

function notifyTab(tabId: number, message: Record<string, unknown>): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

// ── Message listeners ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_BOT') {
    const tabId = sender.tab?.id;
    if (tabId && message.url) {
      sendBot(tabId, message.url);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'No tab context' });
    }
    return true;
  }

  if (message.type === 'SEND_BOT_FROM_POPUP') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id && tab.url) {
        sendBot(tab.id, tab.url);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: 'No active meeting tab' });
      }
    });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    const tabId = sender.tab?.id || message.tabId;
    const session = tabId ? activeSessions.get(tabId) : undefined;
    sendResponse(session ? { status: session.status, meetingId: session.meetingId } : null);
    return true;
  }

  if (message.type === 'CHECK_AUTH') {
    getAuthToken()
      .then((token) => {
        if (!token) {
          sendResponse({ authenticated: false });
          return;
        }
        return apiCall('/api/bot/verify')
          .then((res) => res.json())
          .then((data) => sendResponse({ authenticated: data.success }))
          .catch(() => sendResponse({ authenticated: false }));
      })
      .catch(() => sendResponse({ authenticated: false }));
    return true;
  }

  if (message.type === 'OPEN_LOGIN') {
    chrome.tabs.create({ url: `${FRONTEND_URL}/sign-in` });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const session = activeSessions.get(tabId);
  if (session?.pollTimer) clearInterval(session.pollTimer);
  activeSessions.delete(tabId);
});

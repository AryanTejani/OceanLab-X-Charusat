// MeetMind AI — Popup Script

import { FRONTEND_URL } from './config';

const MEETING_URL_PATTERNS = [
  /meet\.google\.com\/.+-/i,
  /zoom\.us\/j\//i,
  /teams\.microsoft\.com\/l\//i,
  /teams\.live\.com\//i,
];

function isMeetingUrl(url: string): boolean {
  return MEETING_URL_PATTERNS.some((p) => p.test(url));
}

function getPlatformName(url: string): string {
  if (/meet\.google\.com/i.test(url)) return 'Google Meet';
  if (/zoom\.us/i.test(url)) return 'Zoom';
  if (/teams\.(microsoft|live)\.com/i.test(url)) return 'Teams';
  return 'Meeting';
}

const $ = (id: string) => document.getElementById(id)!;

async function init(): Promise<void> {
  // Set dashboard link
  ($('dashboard-link') as HTMLAnchorElement).href = `${FRONTEND_URL}/insights`;

  // Check auth
  chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, async (response) => {
    const authDot = $('auth-dot');
    const authText = $('auth-text');

    if (response?.authenticated) {
      authDot.className = 'dot green';
      authText.textContent = 'Connected';

      // Check if on a meeting page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && isMeetingUrl(tab.url)) {
        $('meeting-section').classList.remove('hidden');
        $('meeting-info').textContent = `Detected: ${getPlatformName(tab.url)}`;

        // Check existing session
        chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: tab.id }, (status) => {
          if (status?.status) showBotStatus(status.status);
        });
      } else {
        $('no-meeting-section').classList.remove('hidden');
      }
    } else {
      authDot.className = 'dot red';
      authText.textContent = 'Not signed in';
      $('login-section').classList.remove('hidden');
    }
  });

  // Login button — opens MeetMind frontend sign-in page
  $('login-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LOGIN' });
  });

  // Send bot button
  $('send-bot-btn').addEventListener('click', () => {
    ($('send-bot-btn') as HTMLButtonElement).disabled = true;
    chrome.runtime.sendMessage({ type: 'SEND_BOT_FROM_POPUP' }, (response) => {
      if (response?.ok) {
        showBotStatus('joining');
      } else {
        showError(response?.error || 'Failed to send bot');
        ($('send-bot-btn') as HTMLButtonElement).disabled = false;
      }
    });
  });
}

function showBotStatus(status: string): void {
  const statusBar = $('bot-status');
  const dot = $('status-dot');
  const text = $('status-text');
  const sendBtn = $('send-bot-btn') as HTMLButtonElement;

  statusBar.classList.remove('hidden');

  const configs: Record<string, { color: string; text: string }> = {
    joining: { color: '#eab308', text: 'Bot is joining...' },
    waiting_room: { color: '#eab308', text: 'In waiting room — admit the bot' },
    joined_recording: { color: '#22c55e', text: 'Recording meeting' },
    post_processing: { color: '#3b82f6', text: 'Processing...' },
    processing: { color: '#3b82f6', text: 'Generating insights...' },
    completed: { color: '#22c55e', text: 'Insights ready!' },
    failed: { color: '#ef4444', text: 'Failed' },
    fatal_error: { color: '#ef4444', text: 'Bot error' },
  };

  const cfg = configs[status] || { color: '#6b7280', text: status };
  dot.style.background = cfg.color;
  text.textContent = cfg.text;

  sendBtn.disabled = !['failed', 'fatal_error'].includes(status);
  if (status === 'completed') {
    sendBtn.textContent = 'Send Another Bot';
    sendBtn.disabled = false;
  }
}

function showError(msg: string): void {
  const el = $('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// Listen for live status updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BOT_STATUS') showBotStatus(message.status);
  if (message.type === 'BOT_COMPLETE') showBotStatus('completed');
  if (message.type === 'BOT_ERROR') showError(message.message);
});

document.addEventListener('DOMContentLoaded', init);

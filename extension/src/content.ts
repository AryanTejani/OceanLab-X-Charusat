// MeetMind AI — Content Script
// Injected on meeting pages, shows floating "Send Bot" button

const MEETING_PATTERNS = [
  /meet\.google\.com\/.+-/i,
  /zoom\.us\/j\//i,
  /teams\.microsoft\.com\/l\/meetup-join/i,
  /teams\.live\.com\//i,
];

function isMeetingPage(): boolean {
  return MEETING_PATTERNS.some((p) => p.test(window.location.href));
}

function getPlatform(): string {
  const url = window.location.href;
  if (/meet\.google\.com/i.test(url)) return 'Google Meet';
  if (/zoom\.us/i.test(url)) return 'Zoom';
  if (/teams\.(microsoft|live)\.com/i.test(url)) return 'Teams';
  return 'Meeting';
}

let currentStatus: string | null = null;
let floatingBtn: HTMLElement | null = null;
let statusToast: HTMLElement | null = null;

function createFloatingButton(): void {
  if (floatingBtn) return;

  floatingBtn = document.createElement('div');
  floatingBtn.id = 'meetmind-floating-btn';
  floatingBtn.innerHTML = `
    <div class="meetmind-btn-inner">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 12l2 2 4-4"/>
      </svg>
      <span>Send MeetMind Bot</span>
    </div>
  `;
  floatingBtn.addEventListener('click', handleSendBot);
  document.body.appendChild(floatingBtn);
}

function createStatusToast(): void {
  if (statusToast) return;

  statusToast = document.createElement('div');
  statusToast.id = 'meetmind-status-toast';
  statusToast.style.display = 'none';
  document.body.appendChild(statusToast);
}

function updateStatus(status: string, message: string): void {
  currentStatus = status;
  if (!statusToast) createStatusToast();
  if (!statusToast) return;

  const colors: Record<string, string> = {
    joining: '#eab308',
    waiting_room: '#eab308',
    joined_recording: '#22c55e',
    leaving: '#3b82f6',
    post_processing: '#3b82f6',
    processing: '#3b82f6',
    completed: '#22c55e',
    failed: '#ef4444',
    fatal_error: '#ef4444',
    error: '#ef4444',
  };

  const color = colors[status] || '#6b7280';

  statusToast.innerHTML = `
    <div class="meetmind-toast-inner" style="border-left: 3px solid ${color}">
      <div class="meetmind-toast-dot" style="background: ${color}"></div>
      <span>${message}</span>
    </div>
  `;
  statusToast.style.display = 'block';

  // Update button text
  if (floatingBtn) {
    const inner = floatingBtn.querySelector('.meetmind-btn-inner span');
    if (inner) {
      if (status === 'joining' || status === 'waiting_room') {
        inner.textContent = 'Bot Joining...';
      } else if (status === 'joined_recording') {
        inner.textContent = 'Bot Recording';
      } else if (status === 'post_processing' || status === 'processing') {
        inner.textContent = 'Processing...';
      } else if (status === 'completed') {
        inner.textContent = 'View Insights';
      } else if (status === 'failed' || status === 'fatal_error') {
        inner.textContent = 'Send MeetMind Bot';
        currentStatus = null;
      }
    }
  }
}

function handleSendBot(): void {
  if (currentStatus === 'completed') {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response?.meetingId) {
        // Background will have the insights URL
        chrome.runtime.sendMessage({ type: 'OPEN_LOGIN' }); // fallback
      }
    });
    return;
  }

  if (currentStatus) return; // Already in progress

  updateStatus('joining', `Sending bot to ${getPlatform()}...`);
  chrome.runtime.sendMessage({
    type: 'SEND_BOT',
    url: window.location.href,
  });
}

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BOT_STATUS') {
    const statusMessages: Record<string, string> = {
      joining: 'Bot is joining the meeting...',
      waiting_room: 'Bot is in the waiting room — please admit it',
      joined_recording: 'Bot is recording the meeting',
      leaving: 'Bot is leaving...',
      post_processing: 'Processing recording...',
      processing: 'Generating insights...',
      ended: 'Recording complete!',
    };
    updateStatus(message.status, statusMessages[message.status] || `Status: ${message.status}`);
  }

  if (message.type === 'BOT_ERROR') {
    updateStatus('error', message.message || 'Failed to send bot');
    setTimeout(() => {
      if (statusToast) statusToast.style.display = 'none';
      currentStatus = null;
      if (floatingBtn) {
        const inner = floatingBtn.querySelector('.meetmind-btn-inner span');
        if (inner) inner.textContent = 'Send MeetMind Bot';
      }
    }, 5000);
  }

  if (message.type === 'BOT_COMPLETE') {
    updateStatus('completed', 'Insights ready! Click to view.');
  }
});

// Initialize
if (isMeetingPage()) {
  createFloatingButton();
  createStatusToast();

  // Check if there's an active session for this tab
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response?.status) {
      updateStatus(response.status, `Bot status: ${response.status}`);
    }
  });
}

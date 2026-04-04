'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';

const URL_PATTERNS = [
  /zoom\.us\/j\//i,
  /meet\.google\.com\//i,
  /teams\.microsoft\.com\/l\//i,
  /teams\.live\.com\//i,
];

function isValidMeetingUrl(url: string): boolean {
  return URL_PATTERNS.some((pattern) => pattern.test(url));
}

function getPlatformName(url: string): string {
  if (/zoom\.us/i.test(url)) return 'Zoom';
  if (/meet\.google\.com/i.test(url)) return 'Google Meet';
  if (/teams\.(microsoft|live)\.com/i.test(url)) return 'Microsoft Teams';
  return 'Meeting';
}

const BOT_STATE_CONFIG: Record<string, { label: string; color: string }> = {
  joining: { label: 'Bot is joining the meeting...', color: 'text-yellow-400' },
  waiting_room: { label: 'Bot is in the waiting room — please admit it', color: 'text-yellow-400' },
  joined_recording: { label: 'Bot is recording the meeting', color: 'text-green-400' },
  leaving: { label: 'Bot is leaving the meeting...', color: 'text-blue-400' },
  post_processing: { label: 'Processing recording...', color: 'text-blue-400' },
  ended: { label: 'Recording complete — generating insights...', color: 'text-blue-400' },
  fatal_error: { label: 'Bot encountered an error', color: 'text-red-400' },
};

const BotJoin = ({ onClose }: { onClose?: () => void }) => {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [botState, setBotState] = useState<string | null>(null);
  const [meetingStatus, setMeetingStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const { getToken } = useAuth();

  const urlValid = meetingUrl.trim().length > 0 && isValidMeetingUrl(meetingUrl);

  // Poll bot status after dispatch
  useEffect(() => {
    if (!meetingId) return;

    const poll = async () => {
      try {
        const token = await getToken();
        const res = await apiFetch(`/api/bot/status/${meetingId}`, token);
        if (res.ok) {
          const data = await res.json();
          setBotState(data.botState);
          setMeetingStatus(data.meetingStatus);

          // Redirect when insights are ready
          if (data.meetingStatus === 'completed' || data.meetingStatus === 'processing') {
            if (pollRef.current) clearInterval(pollRef.current);
            router.push(`/meeting-insights/${meetingId}`);
          }

          // Stop polling on failure
          if (data.meetingStatus === 'failed' || data.botState === 'fatal_error') {
            if (pollRef.current) clearInterval(pollRef.current);
            setError('Bot failed to join or record the meeting');
            setSending(false);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    pollRef.current = setInterval(poll, 5000);
    poll(); // Initial call

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [meetingId]);

  const handleSendBot = async () => {
    if (!urlValid) return;
    setSending(true);
    setError(null);

    try {
      const token = await getToken();
      const res = await apiFetch('/api/bot/join', token, {
        method: 'POST',
        body: JSON.stringify({
          meetingUrl,
          title: title || `${getPlatformName(meetingUrl)} Meeting`,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send bot');
      }

      const data = await res.json();
      setMeetingId(data.meetingId);
      setBotState('joining');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send bot';
      setError(message);
      setSending(false);
    }
  };

  // Active state — show bot status
  if (meetingId && botState) {
    const stateConfig = BOT_STATE_CONFIG[botState] || {
      label: `Bot status: ${botState}`,
      color: 'text-gray-400',
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center py-6">
          {/* Pulsing indicator */}
          <div className="relative mb-4">
            <div className="size-16 rounded-full bg-dark-3 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={stateConfig.color}>
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12l2 2 4-4" />
              </svg>
            </div>
            {botState !== 'fatal_error' && (
              <div className="absolute inset-0 rounded-full border-2 border-blue-1/30 animate-ping" />
            )}
          </div>

          <p className={`font-medium ${stateConfig.color}`}>{stateConfig.label}</p>
          <p className="text-gray-500 text-sm mt-2">
            {getPlatformName(meetingUrl)} meeting
          </p>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={onClose}
          className="w-full px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          Close
        </button>
      </div>
    );
  }

  // Initial state — URL input form
  return (
    <div className="space-y-4">
      <div className="text-left">
        <p className="text-gray-400 text-sm mb-4">
          Paste a Zoom, Google Meet, or Microsoft Teams link. A bot will join and
          record the meeting automatically.
        </p>
      </div>

      <input
        type="url"
        placeholder="https://meet.google.com/abc-defg-hij"
        value={meetingUrl}
        onChange={(e) => {
          setMeetingUrl(e.target.value);
          setError(null);
        }}
        className="w-full px-4 py-3 rounded-lg bg-dark-3 border border-dark-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-1"
      />

      {meetingUrl && !urlValid && (
        <p className="text-yellow-400 text-xs">
          Enter a valid Zoom, Google Meet, or Teams meeting link
        </p>
      )}

      <input
        type="text"
        placeholder="Meeting title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-4 py-2 rounded-lg bg-dark-3 border border-dark-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-1"
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleSendBot}
        disabled={!urlValid || sending}
        className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending ? 'Sending Bot...' : 'Send Bot to Meeting'}
      </button>
    </div>
  );
};

export default BotJoin;

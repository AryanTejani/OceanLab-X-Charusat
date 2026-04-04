'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { apiFetch } from '@/lib/api';

interface MeetingInvite {
  id: string;
  meetingId: string;
  meetingTitle: string;
  inviterName: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 6000;

export default function MeetingNotificationBell() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [invites, setInvites] = useState<MeetingInvite[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchInvites = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await apiFetch('/api/notifications/meeting-invites', token);
      const data = await res.json();
      if (data?.success && Array.isArray(data.data)) {
        setInvites(data.data);
      }
    } catch {
      // silent — polling failure shouldn't disrupt the UI
    }
  }, [getToken]);

  useEffect(() => {
    fetchInvites();
    const interval = setInterval(fetchInvites, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchInvites]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const dismiss = async (id: string) => {
    try {
      const token = await getToken();
      await apiFetch(`/api/notifications/meeting-invites/${id}/dismiss`, token, { method: 'PATCH' });
      setInvites((prev) => prev.filter((inv) => inv.id !== id));
    } catch {
      // silent
    }
  };

  const joinMeeting = (meetingId: string, id: string) => {
    dismiss(id);
    router.push(`/meeting/${meetingId}`);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center size-10 rounded-full hover:bg-dark-3 transition-colors"
        aria-label="Meeting notifications"
      >
        {/* Bell icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {invites.length > 0 && (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {invites.length > 9 ? '9+' : invites.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-dark-3 bg-dark-1 shadow-xl">
          <div className="border-b border-dark-3 px-4 py-3">
            <p className="text-sm font-semibold text-white">Meeting Invitations</p>
          </div>

          {invites.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-sky-2">
              No pending invitations
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-dark-3 overflow-y-auto">
              {invites.map((inv) => (
                <li key={inv.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-white">
                    {inv.meetingTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-sky-2">
                    Invited by <span className="font-medium">{inv.inviterName}</span>
                    {' · '}
                    {new Date(inv.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => joinMeeting(inv.meetingId, inv.id)}
                      className="rounded-md bg-blue-1 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-600 transition-colors"
                    >
                      Join Meeting
                    </button>
                    <button
                      onClick={() => dismiss(inv.id)}
                      className="rounded-md px-3 py-1 text-xs text-sky-2 hover:bg-dark-3 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

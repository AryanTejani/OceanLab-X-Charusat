'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Loader from '@/components/Loader';

interface MeetingListItem {
  meetingId: string;
  title: string;
  status: 'live' | 'processing' | 'completed' | 'failed';
  podcastStatus: 'none' | 'generating' | 'ready' | 'failed';
  participants: string[];
  createdAt: string;
  keyTopics: string[];
}

const InsightsPage = () => {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const res = await fetch('/api/meetings');
        if (res.ok) {
          const data = await res.json();
          setMeetings(data.meetings || []);
        }
      } catch (err) {
        console.error('Failed to fetch meetings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMeetings();
  }, []);

  if (loading) return <Loader />;

  const statusConfig: Record<string, { label: string; color: string }> = {
    live: { label: 'Live', color: 'bg-green-500' },
    processing: { label: 'Processing', color: 'bg-yellow-500' },
    completed: { label: 'Completed', color: 'bg-blue-1' },
    failed: { label: 'Failed', color: 'bg-red-500' },
  };

  return (
    <section className="flex size-full flex-col gap-6 text-white">
      <h1 className="text-3xl font-bold">Meeting Insights</h1>
      <p className="text-gray-400">
        View AI-generated summaries, action items, decisions, and podcast recaps.
      </p>

      {meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-16 rounded-full bg-dark-3 flex items-center justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5E6680" strokeWidth="1.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">No meetings yet</h2>
          <p className="text-gray-400 max-w-md">
            Start a meeting or upload a recording to get AI-powered insights.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {meetings.map((meeting) => {
            const status = statusConfig[meeting.status] || statusConfig.processing;
            return (
              <div
                key={meeting.meetingId}
                onClick={() => router.push(`/meeting-insights/${meeting.meetingId}`)}
                className="flex items-center justify-between p-4 rounded-xl bg-dark-3 border border-dark-4 hover:border-blue-1/50 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-white font-medium truncate">
                      {meeting.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full text-white flex-shrink-0 ${status.color}`}
                    >
                      {status.label}
                    </span>
                    {meeting.podcastStatus === 'ready' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-1/20 text-purple-1 border border-purple-1/30 flex-shrink-0">
                        Podcast
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>
                      {new Date(meeting.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {meeting.keyTopics && meeting.keyTopics.length > 0 && (
                      <span className="truncate max-w-[200px]">
                        {meeting.keyTopics.slice(0, 3).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#5E6680"
                  strokeWidth="2"
                  className="flex-shrink-0"
                >
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default InsightsPage;

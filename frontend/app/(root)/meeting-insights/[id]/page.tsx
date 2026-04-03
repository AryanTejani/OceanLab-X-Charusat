'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import InsightsTabs from '@/components/InsightsTabs';
import PodcastPlayer from '@/components/PodcastPlayer';
import Loader from '@/components/Loader';
import { apiFetch } from '@/lib/api';

interface MeetingData {
  meetingId: string;
  title: string;
  status: 'live' | 'processing' | 'completed' | 'failed';
  podcastStatus: 'none' | 'generating' | 'ready' | 'failed';
  summary?: string;
  actionItems: Array<{ text: string; assignee?: string; done: boolean }>;
  decisions: Array<{ text: string; context: string }>;
  timeline: Array<{ time: string; topic: string; summary: string }>;
  keyTopics: string[];
  transcriptText: string;
  participants: string[];
  podcastUrl?: string;
  podcastScript?: string;
  createdAt: string;
}

const SkeletonBlock = ({ className = '' }: { className?: string }) => (
  <div className={`bg-dark-3 rounded-lg animate-pulse ${className}`} />
);

const InsightsSkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-2 border-b border-dark-4 pb-2">
      {['w-20', 'w-24', 'w-20', 'w-20', 'w-24'].map((w, i) => (
        <SkeletonBlock key={i} className={`h-8 rounded-md ${w}`} />
      ))}
    </div>
    <SkeletonBlock className="h-4 w-3/4" />
    <SkeletonBlock className="h-4 w-full" />
    <SkeletonBlock className="h-4 w-5/6" />
    <SkeletonBlock className="h-4 w-2/3 mt-2" />
    <SkeletonBlock className="h-4 w-full" />
    <SkeletonBlock className="h-4 w-4/5" />
  </div>
);

const MeetingInsightsPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [podcastGenerating, setPodcastGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchMeeting = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await apiFetch(`/api/meetings/${id}`, token);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Meeting not found');
          return null;
        }
        throw new Error('Failed to fetch meeting');
      }
      const data = await res.json();
      setMeeting(data.meeting);
      return data.meeting;
    } catch {
      setError('Failed to load meeting');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const data = await fetchMeeting();
      if (data?.status === 'completed' || data?.status === 'failed') {
        stopPolling();
        setGenerating(false);
      }
    }, 3000);
  }, [fetchMeeting]);

  const generateInsights = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await apiFetch('/api/insights/generate', token, {
        method: 'POST',
        body: JSON.stringify({ meetingId: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate insights');
      }
      await fetchMeeting();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate insights';
      setError(message);
    } finally {
      setGenerating(false);
      stopPolling();
    }
  }, [id, fetchMeeting]);

  // Initial load: fetch → auto-generate if processing → poll for completion
  useEffect(() => {
    const init = async () => {
      const meetingData = await fetchMeeting();
      if (meetingData?.status === 'processing') {
        generateInsights();
        startPolling();
      }
    };
    init();
    return () => stopPolling();
  }, [fetchMeeting, generateInsights, startPolling]);

  const generatePodcast = async () => {
    setPodcastGenerating(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await apiFetch('/api/podcast/generate', token, {
        method: 'POST',
        body: JSON.stringify({ meetingId: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate podcast');
      }
      const data = await res.json();
      if (data.podcastUrl) {
        setMeeting(prev => prev ? { ...prev, podcastUrl: data.podcastUrl, podcastStatus: 'ready' } : prev);
      } else {
        await fetchMeeting();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate podcast';
      setError(message);
    } finally {
      setPodcastGenerating(false);
    }
  };

  if (loading) return <Loader />;

  if (error && !meeting) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
        <p className="text-red-400 text-lg">{error}</p>
        <button
          onClick={() => router.push('/insights')}
          className="mt-4 px-4 py-2 bg-blue-1 text-white rounded-lg hover:bg-blue-600"
        >
          Back to Meetings
        </button>
      </div>
    );
  }

  if (!meeting) return null;

  const statusColors: Record<string, string> = {
    live: 'bg-green-500',
    processing: 'bg-yellow-500',
    completed: 'bg-blue-1',
    failed: 'bg-red-500',
  };

  const isProcessing = generating || meeting.status === 'processing';

  return (
    <section className="flex size-full flex-col gap-6 text-white">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">{meeting.title}</h1>
          <span
            className={`px-2 py-0.5 text-xs rounded-full text-white ${statusColors[meeting.status] || 'bg-gray-500'}`}
          >
            {meeting.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>
            {new Date(meeting.createdAt).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {meeting.participants.length > 0 && (
            <span>
              {meeting.participants.length} participant
              {meeting.participants.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Processing banner */}
      {isProcessing && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-dark-3 border border-yellow-500/30">
          <div className="size-3 rounded-full bg-yellow-500 animate-pulse flex-shrink-0" />
          <div>
            <p className="text-yellow-200 text-sm font-medium">
              Analyzing meeting transcript...
            </p>
            <p className="text-yellow-200/60 text-xs mt-0.5">
              Generating summary, action items, decisions, and timeline. This
              takes ~15 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {meeting.status === 'completed' ? (
            <InsightsTabs meeting={meeting as any} />
          ) : isProcessing ? (
            <InsightsSkeleton />
          ) : meeting.status === 'failed' ? (
            <div className="text-center py-8">
              <p className="text-gray-400 mb-4">Insight generation failed.</p>
              <button
                onClick={generateInsights}
                disabled={generating}
                className="px-4 py-2 bg-blue-1 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {generating ? 'Retrying...' : 'Retry Analysis'}
              </button>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-80 space-y-4 flex-shrink-0">
          {/* Podcast section */}
          {meeting.status === 'completed' &&
            (meeting.podcastStatus === 'ready' && meeting.podcastUrl ? (
              <PodcastPlayer
                audioUrl={meeting.podcastUrl}
                title="Meeting Podcast"
              />
            ) : (
              <div className="rounded-xl bg-dark-3 p-4 border border-dark-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0E78F9"
                    strokeWidth="2"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                  AI Podcast Summary
                </h3>
                <p className="text-xs text-gray-400 mb-3">
                  Generate a podcast-style audio recap of this meeting.
                </p>
                <button
                  onClick={generatePodcast}
                  disabled={
                    podcastGenerating || meeting.podcastStatus === 'generating'
                  }
                  className="w-full px-3 py-2 bg-blue-1 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {podcastGenerating || meeting.podcastStatus === 'generating'
                    ? 'Generating Podcast...'
                    : meeting.podcastStatus === 'failed'
                      ? 'Retry Podcast'
                      : 'Generate Podcast'}
                </button>
              </div>
            ))}

          {/* Quick stats — show skeleton while processing */}
          <div className="rounded-xl bg-dark-3 p-4 border border-dark-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Quick Stats</h3>
            {isProcessing ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="text-center p-2 rounded-lg bg-dark-4 animate-pulse"
                  >
                    <div className="h-7 w-8 bg-dark-3 rounded mx-auto mb-1" />
                    <div className="h-3 w-16 bg-dark-3 rounded mx-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded-lg bg-dark-4">
                  <p className="text-xl font-bold text-blue-1">
                    {meeting.actionItems?.length || 0}
                  </p>
                  <p className="text-xs text-gray-400">Action Items</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-dark-4">
                  <p className="text-xl font-bold text-green-400">
                    {meeting.decisions?.length || 0}
                  </p>
                  <p className="text-xs text-gray-400">Decisions</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-dark-4">
                  <p className="text-xl font-bold text-purple-1">
                    {meeting.keyTopics?.length || 0}
                  </p>
                  <p className="text-xs text-gray-400">Topics</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-dark-4">
                  <p className="text-xl font-bold text-orange-1">
                    {meeting.timeline?.length || 0}
                  </p>
                  <p className="text-xs text-gray-400">Timeline</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default MeetingInsightsPage;

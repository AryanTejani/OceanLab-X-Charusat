'use client';
import { useState } from 'react';
import {
  CallControls,
  CallParticipantsList,
  CallStatsButton,
  CallingState,
  PaginatedGridLayout,
  SpeakerLayout,
  useCall,
  useCallStateHooks,
} from '@stream-io/video-react-sdk';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, LayoutGrid, MonitorPlay, FileText } from 'lucide-react';
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';
import { AnimatePresence, motion } from 'framer-motion';

import Loader from './Loader';
import EndCallButton from './EndCallButton';
import TranscriptionPanel from './TranscriptionPanel';
import { cn } from '@/lib/utils';

type CallLayoutType = 'grid' | 'speaker-left' | 'speaker-right';

const LAYOUT_OPTIONS: { label: string; value: CallLayoutType }[] = [
  { label: 'Grid', value: 'grid' },
  { label: 'Speaker Left', value: 'speaker-left' },
  { label: 'Speaker Right', value: 'speaker-right' },
];

const MeetingRoom = () => {
  const searchParams = useSearchParams();
  const isPersonalRoom = !!searchParams.get('personal');
  const router = useRouter();
  const call = useCall();
  const [layout, setLayout] = useState<CallLayoutType>('speaker-left');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { useCallCallingState } = useCallStateHooks();

  const callingState = useCallCallingState();

  const handleLeave = async () => {
    const transcriptText = localTranscriptStorageClient.getTranscriptText?.();
    const callId = call?.id;

    if (!transcriptText || !callId) {
      router.push('/');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/meetings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: callId,
          transcriptText,
          title:
            call?.state?.custom?.description ||
            `Meeting ${new Date().toLocaleDateString()}`,
          participants:
            call?.state?.members?.map((m) => m.user?.name || m.user_id) || [],
        }),
      });
      if (res.ok) {
        router.push(`/meeting-insights/${callId}`);
        return;
      }
    } catch (err) {
      console.error('Failed to save meeting transcript:', err);
    } finally {
      setIsSaving(false);
    }
    router.push('/');
  };

  if (callingState !== CallingState.JOINED) return <Loader />;

  const CallLayout = () => {
    switch (layout) {
      case 'grid':
        return <PaginatedGridLayout />;
      case 'speaker-right':
        return <SpeakerLayout participantsBarPosition="left" />;
      default:
        return <SpeakerLayout participantsBarPosition="right" />;
    }
  };

  return (
    <section className="relative h-screen w-full overflow-hidden pt-4 text-white">
      {isSaving && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-1/90 gap-3">
          <div className="size-10 rounded-full border-4 border-blue-1 border-t-transparent animate-spin" />
          <p className="text-white text-lg font-medium">
            Saving meeting insights...
          </p>
        </div>
      )}

      <div className="relative flex size-full items-center justify-center">
        <div className="flex size-full max-w-[1000px] items-center">
          <CallLayout />
        </div>
        <div
          className={cn('h-[calc(100vh-86px)] hidden ml-2', {
            'show-block': showParticipants,
          })}
        >
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
      </div>

      {/* Bottom controls bar */}
      <div className="fixed bottom-0 flex w-full items-center justify-center gap-5 pb-2">
        <CallControls onLeave={handleLeave} />

        {/* Layout picker — Watermelon UI style tooltip-driven menu */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutMenu((p) => !p)}
            className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b] transition-colors"
            aria-label="Change layout"
          >
            <LayoutGrid size={20} className="text-white" />
          </button>

          <AnimatePresence>
            {showLayoutMenu && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                className="absolute bottom-14 left-1/2 -translate-x-1/2 w-44 rounded-xl border border-white/10 bg-dark-1 shadow-2xl overflow-hidden"
              >
                {LAYOUT_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setLayout(opt.value);
                      setShowLayoutMenu(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                      layout === opt.value
                        ? 'bg-blue-1 text-white font-semibold'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white',
                      i > 0 && 'border-t border-white/5'
                    )}
                  >
                    <MonitorPlay size={14} className="shrink-0" />
                    {opt.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <CallStatsButton />

        <button
          onClick={() => setShowParticipants((prev) => !prev)}
          className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b] transition-colors"
          aria-label="Toggle participants"
        >
          <Users size={20} className="text-white" />
        </button>

        <button
          onClick={() => setShowTranscription((prev) => !prev)}
          className={cn(
            'cursor-pointer rounded-2xl px-4 py-2 transition-colors',
            showTranscription
              ? 'bg-blue-1 hover:bg-blue-1/80'
              : 'bg-[#19232d] hover:bg-[#4c535b]'
          )}
          aria-label="Toggle transcription"
        >
          <FileText size={20} className="text-white" />
        </button>

        {!isPersonalRoom && <EndCallButton />}
      </div>

      {/* Transcription Panel */}
      <TranscriptionPanel
        isOpen={showTranscription}
        onToggle={() => setShowTranscription(!showTranscription)}
      />
    </section>
  );
};

export default MeetingRoom;

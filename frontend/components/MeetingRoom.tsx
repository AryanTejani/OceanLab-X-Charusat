'use client';
import { useState, useCallback } from 'react';
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
import { useAuth } from '@clerk/nextjs';
import { Users, LayoutList, FileText } from 'lucide-react';
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';
import { apiFetch } from '@/lib/api';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import Loader from './Loader';
import EndCallButton from './EndCallButton';
import TranscriptionPanel from './TranscriptionPanel';
import { cn } from '@/lib/utils';

type CallLayoutType = 'grid' | 'speaker-left' | 'speaker-right';

const MeetingRoom = () => {
  const searchParams = useSearchParams();
  const isPersonalRoom = !!searchParams.get('personal');
  const router = useRouter();
  const call = useCall();
  const { getToken } = useAuth();
  const [layout, setLayout] = useState<CallLayoutType>('speaker-left');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { useCallCallingState } = useCallStateHooks();

  const callingState = useCallCallingState();

  const saveMeeting = useCallback(async () => {
    const callId = call?.id;
    if (!callId) return;

    setIsSaving(true);
    const transcriptText = localTranscriptStorageClient.getTranscriptText?.() || '';
    const token = await getToken();
    try {
      const res = await apiFetch('/api/meetings/save', token, {
        method: 'POST',
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
      console.error('Failed to save meeting:', await res.text());
    } catch (err) {
      console.error('Failed to save meeting transcript:', err);
    } finally {
      setIsSaving(false);
    }
    router.push('/');
  }, [call, router, getToken]);

  const handleLeave = saveMeeting;

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
        <div className=" flex size-full max-w-[1000px] items-center">
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
      {/* video layout and call controls */}
      <div className="fixed bottom-0 flex w-full items-center justify-center gap-5">
        <CallControls onLeave={handleLeave} />

        <DropdownMenu>
          <div className="flex items-center">
            <DropdownMenuTrigger className="cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]  ">
              <LayoutList size={20} className="text-white" />
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent className="border-dark-1 bg-dark-1 text-white">
            {['Grid', 'Speaker-Left', 'Speaker-Right'].map((item, index) => (
              <div key={index}>
                <DropdownMenuItem
                  onClick={() =>
                    setLayout(item.toLowerCase() as CallLayoutType)
                  }
                >
                  {item}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="border-dark-1" />
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <CallStatsButton />
        <button onClick={() => setShowParticipants((prev) => !prev)}>
          <div className=" cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]  ">
            <Users size={20} className="text-white" />
          </div>
        </button>
        <button onClick={() => setShowTranscription((prev) => !prev)}>
          <div className=" cursor-pointer rounded-2xl bg-[#19232d] px-4 py-2 hover:bg-[#4c535b]  ">
            <FileText size={20} className="text-white" />
          </div>
        </button>
        {!isPersonalRoom && <EndCallButton onBeforeLeave={saveMeeting} />}
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

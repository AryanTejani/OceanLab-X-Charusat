'use client';

import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Pause, Play, Square, FileText } from 'lucide-react';
import { useHostTranscription } from '@/hooks/useHostTranscription';
import {
  useTranscriptionReceiver,
  isSeparator,
  TranscriptEntry,
  TranscriptSeparator,
} from '@/hooks/useTranscriptionReceiver';
import QnAChatbot from './QnAChatbot';

interface TranscriptionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  isHost: boolean;
  meetingId: string;
}

const formatTime = (timestamp: Date) =>
  new Date(timestamp).toLocaleTimeString();

const TranscriptionPanel = ({
  isOpen,
  onToggle,
  isHost,
  meetingId,
}: TranscriptionPanelProps) => {
  const receiver = useTranscriptionReceiver(meetingId);
  const host = useHostTranscription(meetingId);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll when new items arrive
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [receiver.items]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 10;
  };

  if (!isOpen) return null;

  const { transcriptionState } = receiver;
  const isPaused = transcriptionState.state === 'paused';
  const isActive = transcriptionState.state === 'active';

  return (
    <div className="fixed right-4 top-20 w-80 bg-dark-1 rounded-lg shadow-lg border border-dark-2 z-50 flex flex-col max-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-white" />
          <h3 className="text-white font-semibold">Live Transcript</h3>
          {isActive && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white transition-colors"
        >
          ×
        </button>
      </div>

      {/* Host controls */}
      {isHost && (
        <div className="flex items-center gap-2 p-3 border-b border-dark-2 flex-shrink-0">
          {host.status === 'idle' && (
            <button
              onClick={host.start}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <Mic size={14} />
              Start
            </button>
          )}
          {host.status === 'connecting' && (
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <div className="size-3.5 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin flex-shrink-0" />
              Connecting...
            </div>
          )}
          {host.status === 'active' && (
            <>
              <button
                onClick={host.pause}
                className="flex items-center gap-1.5 bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <Pause size={14} />
                Pause
              </button>
              <button
                onClick={host.stop}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <Square size={14} />
                Stop
              </button>
            </>
          )}
          {host.status === 'paused' && (
            <>
              <button
                onClick={host.resume}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <Play size={14} />
                Resume
              </button>
              <button
                onClick={host.stop}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                <Square size={14} />
                Stop
              </button>
            </>
          )}
          {host.error && (
            <p className="text-red-400 text-xs ml-1 truncate">{host.error}</p>
          )}
        </div>
      )}

      {/* Paused banner — visible to all participants */}
      {isPaused && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/30 border-b border-yellow-600/30 flex-shrink-0">
          <Pause size={14} className="text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-300 text-xs">
            Transcription paused at {formatTime(transcriptionState.timestamp)}
            {!isHost && ' — confidential discussion'}
          </p>
        </div>
      )}

      {/* Status hint for non-host participants */}
      {!isHost &&
        transcriptionState.state === 'stopped' &&
        receiver.items.length === 0 && (
          <div className="px-3 py-2 text-gray-400 text-xs border-b border-dark-2 flex-shrink-0">
            Waiting for host to start transcription...
          </div>
        )}

      {/* Transcript list */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0"
        onScroll={handleScroll}
      >
        {receiver.items.length === 0 ? (
          <p className="text-gray-400 text-center text-sm py-8">
            {isHost
              ? 'Click Start to begin transcription.'
              : 'No transcripts yet.'}
          </p>
        ) : (
          receiver.items.map((item, idx) => {
            if (isSeparator(item)) {
              const sep = item as TranscriptSeparator;
              return (
                <div
                  key={`sep-${idx}`}
                  className="flex items-center gap-2 py-1"
                >
                  <div className="flex-1 h-px bg-dark-3" />
                  <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                    {sep.type === 'paused' ? (
                      <>
                        <Pause size={10} className="text-yellow-500" /> Paused{' '}
                        {formatTime(sep.timestamp)}
                      </>
                    ) : (
                      <>
                        <Play size={10} className="text-green-500" /> Resumed{' '}
                        {formatTime(sep.timestamp)}
                      </>
                    )}
                  </span>
                  <div className="flex-1 h-px bg-dark-3" />
                </div>
              );
            }

            const entry = item as TranscriptEntry;
            const displayName = receiver.getDisplayName(entry);

            return (
              <div
                key={`entry-${idx}`}
                className={`p-2.5 rounded-lg ${entry.isFinal ? 'bg-dark-2' : 'bg-dark-3 opacity-70'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-blue-400 font-medium text-xs">
                    {entry.isFinal
                      ? displayName
                      : entry.speakerLabel
                        ? `Speaker ${entry.speakerLabel}`
                        : '...'}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <p
                  className={`text-sm leading-relaxed ${entry.isFinal ? 'text-white' : 'text-gray-400 italic'}`}
                >
                  {entry.text}
                  {!entry.isFinal && <span className="animate-pulse">...</span>}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* QnA Chatbot */}
      <QnAChatbot meetingId={meetingId} />
    </div>
  );
};

export default TranscriptionPanel;

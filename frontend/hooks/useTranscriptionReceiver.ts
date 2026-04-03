'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/lib/api';
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';

export interface TranscriptEntry {
  meetingId: string;
  text: string;
  speakerLabel: string | null;  // "A", "B", "C"... from AssemblyAI (null if UNKNOWN)
  speakerName: string | null;   // resolved participant name (null until resolved)
  speakerId?: string;           // Stream participant userId
  confidence?: number;
  start?: number;
  end?: number;
  isFinal?: boolean;
  turnOrder?: number | null;    // AssemblyAI turn_order — used for turn-start speaker tracking
  timestamp: Date;
}

export interface TranscriptionState {
  state: 'active' | 'paused' | 'stopped';
  timestamp: Date;
}

export interface SpeakerMapping {
  [label: string]: { id: string; name: string };
}

// Visual separator inserted into transcript list on pause/resume transitions
export interface TranscriptSeparator {
  type: 'paused' | 'resumed';
  timestamp: Date;
}

export type TranscriptItem = TranscriptEntry | TranscriptSeparator;

export function isSeparator(item: TranscriptItem): item is TranscriptSeparator {
  return 'type' in item;
}

export const useTranscriptionReceiver = (meetingId: string) => {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState>({
    state: 'stopped',
    timestamp: new Date(),
  });
  const [speakerMapping, setSpeakerMapping] = useState<SpeakerMapping>({});

  const socketRef = useRef<Socket | null>(null);
  const prevStateRef = useRef<'active' | 'paused' | 'stopped'>('stopped');

  // Resolve display name for a transcript entry using latest mapping
  const resolveName = useCallback(
    (entry: TranscriptEntry, mapping: SpeakerMapping): string => {
      if (entry.speakerName) return entry.speakerName;
      if (entry.speakerLabel && mapping[entry.speakerLabel]) {
        return mapping[entry.speakerLabel].name;
      }
      return entry.speakerLabel ? `Speaker ${entry.speakerLabel}` : 'Speaker';
    },
    []
  );

  useEffect(() => {
    if (!meetingId) return;

    const socket = io(API_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.emit('join-meeting', meetingId);

    socket.on('transcript', (raw: Omit<TranscriptEntry, 'timestamp'> & { timestamp: string }) => {
      const entry: TranscriptEntry = {
        ...raw,
        timestamp: new Date(raw.timestamp),
      };

      // Only persist final turns (end_of_turn=true) — these have the speaker label
      if (entry.isFinal) {
        localTranscriptStorageClient.addTranscript({
          text: entry.text,
          speakerId: entry.speakerLabel || undefined,
          speakerName: entry.speakerName || undefined,
          confidence: entry.confidence || 0,
          start: entry.start || 0,
          end: entry.end || 0,
          isFinal: true,
          timestamp: entry.timestamp,
        });
      }

      setItems((prev) => {
        // Replace the last item if it is a non-final transcript from the same turn
        // (same start timestamp = same turn building up word by word)
        const last = prev[prev.length - 1];
        if (
          last &&
          !isSeparator(last) &&
          !(last as TranscriptEntry).isFinal &&
          (last as TranscriptEntry).start === entry.start
        ) {
          return [...prev.slice(0, -1), entry];
        }
        return [...prev, entry];
      });
    });

    socket.on('transcription-state', (data: { state: 'active' | 'paused' | 'stopped'; timestamp: string }) => {
      const newState = data.state;
      const timestamp = new Date(data.timestamp);

      setTranscriptionState({ state: newState, timestamp });

      // Insert visual separator on transitions
      setItems((prev) => {
        const previous = prevStateRef.current;
        prevStateRef.current = newState;

        if (previous === 'active' && newState === 'paused') {
          return [...prev, { type: 'paused', timestamp } as TranscriptSeparator];
        }
        if (previous === 'paused' && newState === 'active') {
          return [...prev, { type: 'resumed', timestamp } as TranscriptSeparator];
        }
        return prev;
      });
    });

    socket.on('speaker-mapping-update', (data: { mapping: SpeakerMapping }) => {
      setSpeakerMapping(data.mapping);
      // Backfill speakerName for existing entries that only have a label
      setItems((prev) =>
        prev.map((item) => {
          if (isSeparator(item)) return item;
          const entry = item as TranscriptEntry;
          if (!entry.speakerName && entry.speakerLabel && data.mapping[entry.speakerLabel]) {
            return { ...entry, speakerName: data.mapping[entry.speakerLabel].name };
          }
          return entry;
        })
      );
    });

    // Patch a specific turn's speaker name using the turn's start timestamp as key
    socket.on('speaker-for-turn', (data: { turnStart: number; speakerId: string; speakerName: string }) => {
      // Also update localTranscriptStorageClient so DB gets the resolved name
      localTranscriptStorageClient.updateSpeakerName(data.turnStart, data.speakerName, data.speakerId);

      setItems((prev) =>
        prev.map((item) => {
          if (isSeparator(item)) return item;
          const entry = item as TranscriptEntry;
          if (entry.start === data.turnStart) {
            return { ...entry, speakerName: data.speakerName, speakerId: data.speakerId };
          }
          return entry;
        })
      );
    });

    socket.on('transcription-error', (data: { error: string }) => {
      console.error('Transcription error:', data.error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [meetingId]);

  const clearItems = useCallback(() => {
    setItems([]);
  }, []);

  // Helper: display name for a transcript entry (uses latest mapping)
  const getDisplayName = useCallback(
    (entry: TranscriptEntry) => resolveName(entry, speakerMapping),
    [speakerMapping, resolveName]
  );

  return {
    items,
    transcriptionState,
    speakerMapping,
    clearItems,
    getDisplayName,
  };
};

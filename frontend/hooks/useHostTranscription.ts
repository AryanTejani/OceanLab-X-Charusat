'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCallStateHooks } from '@stream-io/video-react-sdk';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/lib/api';

// Browser-safe ArrayBuffer → base64 (no Node.js Buffer needed)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

interface SpeakerIdentity {
  id: string;
  name: string;
}

type TranscriptionStatus = 'idle' | 'active' | 'paused';

export const useHostTranscription = (meetingId: string) => {
  const { user } = useUser();
  const { useLocalParticipant, useParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();

  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixBusRef = useRef<GainNode | null>(null);
  const remoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const rescanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speakerDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Speaking history: sampled every 100ms
  type SpeakingSample = { ts: number; active: string[] };
  const speakingHistoryRef = useRef<SpeakingSample[]>([]);

  // Turn-start speaker capture: turn_order → who was speaking when that turn first appeared
  // This is the most reliable signal — captured the moment AssemblyAI sees the first word
  const turnStartSpeakersRef = useRef<Map<number, SpeakerIdentity>>(new Map());
  const seenTurnOrdersRef = useRef<Set<number>>(new Set());

  // Keep fresh refs to avoid stale closures in timers
  const participantsRef = useRef(participants);
  const localParticipantRef = useRef(localParticipant);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { localParticipantRef.current = localParticipant; }, [localParticipant]);

  // ── Socket.IO ────────────────────────────────────────────────────────────────
  const getSocket = useCallback((): Socket => {
    if (!socketRef.current || !socketRef.current.connected) {
      socketRef.current = io(API_URL, { transports: ['websocket'] });
      socketRef.current.emit('join-meeting', meetingId);
    }
    return socketRef.current;
  }, [meetingId]);

  // ── Audio graph ──────────────────────────────────────────────────────────────
  const attachStreamToGraph = useCallback((stream: MediaStream, label: string) => {
    if (!audioContextRef.current || !mixBusRef.current) return;
    stream.getAudioTracks().forEach((track) => {
      const id = `${label}:${track.id}`;
      if (remoteSourcesRef.current.has(id)) return;
      try {
        const src = audioContextRef.current!.createMediaStreamSource(new MediaStream([track]));
        src.connect(mixBusRef.current!);
        remoteSourcesRef.current.set(id, src);
      } catch (_) {}
    });
  }, []);

  const scanAndAttachRemoteAudio = useCallback(() => {
    try {
      const container = document.querySelector('[class*="str-video"]') || document.body;
      (Array.from(container.querySelectorAll('video, audio')) as (HTMLVideoElement | HTMLAudioElement)[])
        .forEach((el, idx) => {
          try {
            const stream = (el as any).captureStream?.();
            if (stream) attachStreamToGraph(stream, `elem${idx}`);
          } catch (_) {}
        });
    } catch (_) {}
  }, [attachStreamToGraph]);

  const setupAudioCapture = useCallback(async () => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    await audioContext.audioWorklet.addModule('/audio-processor.js');
    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioWorkletNodeRef.current = workletNode;
    const mixBus = audioContext.createGain();
    mixBus.gain.value = 1.0;
    mixBusRef.current = mixBus;
    mixBus.connect(workletNode);
    const sink = audioContext.createGain();
    sink.gain.value = 0;
    workletNode.connect(sink);
    sink.connect(audioContext.destination);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = mic;
      const micSrc = audioContext.createMediaStreamSource(mic);
      sourceRef.current = micSrc;
      micSrc.connect(mixBus);
    } catch (_) {}
    scanAndAttachRemoteAudio();
    rescanTimerRef.current = setInterval(scanAndAttachRemoteAudio, 1500);
    await audioContext.resume();
  }, [scanAndAttachRemoteAudio]);

  const teardownAudio = useCallback(() => {
    if (rescanTimerRef.current) { clearInterval(rescanTimerRef.current); rescanTimerRef.current = null; }
    if (audioWorkletNodeRef.current) { try { audioWorkletNodeRef.current.disconnect(); } catch (_) {} audioWorkletNodeRef.current = null; }
    if (audioContextRef.current) { try { audioContextRef.current.close(); } catch (_) {} audioContextRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (sourceRef.current) { try { sourceRef.current.disconnect(); } catch (_) {} sourceRef.current = null; }
    remoteSourcesRef.current.forEach((src) => { try { src.disconnect(); } catch (_) {} });
    remoteSourcesRef.current.clear();
    if (mixBusRef.current) { try { mixBusRef.current.disconnect(); } catch (_) {} mixBusRef.current = null; }
  }, []);

  // ── Speaker detection — 100ms sampling ──────────────────────────────────────
  const startSpeakerDetection = useCallback(() => {
    if (speakerDetectionTimerRef.current) return;
    speakerDetectionTimerRef.current = setInterval(() => {
      const parts = participantsRef.current || [];
      const local = localParticipantRef.current;
      const actives: string[] = [];
      parts.forEach((p) => { if (p.isSpeaking) actives.push(p.userId); });
      if (local?.isSpeaking && !actives.includes(local.userId)) actives.push(local.userId);
      const now = Date.now();
      speakingHistoryRef.current.push({ ts: now, active: actives });
      const cutoff = now - 30000;
      while (speakingHistoryRef.current.length > 0 && speakingHistoryRef.current[0].ts < cutoff) {
        speakingHistoryRef.current.shift();
      }
    }, 100);
  }, []);

  const stopSpeakerDetection = useCallback(() => {
    if (speakerDetectionTimerRef.current) { clearInterval(speakerDetectionTimerRef.current); speakerDetectionTimerRef.current = null; }
  }, []);

  // ── Speaker resolution ───────────────────────────────────────────────────────
  // Returns who is speaking RIGHT NOW — the ground truth from Stream SDK
  const getCurrentSpeaker = useCallback((): SpeakerIdentity | null => {
    const parts = participantsRef.current || [];
    const local = localParticipantRef.current;

    // 1. Someone is actively flagged as speaking by Stream SDK right now
    for (const p of parts) {
      if (p.isSpeaking) {
        return { id: p.userId, name: p.name || p.userId.split('@')[0] || 'Participant' };
      }
    }
    if (local?.isSpeaking) {
      return { id: local.userId, name: local.name || user?.fullName || 'Host' };
    }

    // 2. Most recent active speaker in the last 2 seconds (handles brief silence gaps)
    const cutoff = Date.now() - 2000;
    for (let i = speakingHistoryRef.current.length - 1; i >= 0; i--) {
      const s = speakingHistoryRef.current[i];
      if (s.ts < cutoff) break;
      if (s.active.length > 0) {
        const id = s.active[0];
        const p = parts.find((x) => x.userId === id);
        const name = p?.name
          || (local?.userId === id ? local.name || user?.fullName : null)
          || id.split('@')[0]
          || 'Speaker';
        return { id, name };
      }
    }

    // 3. Fall back to local participant (host — they started the transcription)
    if (local) {
      return { id: local.userId, name: local.name || user?.fullName || 'Host' };
    }
    return null;
  }, [user]);

  // Wire the transcript listener — called once per start/resume
  const wireTranscriptListener = useCallback((socket: Socket) => {
    socket.off('transcript');
    socket.on('transcript', (entry: {
      speakerLabel?: string | null;
      isFinal?: boolean;
      start?: number;
      end?: number;
      turnOrder?: number | null;
    }) => {
      const turnOrder = entry.turnOrder ?? null;

      // CAPTURE speaker at the FIRST interim event of each turn
      // This is when the person just started speaking — most accurate signal
      if (turnOrder !== null && !seenTurnOrdersRef.current.has(turnOrder)) {
        seenTurnOrdersRef.current.add(turnOrder);
        const speaker = getCurrentSpeaker();
        if (speaker) {
          turnStartSpeakersRef.current.set(turnOrder, speaker);
          console.log(`🎙️ Turn ${turnOrder} started → "${speaker.name}"`);
        }
      }

      if (!entry.isFinal) return;

      // Resolve speaker for this completed turn
      let identity: SpeakerIdentity | null = null;

      // Priority 1: use turn-start capture (most accurate)
      if (turnOrder !== null) {
        identity = turnStartSpeakersRef.current.get(turnOrder) || null;
      }

      // Priority 2: fall back to current speaker
      if (!identity) {
        identity = getCurrentSpeaker();
      }

      if (!identity) return;

      console.log(`✅ Resolved turn ${turnOrder} (Speaker ${entry.speakerLabel || '?'}) → "${identity.name}"`);

      // Broadcast resolution to all clients
      if (socket.connected) {
        socket.emit('resolve-turn-speaker', {
          meetingId,
          turnStart: entry.start || 0,
          speakerId: identity.id,
          speakerName: identity.name,
        });
      }

      // Clean up turn-start record to save memory
      if (turnOrder !== null) turnStartSpeakersRef.current.delete(turnOrder);
    });
  }, [meetingId, getCurrentSpeaker]);

  // ── Public controls ──────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!user || !meetingId) return;
    setError(null);
    try {
      await setupAudioCapture();
      startSpeakerDetection();

      const socket = getSocket();

      // Reset turn tracking for new session
      turnStartSpeakersRef.current.clear();
      seenTurnOrdersRef.current.clear();

      wireTranscriptListener(socket);

      socket.emit('start-transcription', {
        meetingId,
        userId: user.id,
        userName: user.fullName || user.id,
      });

      if (audioWorkletNodeRef.current) {
        audioWorkletNodeRef.current.port.onmessage = (event) => {
          const audioBuffer: ArrayBuffer = event.data.audio_data;
          if (!audioBuffer || !socket.connected) return;
          socket.emit('audio-chunk', { meetingId, audioChunk: arrayBufferToBase64(audioBuffer) });
        };
      }

      setStatus('active');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start transcription';
      setError(msg);
      teardownAudio();
      stopSpeakerDetection();
    }
  }, [user, meetingId, setupAudioCapture, startSpeakerDetection, getSocket, teardownAudio, stopSpeakerDetection, wireTranscriptListener]);

  const pause = useCallback(() => {
    teardownAudio();
    stopSpeakerDetection();
    const socket = socketRef.current;
    if (socket?.connected) socket.emit('pause-transcription', { meetingId });
    setStatus('paused');
  }, [meetingId, teardownAudio, stopSpeakerDetection]);

  const resume = useCallback(async () => {
    if (!user || !meetingId) return;
    setError(null);
    try {
      await setupAudioCapture();
      startSpeakerDetection();

      const socket = getSocket();

      // Reset turn tracking — new AssemblyAI session resets turn_order numbering
      turnStartSpeakersRef.current.clear();
      seenTurnOrdersRef.current.clear();

      wireTranscriptListener(socket);

      socket.emit('resume-transcription', {
        meetingId,
        userId: user.id,
        userName: user.fullName || user.id,
      });

      if (audioWorkletNodeRef.current) {
        audioWorkletNodeRef.current.port.onmessage = (event) => {
          const audioBuffer: ArrayBuffer = event.data.audio_data;
          if (!audioBuffer || !socket.connected) return;
          socket.emit('audio-chunk', { meetingId, audioChunk: arrayBufferToBase64(audioBuffer) });
        };
      }

      setStatus('active');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resume transcription';
      setError(msg);
      teardownAudio();
      stopSpeakerDetection();
    }
  }, [user, meetingId, setupAudioCapture, startSpeakerDetection, getSocket, teardownAudio, stopSpeakerDetection, wireTranscriptListener]);

  const stop = useCallback(() => {
    teardownAudio();
    stopSpeakerDetection();
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('stop-transcription', { meetingId });
      socket.off('transcript');
    }
    setStatus('idle');
  }, [meetingId, teardownAudio, stopSpeakerDetection]);

  useEffect(() => {
    return () => {
      teardownAudio();
      stopSpeakerDetection();
      if (socketRef.current) {
        socketRef.current.off('transcript');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [teardownAudio, stopSpeakerDetection]);

  return { status, error, start, pause, resume, stop };
};

import { useState, useCallback, useRef, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useCall, useCallStateHooks } from '@stream-io/video-react-sdk';

interface TranscriptionResult {
  text: string;
  confidence: number;
  start: number;
  end: number;
  isFinal: boolean;
  speakerId?: string;
  speakerName?: string;
  timestamp?: Date;
}

// Import local storage utility
import localTranscriptStorageClient from '@/lib/localTranscriptStorageClient';

export const useDeepgramTranscription = (meetingId: string) => {
  const { user } = useUser();
  const call = useCall();
  const { useLocalParticipant, useParticipants } = useCallStateHooks();
  const localParticipant = useLocalParticipant();
  const participants = useParticipants();
  
  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTranscriptPath, setSavedTranscriptPath] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mixBusRef = useRef<GainNode | null>(null);
  const remoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const rescanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speakerDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentSpeakerRef = useRef<{ id: string; name: string } | null>(null);
  const diarizationMapRef = useRef<Map<string, { id: string; name: string }>>(new Map());
  type SpeakingSample = { ts: number; active: string[] };
  const speakingHistoryRef = useRef<SpeakingSample[]>([]);
  // Keep latest participant states to avoid stale closures inside timers/WS handlers
  const participantsRef = useRef(participants);
  const localParticipantRef = useRef(localParticipant);
  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { localParticipantRef.current = localParticipant; }, [localParticipant]);

  // Detect current speaker using Stream participant state
  const detectCurrentSpeaker = useCallback(() => {
    const parts = participantsRef.current || [];
    const local = localParticipantRef.current;
    const speakingParticipants = parts.filter(p => p.isSpeaking);
    
    if (speakingParticipants.length > 0) {
      const currentSpeaker = speakingParticipants[0];
      currentSpeakerRef.current = {
        id: currentSpeaker.userId,
        name: currentSpeaker.name || currentSpeaker.userId?.split('@')[0] || 'Speaker'
      };
    } else if (local?.isSpeaking) {
      currentSpeakerRef.current = {
        id: local.userId,
        name: local.name || local.userId?.split('@')[0] || 'Speaker'
      };
    } else {
      // Fallback to local participant
      currentSpeakerRef.current = {
        id: local?.userId || user?.id || 'user-1',
        name: local?.name || user?.fullName || 'Speaker'
      };
    }
  }, [user]);

  // Helper: attach a MediaStream to graph, dedup by track id
  const attachStreamToGraph = useCallback((stream: MediaStream, label: string) => {
    if (!audioContextRef.current || !mixBusRef.current) return;
    const tracks = stream.getAudioTracks();
    if (!tracks || tracks.length === 0) return;

    tracks.forEach((track) => {
      const id = `${label}:${track.id}`;
      if (remoteSourcesRef.current.has(id)) return;
      try {
        const singleTrackStream = new MediaStream([track]);
        const src = audioContextRef.current!.createMediaStreamSource(singleTrackStream);
        src.connect(mixBusRef.current!);
        remoteSourcesRef.current.set(id, src);
        console.log('🔊 Attached audio track:', id);
      } catch (err) {
        console.warn('Could not attach track', id, err);
      }
    });
  }, []);

  // Scan DOM for Stream Video SDK media elements and attach their audio
  const scanAndAttachRemoteAudio = useCallback(() => {
    try {
      // Stream Video SDK mounts media inside elements with class containing 'str-video'
      const container = document.querySelector('[class*="str-video"]') || document.body;
      const mediaEls = Array.from(container.querySelectorAll('video, audio')) as (HTMLVideoElement | HTMLAudioElement)[];
      mediaEls.forEach((el, idx) => {
        // Skip elements without audio
        let mediaStream: MediaStream | null = null;
        try {
          // captureStream works for <video> and many <audio> in Chromium
          const anyEl: any = el as any;
          if (typeof anyEl.captureStream === 'function') {
            mediaStream = anyEl.captureStream();
          }
        } catch {}
        if (!mediaStream) return;
        attachStreamToGraph(mediaStream, `elem${idx}`);
      });
    } catch (e) {
      console.warn('Remote audio scan failed:', e);
    }
  }, [attachStreamToGraph]);

  // Setup audio capture by mixing mic + remote elements (no screen share)
  const setupAudioCapture = useCallback(async () => {
    console.log('🎤 Setting up audio capture...');
    // Create the audio graph
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    await audioContext.audioWorklet.addModule('/audio-processor.js');
    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    audioWorkletNodeRef.current = workletNode;

    // Mix bus collects all sources (mic + remotes)
    const mixBus = audioContext.createGain();
    mixBus.gain.value = 1.0;
    mixBusRef.current = mixBus;
    mixBus.connect(workletNode);

    // Mute output but keep graph running
    const sink = audioContext.createGain();
    sink.gain.value = 0;
    workletNode.connect(sink);
    sink.connect(audioContext.destination);

    // 1) Attach local microphone (so your voice is included)
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = mic;
      const micSrc = audioContext.createMediaStreamSource(mic);
      sourceRef.current = micSrc;
      micSrc.connect(mixBus);
      console.log('🎙️ Mic attached');
    } catch (micErr) {
      console.warn('Mic not available:', micErr);
    }

    // 2) Attach remote participant audio by capturing SDK-rendered media elements
    scanAndAttachRemoteAudio();
    // Re-scan periodically to catch joins/leaves
    if (rescanTimerRef.current) clearInterval(rescanTimerRef.current);
    rescanTimerRef.current = setInterval(scanAndAttachRemoteAudio, 1500);

    try {
      await audioContext.resume();
    } catch (error) {
      console.warn('Could not resume audio context:', error);
    }
    console.log('✅ Audio mixing setup complete');
  }, []);

  // Start transcription
  const startTranscription = useCallback(async () => {
    if (!user || !meetingId) return;

    // Force cleanup any existing connections first
    console.log('🧹 Cleaning up any existing connections...');
    stopTranscription();
    
    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      setIsTranscribing(true);
      setError(null);
      
      // Get all participants with proper display names
      const getAllParticipants = () => {
        const allParticipants = [];
        
        // Add local participant
        if (localParticipant) {
          const localName = localParticipant.name || 
                           localParticipant.userId?.split('@')[0] || 
                           'Host';
          allParticipants.push({
            id: localParticipant.userId,
            name: localName,
            role: 'Host',
            isHost: true
          });
        }
        
        // Add remote participants
        participants.forEach(participant => {
          if (participant.userId !== localParticipant?.userId) {
            const participantName = participant.name || 
                                  participant.userId?.split('@')[0] || 
                                  `Participant ${participant.userId}`;
            allParticipants.push({
              id: participant.userId,
              name: participantName,
              role: 'Participant',
              isHost: false
            });
          }
        });
        
        return allParticipants;
      };

      const allParticipants = getAllParticipants();
      const participantNames = allParticipants.map(p => p.name);

      // Start local transcript storage session with enhanced details
      localTranscriptStorageClient.startMeeting(meetingId, {
        title: `Meeting ${meetingId}`,
        startTime: new Date(),
        participants: participantNames,
        industry: 'manufacturing', // Can be made configurable
        meetingType: 'sales',
        attendees: allParticipants,
        language: 'English',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      // Setup audio capture
      try {
        await setupAudioCapture();
        console.log('🎤 Audio capture setup complete');
      } catch (error) {
        console.error('❌ Audio capture setup failed:', error);
        throw error;
      }

      // Get Deepgram API key (no-cache to avoid stale keys)
      const response = await fetch('/api/deepgram-token', { cache: 'no-store' });
      const data = await response.json();
      
      if (data.error || !data.apiKey) {
        console.error('Deepgram API key error:', data.error);
        throw new Error('Failed to get Deepgram API key');
      }

      // Debug: log masked key info (length only, not the key)
      try { console.log('🔑 Retrieved Deepgram API key length:', data.apiKey.length); } catch (_) {}

      // Connect to Deepgram WebSocket - using direct connection
      const endpoint = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&punctuate=true&diarize=true&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1`;
      console.log('🔗 Connecting to Deepgram:', endpoint.substring(0, 50) + '...');
      
      const ws = new WebSocket(endpoint, ['token', data.apiKey]);
      wsRef.current = ws;

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('❌ WebSocket connection timeout');
          ws.close();
          setError('Connection timeout. Please try again.');
          setIsTranscribing(false);
        }
      }, 10000); // 10 second timeout

      ws.onopen = () => {
        console.log('🔓 Deepgram WebSocket connected!');
        clearTimeout(connectionTimeout); // Clear connection timeout

        // Send a small silence chunk to prime the connection
        const silence = new Int16Array(1600).fill(0); // 100ms of silence at 16kHz
        ws.send(silence.buffer);

        // Setup audio streaming to WebSocket
        if (audioWorkletNodeRef.current) {
          audioWorkletNodeRef.current.port.onmessage = (event) => {
            try {
              if (ws.readyState === WebSocket.OPEN) {
                // Send the audio buffer as binary (correct format for Deepgram)
                const audioBuffer = event.data.audio_data;
                ws.send(audioBuffer);
              }
            } catch (sendErr) {
              console.error('❌ Failed to send audio chunk:', sendErr);
            }
          };
        }
        
        // Start speaker detection timer: sample Stream SDK's isSpeaking and build a small history buffer
        const sampleIntervalMs = 200;
        let sampleCount = 0;
        speakerDetectionTimerRef.current = setInterval(() => {
          detectCurrentSpeaker();
          try {
            const actives: string[] = [];
            const parts = participantsRef.current || [];
            const local = localParticipantRef.current;
            parts.forEach(p => { if (p.isSpeaking) actives.push(p.userId); });
            if (local?.isSpeaking && !actives.includes(local.userId)) {
              actives.push(local.userId);
            }
            
            // Log every 50 samples (every 10 seconds) to see what's being tracked
            sampleCount++;
            if (sampleCount % 50 === 0 && actives.length > 0) {
              console.log('🎤 Speaker detection sample:', {
                activeSpeakers: actives,
                participants: parts.map(p => ({ id: p.userId, name: p.name, isSpeaking: p.isSpeaking })),
                local: local ? { id: local.userId, name: local.name, isSpeaking: local.isSpeaking } : 'none',
                historyLength: speakingHistoryRef.current.length
              });
            }
            
            speakingHistoryRef.current.push({ ts: Date.now(), active: actives });
            // Keep last 30s
            const cutoff = Date.now() - 30000;
            while (speakingHistoryRef.current.length > 0 && speakingHistoryRef.current[0].ts < cutoff) {
              speakingHistoryRef.current.shift();
            }
          } catch (err) {
            console.error('Error in speaker detection timer:', err);
          }
        }, sampleIntervalMs);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('📨 Deepgram message:', msg);

          // Deepgram sends Results messages with transcript data
          if (msg.type === 'Results') {
            const channel = msg.channel;
            const alternatives = channel?.alternatives || [];
            
            if (alternatives.length > 0) {
              const transcript = alternatives[0].transcript;
              const words = alternatives[0].words || [];
              const isFinal = msg.is_final || false;
              
              if (transcript && transcript.trim()) {
                // Extract speaker label from Deepgram response
                // Deepgram provides speaker labels in words[0].speaker or channel.speaker
                let speakerLabelRaw = '';
                if (words.length > 0 && (words[0] as any).speaker !== undefined) {
                  speakerLabelRaw = String((words[0] as any).speaker);
                } else if ((channel as any).speaker !== undefined) {
                  speakerLabelRaw = String((channel as any).speaker);
                }
                const speakerLabel = speakerLabelRaw || '';

                // DEBUG: Log raw Deepgram data
                console.log('🔍 Deepgram raw data:', {
                  hasWords: words.length > 0,
                  firstWord: words[0] ? JSON.stringify(words[0]) : 'none',
                  channelSpeaker: (channel as any).speaker,
                  speakerLabel,
                  speakingHistoryLength: speakingHistoryRef.current.length,
                  currentParticipants: participantsRef.current.map(p => ({ id: p.userId, name: p.name, isSpeaking: p.isSpeaking })),
                  localParticipant: localParticipantRef.current ? { id: localParticipantRef.current.userId, name: localParticipantRef.current.name, isSpeaking: localParticipantRef.current.isSpeaking } : 'none'
                });

                // Calculate timing (Deepgram times are in seconds, convert to ms)
                const start = words.length > 0 ? (words[0].start || 0) * 1000 : Date.now();
                const end = words.length > 0 ? (words[words.length - 1].end || 0) * 1000 : Date.now();

                const result: TranscriptionResult = {
                  text: transcript,
                  confidence: alternatives[0].confidence || 0.8,
                  start: start,
                  end: end,
                  isFinal: isFinal,
                };

                // ALWAYS use speaking history first (this is what AssemblyAI did successfully)
                // Estimate time window from words if available; else last 2s
                let startTs = Date.now() - 2000;
                let endTs = Date.now();
                try {
                  if (words.length > 0) {
                    const first = words.find((w: any) => typeof w.start === 'number');
                    const last = [...words].reverse().find((w: any) => typeof w.end === 'number');
                    if (first?.start != null && last?.end != null) {
                      // Deepgram times are in seconds, convert to ms
                      const now = Date.now();
                      endTs = now;
                      startTs = now - Math.max(500, Math.min(5000, (last.end * 1000 - first.start * 1000)));
                    }
                  }
                } catch {}

                const windowSamples = speakingHistoryRef.current.filter(s => s.ts >= startTs && s.ts <= endTs);
                console.log('🔍 Speaking history window:', {
                  startTs,
                  endTs,
                  windowSamplesCount: windowSamples.length,
                  samples: windowSamples.map(s => ({ ts: s.ts, active: s.active }))
                });

                const counts = new Map<string, number>();
                windowSamples.forEach(s => s.active.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
                console.log('🔍 Speaker counts:', Array.from(counts.entries()));
                
                let topId: string | null = null;
                let topCount = 0;
                counts.forEach((c, id) => { if (c > topCount) { topCount = c; topId = id; } });

                // Resolve speaker using speaking history (PRIORITY) or diarization map
                let resolved: { id: string; name: string } | null = null;
                
                if (topId && topCount > 0) {
                  // Use speaking history result (this is what worked in AssemblyAI)
                  const parts = participantsRef.current || [];
                  const local = localParticipantRef.current;
                  let name = parts.find(p => p.userId === topId)?.name || '';
                  if (!name && local && local.userId === topId) {
                    name = local.name || user?.fullName || 'Host';
                  }
                  const fallbackName = name || `Speaker ${speakerLabel || ''}`.trim() || 'Speaker';
                  resolved = { id: topId, name: fallbackName };
                  
                  // If we have a speaker label, map it for future use
                  if (speakerLabel) {
                    diarizationMapRef.current.set(speakerLabel, resolved);
                    console.log('✅ MAPPED (history-based):', speakerLabel, '→', resolved.name, '(count:', topCount, ')');
                  } else {
                    console.log('✅ RESOLVED (history-based):', resolved.name, '(count:', topCount, ', no Deepgram label)');
                  }
                } else if (speakerLabel) {
                  // Fallback: check if we have a cached mapping for this Deepgram speaker label
                  resolved = diarizationMapRef.current.get(speakerLabel) || null;
                  if (resolved) {
                    console.log('✅ Using cached mapping:', speakerLabel, '→', resolved.name);
                  }
                }

                if (!resolved) {
                  // Final fallback: use current speaker or local participant
                  const parts = participantsRef.current || [];
                  const local = localParticipantRef.current;
                  
                  // Check who is currently speaking RIGHT NOW
                  const speakingNow = parts.find(p => p.isSpeaking) || (local?.isSpeaking ? local : null);
                  
                  if (speakingNow) {
                    const name = speakingNow.name || speakingNow.userId?.split('@')[0] || 'Speaker';
                    resolved = { id: speakingNow.userId, name: name };
                    console.log('⚠️ Fallback to current speaker:', resolved.name);
                  } else {
                    const cur = currentSpeakerRef.current || {
                      id: (local?.userId) || user?.id || 'user-1',
                      name: (local?.name) || user?.fullName || (speakerLabel ? `Speaker ${speakerLabel}` : 'Speaker'),
                    };
                    resolved = cur;
                    console.log('⚠️ Final fallback:', resolved.name);
                  }
                }
                
                const speakerId = resolved.id;
                const speakerName = resolved.name;

                const transcriptWithSpeaker = {
                  ...result,
                  speakerId,
                  speakerName,
                  timestamp: new Date(start)
                };
                
                localTranscriptStorageClient.addTranscript(transcriptWithSpeaker);
                
                // Only show final transcripts in UI (less restrictive)
                if (result.isFinal && result.text.trim().length > 0) {
                  setTranscripts(prev => [...prev, transcriptWithSpeaker]);
                }
                
                console.log('✅ FINAL Transcript:', { 
                  text: result.text.substring(0, 50), 
                  speakerId, 
                  speakerName,
                  speakerLabel: speakerLabel || 'none'
                });
              }
            }
          } else if (msg.type === 'Metadata') {
            console.log('📊 Deepgram metadata:', msg);
          } else if (msg.type === 'Error') {
            console.error('❌ Deepgram error:', msg);
            setError(msg.message || 'Deepgram API error');
          }
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };

      ws.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
        setError('WebSocket connection error: ' + (err && (err as any).message ? (err as any).message : String(err)));
      };

      ws.onclose = (ev) => {
        clearTimeout(connectionTimeout); // Clear connection timeout
        try {
          const code = (ev as any)?.code ?? 'unknown';
          const reason = (ev as any)?.reason ?? '';
          console.log('🔌 WebSocket closed; code=', code, ' reason=', reason);
          if (code !== 1000) setError(`WebSocket closed (code=${code}) ${reason}`);
        } catch (closeErr) {
          console.log('🔌 WebSocket closed (could not parse event)');
        }
        setIsTranscribing(false);
      };

    } catch (err) {
      console.error('Failed to start transcription:', err);
      setError(err instanceof Error ? err.message : 'Failed to start transcription');
      setIsTranscribing(false);
    }
  }, [user, meetingId, setupAudioCapture]);

  // Stop transcription
  const stopTranscription = useCallback(() => {
    console.log('🛑 Stopping transcription...');
    if (rescanTimerRef.current) {
      clearInterval(rescanTimerRef.current);
      rescanTimerRef.current = null;
    }
    
    // Close WebSocket connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      wsRef.current = null;
    }

    // Clean up audio worklet
    if (audioWorkletNodeRef.current) {
      try {
        audioWorkletNodeRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio worklet:', error);
      }
      audioWorkletNodeRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
      audioContextRef.current = null;
    }

    // Stop all audio tracks
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('🛑 Stopped audio track:', track.kind);
        });
      } catch (error) {
        console.error('Error stopping audio tracks:', error);
      }
      streamRef.current = null;
    }

    // Disconnect audio source
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (error) {
        console.error('Error disconnecting audio source:', error);
      }
      sourceRef.current = null;
    }

    // Disconnect remote sources
    if (remoteSourcesRef.current.size > 0) {
      remoteSourcesRef.current.forEach((src) => {
        try { src.disconnect(); } catch {}
      });
      remoteSourcesRef.current.clear();
    }

    if (mixBusRef.current) {
      try { mixBusRef.current.disconnect(); } catch {}
      mixBusRef.current = null;
    }

    // Clear speaker detection timer
    if (speakerDetectionTimerRef.current) {
      clearInterval(speakerDetectionTimerRef.current);
      speakerDetectionTimerRef.current = null;
    }

    // Save transcript to local file
    const savedPath = localTranscriptStorageClient.endMeeting();
    if (savedPath) {
      setSavedTranscriptPath(savedPath);
      console.log('💾 Transcript saved to:', savedPath);
    }

    setIsTranscribing(false);
    console.log('✅ Transcription stopped and cleaned up');
  }, []);

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    console.log('🧹 Clearing transcripts and resetting...');
    
    // Force cleanup any existing connections
    stopTranscription();
    
    setTranscripts([]);
    setSavedTranscriptPath(null);
    
    // Get all participants for reset
    const getAllParticipants = () => {
      const allParticipants = [];
      
      if (localParticipant) {
        const localName = localParticipant.name || 
                         localParticipant.userId?.split('@')[0] || 
                         'Host';
        allParticipants.push({
          id: localParticipant.userId,
          name: localName,
          role: 'Host',
          isHost: true
        });
      }
      
      participants.forEach(participant => {
        if (participant.userId !== localParticipant?.userId) {
          const participantName = participant.name || 
                                participant.userId?.split('@')[0] || 
                                `Participant ${participant.userId}`;
          allParticipants.push({
            id: participant.userId,
            name: participantName,
            role: 'Participant',
            isHost: false
          });
        }
      });
      
      return allParticipants;
    };

    const allParticipants = getAllParticipants();
    const participantNames = allParticipants.map(p => p.name);
    
    // Reset local storage session
    localTranscriptStorageClient.startMeeting(meetingId, {
      title: `Meeting ${meetingId}`,
      startTime: new Date(),
      participants: participantNames,
      industry: 'manufacturing',
      meetingType: 'sales',
      attendees: allParticipants,
      language: 'English',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }, [meetingId, localParticipant, participants]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTranscription();
    };
  }, [stopTranscription]);

  return {
    transcripts,
    isTranscribing,
    error,
    savedTranscriptPath,
    setSavedTranscriptPath,
    startTranscription,
    stopTranscription,
    clearTranscripts,
  };
};


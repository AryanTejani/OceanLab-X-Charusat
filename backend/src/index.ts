import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

// @clerk/express needs CLERK_PUBLISHABLE_KEY (without NEXT_PUBLIC_ prefix)
if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { clerkMiddleware } from '@clerk/express';
import { getDb } from './lib/db';
import AssemblyAIWebSocketService from './lib/assemblyai-ws';

// Routes
import meetingsRouter from './routes/meetings';
import insightsRouter from './routes/insights';
import podcastRouter from './routes/podcast';
import uploadRouter from './routes/upload';
import meetingQaRouter from './routes/meetingQa';
import tokensRouter from './routes/tokens';
import healthRouter from './routes/health';

const app = express();
const server = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(clerkMiddleware());

// API routes
app.use('/api/meetings', meetingsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/podcast', podcastRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/meeting-qa', meetingQaRouter);
app.use('/api', tokensRouter);
app.use('/api/health', healthRouter);

// ─── Socket.IO — Single-source AssemblyAI transcription per meeting room ──────
const io = new SocketIOServer(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
});

// Per-room state: one AssemblyAI connection per meeting, host-controlled
interface SpeakerIdentity {
  id: string;
  name: string;
}

interface RoomTranscriptionState {
  hostSocketId: string;
  connection: {
    sendAudio: (buf: Buffer) => void;
    closeConnection?: () => void;
    close: () => void;
    on: (event: string, cb: () => void) => void;
    readyState?: number;
  } | null;
  state: 'active' | 'paused' | 'stopped';
  // Map from AssemblyAI speaker label ("A","B"...) to participant identity — locked once set
  speakerMapping: Record<string, SpeakerIdentity>;
}

const roomStates = new Map<string, RoomTranscriptionState>();

function getRoomState(meetingId: string): RoomTranscriptionState | undefined {
  return roomStates.get(meetingId);
}

function closeRoomConnection(room: RoomTranscriptionState) {
  if (room.connection) {
    try {
      room.connection.closeConnection ? room.connection.closeConnection() : room.connection.close();
    } catch (_) {}
    room.connection = null;
  }
}

async function openAssemblyAIConnection(
  meetingId: string,
  room: RoomTranscriptionState
) {
  const assemblyai = AssemblyAIWebSocketService.getInstance();
  const connection = await assemblyai.createLiveTranscription(
    { sample_rate: 16000 },
    (result: { text?: string; confidence?: number; start?: number; end?: number; isFinal?: boolean; speakerLabel?: string | null; turnOrder?: number | null }) => {
      const text = result.text?.trim();
      if (!text) return;

      const speakerLabel = result.speakerLabel || null;
      const speakerName = speakerLabel ? (room.speakerMapping[speakerLabel]?.name || null) : null;

      io.to(meetingId).emit('transcript', {
        meetingId,
        text,
        speakerLabel,
        speakerName,
        confidence: result.confidence,
        start: result.start,
        end: result.end,
        isFinal: result.isFinal,
        turnOrder: result.turnOrder ?? null,
        timestamp: new Date(),
      });
    },
    (error: Error) => {
      console.error(`❌ AssemblyAI error for room ${meetingId}:`, error);
      room.connection = null;
      room.state = 'paused';
      io.to(meetingId).emit('transcription-error', { error: error.message || String(error) });
      io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp: new Date() });
    }
  );

  connection.on('close', () => {
    console.log(`🔌 AssemblyAI closed for room ${meetingId}`);
    room.connection = null;
  });

  return connection;
}

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Join a meeting room (all participants call this)
  socket.on('join-meeting', (meetingId: string) => {
    if (typeof meetingId === 'string' && meetingId.trim()) {
      socket.join(meetingId);
      console.log(`🫶 Socket ${socket.id} joined room ${meetingId}`);
    }
  });

  // HOST ONLY: Start transcription for the room
  socket.on('start-transcription', async ({ meetingId, userId, userName }: { meetingId: string; userId: string; userName: string }) => {
    if (!meetingId) {
      socket.emit('transcription-error', { error: 'Missing meetingId' });
      return;
    }

    // Enforce single active connection per room
    const existing = roomStates.get(meetingId);
    if (existing && existing.state === 'active') {
      socket.emit('transcription-error', { error: 'Transcription already active for this room' });
      return;
    }

    socket.join(meetingId);

    // Create or reset room state — host is whoever starts
    const room: RoomTranscriptionState = existing || {
      hostSocketId: socket.id,
      connection: null,
      state: 'stopped',
      speakerMapping: {},
    };
    room.hostSocketId = socket.id;
    room.state = 'active';
    roomStates.set(meetingId, room);

    try {
      const connection = await openAssemblyAIConnection(meetingId, room);
      room.connection = connection;

      socket.emit('transcription-started');
      io.to(meetingId).emit('transcription-state', { state: 'active', timestamp: new Date() });
      console.log(`🎤 AssemblyAI started for room ${meetingId} by host ${socket.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to start transcription:', err);
      room.state = 'stopped';
      socket.emit('transcription-error', { error: message });
    }
  });

  // HOST ONLY: Audio chunks from host browser → forward to AssemblyAI
  socket.on('audio-chunk', (data: { meetingId?: string; audioChunk?: string }) => {
    const base64 = data?.audioChunk;
    const meetingId = data?.meetingId;
    if (!base64 || !meetingId) return;

    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return; // only host sends audio
    if (!room.connection || room.state !== 'active') return;
    if (room.connection.readyState !== 1) return;

    try {
      const buf = Buffer.from(base64, 'base64');
      room.connection.sendAudio(buf);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Error sending audio:', message);
      room.connection = null;
      room.state = 'paused';
      socket.emit('transcription-error', { error: 'Connection closed unexpectedly' });
      io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp: new Date() });
    }
  });

  // HOST ONLY: Pause transcription (closes AssemblyAI WS to save tokens)
  socket.on('pause-transcription', ({ meetingId }: { meetingId: string }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;

    closeRoomConnection(room);
    room.state = 'paused';

    const timestamp = new Date();
    socket.emit('transcription-paused');
    io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp });
    console.log(`⏸ Transcription paused for room ${meetingId}`);
  });

  // HOST ONLY: Resume transcription (opens a new AssemblyAI WS)
  socket.on('resume-transcription', async ({ meetingId, userId, userName }: { meetingId: string; userId: string; userName: string }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.state === 'active') return; // already active

    try {
      const connection = await openAssemblyAIConnection(meetingId, room);
      room.connection = connection;
      room.state = 'active';

      const timestamp = new Date();
      socket.emit('transcription-resumed');
      io.to(meetingId).emit('transcription-state', { state: 'active', timestamp });
      console.log(`▶ Transcription resumed for room ${meetingId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to resume transcription:', err);
      socket.emit('transcription-error', { error: message });
    }
  });

  // HOST ONLY: Stop transcription entirely
  socket.on('stop-transcription', ({ meetingId }: { meetingId?: string } = {}) => {
    if (meetingId) {
      const room = roomStates.get(meetingId);
      if (room && room.hostSocketId === socket.id) {
        closeRoomConnection(room);
        room.state = 'stopped';
        io.to(meetingId).emit('transcription-state', { state: 'stopped', timestamp: new Date() });
        roomStates.delete(meetingId);
      }
    }
    socket.emit('transcription-stopped');
    console.log(`🛑 Transcription stopped by ${socket.id}`);
  });

  // HOST ONLY: Resolve actual speaker name for a specific turn by its start timestamp
  // Used when AssemblyAI returns UNKNOWN or when we want to confirm the speaker
  socket.on('resolve-turn-speaker', ({ meetingId, turnStart, speakerId, speakerName }: { meetingId: string; turnStart: number; speakerId: string; speakerName: string }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(meetingId).emit('speaker-for-turn', { turnStart, speakerId, speakerName });
  });

  // HOST ONLY: Lock speaker label → participant identity mapping
  // Once a label (e.g. "A") is mapped, it is never overwritten
  socket.on('update-speaker-mapping', ({ meetingId, mapping }: { meetingId: string; mapping: Record<string, SpeakerIdentity> }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;

    let updated = false;
    Object.entries(mapping).forEach(([label, identity]) => {
      if (!room.speakerMapping[label]) {
        room.speakerMapping[label] = identity;
        updated = true;
        console.log(`🏷️ Speaker ${label} → "${identity.name}" locked for room ${meetingId}`);
      }
    });

    if (updated) {
      io.to(meetingId).emit('speaker-mapping-update', { mapping: room.speakerMapping });
    }
  });

  // Cleanup when a socket disconnects
  socket.on('disconnect', () => {
    // If a host disconnects, pause transcription for their room
    roomStates.forEach((room, meetingId) => {
      if (room.hostSocketId === socket.id) {
        closeRoomConnection(room);
        room.state = 'paused';
        io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp: new Date() });
        console.log(`⚠️ Host disconnected — transcription paused for room ${meetingId}`);
      }
    });
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);
server.listen(PORT, async () => {
  console.log(`> Backend running on http://localhost:${PORT}`);
  try {
    await getDb();
    console.log('✅ PostgreSQL connected');
  } catch (e) {
    console.error('❌ PostgreSQL connection failed:', e);
  }
});

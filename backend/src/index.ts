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
// transcripts route removed — transcripts accumulate client-side, bulk-saved via /api/meetings/save
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
// /api/transcripts removed — transcripts accumulate client-side
app.use('/api/insights', insightsRouter);
app.use('/api/podcast', podcastRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/meeting-qa', meetingQaRouter);
app.use('/api', tokensRouter);
app.use('/api/health', healthRouter);

// ─── Socket.IO — AssemblyAI real-time transcription ───────────────────────────
const io = new SocketIOServer(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
});

// Typed socket state — replaces (socket as any) casts
interface SocketState {
  connection: { ws?: { readyState: number }; _socket?: { readyState: number }; sendAudio: (buf: Buffer) => void; closeConnection?: () => void; close: () => void; on: (event: string, cb: () => void) => void; readyState?: number } | null;
  ready: boolean;
  keepAliveInterval: ReturnType<typeof setInterval> | null;
}
const socketStates = new Map<string, SocketState>();

function getState(socketId: string): SocketState {
  let state = socketStates.get(socketId);
  if (!state) {
    state = { connection: null, ready: false, keepAliveInterval: null };
    socketStates.set(socketId, state);
  }
  return state;
}

function cleanupState(socketId: string) {
  const state = socketStates.get(socketId);
  if (!state) return;
  if (state.connection) {
    try {
      state.connection.closeConnection ? state.connection.closeConnection() : state.connection.close();
    } catch (_) {}
  }
  if (state.keepAliveInterval) clearInterval(state.keepAliveInterval);
  socketStates.delete(socketId);
}

function attachIsOpen(connection: SocketState['connection']) {
  if (connection && typeof (connection as Record<string, unknown>).isOpen !== 'function') {
    (connection as Record<string, unknown>).isOpen = function () {
      try {
        const ws = connection!.ws || connection!._socket;
        return ws ? ws.readyState === 1 : false;
      } catch (e) {
        console.log('Error checking connection state:', e);
        return false;
      }
    };
  }
  return connection;
}

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-meeting', (meetingId: string) => {
    if (typeof meetingId === 'string' && meetingId.trim()) {
      socket.join(meetingId);
      console.log(`🫶 Socket ${socket.id} joined room ${meetingId}`);
    }
  });

  socket.on('start-transcription', async ({ meetingId, userId, userName }: { meetingId: string; userId: string; userName: string }) => {
    if (!meetingId) {
      socket.emit('transcription-error', { error: 'Missing meetingId' });
      return;
    }
    socket.join(meetingId);
    const state = getState(socket.id);

    try {
      const assemblyai = AssemblyAIWebSocketService.getInstance();
      const connection = attachIsOpen(
        await assemblyai.createLiveTranscription(
          { sample_rate: 16000 },
          async (result: { text?: string; confidence?: number; start?: number; end?: number; isFinal?: boolean }) => {
            const transcriptData = {
              meetingId,
              userId,
              userName,
              text: result.text,
              confidence: result.confidence,
              start: result.start,
              end: result.end,
              isFinal: result.isFinal,
            };
            if (transcriptData.text?.trim()) {
              io.to(meetingId).emit('transcript', { ...transcriptData, timestamp: new Date() });
              console.log('📤 Transcript broadcasted:', transcriptData.text);
            }
          },
          (error: Error) => {
            console.error('❌ AssemblyAI error:', error);
            state.connection = null;
            state.ready = false;
            socket.emit('transcription-error', { error: error.message || String(error) });
          }
        )
      );

      state.connection = connection;
      state.ready = true;

      connection!.on('close', () => {
        console.log(`🔌 AssemblyAI closed for ${socket.id}`);
        state.connection = null;
        state.ready = false;
      });

      state.keepAliveInterval = setInterval(() => {
        if (!state.connection || state.connection?.readyState !== 1) {
          if (state.keepAliveInterval) clearInterval(state.keepAliveInterval);
          state.keepAliveInterval = null;
        }
      }, 30000);

      socket.emit('transcription-started');
      console.log(`🎤 AssemblyAI ready for socket ${socket.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to start transcription:', err);
      socket.emit('transcription-error', { error: message });
    }
  });

  socket.on('audio-chunk', (data: { audioChunk?: string }) => {
    const base64 = data?.audioChunk;
    if (!base64) return;
    const state = socketStates.get(socket.id);
    if (!state?.connection || !state.ready || state.connection.readyState !== 1) {
      return;
    }
    try {
      const buf = Buffer.from(base64, 'base64');
      state.connection.sendAudio(buf);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Error sending audio:', message);
      state.ready = false;
      state.connection = null;
      socket.emit('transcription-error', { error: 'Connection closed' });
    }
  });

  socket.on('stop-transcription', () => {
    cleanupState(socket.id);
    socket.emit('transcription-stopped');
  });

  socket.on('disconnect', () => {
    cleanupState(socket.id);
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

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

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
import { Transcript } from './entities/Transcript';
import { warmUpEmbedder, embedBatch } from './lib/embeddings';
import { getSupabaseAdmin } from './lib/supabaseAdmin';
import { warmUpGraph } from './lib/qaGraph';

import meetingsRouter from './routes/meetings';
import insightsRouter from './routes/insights';
import podcastRouter from './routes/podcast';
import uploadRouter from './routes/upload';
import meetingQaRouter from './routes/meetingQa';
import tokensRouter from './routes/tokens';
import healthRouter from './routes/health';
import botRouter from './routes/bot';
import webhooksRouter from './routes/webhooks';
import teamRouter from './routes/team';
import notificationsRouter from './routes/notifications';

const app = express();
const server = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(clerkMiddleware());

app.use('/api/meetings', meetingsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/podcast', podcastRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/meeting-qa', meetingQaRouter);
app.use('/api/bot', botRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/team', teamRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', tokensRouter);
app.use('/api/health', healthRouter);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
});

// ── Per-room transcription state ──────────────────────────────────────────────
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
  speakerMapping: Record<string, SpeakerIdentity>;
}

const roomStates = new Map<string, RoomTranscriptionState>();

// ── Per-room transcript buffer — flush to DB every 5 turns or 30 seconds ─────
interface PendingTranscript {
  meetingId: string;
  text: string;
  speakerLabel: string | null;
  speakerName: string | null;
  speakerId: string | null;
  start: number;
  end: number;
  confidence: number;
  timestamp: Date;
}

const roomBuffers = new Map<string, PendingTranscript[]>();
const roomFlushTimers = new Map<string, ReturnType<typeof setInterval>>();
const FLUSH_BATCH_SIZE = 5;
const FLUSH_INTERVAL_MS = 30_000;

async function indexTranscriptChunks(
  meetingId: string,
  rows: Array<{ text: string; speakerName: string | null; start: number | null }>
): Promise<void> {
  const meaningful = rows.filter((r) => r.text.trim().length >= 20);
  if (meaningful.length === 0) return;

  try {
    const embeddings = await embedBatch(meaningful.map((r) => r.text));
    const supabase = getSupabaseAdmin();
    const records = meaningful.map((r, i) => ({
      meeting_id: meetingId,
      chunk_text: r.text,
      speaker_name: r.speakerName,
      start_ms: r.start,
      embedding: embeddings[i],
    }));
    const { error } = await supabase.from('transcript_embeddings').insert(records);
    if (error) console.error('Failed to index transcript chunks:', error);
    else console.log(`📐 Indexed ${records.length} chunks for meeting ${meetingId}`);
  } catch (err) {
    console.error('Background indexing failed:', err);
  }
}

async function flushBuffer(meetingId: string) {
  const buffer = roomBuffers.get(meetingId);
  if (!buffer || buffer.length === 0) return;

  // Swap buffer immediately to avoid double-flush race
  roomBuffers.set(meetingId, []);

  // Re-resolve speaker names at flush time — mappings may have arrived after push
  const speakerMapping = roomStates.get(meetingId)?.speakerMapping || {};
  const rows = buffer.map((b) => ({
    meetingId: b.meetingId,
    text: b.text,
    speakerLabel: b.speakerLabel,
    speakerName: b.speakerName ?? (b.speakerLabel ? (speakerMapping[b.speakerLabel]?.name || null) : null),
    speakerId: b.speakerId ?? (b.speakerLabel ? (speakerMapping[b.speakerLabel]?.id || null) : null),
    start: b.start,
    end: b.end,
    confidence: b.confidence,
    timestamp: b.timestamp,
  }));

  try {
    const ds = await getDb();
    await ds.getRepository(Transcript).insert(rows);
    // Fire-and-forget vector indexing — never block the flush
    indexTranscriptChunks(meetingId, rows).catch((err) =>
      console.error('Background indexing error:', err)
    );
    console.log(
      `💾 Flushed ${rows.length} transcript(s) for room ${meetingId}:\n` +
      rows.map((r) => `   [${r.speakerName || r.speakerLabel || 'Unknown'}] ${r.text}`).join('\n')
    );
  } catch (err) {
    console.error(`❌ Failed to flush transcripts for ${meetingId}:`, err);
    // Restore failed entries back to buffer so they're not lost
    const current = roomBuffers.get(meetingId) || [];
    roomBuffers.set(meetingId, [...buffer, ...current]);
  }
}

function startFlushTimer(meetingId: string) {
  stopFlushTimer(meetingId);
  const timer = setInterval(() => flushBuffer(meetingId), FLUSH_INTERVAL_MS);
  roomFlushTimers.set(meetingId, timer);
}

function stopFlushTimer(meetingId: string) {
  const existing = roomFlushTimers.get(meetingId);
  if (existing) { clearInterval(existing); roomFlushTimers.delete(meetingId); }
}

function pushToBuffer(entry: PendingTranscript) {
  const buf = roomBuffers.get(entry.meetingId) || [];
  buf.push(entry);
  roomBuffers.set(entry.meetingId, buf);
  if (buf.length >= FLUSH_BATCH_SIZE) {
    flushBuffer(entry.meetingId);
  }
}

// ── Room helpers ──────────────────────────────────────────────────────────────
function closeRoomConnection(room: RoomTranscriptionState) {
  if (!room.connection) return;
  try {
    room.connection.closeConnection ? room.connection.closeConnection() : room.connection.close();
  } catch (_) {}
  room.connection = null;
}

async function openAssemblyAIConnection(meetingId: string, room: RoomTranscriptionState) {
  const assemblyai = AssemblyAIWebSocketService.getInstance();
  const connection = await assemblyai.createLiveTranscription(
    { sample_rate: 16000 },
    (result: { text?: string; confidence?: number; start?: number; end?: number; isFinal?: boolean; speakerLabel?: string | null; turnOrder?: number | null }) => {
      const text = result.text?.trim();
      if (!text) return;

      const speakerLabel = result.speakerLabel || null;
      const speakerName = speakerLabel ? (room.speakerMapping[speakerLabel]?.name || null) : null;
      const speakerId = speakerLabel ? (room.speakerMapping[speakerLabel]?.id || null) : null;
      const timestamp = new Date();

      // Broadcast to all clients in the room
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
        timestamp,
      });

      // Buffer final turns for DB persistence
      if (result.isFinal) {
        pushToBuffer({
          meetingId,
          text,
          speakerLabel,
          speakerName,
          speakerId,
          start: result.start ?? 0,
          end: result.end ?? 0,
          confidence: result.confidence ?? 0,
          timestamp,
        });
      }
    },
    (error: Error) => {
      console.error(`❌ AssemblyAI error for room ${meetingId}:`, error);
      room.connection = null;
      room.state = 'paused';
      // Flush what we have before pausing
      flushBuffer(meetingId);
      io.to(meetingId).emit('transcription-error', { error: error.message });
      io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp: new Date() });
    }
  );

  connection.on('close', () => {
    console.log(`🔌 AssemblyAI closed for room ${meetingId}`);
    room.connection = null;
  });

  return connection;
}

// ── Socket.IO events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-meeting', (meetingId: string) => {
    if (typeof meetingId === 'string' && meetingId.trim()) {
      socket.join(meetingId);
      console.log(`🫶 Socket ${socket.id} joined room ${meetingId}`);
    }
  });

  // HOST ONLY: Start transcription
  socket.on('start-transcription', async ({ meetingId, userId, userName }: { meetingId: string; userId: string; userName: string }) => {
    if (!meetingId) { socket.emit('transcription-error', { error: 'Missing meetingId' }); return; }

    const existing = roomStates.get(meetingId);
    if (existing && existing.state === 'active') {
      socket.emit('transcription-error', { error: 'Transcription already active for this room' });
      return;
    }

    socket.join(meetingId);

    const room: RoomTranscriptionState = existing || {
      hostSocketId: socket.id,
      connection: null,
      state: 'stopped',
      speakerMapping: {},
    };
    room.hostSocketId = socket.id;
    room.state = 'active';
    roomStates.set(meetingId, room);

    // Init buffer for this room
    if (!roomBuffers.has(meetingId)) roomBuffers.set(meetingId, []);
    startFlushTimer(meetingId);

    try {
      const connection = await openAssemblyAIConnection(meetingId, room);
      room.connection = connection;
      socket.emit('transcription-started');
      io.to(meetingId).emit('transcription-state', { state: 'active', timestamp: new Date() });
      console.log(`🎤 AssemblyAI started for room ${meetingId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      room.state = 'stopped';
      stopFlushTimer(meetingId);
      socket.emit('transcription-error', { error: message });
    }
  });

  // HOST ONLY: Audio stream → AssemblyAI
  socket.on('audio-chunk', (data: { meetingId?: string; audioChunk?: string }) => {
    const { audioChunk, meetingId } = data;
    if (!audioChunk || !meetingId) return;
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id || room.state !== 'active') return;
    if (!room.connection || room.connection.readyState !== 1) return;
    try {
      room.connection.sendAudio(Buffer.from(audioChunk, 'base64'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Error sending audio:', message);
      room.connection = null;
      room.state = 'paused';
      flushBuffer(meetingId);
      socket.emit('transcription-error', { error: 'Connection closed unexpectedly' });
      io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp: new Date() });
    }
  });

  // HOST ONLY: Pause — closes AssemblyAI WS (stops billing)
  socket.on('pause-transcription', ({ meetingId }: { meetingId: string }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;
    closeRoomConnection(room);
    room.state = 'paused';
    stopFlushTimer(meetingId);
    flushBuffer(meetingId); // flush remaining before pausing
    const timestamp = new Date();
    socket.emit('transcription-paused');
    io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp });
    console.log(`⏸ Transcription paused for room ${meetingId}`);
  });

  // HOST ONLY: Resume — opens new AssemblyAI WS
  socket.on('resume-transcription', async ({ meetingId, userId, userName }: { meetingId: string; userId: string; userName: string }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id || room.state === 'active') return;
    startFlushTimer(meetingId);
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
      socket.emit('transcription-error', { error: message });
    }
  });

  // HOST ONLY: Stop
  socket.on('stop-transcription', ({ meetingId }: { meetingId?: string } = {}) => {
    if (meetingId) {
      const room = roomStates.get(meetingId);
      if (room && room.hostSocketId === socket.id) {
        closeRoomConnection(room);
        room.state = 'stopped';
        stopFlushTimer(meetingId);
        flushBuffer(meetingId); // flush all remaining
        io.to(meetingId).emit('transcription-state', { state: 'stopped', timestamp: new Date() });
        roomStates.delete(meetingId);
      }
    }
    socket.emit('transcription-stopped');
    console.log(`🛑 Transcription stopped by ${socket.id}`);
  });

  // HOST ONLY: Resolve speaker name for a specific turn (matched by start timestamp)
  socket.on('resolve-turn-speaker', async ({ meetingId, turnStart, speakerId, speakerName }: {
    meetingId: string; turnStart: number; speakerId: string; speakerName: string;
  }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;

    console.log(`🏷️ Resolving turn start=${turnStart} → "${speakerName}"`);

    // Broadcast to all clients for UI update
    io.to(meetingId).emit('speaker-for-turn', { turnStart, speakerId, speakerName });

    // Update in-memory buffer first (turn may not be flushed to DB yet)
    const buf = roomBuffers.get(meetingId);
    if (buf) {
      buf.forEach((entry) => {
        if (entry.start === turnStart) {
          entry.speakerName = speakerName;
          entry.speakerId = speakerId;
        }
      });
    }

    // Update DB row — works if already flushed; no-op if not yet (buffer handles it)
    try {
      const ds = await getDb();
      const result = await ds.getRepository(Transcript).update(
        { meetingId, start: turnStart },
        { speakerName, speakerId }
      );
      if (result.affected && result.affected > 0) {
        console.log(`✅ DB updated: "${speakerName}" for turn start=${turnStart}`);
      }
    } catch (err) {
      console.error('❌ Failed to update speaker name in DB:', err);
    }
  });

  // HOST ONLY: Lock label → name mapping (for future turns in same session)
  socket.on('update-speaker-mapping', ({ meetingId, mapping }: { meetingId: string; mapping: Record<string, SpeakerIdentity> }) => {
    const room = roomStates.get(meetingId);
    if (!room || room.hostSocketId !== socket.id) return;
    let updated = false;
    Object.entries(mapping).forEach(([label, identity]) => {
      if (!room.speakerMapping[label]) {
        room.speakerMapping[label] = identity;
        updated = true;
        console.log(`🔒 Locked Speaker ${label} → "${identity.name}" for room ${meetingId}`);

        // Retroactively update any buffered entries with this label that have no name yet
        const buf = roomBuffers.get(meetingId);
        if (buf) {
          buf.forEach((entry) => {
            if (entry.speakerLabel === label && !entry.speakerName) {
              entry.speakerName = identity.name;
              entry.speakerId = identity.id;
            }
          });
        }
      }
    });
    if (updated) {
      io.to(meetingId).emit('speaker-mapping-update', { mapping: room.speakerMapping });
    }
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    roomStates.forEach((room, meetingId) => {
      if (room.hostSocketId === socket.id) {
        closeRoomConnection(room);
        room.state = 'paused';
        stopFlushTimer(meetingId);
        flushBuffer(meetingId);
        io.to(meetingId).emit('transcription-state', { state: 'paused', timestamp: new Date() });
        console.log(`⚠️ Host disconnected — transcripts flushed, transcription paused for room ${meetingId}`);
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
  warmUpEmbedder();
  warmUpGraph();
});

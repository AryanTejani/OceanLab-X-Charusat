import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

// @clerk/express needs CLERK_PUBLISHABLE_KEY (without NEXT_PUBLIC_ prefix)
if (
  !process.env.CLERK_PUBLISHABLE_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
) {
  process.env.CLERK_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { clerkMiddleware } from "@clerk/express";
import { getDb } from "./lib/db";
// @ts-ignore — plain JS module
import AssemblyAIWebSocketService from "./lib/assemblyai-ws";

// Routes
import meetingsRouter from "./routes/meetings";
import transcriptsRouter from "./routes/transcripts";
import insightsRouter from "./routes/insights";
import podcastRouter from "./routes/podcast";
import uploadRouter from "./routes/upload";
import meetingQaRouter from "./routes/meetingQa";
import tokensRouter from "./routes/tokens";
import healthRouter from "./routes/health";

const app = express();
const server = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(clerkMiddleware());

// API routes
app.use("/api/meetings", meetingsRouter);
app.use("/api/transcripts", transcriptsRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/podcast", podcastRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/meeting-qa", meetingQaRouter);
app.use("/api", tokensRouter);
app.use("/api/health", healthRouter);

// ─── Socket.IO — AssemblyAI real-time transcription ───────────────────────────
const io = new SocketIOServer(server, {
  cors: { origin: FRONTEND_URL, methods: ["GET", "POST"] },
});

function attachIsOpen(connection: any) {
  if (connection && typeof connection.isOpen !== "function") {
    connection.isOpen = function () {
      try {
        const ws = connection.ws || connection._socket;
        return ws && ws.readyState === 1;
      } catch (_) {
        return false;
      }
    };
  }
  return connection;
}

io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("join-meeting", (meetingId: string) => {
    if (typeof meetingId === "string" && meetingId.trim()) {
      socket.join(meetingId);
      console.log(`🫶 Socket ${socket.id} joined room ${meetingId}`);
    }
  });

  socket.on(
    "start-transcription",
    async ({ meetingId, userId, userName }: any) => {
      if (!meetingId) {
        socket.emit("transcription-error", { error: "Missing meetingId" });
        return;
      }
      socket.join(meetingId);

      try {
        const assemblyai = AssemblyAIWebSocketService.getInstance();
        const connection = attachIsOpen(
          await assemblyai.createLiveTranscription(
            { sample_rate: 16000 },
            async (result: any) => {
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
                io.to(meetingId).emit("transcript", {
                  ...transcriptData,
                  timestamp: new Date(),
                });
                console.log("📤 Transcript broadcasted:", transcriptData.text);
              }
            },
            (error: any) => {
              console.error("❌ AssemblyAI error:", error);
              (socket as any).assemblyaiConnection = null;
              socket.emit("transcription-error", {
                error: error.message || String(error),
              });
            },
          ),
        );

        (socket as any).assemblyaiConnection = connection;
        (socket as any).assemblyaiReady = true;

        connection.on("close", () => {
          console.log(`🔌 AssemblyAI closed for ${socket.id}`);
          (socket as any).assemblyaiConnection = null;
          (socket as any).assemblyaiReady = false;
        });

        (socket as any).keepAliveInterval = setInterval(() => {
          if ((socket as any).assemblyaiConnection?.readyState !== 1) {
            clearInterval((socket as any).keepAliveInterval);
          }
        }, 30000);

        socket.emit("transcription-started");
        console.log(`🎤 AssemblyAI ready for socket ${socket.id}`);
      } catch (err: any) {
        console.error("Failed to start transcription:", err);
        socket.emit("transcription-error", {
          error: err.message || String(err),
        });
      }
    },
  );

  socket.on("audio-chunk", (data: any) => {
    const base64 = data?.audioChunk;
    if (!base64) return;
    if (
      !(socket as any).assemblyaiConnection ||
      !(socket as any).assemblyaiReady ||
      (socket as any).assemblyaiConnection.readyState !== 1
    ) {
      return;
    }
    try {
      const buf = Buffer.from(base64, "base64");
      (socket as any).assemblyaiConnection.sendAudio(buf);
    } catch (err: any) {
      console.error("❌ Error sending audio:", err.message);
      (socket as any).assemblyaiReady = false;
      (socket as any).assemblyaiConnection = null;
      socket.emit("transcription-error", { error: "Connection closed" });
    }
  });

  socket.on("stop-transcription", () => {
    const conn = (socket as any).assemblyaiConnection;
    if (conn) {
      try {
        conn.closeConnection ? conn.closeConnection() : conn.close();
      } catch (_) {}
      (socket as any).assemblyaiConnection = null;
      (socket as any).assemblyaiReady = false;
    }
    clearInterval((socket as any).keepAliveInterval);
    socket.emit("transcription-stopped");
  });

  socket.on("disconnect", () => {
    const conn = (socket as any).assemblyaiConnection;
    if (conn) {
      try {
        conn.closeConnection ? conn.closeConnection() : conn.close();
      } catch (_) {}
    }
    clearInterval((socket as any).keepAliveInterval);
    (socket as any).assemblyaiConnection = null;
    (socket as any).assemblyaiReady = false;
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.BACKEND_PORT || "3001", 10);
server.listen(PORT, async () => {
  console.log(`> Backend running on http://localhost:${PORT}`);
  try {
    await getDb();
    console.log("✅ PostgreSQL connected");
  } catch (e) {
    console.error("❌ PostgreSQL connection failed:", e);
  }
});

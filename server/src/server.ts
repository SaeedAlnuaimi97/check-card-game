import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { connectDB } from './utils/database';
import healthRouter from './routes/health';
import leaderboardRouter from './routes/leaderboard';
import guestRouter from './routes/guest';
import { registerSocketHandlers } from './socket';

const PORT = process.env.PORT || 3001;

// In development, allow connections from any origin so LAN devices (phones) can connect.
const CORS_ORIGIN = process.env.CLIENT_URL || true;

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// REST routes
app.use('/api', healthRouter);
app.use('/api', leaderboardRouter);
app.use('/api', guestRouter);

// Socket.io setup
const io = new SocketIOServer(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  // Increase ping timeout so mobile browsers that go to background
  // don't get disconnected during the default 20s window.
  pingInterval: 25000,
  pingTimeout: 60000,
});

// Register socket event handlers
registerSocketHandlers(io);

// Start server
async function startServer() {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`CORS origin: ${CORS_ORIGIN === true ? 'all origins (dev mode)' : CORS_ORIGIN}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export { io };

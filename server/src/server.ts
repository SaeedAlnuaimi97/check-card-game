import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { connectDB, registerShutdownHandlers } from './utils/database';
import { startRoomExpiryJob } from './utils/roomExpiry';
import healthRouter from './routes/health';
import leaderboardRouter from './routes/leaderboard';
import guestRouter from './routes/guest';
import { registerSocketHandlers } from './socket';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// In development, allow connections from any origin so LAN devices (phones) can connect.
const CORS_ORIGIN = process.env.CLIENT_URL || true;

const app = express();
const server = http.createServer(app);

// ============================================================
// Security & compression middleware (F-262)
// ============================================================
if (IS_PRODUCTION) {
  app.use(helmet());
  app.use(compression());
}

// CORS
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// ============================================================
// Rate limiting on REST endpoints (F-261)
// ============================================================
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api', apiLimiter);

// REST routes
app.use('/api', healthRouter);
app.use('/api', leaderboardRouter);
app.use('/api', guestRouter);

// ============================================================
// Global error handler (F-264)
// ============================================================
// Must be defined after all routes — Express identifies error handlers
// by the 4-parameter signature.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

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
    registerShutdownHandlers();
    startRoomExpiryJob();
    server.listen(PORT, () => {
      logger.info(
        {
          port: PORT,
          env: IS_PRODUCTION ? 'production' : 'development',
          cors: CORS_ORIGIN === true ? 'all origins (dev)' : CORS_ORIGIN,
        },
        'Server started',
      );
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

export { io };

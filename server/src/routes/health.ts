import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStatus =
    mongoState === 1
      ? 'connected'
      : mongoState === 2
        ? 'connecting'
        : 'disconnected';

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoStatus,
  });
});

export default router;

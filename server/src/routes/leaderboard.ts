import { Router, Request, Response } from 'express';
import { getLeaderboard, getPlayerStats } from '../services/leaderboard';

const router = Router();

// ============================================================
// GET /api/leaderboard (F-235)
// ============================================================

router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

    const leaderboard = await getLeaderboard(limit);
    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ============================================================
// GET /api/stats/:guestId (F-236)
// ============================================================

router.get('/stats/:guestId', async (req: Request, res: Response) => {
  try {
    const { guestId } = req.params;

    if (!guestId || typeof guestId !== 'string') {
      res.status(400).json({ error: 'Invalid guestId' });
      return;
    }

    const stats = await getPlayerStats(guestId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

export default router;

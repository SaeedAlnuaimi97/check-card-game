import { Router, Request, Response } from 'express';
import { GameResultModel } from '../models/GameResult';

const router = Router();

// ============================================================
// GET /api/leaderboard (F-235)
// ============================================================
// Returns top players by win count using MongoDB aggregation.

router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

    const pipeline = [
      { $unwind: '$players' as const },
      {
        $group: {
          _id: '$players.guestId',
          username: { $last: '$players.username' },
          gamesPlayed: { $sum: 1 },
          wins: { $sum: { $cond: ['$players.isWinner', 1, 0] } },
          losses: { $sum: { $cond: ['$players.isLoser', 1, 0] } },
          totalScore: { $sum: '$players.finalScore' },
          lastPlayedAt: { $max: '$endedAt' },
        },
      },
      {
        $addFields: {
          winRate: {
            $cond: [
              { $gt: ['$gamesPlayed', 0] },
              { $round: [{ $multiply: [{ $divide: ['$wins', '$gamesPlayed'] }, 100] }, 1] },
              0,
            ],
          },
          avgScore: {
            $cond: [
              { $gt: ['$gamesPlayed', 0] },
              { $round: [{ $divide: ['$totalScore', '$gamesPlayed'] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { wins: -1 as const, winRate: -1 as const, gamesPlayed: -1 as const } },
      { $limit: limit },
    ];

    const results = await GameResultModel.aggregate(pipeline);

    const leaderboard = results.map((entry, index) => ({
      rank: index + 1,
      guestId: entry._id,
      username: entry.username,
      gamesPlayed: entry.gamesPlayed,
      wins: entry.wins,
      losses: entry.losses,
      winRate: entry.winRate,
      avgScore: entry.avgScore,
      lastPlayedAt: entry.lastPlayedAt,
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ============================================================
// GET /api/stats/:guestId (F-236)
// ============================================================
// Returns personal stats and recent games for a specific guest.

router.get('/stats/:guestId', async (req: Request, res: Response) => {
  try {
    const { guestId } = req.params;

    if (!guestId || typeof guestId !== 'string') {
      res.status(400).json({ error: 'Invalid guestId' });
      return;
    }

    // Summary stats via aggregation
    const statsPipeline = [
      { $match: { 'players.guestId': guestId } },
      { $unwind: '$players' as const },
      { $match: { 'players.guestId': guestId } },
      {
        $group: {
          _id: '$players.guestId',
          username: { $last: '$players.username' },
          gamesPlayed: { $sum: 1 },
          wins: { $sum: { $cond: ['$players.isWinner', 1, 0] } },
          losses: { $sum: { $cond: ['$players.isLoser', 1, 0] } },
          totalScore: { $sum: '$players.finalScore' },
        },
      },
      {
        $addFields: {
          winRate: {
            $cond: [
              { $gt: ['$gamesPlayed', 0] },
              { $round: [{ $multiply: [{ $divide: ['$wins', '$gamesPlayed'] }, 100] }, 1] },
              0,
            ],
          },
          avgScore: {
            $cond: [
              { $gt: ['$gamesPlayed', 0] },
              { $round: [{ $divide: ['$totalScore', '$gamesPlayed'] }, 1] },
              0,
            ],
          },
        },
      },
    ];

    const statsResults = await GameResultModel.aggregate(statsPipeline);

    if (statsResults.length === 0) {
      res.json({
        guestId,
        username: 'Unknown',
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgScore: 0,
        recentGames: [],
      });
      return;
    }

    const stats = statsResults[0];

    // Recent games
    const recentGames = await GameResultModel.find({ 'players.guestId': guestId })
      .sort({ endedAt: -1 })
      .limit(20)
      .lean();

    const formattedRecentGames = recentGames.map((game) => {
      const myEntry = game.players.find((p) => p.guestId === guestId);
      return {
        roomCode: game.roomCode,
        endedAt: game.endedAt,
        totalRounds: game.totalRounds,
        playerCount: game.players.length,
        myScore: myEntry?.finalScore ?? 0,
        winnerUsername: game.winnerUsername,
        isWin: myEntry?.isWinner ?? false,
      };
    });

    res.json({
      guestId,
      username: stats.username,
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      avgScore: stats.avgScore,
      recentGames: formattedRecentGames,
    });
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

export default router;

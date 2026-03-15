import { GameResultModel } from '../models/GameResult';

// ============================================================
// Shared leaderboard & stats queries (F-251)
// ============================================================
// Extracted from REST routes and socket handlers to avoid duplication.
// Pipelines are compatible with both MongoDB and Azure Cosmos DB
// (MongoDB API). Cosmos DB supports $unwind, $group, $addFields,
// $cond, $round, $sort, and $limit on the MongoDB v4+ API.

export interface LeaderboardEntry {
  rank: number;
  guestId: string;
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  lastPlayedAt: Date;
}

export interface RecentGame {
  roomCode: string;
  endedAt: Date;
  totalRounds: number;
  playerCount: number;
  myScore: number;
  winnerUsername: string;
  isWin: boolean;
}

export interface PlayerStats {
  guestId: string;
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  recentGames: RecentGame[];
}

// Guest IDs excluded from the public leaderboard (private/test players).
const LEADERBOARD_BLOCKLIST = new Set(['guest_bb4c938b', 'guest_50f97244', 'guest_c46a5f83']);

/**
 * Get the global leaderboard (top players by win count).
 */
export async function getLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50;
  const blocklist = [...LEADERBOARD_BLOCKLIST];

  const pipeline = [
    { $unwind: '$players' as const },
    { $match: { 'players.guestId': { $nin: [...blocklist, 'bot', 'unknown'] } } },
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
    { $limit: safeLimit },
  ];

  const results = await GameResultModel.aggregate(pipeline);

  return results.map((entry, index) => ({
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
}

/**
 * Get personal stats and recent games for a specific guest.
 */
export async function getPlayerStats(guestId: string): Promise<PlayerStats> {
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
    return {
      guestId,
      username: 'Unknown',
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgScore: 0,
      recentGames: [],
    };
  }

  const st = statsResults[0];

  const recentGames = await GameResultModel.find({ 'players.guestId': guestId })
    .sort({ endedAt: -1 })
    .limit(20)
    .lean();

  const formattedRecentGames: RecentGame[] = recentGames.map((game) => {
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

  return {
    guestId,
    username: st.username,
    gamesPlayed: st.gamesPlayed,
    wins: st.wins,
    losses: st.losses,
    winRate: st.winRate,
    avgScore: st.avgScore,
    recentGames: formattedRecentGames,
  };
}

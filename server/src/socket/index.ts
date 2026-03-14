import { Server as SocketIOServer } from 'socket.io';
import { registerRoomHandlers } from './roomHandlers';
import { registerGameHandlers } from './gameHandlers';
import { GuestProfileModel } from '../models/GuestProfile';
import { GameResultModel } from '../models/GameResult';

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Guest identification — client sends guestId on connect so we can
    // log whether this is a returning user and return their stored username.
    socket.on(
      'identifyGuest',
      async (data: { guestId?: string }, callback?: (response: { username?: string }) => void) => {
        const guestId =
          typeof data?.guestId === 'string' && data.guestId.length > 0 ? data.guestId : null;

        if (!guestId) {
          console.log(`[${socket.id}] identifyGuest: no guestId provided`);
          callback?.({});
          return;
        }

        try {
          const profile = await GuestProfileModel.findOne({ guestId }).lean();
          if (profile) {
            console.log(`[${socket.id}] Returning guest: ${profile.username} (${guestId})`);
            callback?.({ username: profile.username });
          } else {
            console.log(`[${socket.id}] New guest: ${guestId} (no profile in DB)`);
            callback?.({});
          }
        } catch (err) {
          console.error(`[${socket.id}] identifyGuest DB error:`, err);
          callback?.({});
        }
      },
    );

    // ============================================================
    // getLeaderboard — socket alternative to GET /api/leaderboard
    // ============================================================
    socket.on(
      'getLeaderboard',
      async (
        data: { limit?: number },
        callback?: (response: {
          success: boolean;
          leaderboard?: unknown[];
          error?: string;
        }) => void,
      ) => {
        try {
          const limitParam = typeof data?.limit === 'number' ? data.limit : 50;
          const limit =
            Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50;

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

          callback?.({ success: true, leaderboard });
        } catch (err) {
          console.error(`[${socket.id}] getLeaderboard error:`, err);
          callback?.({ success: false, error: 'Failed to fetch leaderboard' });
        }
      },
    );

    // ============================================================
    // getStats — socket alternative to GET /api/stats/:guestId
    // ============================================================
    socket.on(
      'getStats',
      async (
        data: { guestId?: string },
        callback?: (response: { success: boolean; stats?: unknown; error?: string }) => void,
      ) => {
        const guestId =
          typeof data?.guestId === 'string' && data.guestId.length > 0 ? data.guestId : null;

        if (!guestId) {
          callback?.({ success: false, error: 'Invalid guestId' });
          return;
        }

        try {
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
            callback?.({
              success: true,
              stats: {
                guestId,
                username: 'Unknown',
                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                winRate: 0,
                avgScore: 0,
                recentGames: [],
              },
            });
            return;
          }

          const st = statsResults[0];

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

          callback?.({
            success: true,
            stats: {
              guestId,
              username: st.username,
              gamesPlayed: st.gamesPlayed,
              wins: st.wins,
              losses: st.losses,
              winRate: st.winRate,
              avgScore: st.avgScore,
              recentGames: formattedRecentGames,
            },
          });
        } catch (err) {
          console.error(`[${socket.id}] getStats error:`, err);
          callback?.({ success: false, error: 'Failed to fetch player stats' });
        }
      },
    );

    // Register room management handlers (F-016 to F-021)
    registerRoomHandlers(io, socket);

    // Register game action handlers (F-033+)
    registerGameHandlers(io, socket);
  });
}

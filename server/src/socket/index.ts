import { Server as SocketIOServer } from 'socket.io';
import { registerRoomHandlers } from './roomHandlers';
import { registerGameHandlers } from './gameHandlers';
import { GuestProfileModel } from '../models/GuestProfile';
import { getLeaderboard, getPlayerStats } from '../services/leaderboard';

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

          const leaderboard = await getLeaderboard(limit);
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
          const stats = await getPlayerStats(guestId);
          callback?.({ success: true, stats });
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

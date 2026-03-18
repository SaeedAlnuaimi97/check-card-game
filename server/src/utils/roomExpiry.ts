/**
 * Room Expiration Service (F-202/F-305)
 *
 * Two expiry tiers:
 *
 * 1. Fast expiry (every 30s): Deletes lobby and playing rooms that have no
 *    human players and have been inactive for 1+ minute. This catches rooms
 *    abandoned mid-session where grace period timers may not have fired
 *    (e.g. server restart, crash).
 *
 * 2. Slow expiry (every hour): Deletes any lobby/playing room inactive for
 *    24+ hours, regardless of player count (covers edge cases).
 *
 * Finished rooms are handled automatically by the MongoDB TTL index on
 * `updatedAt` (expires after 1 hour, defined in Room.ts).
 */

import { RoomModel } from '../models/Room';
import { deleteRoomMutex } from './roomLock';
import { logger } from './logger';

const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour

const EMPTY_ROOM_MAX_AGE_MS = 60 * 1000; // 1 minute
const FAST_CLEANUP_INTERVAL_MS = 30 * 1000; // Run every 30 seconds

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let fastCleanupInterval: ReturnType<typeof setInterval> | null = null;
let sessionLogInterval: ReturnType<typeof setInterval> | null = null;

const SESSION_LOG_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Deletes lobby and playing rooms that have no human players and have been
 * inactive for 1+ minute. This covers rooms abandoned after all players
 * disconnected (and the grace period expired or the server restarted).
 * Returns the number of rooms deleted.
 */
export async function expireEmptyRooms(): Promise<number> {
  const cutoff = new Date(Date.now() - EMPTY_ROOM_MAX_AGE_MS);

  try {
    const staleRooms = await RoomModel.find(
      {
        status: { $in: ['lobby', 'playing'] },
        updatedAt: { $lt: cutoff },
        // No human players: exclude rooms that have any player with isBot != true
        $nor: [{ players: { $elemMatch: { isBot: { $ne: true } } } }],
      },
      { roomCode: 1 },
    ).lean();

    if (staleRooms.length === 0) {
      return 0;
    }

    const roomCodes = staleRooms.map((r) => r.roomCode);

    const result = await RoomModel.deleteMany({ roomCode: { $in: roomCodes } });

    for (const code of roomCodes) {
      deleteRoomMutex(code);
    }

    logger.info({ count: result.deletedCount, roomCodes }, 'Expired empty rooms (1min inactivity)');

    return result.deletedCount;
  } catch (err) {
    logger.error({ err }, 'Failed to expire empty rooms');
    return 0;
  }
}

/**
 * Deletes lobby and playing rooms that have not been updated in 24+ hours.
 * Returns the number of rooms deleted.
 */
export async function expireStaleRooms(): Promise<number> {
  const cutoff = new Date(Date.now() - ROOM_MAX_AGE_MS);

  try {
    const staleRooms = await RoomModel.find(
      {
        status: { $in: ['lobby', 'playing'] },
        updatedAt: { $lt: cutoff },
      },
      { roomCode: 1 },
    ).lean();

    if (staleRooms.length === 0) {
      return 0;
    }

    const roomCodes = staleRooms.map((r) => r.roomCode);

    const result = await RoomModel.deleteMany({ roomCode: { $in: roomCodes } });

    // Clean up in-memory mutex entries for deleted rooms
    for (const code of roomCodes) {
      deleteRoomMutex(code);
    }

    logger.info({ count: result.deletedCount, roomCodes }, 'Expired stale rooms (24h inactivity)');

    return result.deletedCount;
  } catch (err) {
    logger.error({ err }, 'Failed to expire stale rooms');
    return 0;
  }
}

/**
 * Logs a summary of all active sessions (lobby + playing rooms) to the
 * console. Runs only in development (NODE_ENV !== 'production').
 */
export async function logActiveSessions(): Promise<void> {
  try {
    const rooms = await RoomModel.find(
      { status: { $in: ['lobby', 'playing'] } },
      { roomCode: 1, status: 1, players: 1, updatedAt: 1 },
    ).lean();

    const summary = rooms.map((r) => ({
      roomCode: r.roomCode,
      status: r.status,
      players: r.players.length,
      humans: r.players.filter((p) => !p.isBot).length,
      bots: r.players.filter((p) => p.isBot).length,
      updatedAt: r.updatedAt,
    }));

    logger.debug({ count: rooms.length, rooms: summary }, 'Active sessions');
  } catch (err) {
    logger.error({ err }, 'Failed to log active sessions');
  }
}

/**
 * Starts the periodic room expiration jobs.
 * Safe to call multiple times — will only start one set of intervals.
 */
export function startRoomExpiryJob(): void {
  if (cleanupInterval) return;

  // Run both immediately on startup to clean up any pre-existing stale rooms
  expireEmptyRooms().catch((err) => logger.error({ err }, 'Initial empty room expiry failed'));
  expireStaleRooms().catch((err) => logger.error({ err }, 'Initial room expiry failed'));

  // Fast expiry: empty rooms every 30 seconds
  fastCleanupInterval = setInterval(() => {
    expireEmptyRooms().catch((err) => logger.error({ err }, 'Scheduled empty room expiry failed'));
  }, FAST_CLEANUP_INTERVAL_MS);
  if (fastCleanupInterval.unref) {
    fastCleanupInterval.unref();
  }

  // Slow expiry: all stale rooms every hour
  cleanupInterval = setInterval(() => {
    expireStaleRooms().catch((err) => logger.error({ err }, 'Scheduled room expiry failed'));
  }, CLEANUP_INTERVAL_MS);
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  // Debug: log active sessions every minute (development only)
  if (process.env.NODE_ENV !== 'production') {
    logActiveSessions().catch((err) => logger.error({ err }, 'Initial session log failed'));
    sessionLogInterval = setInterval(() => {
      logActiveSessions().catch((err) => logger.error({ err }, 'Scheduled session log failed'));
    }, SESSION_LOG_INTERVAL_MS);
    if (sessionLogInterval.unref) {
      sessionLogInterval.unref();
    }
  }

  logger.info(
    {
      intervalMs: CLEANUP_INTERVAL_MS,
      maxAgeMs: ROOM_MAX_AGE_MS,
      fastIntervalMs: FAST_CLEANUP_INTERVAL_MS,
      emptyRoomMaxAgeMs: EMPTY_ROOM_MAX_AGE_MS,
    },
    'Room expiry job started',
  );
}

/**
 * Stops the periodic room expiration jobs. Used in tests.
 */
export function stopRoomExpiryJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (fastCleanupInterval) {
    clearInterval(fastCleanupInterval);
    fastCleanupInterval = null;
  }
  if (sessionLogInterval) {
    clearInterval(sessionLogInterval);
    sessionLogInterval = null;
  }
}

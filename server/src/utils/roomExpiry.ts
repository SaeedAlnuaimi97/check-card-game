/**
 * Room Expiration Service (F-202/F-305)
 *
 * Periodically deletes stale rooms that have been inactive for 24+ hours.
 * This covers lobby rooms where players never started a game, and playing
 * rooms where all players disconnected without the game formally finishing.
 *
 * Finished rooms are handled automatically by the MongoDB TTL index on
 * `updatedAt` (expires after 1 hour, defined in Room.ts).
 */

import { RoomModel } from '../models/Room';
import { deleteRoomMutex } from './roomLock';
import { logger } from './logger';

const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

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
 * Starts the periodic room expiration job.
 * Safe to call multiple times — will only start one interval.
 */
export function startRoomExpiryJob(): void {
  if (cleanupInterval) return;

  // Run once immediately on startup to clean up any pre-existing stale rooms
  expireStaleRooms().catch((err) => logger.error({ err }, 'Initial room expiry failed'));

  cleanupInterval = setInterval(() => {
    expireStaleRooms().catch((err) => logger.error({ err }, 'Scheduled room expiry failed'));
  }, CLEANUP_INTERVAL_MS);

  // Prevent the interval from blocking Node.js process shutdown
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  logger.info(
    { intervalMs: CLEANUP_INTERVAL_MS, maxAgeMs: ROOM_MAX_AGE_MS },
    'Room expiry job started',
  );
}

/**
 * Stops the periodic room expiration job. Used in tests.
 */
export function stopRoomExpiryJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

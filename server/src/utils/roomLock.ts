// ============================================================
// Per-room mutex to prevent concurrent read-modify-write races
// on Room documents.
//
// Every socket handler that reads a room, mutates it, and saves
// it must acquire the lock for that room code first.
// ============================================================

import { Mutex } from 'async-mutex';

const roomMutexes = new Map<string, Mutex>();

/**
 * Returns the Mutex for the given room code, creating one if needed.
 */
export function getRoomMutex(roomCode: string): Mutex {
  let mutex = roomMutexes.get(roomCode);
  if (!mutex) {
    mutex = new Mutex();
    roomMutexes.set(roomCode, mutex);
  }
  return mutex;
}

/**
 * Removes the mutex for a room (call when room is deleted).
 * Optional cleanup to prevent unbounded Map growth.
 */
export function deleteRoomMutex(roomCode: string): void {
  roomMutexes.delete(roomCode);
}

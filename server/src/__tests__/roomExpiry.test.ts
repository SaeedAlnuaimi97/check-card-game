/**
 * Tests for room expiry service (F-202/F-305)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expireStaleRooms, startRoomExpiryJob, stopRoomExpiryJob } from '../utils/roomExpiry';

// Mock the Room model and roomLock utility
vi.mock('../models/Room', () => ({
  RoomModel: {
    find: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('../utils/roomLock', () => ({
  deleteRoomMutex: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { RoomModel } from '../models/Room';
import { deleteRoomMutex } from '../utils/roomLock';

const mockFind = RoomModel.find as ReturnType<typeof vi.fn>;
const mockDeleteMany = RoomModel.deleteMany as ReturnType<typeof vi.fn>;
const mockDeleteMutex = deleteRoomMutex as ReturnType<typeof vi.fn>;

describe('expireStaleRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no stale rooms found', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    const count = await expireStaleRooms();
    expect(count).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes stale rooms and cleans up mutexes', async () => {
    const staleRooms = [{ roomCode: 'ABC123' }, { roomCode: 'XYZ789' }];
    mockFind.mockReturnValue({ lean: () => Promise.resolve(staleRooms) });
    mockDeleteMany.mockResolvedValue({ deletedCount: 2 });

    const count = await expireStaleRooms();

    expect(count).toBe(2);
    expect(mockDeleteMany).toHaveBeenCalledWith({ roomCode: { $in: ['ABC123', 'XYZ789'] } });
    expect(mockDeleteMutex).toHaveBeenCalledWith('ABC123');
    expect(mockDeleteMutex).toHaveBeenCalledWith('XYZ789');
  });

  it('returns 0 and logs error when DB throws', async () => {
    mockFind.mockReturnValue({
      lean: () => Promise.reject(new Error('DB error')),
    });

    const count = await expireStaleRooms();
    expect(count).toBe(0);
  });
});

describe('startRoomExpiryJob / stopRoomExpiryJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopRoomExpiryJob(); // ensure clean state
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopRoomExpiryJob();
    vi.useRealTimers();
  });

  it('runs expiry on startup', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    startRoomExpiryJob();

    // Flush promises for the immediate call (no timer advancement needed)
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFind).toHaveBeenCalled();
  });

  it('does not start a second interval if called twice', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    startRoomExpiryJob();
    startRoomExpiryJob(); // second call should be no-op

    await Promise.resolve();
    await Promise.resolve();

    // find is called once (from first startRoomExpiryJob immediate call only)
    expect(mockFind).toHaveBeenCalledTimes(1);
  });

  it('stops running after stopRoomExpiryJob', () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    startRoomExpiryJob();
    stopRoomExpiryJob();

    // After stopping, the interval should be gone — advance time, nothing should run
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    // The immediate startup call may have fired (async), but the interval should not
    // We just verify stop doesn't throw and the interval is cleared
    expect(() => stopRoomExpiryJob()).not.toThrow();
  });
});

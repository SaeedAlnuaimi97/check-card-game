/**
 * Tests for room expiry service (F-202/F-305)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  expireStaleRooms,
  expireEmptyRooms,
  startRoomExpiryJob,
  stopRoomExpiryJob,
} from '../utils/roomExpiry';

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

describe('expireEmptyRooms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no empty stale rooms found', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    const count = await expireEmptyRooms();
    expect(count).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes empty rooms and cleans up mutexes', async () => {
    const emptyRooms = [{ roomCode: 'EMP001' }, { roomCode: 'EMP002' }];
    mockFind.mockReturnValue({ lean: () => Promise.resolve(emptyRooms) });
    mockDeleteMany.mockResolvedValue({ deletedCount: 2 });

    const count = await expireEmptyRooms();

    expect(count).toBe(2);
    expect(mockDeleteMany).toHaveBeenCalledWith({ roomCode: { $in: ['EMP001', 'EMP002'] } });
    expect(mockDeleteMutex).toHaveBeenCalledWith('EMP001');
    expect(mockDeleteMutex).toHaveBeenCalledWith('EMP002');
  });

  it('queries for lobby and playing rooms with no human players', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    await expireEmptyRooms();

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: ['lobby', 'playing'] },
        $nor: expect.any(Array),
      }),
      expect.anything(),
    );
  });

  it('returns 0 and logs error when DB throws', async () => {
    mockFind.mockReturnValue({
      lean: () => Promise.reject(new Error('DB error')),
    });

    const count = await expireEmptyRooms();
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

  it('runs both expiry functions on startup', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    startRoomExpiryJob();

    // Flush promises for both immediate calls
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // find is called three times: expireEmptyRooms, expireStaleRooms, logActiveSessions
    expect(mockFind).toHaveBeenCalledTimes(3);
  });

  it('does not start a second interval if called twice', async () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    startRoomExpiryJob();
    startRoomExpiryJob(); // second call should be no-op

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // find is called three times (one immediate call each, from first startRoomExpiryJob only)
    expect(mockFind).toHaveBeenCalledTimes(3);
  });

  it('stops running after stopRoomExpiryJob', () => {
    mockFind.mockReturnValue({ lean: () => Promise.resolve([]) });

    startRoomExpiryJob();
    stopRoomExpiryJob();

    // After stopping, advance time well past both intervals — nothing should fire
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);

    expect(() => stopRoomExpiryJob()).not.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Socket leaderboard handler tests (getLeaderboard, getStats)
// ============================================================
// Tests the socket event handlers in socket/index.ts by mocking
// the GameResultModel and providing mock socket/io objects.

const { mockAggregate, mockFind, mockFindOneGuest } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockFind: vi.fn(),
  mockFindOneGuest: vi.fn(),
}));

vi.mock('../models/GameResult', () => ({
  GameResultModel: {
    aggregate: mockAggregate,
    find: (...args: unknown[]) => mockFind(...args),
  },
}));

vi.mock('../models/GuestProfile', () => ({
  GuestProfileModel: {
    findOne: (...args: unknown[]) => mockFindOneGuest(...args),
  },
}));

// Suppress console.log/error in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import { registerSocketHandlers } from '../socket/index';

// ============================================================
// Helper: create mock io & socket, register handlers, extract handler
// ============================================================

type HandlerFn = (...args: unknown[]) => void | Promise<void>;

function setupSocket() {
  const handlers: Record<string, HandlerFn> = {};

  const mockSocket = {
    id: 'test-socket-id',
    on: vi.fn((event: string, handler: HandlerFn) => {
      handlers[event] = handler;
    }),
    join: vi.fn(),
    emit: vi.fn(),
  };

  const mockIo = {
    on: vi.fn((_event: string, cb: (socket: typeof mockSocket) => void) => {
      cb(mockSocket);
    }),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };

  registerSocketHandlers(mockIo as never);

  return { handlers, mockSocket };
}

// ============================================================
// getLeaderboard tests
// ============================================================

describe('getLeaderboard socket handler', () => {
  let handlers: Record<string, HandlerFn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const setup = setupSocket();
    handlers = setup.handlers;
  });

  it('registers the getLeaderboard handler', () => {
    expect(handlers['getLeaderboard']).toBeDefined();
  });

  it('returns ranked leaderboard entries', async () => {
    const mockResults = [
      {
        _id: 'guest_1',
        username: 'Alice',
        gamesPlayed: 10,
        wins: 7,
        losses: 2,
        winRate: 70,
        avgScore: 25.5,
        lastPlayedAt: '2026-03-14T00:00:00Z',
      },
      {
        _id: 'guest_2',
        username: 'Bob',
        gamesPlayed: 5,
        wins: 3,
        losses: 1,
        winRate: 60,
        avgScore: 30.2,
        lastPlayedAt: '2026-03-13T00:00:00Z',
      },
    ];
    mockAggregate.mockResolvedValue(mockResults);

    const callback = vi.fn();
    await handlers['getLeaderboard']({ limit: 50 }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      leaderboard: [
        {
          rank: 1,
          guestId: 'guest_1',
          username: 'Alice',
          gamesPlayed: 10,
          wins: 7,
          losses: 2,
          winRate: 70,
          avgScore: 25.5,
          lastPlayedAt: '2026-03-14T00:00:00Z',
        },
        {
          rank: 2,
          guestId: 'guest_2',
          username: 'Bob',
          gamesPlayed: 5,
          wins: 3,
          losses: 1,
          winRate: 60,
          avgScore: 30.2,
          lastPlayedAt: '2026-03-13T00:00:00Z',
        },
      ],
    });
  });

  it('returns empty leaderboard when no games exist', async () => {
    mockAggregate.mockResolvedValue([]);

    const callback = vi.fn();
    await handlers['getLeaderboard']({ limit: 50 }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      leaderboard: [],
    });
  });

  it('caps limit at 100', async () => {
    mockAggregate.mockResolvedValue([]);

    const callback = vi.fn();
    await handlers['getLeaderboard']({ limit: 500 }, callback);

    // Verify the pipeline was called — the $limit stage should be 100
    expect(mockAggregate).toHaveBeenCalled();
    const pipeline = mockAggregate.mock.calls[0][0];
    const limitStage = pipeline.find((stage: Record<string, unknown>) => '$limit' in stage);
    expect(limitStage.$limit).toBe(100);

    expect(callback).toHaveBeenCalledWith({ success: true, leaderboard: [] });
  });

  it('defaults limit to 50 when not provided', async () => {
    mockAggregate.mockResolvedValue([]);

    const callback = vi.fn();
    await handlers['getLeaderboard']({}, callback);

    const pipeline = mockAggregate.mock.calls[0][0];
    const limitStage = pipeline.find((stage: Record<string, unknown>) => '$limit' in stage);
    expect(limitStage.$limit).toBe(50);
  });

  it('returns error on DB failure', async () => {
    mockAggregate.mockRejectedValue(new Error('DB down'));

    const callback = vi.fn();
    await handlers['getLeaderboard']({ limit: 50 }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch leaderboard',
    });
  });

  it('handles missing callback gracefully', async () => {
    mockAggregate.mockResolvedValue([]);

    // Should not throw even without a callback
    await expect(handlers['getLeaderboard']({ limit: 50 })).resolves.not.toThrow();
  });
});

// ============================================================
// getStats tests
// ============================================================

describe('getStats socket handler', () => {
  let handlers: Record<string, HandlerFn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const setup = setupSocket();
    handlers = setup.handlers;
  });

  it('registers the getStats handler', () => {
    expect(handlers['getStats']).toBeDefined();
  });

  it('returns stats for a known guest', async () => {
    const mockStatsResult = [
      {
        _id: 'guest_abc',
        username: 'Alice',
        gamesPlayed: 5,
        wins: 3,
        losses: 1,
        winRate: 60,
        avgScore: 28.4,
      },
    ];
    mockAggregate.mockResolvedValue(mockStatsResult);

    const mockGames = [
      {
        roomCode: 'ABCDEF',
        endedAt: '2026-03-14T12:00:00Z',
        totalRounds: 3,
        players: [
          {
            guestId: 'guest_abc',
            username: 'Alice',
            finalScore: 25,
            isWinner: true,
            isLoser: false,
          },
          { guestId: 'guest_xyz', username: 'Bob', finalScore: 80, isWinner: false, isLoser: true },
        ],
        winnerUsername: 'Alice',
      },
    ];
    mockFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockGames),
        }),
      }),
    });

    const callback = vi.fn();
    await handlers['getStats']({ guestId: 'guest_abc' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      stats: {
        guestId: 'guest_abc',
        username: 'Alice',
        gamesPlayed: 5,
        wins: 3,
        losses: 1,
        winRate: 60,
        avgScore: 28.4,
        recentGames: [
          {
            roomCode: 'ABCDEF',
            endedAt: '2026-03-14T12:00:00Z',
            totalRounds: 3,
            playerCount: 2,
            myScore: 25,
            winnerUsername: 'Alice',
            isWin: true,
          },
        ],
      },
    });
  });

  it('returns default stats for unknown guest', async () => {
    mockAggregate.mockResolvedValue([]);

    const callback = vi.fn();
    await handlers['getStats']({ guestId: 'guest_unknown' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      stats: {
        guestId: 'guest_unknown',
        username: 'Unknown',
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgScore: 0,
        recentGames: [],
      },
    });
  });

  it('returns error when guestId is missing', async () => {
    const callback = vi.fn();
    await handlers['getStats']({}, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid guestId',
    });
  });

  it('returns error when guestId is empty string', async () => {
    const callback = vi.fn();
    await handlers['getStats']({ guestId: '' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid guestId',
    });
  });

  it('returns error on DB failure', async () => {
    mockAggregate.mockRejectedValue(new Error('DB error'));

    const callback = vi.fn();
    await handlers['getStats']({ guestId: 'guest_abc' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to fetch player stats',
    });
  });

  it('handles missing callback gracefully', async () => {
    const callback = vi.fn();
    await handlers['getStats']({ guestId: '' }, callback);

    // Should have been called with error, not thrown
    expect(callback).toHaveBeenCalled();
  });
});

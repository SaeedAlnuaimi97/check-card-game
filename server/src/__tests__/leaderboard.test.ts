import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ============================================================
// Leaderboard API route tests (F-235, F-236)
// ============================================================
// Tests the route handlers by importing the router and mocking
// the GameResultModel. Uses lightweight mock req/res objects
// instead of supertest to avoid needing a live server.

// Mock GameResultModel — use vi.hoisted to declare mocks that
// are referenced inside vi.mock factories (which are hoisted).
const { mockAggregate, mockFind } = vi.hoisted(() => ({
  mockAggregate: vi.fn(),
  mockFind: vi.fn(),
}));

vi.mock('../models/GameResult', () => ({
  GameResultModel: {
    aggregate: mockAggregate,
    find: (...args: unknown[]) => mockFind(...args),
  },
}));

// Import router after mocks are set up
import leaderboardRouter from '../routes/leaderboard';

// ============================================================
// Helper: extract route handler from Express router
// ============================================================

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (req: Request, res: Response) => Promise<void> }[];
  };
}

function getHandler(method: string, path: string) {
  const layers = (leaderboardRouter as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of layers) {
    if (layer.route && layer.route.path === path && layer.route.methods[method]) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
}

// ============================================================
// Helper: create mock req/res
// ============================================================

function createMockReqRes(params: Record<string, string> = {}, query: Record<string, string> = {}) {
  const req = { params, query } as unknown as Request;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

// ============================================================
// GET /leaderboard tests (F-235)
// ============================================================

describe('GET /leaderboard', () => {
  const handler = getHandler('get', '/leaderboard');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns leaderboard with ranks', async () => {
    mockAggregate.mockResolvedValue([
      {
        _id: 'guest-abc',
        username: 'Alice',
        gamesPlayed: 10,
        wins: 7,
        losses: 1,
        winRate: 70.0,
        avgScore: 30.5,
        lastPlayedAt: new Date('2026-03-13T10:00:00Z'),
      },
      {
        _id: 'guest-def',
        username: 'Bob',
        gamesPlayed: 8,
        wins: 3,
        losses: 4,
        winRate: 37.5,
        avgScore: 55.2,
        lastPlayedAt: new Date('2026-03-12T10:00:00Z'),
      },
    ]);

    const { req, res } = createMockReqRes({}, {});
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      leaderboard: [
        {
          rank: 1,
          guestId: 'guest-abc',
          username: 'Alice',
          gamesPlayed: 10,
          wins: 7,
          losses: 1,
          winRate: 70.0,
          avgScore: 30.5,
          lastPlayedAt: expect.any(Date),
        },
        {
          rank: 2,
          guestId: 'guest-def',
          username: 'Bob',
          gamesPlayed: 8,
          wins: 3,
          losses: 4,
          winRate: 37.5,
          avgScore: 55.2,
          lastPlayedAt: expect.any(Date),
        },
      ],
    });
  });

  it('returns empty leaderboard when no results', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({}, {});
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ leaderboard: [] });
  });

  it('respects custom limit query param', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({}, { limit: '10' });
    await handler(req, res);

    // Check that the pipeline passed to aggregate contains $limit: 10
    const pipeline = mockAggregate.mock.calls[0][0];
    const limitStage = pipeline.find((stage: Record<string, unknown>) => '$limit' in stage);
    expect(limitStage.$limit).toBe(10);
  });

  it('caps limit at 100', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({}, { limit: '500' });
    await handler(req, res);

    const pipeline = mockAggregate.mock.calls[0][0];
    const limitStage = pipeline.find((stage: Record<string, unknown>) => '$limit' in stage);
    expect(limitStage.$limit).toBe(100);
  });

  it('defaults to limit 50 when no param provided', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({}, {});
    await handler(req, res);

    const pipeline = mockAggregate.mock.calls[0][0];
    const limitStage = pipeline.find((stage: Record<string, unknown>) => '$limit' in stage);
    expect(limitStage.$limit).toBe(50);
  });

  it('defaults to limit 50 for invalid limit param', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({}, { limit: 'abc' });
    await handler(req, res);

    const pipeline = mockAggregate.mock.calls[0][0];
    const limitStage = pipeline.find((stage: Record<string, unknown>) => '$limit' in stage);
    expect(limitStage.$limit).toBe(50);
  });

  it('returns 500 on database error', async () => {
    mockAggregate.mockRejectedValue(new Error('DB connection failed'));

    const { req, res } = createMockReqRes({}, {});
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to fetch leaderboard',
    });
  });

  it('aggregation pipeline has correct stages', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({}, {});
    await handler(req, res);

    const pipeline = mockAggregate.mock.calls[0][0];

    // Should have: $unwind, $group, $addFields, $sort, $limit
    const stageTypes = pipeline.map((stage: Record<string, unknown>) => Object.keys(stage)[0]);
    expect(stageTypes).toContain('$unwind');
    expect(stageTypes).toContain('$group');
    expect(stageTypes).toContain('$addFields');
    expect(stageTypes).toContain('$sort');
    expect(stageTypes).toContain('$limit');

    // $group should group by players.guestId
    const groupStage = pipeline.find((stage: Record<string, unknown>) => '$group' in stage);
    expect(groupStage.$group._id).toBe('$players.guestId');
  });
});

// ============================================================
// GET /stats/:guestId tests (F-236)
// ============================================================

describe('GET /stats/:guestId', () => {
  const handler = getHandler('get', '/stats/:guestId');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stats and recent games for a known player', async () => {
    // Mock aggregation result for summary stats
    mockAggregate.mockResolvedValue([
      {
        _id: 'guest-abc',
        username: 'Alice',
        gamesPlayed: 10,
        wins: 7,
        losses: 1,
        winRate: 70.0,
        avgScore: 30.5,
      },
    ]);

    // Mock chained find().sort().limit().lean()
    const recentGames = [
      {
        roomCode: 'ROOM01',
        endedAt: new Date('2026-03-13T10:00:00Z'),
        totalRounds: 5,
        players: [
          { guestId: 'guest-abc', finalScore: 25, isWinner: true },
          { guestId: 'guest-def', finalScore: 102, isWinner: false },
        ],
        winnerUsername: 'Alice',
      },
    ];

    const mockLean = vi.fn().mockResolvedValue(recentGames);
    const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
    const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
    mockFind.mockReturnValue({ sort: mockSort });

    const { req, res } = createMockReqRes({ guestId: 'guest-abc' });
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      guestId: 'guest-abc',
      username: 'Alice',
      gamesPlayed: 10,
      wins: 7,
      losses: 1,
      winRate: 70.0,
      avgScore: 30.5,
      recentGames: [
        {
          roomCode: 'ROOM01',
          endedAt: expect.any(Date),
          totalRounds: 5,
          playerCount: 2,
          myScore: 25,
          winnerUsername: 'Alice',
          isWin: true,
        },
      ],
    });
  });

  it('returns empty stats for unknown player', async () => {
    mockAggregate.mockResolvedValue([]);

    const { req, res } = createMockReqRes({ guestId: 'guest-unknown' });
    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      guestId: 'guest-unknown',
      username: 'Unknown',
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgScore: 0,
      recentGames: [],
    });
  });

  it('queries recent games sorted by endedAt descending with limit 20', async () => {
    mockAggregate.mockResolvedValue([
      {
        _id: 'guest-abc',
        username: 'Alice',
        gamesPlayed: 1,
        wins: 1,
        losses: 0,
        winRate: 100,
        avgScore: 20,
      },
    ]);

    const mockLean = vi.fn().mockResolvedValue([]);
    const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
    const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
    mockFind.mockReturnValue({ sort: mockSort });

    const { req, res } = createMockReqRes({ guestId: 'guest-abc' });
    await handler(req, res);

    expect(mockFind).toHaveBeenCalledWith({ 'players.guestId': 'guest-abc' });
    expect(mockSort).toHaveBeenCalledWith({ endedAt: -1 });
    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(mockLean).toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockAggregate.mockRejectedValue(new Error('DB error'));

    const { req, res } = createMockReqRes({ guestId: 'guest-abc' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Failed to fetch player stats',
    });
  });

  it('handles game where player entry is missing gracefully', async () => {
    mockAggregate.mockResolvedValue([
      {
        _id: 'guest-abc',
        username: 'Alice',
        gamesPlayed: 1,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgScore: 0,
      },
    ]);

    // Game where the player's guestId is not in the players array (edge case)
    const recentGames = [
      {
        roomCode: 'EDGE01',
        endedAt: new Date(),
        totalRounds: 3,
        players: [{ guestId: 'guest-other', finalScore: 50, isWinner: true }],
        winnerUsername: 'Other',
      },
    ];

    const mockLean = vi.fn().mockResolvedValue(recentGames);
    const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
    const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
    mockFind.mockReturnValue({ sort: mockSort });

    const { req, res } = createMockReqRes({ guestId: 'guest-abc' });
    await handler(req, res);

    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.recentGames[0].myScore).toBe(0);
    expect(jsonCall.recentGames[0].isWin).toBe(false);
  });
});

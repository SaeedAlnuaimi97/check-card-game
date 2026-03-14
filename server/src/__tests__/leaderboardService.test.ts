import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Leaderboard service tests (F-251)
// ============================================================

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

import { getLeaderboard, getPlayerStats } from '../services/leaderboard';

describe('leaderboard service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // getLeaderboard
  // ============================================================

  describe('getLeaderboard', () => {
    it('returns ranked entries from aggregation', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'guest-1',
          username: 'Alice',
          gamesPlayed: 10,
          wins: 7,
          losses: 1,
          winRate: 70.0,
          avgScore: 30.5,
          lastPlayedAt: new Date('2026-03-13'),
        },
        {
          _id: 'guest-2',
          username: 'Bob',
          gamesPlayed: 5,
          wins: 2,
          losses: 2,
          winRate: 40.0,
          avgScore: 45.0,
          lastPlayedAt: new Date('2026-03-12'),
        },
      ]);

      const result = await getLeaderboard(50);

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].guestId).toBe('guest-1');
      expect(result[1].rank).toBe(2);
      expect(result[1].guestId).toBe('guest-2');
    });

    it('returns empty array when no data', async () => {
      mockAggregate.mockResolvedValue([]);
      const result = await getLeaderboard(50);
      expect(result).toEqual([]);
    });

    it('caps limit at 100', async () => {
      mockAggregate.mockResolvedValue([]);
      await getLeaderboard(500);

      const pipeline = mockAggregate.mock.calls[0][0];
      const limitStage = pipeline.find((s: Record<string, unknown>) => '$limit' in s);
      expect(limitStage.$limit).toBe(100);
    });

    it('defaults to 50 for invalid limit', async () => {
      mockAggregate.mockResolvedValue([]);
      await getLeaderboard(-1);

      const pipeline = mockAggregate.mock.calls[0][0];
      const limitStage = pipeline.find((s: Record<string, unknown>) => '$limit' in s);
      expect(limitStage.$limit).toBe(50);
    });

    it('pipeline uses $unwind, $group, $addFields, $sort, $limit', async () => {
      mockAggregate.mockResolvedValue([]);
      await getLeaderboard(10);

      const pipeline = mockAggregate.mock.calls[0][0];
      const stages = pipeline.map((s: Record<string, unknown>) => Object.keys(s)[0]);
      expect(stages).toEqual(['$unwind', '$group', '$addFields', '$sort', '$limit']);
    });
  });

  // ============================================================
  // getPlayerStats
  // ============================================================

  describe('getPlayerStats', () => {
    it('returns stats and recent games for known player', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'guest-1',
          username: 'Alice',
          gamesPlayed: 5,
          wins: 3,
          losses: 1,
          winRate: 60.0,
          avgScore: 25.0,
        },
      ]);

      const mockLean = vi.fn().mockResolvedValue([
        {
          roomCode: 'ROOM01',
          endedAt: new Date('2026-03-13'),
          totalRounds: 4,
          players: [
            { guestId: 'guest-1', finalScore: 20, isWinner: true },
            { guestId: 'guest-2', finalScore: 80, isWinner: false },
          ],
          winnerUsername: 'Alice',
        },
      ]);
      const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
      const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
      mockFind.mockReturnValue({ sort: mockSort });

      const result = await getPlayerStats('guest-1');

      expect(result.guestId).toBe('guest-1');
      expect(result.username).toBe('Alice');
      expect(result.wins).toBe(3);
      expect(result.recentGames).toHaveLength(1);
      expect(result.recentGames[0].myScore).toBe(20);
      expect(result.recentGames[0].isWin).toBe(true);
    });

    it('returns default stats for unknown player', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await getPlayerStats('guest-unknown');

      expect(result).toEqual({
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

    it('handles missing player entry in recent game', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'guest-1',
          username: 'Alice',
          gamesPlayed: 1,
          wins: 0,
          losses: 0,
          winRate: 0,
          avgScore: 0,
        },
      ]);

      const mockLean = vi.fn().mockResolvedValue([
        {
          roomCode: 'EDGE01',
          endedAt: new Date(),
          totalRounds: 2,
          players: [{ guestId: 'guest-other', finalScore: 50, isWinner: true }],
          winnerUsername: 'Other',
        },
      ]);
      const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
      const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
      mockFind.mockReturnValue({ sort: mockSort });

      const result = await getPlayerStats('guest-1');

      expect(result.recentGames[0].myScore).toBe(0);
      expect(result.recentGames[0].isWin).toBe(false);
    });

    it('queries recent games sorted by endedAt desc, limit 20', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'guest-1',
          username: 'Alice',
          gamesPlayed: 1,
          wins: 1,
          losses: 0,
          winRate: 100,
          avgScore: 10,
        },
      ]);

      const mockLean = vi.fn().mockResolvedValue([]);
      const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
      const mockSort = vi.fn().mockReturnValue({ limit: mockLimit });
      mockFind.mockReturnValue({ sort: mockSort });

      await getPlayerStats('guest-1');

      expect(mockFind).toHaveBeenCalledWith({ 'players.guestId': 'guest-1' });
      expect(mockSort).toHaveBeenCalledWith({ endedAt: -1 });
      expect(mockLimit).toHaveBeenCalledWith(20);
    });

    it('propagates database errors', async () => {
      mockAggregate.mockRejectedValue(new Error('DB error'));

      await expect(getPlayerStats('guest-1')).rejects.toThrow('DB error');
    });
  });
});

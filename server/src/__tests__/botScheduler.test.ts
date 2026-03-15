import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validatePlayerTurn } from '../game/TurnManager';
import type { Card, GameState, PlayerState } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function makeCard(
  id: string,
  rank: Card['rank'] = '5',
  suit: Card['suit'] = '♠',
  value?: number,
): Card {
  const isRed = suit === '♥' || suit === '♦';
  const computedValue = (() => {
    if (rank === 'A') return 1;
    if (rank === '10' && isRed) return 0;
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 10;
    return parseInt(rank, 10) || 5;
  })();
  return { id, suit, rank, value: value ?? computedValue, isRed };
}

function makePlayer(
  playerId: string,
  opts: { isBot?: boolean; botDifficulty?: 'easy' | 'expert' } = {},
): PlayerState {
  return {
    playerId,
    username: playerId,
    hand: [
      { slot: 'A', card: makeCard('c1', '5') },
      { slot: 'B', card: makeCard('c2', '8') },
      { slot: 'C', card: makeCard('c3', '3') },
      { slot: 'D', card: makeCard('c4', 'K') },
    ],
    peekedSlots: [],
    totalScore: 0,
    ...opts,
  };
}

function createTestGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    deck: [],
    discardPile: [],
    players: [],
    currentTurnIndex: 0,
    checkCalledBy: null,
    checkCalledAtIndex: null,
    roundNumber: 1,
    scores: {},
    phase: 'playing',
    drawnCard: null,
    drawnByPlayerId: null,
    drawnSource: null,
    pendingEffect: null,
    turnStartedAt: null,
    gameStartedAt: null,
    paused: false,
    pausedBy: null,
    pausedAt: null,
    turnTimeRemainingMs: null,
    targetScore: 70,
    ...overrides,
  };
}

// ============================================================
// validatePlayerTurn semantics — prevents regression of inverted check
// ============================================================

describe('validatePlayerTurn return value semantics', () => {
  it('returns null (falsy) when turn IS valid — bot should proceed', () => {
    const bot = makePlayer('bot1', { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
    });

    const result = validatePlayerTurn(gs, 'bot1');
    expect(result).toBeNull();

    // The correct guard in botScheduler is:
    //   if (validatePlayerTurn(gameState, botPlayerId)) return;
    // When result is null (valid turn), this evaluates to:
    //   if (null) return;  → false → bot continues (CORRECT)
    expect(!result).toBe(true); // null is falsy
    expect(!!result).toBe(false); // double-negate to boolean
  });

  it('returns error string (truthy) when turn is NOT valid — bot should exit', () => {
    const bot = makePlayer('bot1', { isBot: true, botDifficulty: 'expert' });
    const human = makePlayer('human1');
    const gs = createTestGameState({
      players: [human, bot],
      currentTurnIndex: 0, // human's turn, not bot's
    });

    const result = validatePlayerTurn(gs, 'bot1');
    expect(result).toBe('It is not your turn');
    expect(typeof result).toBe('string');

    // The correct guard in botScheduler is:
    //   if (validatePlayerTurn(gameState, botPlayerId)) return;
    // When result is "It is not your turn" (invalid), this evaluates to:
    //   if ("It is not your turn") return;  → true → bot exits (CORRECT)
    expect(!result).toBe(false); // truthy string
    expect(!!result).toBe(true);
  });

  it('returns error when game is not in playing phase', () => {
    const bot = makePlayer('bot1', { isBot: true });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
      phase: 'peeking',
    });

    const result = validatePlayerTurn(gs, 'bot1');
    expect(result).toBe('Game is not in playing phase');
    expect(!!result).toBe(true); // truthy → bot should exit
  });
});

// ============================================================
// scheduleBotTurnIfNeeded — only schedules for bots
// ============================================================

describe('scheduleBotTurnIfNeeded', () => {
  let scheduleBotTurnIfNeeded: typeof import('../utils/botScheduler').scheduleBotTurnIfNeeded;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Dynamically import to get fresh module with mocks
    const mod = await import('../utils/botScheduler');
    scheduleBotTurnIfNeeded = mod.scheduleBotTurnIfNeeded;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when current player is not a bot', () => {
    const human = makePlayer('human1');
    const gs = createTestGameState({
      players: [human],
      currentTurnIndex: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log');
    // Using null as io since it should exit before using it
    scheduleBotTurnIfNeeded(null as any, 'ROOM1', gs);
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Scheduling bot turn'));
    consoleSpy.mockRestore();
  });

  it('schedules bot turn when current player is a bot', () => {
    const bot = makePlayer('bot1', { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log');
    scheduleBotTurnIfNeeded(null as any, 'ROOM1', gs);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling bot turn for bot1'),
    );
    consoleSpy.mockRestore();
  });

  it('uses expert delay (900ms) for expert bots', () => {
    const bot = makePlayer('bot1', { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log');
    scheduleBotTurnIfNeeded(null as any, 'ROOM1', gs);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('in 900ms'));
    consoleSpy.mockRestore();
  });

  it('uses easy delay (1500ms) for easy bots', () => {
    const bot = makePlayer('bot1', { isBot: true, botDifficulty: 'easy' });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log');
    scheduleBotTurnIfNeeded(null as any, 'ROOM1', gs);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('in 1500ms'));
    consoleSpy.mockRestore();
  });

  it('defaults to easy delay when botDifficulty is not set', () => {
    const bot = makePlayer('bot1', { isBot: true });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
    });

    const consoleSpy = vi.spyOn(console, 'log');
    scheduleBotTurnIfNeeded(null as any, 'ROOM1', gs);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('in 1500ms'));
    consoleSpy.mockRestore();
  });
});

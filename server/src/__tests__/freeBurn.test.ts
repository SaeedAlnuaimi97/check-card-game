import { describe, it, expect } from 'vitest';
import { computeRoundResult } from '../game/Scoring';
import { handleBurnAttempt } from '../game/ActionHandler';
import { initializeGameState } from '../game/GameSetup';
import type { Card, GameState, PlayerState } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function makeCard(rank: Card['rank'], suit: Card['suit'], value: number): Card {
  return { id: `${rank}-${suit}`, suit, rank, value, isRed: suit === '♥' || suit === '♦' };
}

function makePlayer(playerId: string, hand: { slot: string; card: Card }[]): PlayerState {
  return {
    playerId,
    username: playerId,
    hand,
    peekedSlots: [],
    totalScore: 0,
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
    gameMode: 'classic',
    ...overrides,
  };
}

// ============================================================
// Free Burn Award — computeRoundResult (Scoring.ts)
// ============================================================

describe('Free Burn Award (computeRoundResult)', () => {
  it('awards Free Burn to a player with handSum === 0', () => {
    const gs = createTestGameState({
      players: [
        makePlayer('p1', [
          { slot: 'A', card: makeCard('10', '♥', 0) },
          { slot: 'B', card: makeCard('10', '♦', 0) },
          { slot: 'C', card: makeCard('10', '♥', 0) },
          { slot: 'D', card: makeCard('10', '♦', 0) },
        ]),
        makePlayer('p2', [
          { slot: 'A', card: makeCard('5', '♠', 5) },
          { slot: 'B', card: makeCard('3', '♣', 3) },
          { slot: 'C', card: makeCard('7', '♠', 7) },
          { slot: 'D', card: makeCard('2', '♣', 2) },
        ]),
      ],
      scores: { p1: 0, p2: 10 },
      checkCalledBy: 'p1',
    });

    const result = computeRoundResult(gs);

    expect(result.freeBurnAwarded).toContain('p1');
    expect(result.freeBurnAwarded).not.toContain('p2');
    expect(gs.players[0].hasFreeBurn).toBe(true);
    expect(gs.players[1].hasFreeBurn).toBeUndefined();
  });

  it('does NOT award Free Burn when handSum > 0', () => {
    const gs = createTestGameState({
      players: [
        makePlayer('p1', [
          { slot: 'A', card: makeCard('A', '♠', 1) },
          { slot: 'B', card: makeCard('10', '♦', 0) },
          { slot: 'C', card: makeCard('10', '♥', 0) },
          { slot: 'D', card: makeCard('10', '♦', 0) },
        ]),
        makePlayer('p2', [
          { slot: 'A', card: makeCard('5', '♠', 5) },
          { slot: 'B', card: makeCard('3', '♣', 3) },
          { slot: 'C', card: makeCard('7', '♠', 7) },
          { slot: 'D', card: makeCard('2', '♣', 2) },
        ]),
      ],
      scores: { p1: 0, p2: 10 },
      checkCalledBy: 'p1',
    });

    const result = computeRoundResult(gs);

    expect(result.freeBurnAwarded).toEqual([]);
    expect(gs.players[0].hasFreeBurn).toBeUndefined();
    expect(gs.players[1].hasFreeBurn).toBeUndefined();
  });

  it('awards Free Burn to multiple players if all have handSum === 0', () => {
    const gs = createTestGameState({
      players: [
        makePlayer('p1', [
          { slot: 'A', card: makeCard('10', '♥', 0) },
          { slot: 'B', card: makeCard('10', '♦', 0) },
        ]),
        makePlayer('p2', [
          { slot: 'A', card: makeCard('10', '♥', 0) },
          { slot: 'B', card: makeCard('10', '♦', 0) },
        ]),
      ],
      scores: { p1: 0, p2: 0 },
      checkCalledBy: 'p1',
    });

    const result = computeRoundResult(gs);

    expect(result.freeBurnAwarded).toContain('p1');
    expect(result.freeBurnAwarded).toContain('p2');
    expect(gs.players[0].hasFreeBurn).toBe(true);
    expect(gs.players[1].hasFreeBurn).toBe(true);
  });

  it('awards Free Burn to player with empty hand (all cards burned)', () => {
    const gs = createTestGameState({
      players: [
        makePlayer('p1', []), // all cards burned — handSum = 0
        makePlayer('p2', [
          { slot: 'A', card: makeCard('5', '♠', 5) },
          { slot: 'B', card: makeCard('3', '♣', 3) },
          { slot: 'C', card: makeCard('7', '♠', 7) },
          { slot: 'D', card: makeCard('2', '♣', 2) },
        ]),
      ],
      scores: { p1: 0, p2: 10 },
      checkCalledBy: 'p1',
    });

    const result = computeRoundResult(gs);

    expect(result.freeBurnAwarded).toContain('p1');
    expect(gs.players[0].hasFreeBurn).toBe(true);
  });
});

// ============================================================
// Free Burn Consumption — handleBurnAttempt (ActionHandler.ts)
// ============================================================

describe('Free Burn Consumption (handleBurnAttempt)', () => {
  it('on burn failure with freeBurn=true: skips penalty, consumes token, returns freeBurnUsed', () => {
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('5', '♠', 5) },
      { slot: 'B', card: makeCard('3', '♣', 3) },
    ]);
    player.hasFreeBurn = true;

    const gs = createTestGameState({
      players: [player],
      discardPile: [makeCard('7', '♠', 7)], // discard top is 7, burn slot A has 5 — mismatch
      deck: [makeCard('9', '♠', 9)], // would be penalty card in normal case
    });

    const result = handleBurnAttempt(gs, 'p1', 'A' as any, true);

    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(false);
    expect(result.freeBurnUsed).toBe(true);
    // No penalty card should be added
    expect(player.hand).toHaveLength(2);
    // Token should be consumed
    expect(player.hasFreeBurn).toBe(false);
    // Deck should still have the card (no penalty draw)
    expect(gs.deck).toHaveLength(1);
  });

  it('on burn success with freeBurn=true: does NOT consume token, no freeBurnUsed', () => {
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('7', '♣', 7) },
      { slot: 'B', card: makeCard('3', '♣', 3) },
    ]);
    player.hasFreeBurn = true;

    const gs = createTestGameState({
      players: [player],
      discardPile: [makeCard('7', '♠', 7)], // discard top is 7, burn slot A has 7 — match!
    });

    const result = handleBurnAttempt(gs, 'p1', 'A' as any, true);

    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(true);
    expect(result.freeBurnUsed).toBeUndefined();
    // Card should be removed from hand (burned)
    expect(player.hand).toHaveLength(1);
    // Token should be preserved (not consumed on success)
    expect(player.hasFreeBurn).toBe(true);
  });

  it('on burn failure without freeBurn: penalty card is drawn normally', () => {
    const penaltyCard = makeCard('9', '♠', 9);
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('5', '♠', 5) },
      { slot: 'B', card: makeCard('3', '♣', 3) },
    ]);

    const gs = createTestGameState({
      players: [player],
      discardPile: [makeCard('7', '♠', 7)], // mismatch
      deck: [penaltyCard],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A' as any, false);

    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(false);
    expect(result.freeBurnUsed).toBeUndefined();
    // Penalty card should be added
    expect(player.hand).toHaveLength(3);
    expect(player.hand[2].card.id).toBe(penaltyCard.id);
    // Deck should be empty (penalty card drawn)
    expect(gs.deck).toHaveLength(0);
  });

  it('freeBurn parameter defaults to false', () => {
    const penaltyCard = makeCard('9', '♠', 9);
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('5', '♠', 5) }]);
    player.hasFreeBurn = true;

    const gs = createTestGameState({
      players: [player],
      discardPile: [makeCard('7', '♠', 7)], // mismatch
      deck: [penaltyCard],
    });

    // Call without freeBurn param — should behave as normal (penalty drawn)
    const result = handleBurnAttempt(gs, 'p1', 'A' as any);

    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(false);
    expect(result.freeBurnUsed).toBeUndefined();
    // Penalty card should be drawn
    expect(player.hand).toHaveLength(2);
  });
});

// ============================================================
// Free Burn Validation Edge Cases
// ============================================================

describe('Free Burn Edge Cases', () => {
  it('freeBurn=true on invalid player returns error', () => {
    const gs = createTestGameState({
      players: [makePlayer('p1', [{ slot: 'A', card: makeCard('5', '♠', 5) }])],
      discardPile: [makeCard('7', '♠', 7)],
    });

    const result = handleBurnAttempt(gs, 'unknown', 'A' as any, true);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Player not found');
  });

  it('freeBurn=true on invalid slot returns error', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('5', '♠', 5) }]);
    player.hasFreeBurn = true;

    const gs = createTestGameState({
      players: [player],
      discardPile: [makeCard('7', '♠', 7)],
    });

    const result = handleBurnAttempt(gs, 'p1', 'Z' as any, true);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid slot: Z');
  });

  it('freeBurn=true with empty discard pile returns error', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('5', '♠', 5) }]);
    player.hasFreeBurn = true;

    const gs = createTestGameState({
      players: [player],
      discardPile: [],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A' as any, true);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No discard card to match against');
  });
});

// ============================================================
// Free Burn Carry-Over Across Rounds
// ============================================================

describe('Free Burn carry-over to next round', () => {
  it('initializeGameState does NOT preserve hasFreeBurn (fresh player states)', () => {
    // Simulate: p1 earned Free Burn in round 1
    // Then a new round is initialized — hasFreeBurn should NOT be on the new player states
    // (the caller, executeStartNextRound, is responsible for carrying it over)
    const newGameState = initializeGameState(
      [
        { id: 'p1', username: 'Player1' },
        { id: 'p2', username: 'Player2' },
      ],
      { p1: 0, p2: 10 },
      2,
      70,
      'classic',
    );

    expect(newGameState.players[0].hasFreeBurn).toBeUndefined();
    expect(newGameState.players[1].hasFreeBurn).toBeUndefined();
  });

  it('hasFreeBurn can be manually carried over after initializeGameState', () => {
    // This mirrors the fix in executeStartNextRound
    const oldPlayers: PlayerState[] = [
      { ...makePlayer('p1', []), hasFreeBurn: true },
      makePlayer('p2', []),
    ];

    const newGameState = initializeGameState(
      [
        { id: 'p1', username: 'Player1' },
        { id: 'p2', username: 'Player2' },
      ],
      { p1: 0, p2: 10 },
      2,
      70,
      'classic',
    );

    // Carry over hasFreeBurn (same logic as executeStartNextRound)
    for (const oldPlayer of oldPlayers) {
      if (oldPlayer.hasFreeBurn) {
        const newPlayer = newGameState.players.find((p) => p.playerId === oldPlayer.playerId);
        if (newPlayer) {
          newPlayer.hasFreeBurn = true;
        }
      }
    }

    expect(newGameState.players[0].hasFreeBurn).toBe(true);
    expect(newGameState.players[1].hasFreeBurn).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { initializeGameState, sanitizeGameState } from '../game/GameSetup';
import { handleBurnAttempt } from '../game/ActionHandler';
import { computeRoundResult } from '../game/Scoring';
import type { GameState, PlayerState, Card } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function makeCard(rank: string, suit: string = '♠', value?: number): Card {
  const isRed = suit === '♥' || suit === '♦';
  let v = value;
  if (v === undefined) {
    if (rank === 'A') v = 1;
    else if (['J', 'Q', 'K'].includes(rank)) v = 10;
    else if (rank === '10' && isRed) v = 0;
    else v = parseInt(rank) || 10;
  }
  return {
    id: `${rank}-${suit}`,
    suit: suit as Card['suit'],
    rank: rank as Card['rank'],
    value: v,
    isRed,
  };
}

function makePlayer(id: string, hand: { slot: string; card: Card }[]): PlayerState {
  return {
    playerId: id,
    username: `Player_${id}`,
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
    gameMode: 'bountyHunt',
    bountyRank: '7',
    bountyBurnCounts: {},
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('Bounty Hunt Mode', () => {
  // ----------------------------------------------------------
  // Setup: bountyRank selection, bountyBurnCounts initialization
  // ----------------------------------------------------------
  describe('Game Setup', () => {
    it('initializes bountyRank and bountyBurnCounts for bountyHunt mode', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'bountyHunt');

      expect(gs.gameMode).toBe('bountyHunt');
      expect(gs.bountyRank).toBeDefined();
      expect(typeof gs.bountyRank).toBe('string');
      // bountyRank must be a valid rank
      const validRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      expect(validRanks).toContain(gs.bountyRank);
      expect(gs.bountyBurnCounts).toEqual({});
    });

    it('deals 4 cards per player (same as classic)', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'bountyHunt');

      for (const p of gs.players) {
        expect(p.hand).toHaveLength(4);
        expect(p.hand.map((h) => h.slot)).toEqual(['A', 'B', 'C', 'D']);
      }
    });

    it('uses peek slots C, D (same as classic)', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'bountyHunt');

      for (const p of gs.players) {
        expect(p.peekedSlots).toEqual(['C', 'D']);
      }
    });

    it('bountyRank card is shuffled back into the deck (deck count unchanged)', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      // Classic game for reference
      const classicGs = initializeGameState(players, undefined, 1, 70, 'classic');
      const bountyGs = initializeGameState(players, undefined, 1, 70, 'bountyHunt');

      // Both should have the same total cards in play:
      // 54 total - 8 dealt (4×2) - 1 discard = 45 in deck
      // For bounty: draw 1 for bounty rank, put it back = same count
      expect(bountyGs.deck.length).toBe(classicGs.deck.length);
    });

    it('sanitized state includes bountyRank and bountyBurnCounts', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'bountyHunt');

      const clientState = sanitizeGameState(gs, 'p1');
      expect(clientState.bountyRank).toBe(gs.bountyRank);
      expect(clientState.bountyBurnCounts).toEqual({});
    });

    it('does NOT set bountyRank for classic mode', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'classic');

      expect(gs.bountyRank).toBeUndefined();
      expect(gs.bountyBurnCounts).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // Scoring: bounty card doubling and burn bonuses
  // ----------------------------------------------------------
  describe('Scoring', () => {
    it('doubles the value of bounty-rank cards in hand', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) }, // bounty card — value 7, doubled to 14
        { slot: 'B', card: makeCard('3', '♠', 3) },
        { slot: 'C', card: makeCard('5', '♠', 5) },
        { slot: 'D', card: makeCard('2', '♠', 2) },
      ]);
      const p2 = makePlayer('p2', [
        { slot: 'A', card: makeCard('4', '♠', 4) },
        { slot: 'B', card: makeCard('4', '♥', 4) },
        { slot: 'C', card: makeCard('3', '♥', 3) },
        { slot: 'D', card: makeCard('2', '♥', 2) },
      ]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 0 },
        bountyRank: '7',
      });

      const result = computeRoundResult(gs);

      // p1: 7(doubled=14) + 3 + 5 + 2 = 24
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(24);

      // p2: 4 + 4 + 3 + 2 = 13 (no bounty cards)
      const p2Hand = result.allHands.find((h) => h.playerId === 'p2')!;
      expect(p2Hand.handSum).toBe(13);
    });

    it('doubles each bounty-rank card independently', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) }, // bounty
        { slot: 'B', card: makeCard('7', '♥', 7) }, // bounty
        { slot: 'C', card: makeCard('5', '♠', 5) },
        { slot: 'D', card: makeCard('2', '♠', 2) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '7',
      });

      const result = computeRoundResult(gs);

      // p1: 7*2 + 7*2 + 5 + 2 = 14 + 14 + 5 + 2 = 35
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(35);
    });

    it('subtracts burn bonuses (-5 per successful bounty burn)', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('3', '♠', 3) },
        { slot: 'B', card: makeCard('4', '♠', 4) },
        { slot: 'C', card: makeCard('5', '♠', 5) },
        { slot: 'D', card: makeCard('2', '♠', 2) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: { p1: 1 }, // burned 1 bounty card
      });

      const result = computeRoundResult(gs);

      // p1: 3 + 4 + 5 + 2 = 14, minus 5 for bounty burn = 9
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(9);
    });

    it('stacks multiple burn bonuses', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('3', '♠', 3) },
        { slot: 'B', card: makeCard('4', '♠', 4) },
        { slot: 'C', card: makeCard('5', '♠', 5) },
        { slot: 'D', card: makeCard('2', '♠', 2) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: { p1: 2 }, // burned 2 bounty cards
      });

      const result = computeRoundResult(gs);

      // p1: 3 + 4 + 5 + 2 = 14, minus 10 for 2 burns = 4
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(4);
    });

    it('floors score at 0 when burn bonuses exceed hand value', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('A', '♠', 1) },
        { slot: 'B', card: makeCard('A', '♥', 1) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: { p1: 3 }, // 3 burns × -5 = -15, but hand is only 2
      });

      const result = computeRoundResult(gs);

      // p1: 1 + 1 = 2, minus 15 = -13 → floored to 0
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(0);
    });

    it('combines bounty doubling and burn bonuses correctly', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) }, // bounty: doubled to 14
        { slot: 'B', card: makeCard('3', '♠', 3) },
        { slot: 'C', card: makeCard('2', '♠', 2) },
        { slot: 'D', card: makeCard('A', '♠', 1) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: { p1: 1 }, // -5
      });

      const result = computeRoundResult(gs);

      // p1: 14 + 3 + 2 + 1 = 20, minus 5 = 15
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(15);
    });

    it('bounty rank Ace: value 1 doubled to 2', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('A', '♠', 1) }, // bounty Ace: 1 doubled to 2
        { slot: 'B', card: makeCard('3', '♠', 3) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: 'A',
      });

      const result = computeRoundResult(gs);

      // p1: 1*2 + 3 = 5
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(5);
    });

    it('bounty rank Red 10: value 0 doubled is still 0', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('10', '♥', 0) }, // Red 10 bounty: 0 doubled = 0
        { slot: 'B', card: makeCard('3', '♠', 3) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '10',
      });

      const result = computeRoundResult(gs);

      // p1: 0*2 + 3 = 3
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(3);
    });

    it('bounty rank Black 10: value 10 doubled to 20', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('10', '♠', 10) }, // Black 10 bounty: 10 doubled = 20
        { slot: 'B', card: makeCard('3', '♠', 3) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '10',
      });

      const result = computeRoundResult(gs);

      // p1: 10*2 + 3 = 23
      const p1Hand = result.allHands.find((h) => h.playerId === 'p1')!;
      expect(p1Hand.handSum).toBe(23);
    });

    it('applies bounty modifiers before winner determination', () => {
      // Without bounty, p1 (10) < p2 (12) → p1 wins
      // With bounty doubling p1's 5 → 10 → p1 sum = 15, p2 = 12 → p2 wins
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('5', '♠', 5) }, // bounty: doubled to 10
        { slot: 'B', card: makeCard('5', '♥', 5) }, // bounty: doubled to 10
      ]);
      const p2 = makePlayer('p2', [
        { slot: 'A', card: makeCard('6', '♠', 6) },
        { slot: 'B', card: makeCard('6', '♥', 6) },
      ]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 0 },
        bountyRank: '5',
      });

      const result = computeRoundResult(gs);

      // p1: 10+10 = 20, p2: 12. p2 wins (lower)
      expect(result.roundWinners).toEqual(['p2']);
      expect(result.allHands.find((h) => h.playerId === 'p1')!.handSum).toBe(20);
      expect(result.allHands.find((h) => h.playerId === 'p2')!.handSum).toBe(12);
    });

    it('checker doubling still applies in bountyHunt mode', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('8', '♠', 8) },
        { slot: 'B', card: makeCard('3', '♠', 3) },
      ]);
      const p2 = makePlayer('p2', [
        { slot: 'A', card: makeCard('2', '♠', 2) },
        { slot: 'B', card: makeCard('A', '♠', 1) },
      ]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 0 },
        checkCalledBy: 'p1', // p1 called check but has higher sum
        bountyRank: '7', // no bounty cards in either hand
      });

      const result = computeRoundResult(gs);

      // p1: 11, p2: 3. p2 wins. p1 checker doubled: 11*2 = 22
      expect(result.checkerDoubled).toBe(true);
      expect(result.updatedScores['p1']).toBe(22);
      expect(result.updatedScores['p2']).toBe(0);
    });

    it('uses classic multi-round scoring (game ends at targetScore)', () => {
      const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('3', '♠', 3) }]);
      const p2 = makePlayer('p2', [{ slot: 'A', card: makeCard('8', '♠', 8) }]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 65 }, // p2 at 65, about to exceed 70
        targetScore: 70,
        bountyRank: '7',
      });

      const result = computeRoundResult(gs);

      // p2: 65 + 8 = 73 >= 70 → game ends
      expect(result.gameEnded).toBe(true);
    });

    it('does not end game when no player reaches targetScore', () => {
      const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('3', '♠', 3) }]);
      const p2 = makePlayer('p2', [{ slot: 'A', card: makeCard('8', '♠', 8) }]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 50 },
        targetScore: 70,
        bountyRank: '7',
      });

      const result = computeRoundResult(gs);

      // p2: 50 + 8 = 58 < 70 → game continues
      expect(result.gameEnded).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Burn tracking
  // ----------------------------------------------------------
  describe('Burn Tracking', () => {
    it('increments bountyBurnCounts on successful bounty burn', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) }, // matches bounty rank AND discard top
        { slot: 'B', card: makeCard('3', '♠', 3) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        deck: [makeCard('9', '♠', 9)], // card available for penalty (won't be used — burn succeeds)
        discardPile: [makeCard('7', '♥', 7)], // top discard is a 7
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: {},
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.burnSuccess).toBe(true);
      expect(gs.bountyBurnCounts!['p1']).toBe(1);
    });

    it('does not increment bountyBurnCounts on non-bounty burn', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('3', '♠', 3) }, // matches discard but NOT bounty rank
        { slot: 'B', card: makeCard('5', '♠', 5) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        deck: [makeCard('9', '♠', 9)],
        discardPile: [makeCard('3', '♥', 3)], // top discard is a 3
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: {},
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.burnSuccess).toBe(true);
      expect(gs.bountyBurnCounts!['p1']).toBeUndefined();
    });

    it('does not increment bountyBurnCounts on failed burn', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) }, // bounty rank card, but doesn't match discard
        { slot: 'B', card: makeCard('5', '♠', 5) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        deck: [makeCard('9', '♠', 9)], // penalty card
        discardPile: [makeCard('3', '♥', 3)], // top discard is a 3 — doesn't match 7
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: {},
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.burnSuccess).toBe(false);
      expect(gs.bountyBurnCounts!['p1']).toBeUndefined();
    });

    it('stacks bounty burn counts for multiple successful burns', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) },
        { slot: 'B', card: makeCard('7', '♥', 7) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        deck: [makeCard('9', '♠', 9)],
        discardPile: [makeCard('7', '♦', 7)], // top discard is a 7
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: {},
      });

      // First burn — slot A (7♠)
      handleBurnAttempt(gs, 'p1', 'A');
      expect(gs.bountyBurnCounts!['p1']).toBe(1);

      // After first burn, slot A is gone. Slot B remains.
      // The first burn placed 7♠ on discard (which is still rank 7), so B (7♥) matches.
      handleBurnAttempt(gs, 'p1', 'B');
      expect(gs.bountyBurnCounts!['p1']).toBe(2);
    });

    it('does not track bounty burns in classic mode', () => {
      const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('7', '♠', 7) }]);

      const gs = createTestGameState({
        gameMode: 'classic',
        players: [p1],
        deck: [makeCard('9', '♠', 9)],
        discardPile: [makeCard('7', '♥', 7)],
        scores: { p1: 0 },
        bountyRank: undefined,
        bountyBurnCounts: undefined,
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.burnSuccess).toBe(true);
      expect(gs.bountyBurnCounts).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------
  describe('Edge Cases', () => {
    it('handles bounty rank King (face card): value 10 doubled to 20', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('K', '♠', 10) }, // bounty King: 10 doubled = 20
      ]);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: 'K',
      });

      const result = computeRoundResult(gs);

      expect(result.allHands.find((h) => h.playerId === 'p1')!.handSum).toBe(20);
    });

    it('handles empty hand (all cards burned) with bounty burn bonuses', () => {
      const p1 = makePlayer('p1', []);

      const gs = createTestGameState({
        players: [p1],
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: { p1: 2 }, // burned 2 bounty cards already
      });

      const result = computeRoundResult(gs);

      // hand sum = 0, minus 10 = -10 → floor 0
      expect(result.allHands.find((h) => h.playerId === 'p1')!.handSum).toBe(0);
    });

    it('only applies burn penalty (+1 card) on failed bounty burn — no bonus', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('7', '♠', 7) },
        { slot: 'B', card: makeCard('5', '♠', 5) },
      ]);

      const gs = createTestGameState({
        players: [p1],
        deck: [makeCard('9', '♠', 9)],
        discardPile: [makeCard('3', '♥', 3)], // doesn't match 7
        scores: { p1: 0 },
        bountyRank: '7',
        bountyBurnCounts: {},
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.burnSuccess).toBe(false);
      // Got 1 penalty card (classic penalty, not doubled like SD)
      expect(p1.hand).toHaveLength(3);
      // No bounty burn bonus
      expect(gs.bountyBurnCounts!['p1']).toBeUndefined();
    });
  });
});

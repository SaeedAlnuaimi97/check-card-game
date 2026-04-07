import { describe, it, expect } from 'vitest';
import { initializeGameState, selectInitialPeekSlots, sanitizeGameState } from '../game/GameSetup';
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
    gameMode: 'suddenDeath',
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('Sudden Death Mode', () => {
  // ----------------------------------------------------------
  // Setup: 6-card deal, E/F peek
  // ----------------------------------------------------------
  describe('Game Setup', () => {
    it('deals 6 cards per player in Sudden Death mode', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'suddenDeath');

      expect(gs.gameMode).toBe('suddenDeath');
      for (const player of gs.players) {
        expect(player.hand).toHaveLength(6);
        expect(player.hand.map((h) => h.slot)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      }
    });

    it('deals 4 cards per player in Classic mode', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'classic');

      expect(gs.gameMode).toBe('classic');
      for (const player of gs.players) {
        expect(player.hand).toHaveLength(4);
        expect(player.hand.map((h) => h.slot)).toEqual(['A', 'B', 'C', 'D']);
      }
    });

    it('sets peek slots to E and F in Sudden Death', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'suddenDeath');

      for (const player of gs.players) {
        expect(player.peekedSlots).toEqual(['E', 'F']);
      }
    });

    it('sets peek slots to C and D in Classic', () => {
      const player = makePlayer('p1', []);
      const slots = selectInitialPeekSlots(player, 'classic');
      expect(slots).toEqual(['C', 'D']);
    });

    it('selectInitialPeekSlots defaults to Classic', () => {
      const player = makePlayer('p1', []);
      const slots = selectInitialPeekSlots(player);
      expect(slots).toEqual(['C', 'D']);
    });

    it('respects max 6 players — deck has enough cards for 6 SD players', () => {
      const players = Array.from({ length: 6 }, (_, i) => ({
        id: `p${i}`,
        username: `Player${i}`,
      }));
      const gs = initializeGameState(players, undefined, 1, 70, 'suddenDeath');

      // 6 players × 6 cards = 36 dealt + 1 discard = 37 from 54-card deck
      expect(gs.players).toHaveLength(6);
      for (const player of gs.players) {
        expect(player.hand).toHaveLength(6);
      }
      // Remaining deck should be 54 - 36 - 1 = 17
      expect(gs.deck.length).toBe(17);
    });
  });

  // ----------------------------------------------------------
  // Scoring: no checker doubling
  // ----------------------------------------------------------
  describe('Scoring', () => {
    it('does NOT double checker score when checker is not lowest in SD', () => {
      const gs = createTestGameState({
        players: [
          makePlayer('checker', [
            { slot: 'A', card: makeCard('K', '♠') }, // 10
            { slot: 'B', card: makeCard('9', '♠') }, // 9 → sum = 19
          ]),
          makePlayer('p2', [
            { slot: 'A', card: makeCard('A', '♠') }, // 1
            { slot: 'B', card: makeCard('2', '♠') }, // 2 → sum = 3
          ]),
        ],
        checkCalledBy: 'checker',
        checkCalledAtIndex: 0,
        scores: { checker: 0, p2: 0 },
      });

      const result = computeRoundResult(gs);

      // Checker has higher sum but should NOT be doubled in SD
      expect(result.checkerDoubled).toBe(false);
      expect(result.updatedScores.checker).toBe(19); // Not 38
      expect(result.updatedScores.p2).toBe(0); // Winner scores 0
    });

    it('DOES double checker score in Classic mode when checker is not lowest', () => {
      const gs = createTestGameState({
        gameMode: 'classic',
        players: [
          makePlayer('checker', [
            { slot: 'A', card: makeCard('K', '♠') }, // 10
            { slot: 'B', card: makeCard('9', '♠') }, // 9 → sum = 19
          ]),
          makePlayer('p2', [
            { slot: 'A', card: makeCard('A', '♠') }, // 1
            { slot: 'B', card: makeCard('2', '♠') }, // 2 → sum = 3
          ]),
        ],
        checkCalledBy: 'checker',
        checkCalledAtIndex: 0,
        scores: { checker: 0, p2: 0 },
      });

      const result = computeRoundResult(gs);

      expect(result.checkerDoubled).toBe(true);
      expect(result.updatedScores.checker).toBe(38); // 19 * 2
    });

    it('always ends the game after 1 round in SD', () => {
      const gs = createTestGameState({
        players: [
          makePlayer('p1', [
            { slot: 'A', card: makeCard('A', '♠') }, // 1
          ]),
          makePlayer('p2', [
            { slot: 'A', card: makeCard('2', '♠') }, // 2
          ]),
        ],
        scores: { p1: 0, p2: 0 },
      });

      const result = computeRoundResult(gs);

      expect(result.gameEnded).toBe(true);
      expect(gs.phase).toBe('gameEnd');
    });

    it('does NOT always end game in Classic after round 1', () => {
      const gs = createTestGameState({
        gameMode: 'classic',
        players: [
          makePlayer('p1', [
            { slot: 'A', card: makeCard('A', '♠') }, // 1
          ]),
          makePlayer('p2', [
            { slot: 'A', card: makeCard('2', '♠') }, // 2
          ]),
        ],
        scores: { p1: 0, p2: 0 },
      });

      const result = computeRoundResult(gs);

      expect(result.gameEnded).toBe(false);
      expect(gs.phase).toBe('roundEnd');
    });
  });

  // ----------------------------------------------------------
  // Burn penalty: +2 cards in SD
  // ----------------------------------------------------------
  describe('Burn Penalty', () => {
    it('draws 2 penalty cards on burn failure in SD', () => {
      const topDiscard = makeCard('5', '♠');
      const penaltyCard1 = makeCard('7', '♠');
      const penaltyCard2 = makeCard('8', '♠');

      const gs = createTestGameState({
        players: [
          makePlayer('p1', [
            { slot: 'A', card: makeCard('3', '♠') }, // Rank 3 ≠ top discard rank 5
          ]),
        ],
        deck: [penaltyCard1, penaltyCard2, makeCard('9', '♠')],
        discardPile: [topDiscard],
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.success).toBe(true);
      expect(result.burnSuccess).toBe(false);
      // Player should now have 3 cards: original A + 2 penalty cards
      expect(gs.players[0].hand).toHaveLength(3);
      expect(gs.players[0].hand[1].slot).toBe('E');
      expect(gs.players[0].hand[2].slot).toBe('F');
    });

    it('draws only 1 penalty card on burn failure in Classic', () => {
      const topDiscard = makeCard('5', '♠');
      const penaltyCard1 = makeCard('7', '♠');

      const gs = createTestGameState({
        gameMode: 'classic',
        players: [makePlayer('p1', [{ slot: 'A', card: makeCard('3', '♠') }])],
        deck: [penaltyCard1, makeCard('9', '♠')],
        discardPile: [topDiscard],
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.success).toBe(true);
      expect(result.burnSuccess).toBe(false);
      // Player should now have 2 cards: original A + 1 penalty card
      expect(gs.players[0].hand).toHaveLength(2);
      expect(gs.players[0].hand[1].slot).toBe('E');
    });

    it('handles deck running low — draws available penalty cards', () => {
      const topDiscard = makeCard('5', '♠');
      const penaltyCard = makeCard('7', '♠');

      const gs = createTestGameState({
        players: [makePlayer('p1', [{ slot: 'A', card: makeCard('3', '♠') }])],
        deck: [penaltyCard], // Only 1 card left — should draw 1 of 2
        discardPile: [topDiscard],
      });

      const result = handleBurnAttempt(gs, 'p1', 'A');

      expect(result.success).toBe(true);
      expect(result.burnSuccess).toBe(false);
      // Only 1 penalty card drawn (deck had only 1)
      expect(gs.players[0].hand).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------
  // Sanitization
  // ----------------------------------------------------------
  describe('Sanitization', () => {
    it('includes gameMode in sanitized client state', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ];
      const gs = initializeGameState(players, undefined, 1, 70, 'suddenDeath');
      const clientState = sanitizeGameState(gs, 'p1');

      expect(clientState.gameMode).toBe('suddenDeath');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { initializeGameState, sanitizeGameState } from '../game/GameSetup';
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
    gameMode: 'blindRounds',
    ...overrides,
  };
}

const testPlayers = [
  { id: 'p1', username: 'Alice' },
  { id: 'p2', username: 'Bob' },
];

// ============================================================
// Tests
// ============================================================

describe('Blind Rounds Mode', () => {
  // ----------------------------------------------------------
  // Blind round detection
  // ----------------------------------------------------------
  describe('Blind Round Detection', () => {
    it('round 1 is NOT a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 1, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(false);
    });

    it('round 2 is NOT a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 2, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(false);
    });

    it('round 3 IS a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(true);
    });

    it('round 4 is NOT a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 4, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(false);
    });

    it('round 5 is NOT a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 5, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(false);
    });

    it('round 6 IS a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 6, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(true);
    });

    it('round 9 IS a blind round', () => {
      const gs = initializeGameState(testPlayers, undefined, 9, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(true);
    });

    it('does NOT set isBlindRound for classic mode', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'classic');
      expect(gs.isBlindRound).toBeUndefined();
    });

    it('does NOT set isBlindRound for suddenDeath mode', () => {
      const gs = initializeGameState(testPlayers, undefined, 1, 70, 'suddenDeath');
      expect(gs.isBlindRound).toBeUndefined();
    });

    it('does NOT set isBlindRound for bountyHunt mode', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'bountyHunt');
      expect(gs.isBlindRound).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // Peek phase behavior
  // ----------------------------------------------------------
  describe('Peek Phase', () => {
    it('blind round skips peek phase — phase is playing', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'blindRounds');
      expect(gs.phase).toBe('playing');
    });

    it('blind round gives empty peekedSlots', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'blindRounds');
      for (const p of gs.players) {
        expect(p.peekedSlots).toEqual([]);
      }
    });

    it('non-blind round has normal peeking phase', () => {
      const gs = initializeGameState(testPlayers, undefined, 1, 70, 'blindRounds');
      expect(gs.phase).toBe('peeking');
    });

    it('non-blind round gives normal peek slots (C, D)', () => {
      const gs = initializeGameState(testPlayers, undefined, 1, 70, 'blindRounds');
      for (const p of gs.players) {
        expect(p.peekedSlots).toEqual(['C', 'D']);
      }
    });

    it('non-blind round 4 has normal peeking phase', () => {
      const gs = initializeGameState(testPlayers, undefined, 4, 70, 'blindRounds');
      expect(gs.phase).toBe('peeking');
      for (const p of gs.players) {
        expect(p.peekedSlots).toEqual(['C', 'D']);
      }
    });
  });

  // ----------------------------------------------------------
  // Card dealing (same as classic)
  // ----------------------------------------------------------
  describe('Card Dealing', () => {
    it('deals 4 cards per player (same as classic)', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'blindRounds');
      for (const p of gs.players) {
        expect(p.hand).toHaveLength(4);
        expect(p.hand.map((h) => h.slot)).toEqual(['A', 'B', 'C', 'D']);
      }
    });
  });

  // ----------------------------------------------------------
  // Sanitize — opponent hand hiding
  // ----------------------------------------------------------
  describe('Sanitize (Blind Round)', () => {
    it('hides opponent hand and cardCount during blind rounds', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('3', '♠') },
        { slot: 'B', card: makeCard('5', '♥') },
        { slot: 'C', card: makeCard('7', '♠') },
        { slot: 'D', card: makeCard('9', '♦') },
      ]);
      const p2 = makePlayer('p2', [
        { slot: 'A', card: makeCard('2', '♠') },
        { slot: 'B', card: makeCard('4', '♥') },
        { slot: 'C', card: makeCard('6', '♠') },
        { slot: 'D', card: makeCard('8', '♦') },
      ]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 0 },
        isBlindRound: true,
      });

      const clientState = sanitizeGameState(gs, 'p1');

      // My own hand should be visible (as null cards, with correct count)
      const myState = clientState.players.find((p) => p.playerId === 'p1')!;
      expect(myState.hand).toHaveLength(4);
      expect(myState.cardCount).toBe(4);

      // Opponent hand should be completely hidden
      const opponentState = clientState.players.find((p) => p.playerId === 'p2')!;
      expect(opponentState.hand).toEqual([]);
      expect(opponentState.cardCount).toBe(0);
    });

    it('does NOT hide opponent hand during non-blind rounds', () => {
      const p1 = makePlayer('p1', [
        { slot: 'A', card: makeCard('3', '♠') },
        { slot: 'B', card: makeCard('5', '♥') },
      ]);
      const p2 = makePlayer('p2', [
        { slot: 'A', card: makeCard('2', '♠') },
        { slot: 'B', card: makeCard('4', '♥') },
        { slot: 'C', card: makeCard('6', '♠') },
      ]);

      const gs = createTestGameState({
        players: [p1, p2],
        scores: { p1: 0, p2: 0 },
        isBlindRound: false,
      });

      const clientState = sanitizeGameState(gs, 'p1');

      const opponentState = clientState.players.find((p) => p.playerId === 'p2')!;
      // Opponent hand should be visible (as null cards, with correct count)
      expect(opponentState.hand).toHaveLength(3);
      expect(opponentState.cardCount).toBe(3);
    });

    it('includes isBlindRound in sanitized state', () => {
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'blindRounds');
      const clientState = sanitizeGameState(gs, 'p1');
      expect(clientState.isBlindRound).toBe(true);
    });

    it('includes isBlindRound=false for non-blind rounds', () => {
      const gs = initializeGameState(testPlayers, undefined, 1, 70, 'blindRounds');
      const clientState = sanitizeGameState(gs, 'p1');
      expect(clientState.isBlindRound).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // Scoring (same as classic)
  // ----------------------------------------------------------
  describe('Scoring', () => {
    it('uses standard classic scoring rules', () => {
      // blindRounds uses the same scoring as classic — checker doubling, multi-round, etc.
      const gs = initializeGameState(testPlayers, undefined, 3, 70, 'blindRounds');
      expect(gs.gameMode).toBe('blindRounds');
      // Scoring is tested extensively in other test files; here we just confirm the mode is set
    });
  });

  // ----------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------
  describe('Edge Cases', () => {
    it('round 0 is NOT a blind round (edge: 0 % 3 === 0 but roundNumber starts at 1)', () => {
      // initializeGameState with roundNumber=0 would compute: 0 % 3 === 0 && 0 > 0 → false
      const gs = initializeGameState(testPlayers, undefined, 0, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(false);
    });

    it('multiple players: all opponents hidden during blind round', () => {
      const players = [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Carol' },
        { id: 'p4', username: 'Dave' },
      ];
      const gs = initializeGameState(players, undefined, 3, 70, 'blindRounds');
      const clientState = sanitizeGameState(gs, 'p1');

      // My hand visible
      const myState = clientState.players.find((p) => p.playerId === 'p1')!;
      expect(myState.hand.length).toBeGreaterThan(0);
      expect(myState.cardCount).toBe(4);

      // All 3 opponents hidden
      for (const opId of ['p2', 'p3', 'p4']) {
        const opState = clientState.players.find((p) => p.playerId === opId)!;
        expect(opState.hand).toEqual([]);
        expect(opState.cardCount).toBe(0);
      }
    });

    it('blind round 12 (4th blind round) is correctly detected', () => {
      const gs = initializeGameState(testPlayers, undefined, 12, 70, 'blindRounds');
      expect(gs.isBlindRound).toBe(true);
      expect(gs.phase).toBe('playing');
    });
  });
});

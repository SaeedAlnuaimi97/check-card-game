import { describe, it, expect } from 'vitest';
import {
  dealCards,
  selectInitialPeekSlots,
  getPeekedCards,
  selectFirstPlayer,
  initializeGameState,
  sanitizeGameState,
} from '../game/GameSetup';
import { Card, GameState, PlayerState, SlotLabel } from '../types/game.types';

// ============================================================
// Helper: create test fixtures
// ============================================================

function makeCard(id: string, rank: Card['rank'] = '5', suit: Card['suit'] = '♠'): Card {
  return {
    id,
    suit,
    rank,
    value: rank === 'A' ? 1 : rank === '10' && (suit === '♥' || suit === '♦') ? 0 : 5,
    isRed: suit === '♥' || suit === '♦',
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
    ...overrides,
  };
}

function createTestPlayer(id: string, username: string, hand: Card[] = []): PlayerState {
  return {
    playerId: id,
    username,
    hand: hand.map((card, i) => ({
      slot: (['A', 'B', 'C', 'D'] as SlotLabel[])[i] ?? String.fromCharCode(65 + i),
      card,
    })),
    peekedSlots: [],
    totalScore: 0,
  };
}

// ============================================================
// dealCards (F-028)
// ============================================================

describe('dealCards', () => {
  it('deals 4 cards to each player', () => {
    const deck: Card[] = [];
    for (let i = 0; i < 20; i++) {
      deck.push(makeCard(`card-${i}`));
    }

    const p1 = createTestPlayer('p1', 'Alice');
    const p2 = createTestPlayer('p2', 'Bob');
    const gs = createTestGameState({ deck, players: [p1, p2] });

    dealCards(gs);

    expect(p1.hand).toHaveLength(4);
    expect(p2.hand).toHaveLength(4);
  });

  it('assigns slots A, B, C, D', () => {
    const deck: Card[] = [];
    for (let i = 0; i < 10; i++) {
      deck.push(makeCard(`card-${i}`));
    }

    const p1 = createTestPlayer('p1', 'Alice');
    const gs = createTestGameState({ deck, players: [p1] });

    dealCards(gs);

    const slots = p1.hand.map((h) => h.slot);
    expect(slots).toEqual(['A', 'B', 'C', 'D']);
  });

  it('removes dealt cards from the deck', () => {
    const deck: Card[] = [];
    for (let i = 0; i < 20; i++) {
      deck.push(makeCard(`card-${i}`));
    }

    const p1 = createTestPlayer('p1', 'Alice');
    const p2 = createTestPlayer('p2', 'Bob');
    const gs = createTestGameState({ deck, players: [p1, p2] });

    dealCards(gs);

    // 20 - (2 players * 4 cards) = 12
    expect(gs.deck).toHaveLength(12);
  });

  it('deals cards from the top of the deck (first elements)', () => {
    const deck: Card[] = [];
    for (let i = 0; i < 10; i++) {
      deck.push(makeCard(`card-${i}`));
    }

    const p1 = createTestPlayer('p1', 'Alice');
    const gs = createTestGameState({ deck, players: [p1] });

    dealCards(gs);

    // Player gets cards 0-3 (drawn from top)
    const dealtIds = p1.hand.map((h) => h.card.id);
    expect(dealtIds).toEqual(['card-0', 'card-1', 'card-2', 'card-3']);

    // Remaining deck starts at card-4
    expect(gs.deck[0].id).toBe('card-4');
  });

  it('clears existing hand before dealing', () => {
    const deck: Card[] = [];
    for (let i = 0; i < 10; i++) {
      deck.push(makeCard(`card-${i}`));
    }

    const p1 = createTestPlayer('p1', 'Alice', [makeCard('old-card')]);
    const gs = createTestGameState({ deck, players: [p1] });

    dealCards(gs);

    expect(p1.hand).toHaveLength(4);
    expect(p1.hand.some((h) => h.card.id === 'old-card')).toBe(false);
  });

  it('throws when not enough cards in deck', () => {
    const deck = [makeCard('only-one')];
    const p1 = createTestPlayer('p1', 'Alice');
    const gs = createTestGameState({ deck, players: [p1] });

    expect(() => dealCards(gs)).toThrow('Not enough cards in deck to deal');
  });

  it('deals to 6 players (24 cards needed)', () => {
    const deck: Card[] = [];
    for (let i = 0; i < 30; i++) {
      deck.push(makeCard(`card-${i}`));
    }

    const players = Array.from({ length: 6 }, (_, i) => createTestPlayer(`p${i}`, `Player${i}`));
    const gs = createTestGameState({ deck, players });

    dealCards(gs);

    for (const player of players) {
      expect(player.hand).toHaveLength(4);
    }
    // 30 - 24 = 6 remaining
    expect(gs.deck).toHaveLength(6);
  });
});

// ============================================================
// selectInitialPeekSlots (F-029)
// ============================================================

describe('selectInitialPeekSlots', () => {
  it('always returns slots C and D', () => {
    const player = createTestPlayer('p1', 'Alice', [
      makeCard('c1'),
      makeCard('c2'),
      makeCard('c3'),
      makeCard('c4'),
    ]);

    const slots = selectInitialPeekSlots(player);
    expect(slots).toHaveLength(2);
    expect(slots.sort()).toEqual(['C', 'D']);
  });

  it('returns a new array each time (not the same reference)', () => {
    const player = createTestPlayer('p1', 'Alice', [
      makeCard('c1'),
      makeCard('c2'),
      makeCard('c3'),
      makeCard('c4'),
    ]);

    const slots1 = selectInitialPeekSlots(player);
    const slots2 = selectInitialPeekSlots(player);
    expect(slots1).not.toBe(slots2);
    expect(slots1).toEqual(slots2);
  });
});

// ============================================================
// getPeekedCards
// ============================================================

describe('getPeekedCards', () => {
  it('returns peeked card data for the given slots', () => {
    const c1 = makeCard('c1', 'A', '♥');
    const c3 = makeCard('c3', 'K', '♠');
    const player: PlayerState = {
      playerId: 'p1',
      username: 'Alice',
      hand: [
        { slot: 'A', card: c1 },
        { slot: 'B', card: makeCard('c2') },
        { slot: 'C', card: c3 },
        { slot: 'D', card: makeCard('c4') },
      ],
      peekedSlots: ['A', 'C'],
      totalScore: 0,
    };

    const peeked = getPeekedCards(player);

    expect(peeked).toHaveLength(2);
    expect(peeked[0]).toEqual({ slot: 'A', card: c1 });
    expect(peeked[1]).toEqual({ slot: 'C', card: c3 });
  });

  it('returns empty array when no peeked slots', () => {
    const player: PlayerState = {
      playerId: 'p1',
      username: 'Alice',
      hand: [{ slot: 'A', card: makeCard('c1') }],
      peekedSlots: [],
      totalScore: 0,
    };

    const peeked = getPeekedCards(player);
    expect(peeked).toHaveLength(0);
  });

  it('filters out invalid peeked slots', () => {
    const player: PlayerState = {
      playerId: 'p1',
      username: 'Alice',
      hand: [
        { slot: 'A', card: makeCard('c1') },
        { slot: 'B', card: makeCard('c2') },
      ],
      peekedSlots: ['A', 'Z'], // Z doesn't exist
      totalScore: 0,
    };

    const peeked = getPeekedCards(player);
    expect(peeked).toHaveLength(1);
    expect(peeked[0].slot).toBe('A');
  });
});

// ============================================================
// selectFirstPlayer (F-032)
// ============================================================

describe('selectFirstPlayer', () => {
  it('returns an index within range [0, playerCount)', () => {
    for (let i = 0; i < 50; i++) {
      const index = selectFirstPlayer(4);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(4);
    }
  });

  it('returns 0 for a single player', () => {
    const index = selectFirstPlayer(1);
    expect(index).toBe(0);
  });

  it('selects randomly across different players', () => {
    const counts: Record<number, number> = {};
    for (let i = 0; i < 200; i++) {
      const index = selectFirstPlayer(4);
      counts[index] = (counts[index] ?? 0) + 1;
    }

    // All 4 indices should appear at least once over 200 runs
    expect(Object.keys(counts).length).toBe(4);
  });

  it('returns an integer', () => {
    for (let i = 0; i < 20; i++) {
      const index = selectFirstPlayer(6);
      expect(Number.isInteger(index)).toBe(true);
    }
  });
});

// ============================================================
// initializeGameState (F-028, F-029, F-032 combined)
// ============================================================

describe('initializeGameState', () => {
  const testPlayers = [
    { id: 'p1', username: 'Alice' },
    { id: 'p2', username: 'Bob' },
    { id: 'p3', username: 'Carol' },
    { id: 'p4', username: 'Dave' },
  ];

  it('creates a valid game state', () => {
    const gs = initializeGameState(testPlayers);

    expect(gs).toBeDefined();
    expect(gs.players).toHaveLength(4);
    expect(gs.roundNumber).toBe(1);
    expect(gs.checkCalledBy).toBeNull();
    expect(gs.phase).toBe('peeking');
  });

  it('deals 4 cards to each player', () => {
    const gs = initializeGameState(testPlayers);

    for (const player of gs.players) {
      expect(player.hand).toHaveLength(4);
      expect(player.hand.map((h) => h.slot)).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('starts the discard pile with 1 card', () => {
    const gs = initializeGameState(testPlayers);
    expect(gs.discardPile).toHaveLength(1);
  });

  it('deck has correct remaining card count', () => {
    const gs = initializeGameState(testPlayers);
    // 52 total - (4 players * 4 cards) - 1 discard = 35
    expect(gs.deck).toHaveLength(35);
  });

  it('assigns peek slots C and D to each player', () => {
    const gs = initializeGameState(testPlayers);

    for (const player of gs.players) {
      expect(player.peekedSlots).toHaveLength(2);
      expect(player.peekedSlots.sort()).toEqual(['C', 'D']);
    }
  });

  it('selects a valid current turn index', () => {
    const gs = initializeGameState(testPlayers);
    expect(gs.currentTurnIndex).toBeGreaterThanOrEqual(0);
    expect(gs.currentTurnIndex).toBeLessThan(4);
  });

  it('initializes scores to 0 for all players', () => {
    const gs = initializeGameState(testPlayers);
    for (const p of testPlayers) {
      expect(gs.scores[p.id]).toBe(0);
    }
  });

  it('preserves existing scores when provided', () => {
    const existingScores = { p1: 15, p2: 30, p3: 5, p4: 0 };
    const gs = initializeGameState(testPlayers, existingScores, 2);

    expect(gs.scores).toEqual(existingScores);
    expect(gs.roundNumber).toBe(2);
    expect(gs.players[0].totalScore).toBe(15);
    expect(gs.players[1].totalScore).toBe(30);
  });

  it('all cards are unique across deck, discard, and hands', () => {
    const gs = initializeGameState(testPlayers);

    const allIds: string[] = [];
    allIds.push(...gs.deck.map((c) => c.id));
    allIds.push(...gs.discardPile.map((c) => c.id));
    for (const player of gs.players) {
      allIds.push(...player.hand.map((h) => h.card.id));
    }

    expect(allIds).toHaveLength(52);
    expect(new Set(allIds).size).toBe(52);
  });

  it('sets player usernames correctly', () => {
    const gs = initializeGameState(testPlayers);

    for (let i = 0; i < testPlayers.length; i++) {
      expect(gs.players[i].username).toBe(testPlayers[i].username);
      expect(gs.players[i].playerId).toBe(testPlayers[i].id);
    }
  });

  it('works with 6 players', () => {
    const sixPlayers = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      username: `Player${i}`,
    }));

    const gs = initializeGameState(sixPlayers);

    expect(gs.players).toHaveLength(6);
    // 52 - (6 * 4) - 1 = 27
    expect(gs.deck).toHaveLength(27);
    expect(gs.discardPile).toHaveLength(1);

    for (const player of gs.players) {
      expect(player.hand).toHaveLength(4);
      expect(player.peekedSlots).toHaveLength(2);
    }
  });
});

// ============================================================
// sanitizeGameState (F-014, F-015, F-030)
// ============================================================

describe('sanitizeGameState', () => {
  function createFullGameState(): GameState {
    return initializeGameState([
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
      { id: 'p3', username: 'Carol' },
      { id: 'p4', username: 'Dave' },
    ]);
  }

  it('includes deckCount instead of full deck', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    expect(client.deckCount).toBe(gs.deck.length);
    expect((client as unknown as Record<string, unknown>).deck).toBeUndefined();
  });

  it('hides own cards from the requesting player (all cards face-down)', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    const me = client.players.find((p) => p.playerId === 'p1');
    expect(me).toBeDefined();

    for (const h of me!.hand) {
      expect(h.card).toBeNull();
    }
  });

  it('hides other players cards (null)', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    const opponents = client.players.filter((p) => p.playerId !== 'p1');
    expect(opponents.length).toBe(3);

    for (const opp of opponents) {
      for (const h of opp.hand) {
        expect(h.card).toBeNull();
      }
    }
  });

  it('includes card count for all players', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    for (const p of client.players) {
      expect(p.cardCount).toBe(4);
    }
  });

  it('includes the discard pile (visible to all)', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    expect(client.discardPile).toHaveLength(gs.discardPile.length);
    expect(client.discardPile[0].id).toBe(gs.discardPile[0].id);
  });

  it('includes game metadata', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    expect(client.currentTurnIndex).toBe(gs.currentTurnIndex);
    expect(client.checkCalledBy).toBe(gs.checkCalledBy);
    expect(client.roundNumber).toBe(gs.roundNumber);
    expect(client.phase).toBe(gs.phase);
  });

  it('includes scores as a copy (not reference)', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p1');

    expect(client.scores).toEqual(gs.scores);
    expect(client.scores).not.toBe(gs.scores);
  });

  it('preserves slot labels for all players', () => {
    const gs = createFullGameState();
    const client = sanitizeGameState(gs, 'p2');

    for (const p of client.players) {
      const slots = p.hand.map((h) => h.slot);
      expect(slots).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('returns identical card visibility for all players (all cards hidden)', () => {
    const gs = createFullGameState();

    const viewP1 = sanitizeGameState(gs, 'p1');
    const viewP2 = sanitizeGameState(gs, 'p2');

    // P1's view: own cards hidden
    const p1InP1View = viewP1.players.find((p) => p.playerId === 'p1');
    expect(p1InP1View!.hand[0].card).toBeNull();

    // P2's view: P1's cards hidden
    const p1InP2View = viewP2.players.find((p) => p.playerId === 'p1');
    expect(p1InP2View!.hand[0].card).toBeNull();

    // P2's view: own cards hidden
    const p2InP2View = viewP2.players.find((p) => p.playerId === 'p2');
    expect(p2InP2View!.hand[0].card).toBeNull();

    // All cards null across both views
    for (const p of viewP1.players) {
      for (const h of p.hand) {
        expect(h.card).toBeNull();
      }
    }
  });
});

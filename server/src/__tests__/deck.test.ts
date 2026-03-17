import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeDeck,
  shuffleDeck,
  drawFromDeck,
  drawFromDiscard,
  addToDiscard,
  reshuffleDiscard,
  createShuffledDeck,
  createDebugDeck,
} from '../game/Deck';
import { Card, GameState } from '../types/game.types';

// ============================================================
// Helper: create a minimal GameState for testing
// ============================================================

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

function makeCard(id: string, rank: Card['rank'] = '5', suit: Card['suit'] = '♠'): Card {
  return { id, suit, rank, value: 5, isRed: suit === '♥' || suit === '♦' };
}

// ============================================================
// initializeDeck (F-022)
// ============================================================

describe('initializeDeck', () => {
  let deck: Card[];

  beforeEach(() => {
    deck = initializeDeck();
  });

  it('creates exactly 54 cards', () => {
    expect(deck).toHaveLength(54);
  });

  it('has unique card IDs', () => {
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(54);
  });

  it('has 4 suits — ♥ and ♦ have 14 cards each, ♠ and ♣ have 13 cards each', () => {
    const suitCounts: Record<string, number> = {};
    for (const card of deck) {
      suitCounts[card.suit] = (suitCounts[card.suit] ?? 0) + 1;
    }
    expect(Object.keys(suitCounts)).toHaveLength(4);
    expect(suitCounts['♥']).toBe(14);
    expect(suitCounts['♦']).toBe(14);
    expect(suitCounts['♠']).toBe(13);
    expect(suitCounts['♣']).toBe(13);
  });

  it('has 13 ranks — rank 10 has 6 cards, all others have 4 cards each', () => {
    const rankCounts: Record<string, number> = {};
    for (const card of deck) {
      rankCounts[card.rank] = (rankCounts[card.rank] ?? 0) + 1;
    }
    expect(Object.keys(rankCounts)).toHaveLength(13);
    expect(rankCounts['10']).toBe(6);
    for (const [rank, count] of Object.entries(rankCounts)) {
      if (rank !== '10') {
        expect(count).toBe(4);
      }
    }
  });

  it('assigns red 10s (♥10, ♦10) a value of 0', () => {
    const redTens = deck.filter((c) => c.rank === '10' && (c.suit === '♥' || c.suit === '♦'));
    expect(redTens).toHaveLength(4);
    for (const card of redTens) {
      expect(card.value).toBe(0);
    }
  });

  it('assigns black 10s (♠10, ♣10) a value of 10', () => {
    const blackTens = deck.filter((c) => c.rank === '10' && (c.suit === '♠' || c.suit === '♣'));
    expect(blackTens).toHaveLength(2);
    for (const card of blackTens) {
      expect(card.value).toBe(10);
    }
  });

  it('assigns aces a value of 1', () => {
    const aces = deck.filter((c) => c.rank === 'A');
    expect(aces).toHaveLength(4);
    for (const card of aces) {
      expect(card.value).toBe(1);
    }
  });

  it('assigns 2-9 their face value', () => {
    for (let n = 2; n <= 9; n++) {
      const rank = String(n) as Card['rank'];
      const cards = deck.filter((c) => c.rank === rank);
      expect(cards).toHaveLength(4);
      for (const card of cards) {
        expect(card.value).toBe(n);
      }
    }
  });

  it('assigns J, Q, K a value of 10', () => {
    for (const rank of ['J', 'Q', 'K'] as Card['rank'][]) {
      const cards = deck.filter((c) => c.rank === rank);
      expect(cards).toHaveLength(4);
      for (const card of cards) {
        expect(card.value).toBe(10);
      }
    }
  });

  it('correctly marks isRed for hearts and diamonds', () => {
    for (const card of deck) {
      if (card.suit === '♥' || card.suit === '♦') {
        expect(card.isRed).toBe(true);
      } else {
        expect(card.isRed).toBe(false);
      }
    }
  });

  it('returns cards in deterministic order (not shuffled)', () => {
    const deck2 = initializeDeck();
    expect(deck.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });
});

// ============================================================
// shuffleDeck (F-023)
// ============================================================

describe('shuffleDeck', () => {
  it('returns the same array reference (mutates in place)', () => {
    const deck = initializeDeck();
    const result = shuffleDeck(deck);
    expect(result).toBe(deck);
  });

  it('preserves all 54 cards', () => {
    const deck = initializeDeck();
    const originalIds = deck.map((c) => c.id).sort();
    shuffleDeck(deck);
    const shuffledIds = deck.map((c) => c.id).sort();
    expect(shuffledIds).toEqual(originalIds);
  });

  it('changes the order of cards (statistical check)', () => {
    // Run multiple shuffles and check that at least one differs from the original order
    const original = initializeDeck();
    const originalOrder = original.map((c) => c.id).join(',');

    let allSame = true;
    for (let i = 0; i < 5; i++) {
      const deck = initializeDeck();
      shuffleDeck(deck);
      if (deck.map((c) => c.id).join(',') !== originalOrder) {
        allSame = false;
        break;
      }
    }
    // The probability of 5 consecutive identical shuffles of 52 cards is astronomically low
    expect(allSame).toBe(false);
  });

  it('handles an empty array', () => {
    const empty: Card[] = [];
    const result = shuffleDeck(empty);
    expect(result).toEqual([]);
  });

  it('handles a single-element array', () => {
    const single = [makeCard('only')];
    const result = shuffleDeck(single);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('only');
  });
});

// ============================================================
// drawFromDeck (F-024)
// ============================================================

describe('drawFromDeck', () => {
  it('returns the top card (first element)', () => {
    const card1 = makeCard('top');
    const card2 = makeCard('second');
    const gs = createTestGameState({ deck: [card1, card2] });

    const drawn = drawFromDeck(gs);
    expect(drawn).toEqual(card1);
  });

  it('removes the drawn card from the deck', () => {
    const card1 = makeCard('top');
    const card2 = makeCard('second');
    const gs = createTestGameState({ deck: [card1, card2] });

    drawFromDeck(gs);
    expect(gs.deck).toHaveLength(1);
    expect(gs.deck[0].id).toBe('second');
  });

  it('triggers reshuffleDiscard when deck is empty', () => {
    const discardBottom = makeCard('d-bottom');
    const discardTop = makeCard('d-top');
    const gs = createTestGameState({
      deck: [],
      discardPile: [discardBottom, discardTop],
    });

    const drawn = drawFromDeck(gs);

    // The top discard card should stay in the discard pile
    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0].id).toBe('d-top');

    // The drawn card should be from the reshuffled deck (the bottom discard card)
    expect(drawn).not.toBeNull();
    expect(drawn!.id).toBe('d-bottom');
  });

  it('returns null when both deck and discard are empty', () => {
    const gs = createTestGameState({ deck: [], discardPile: [] });
    const drawn = drawFromDeck(gs);
    expect(drawn).toBeNull();
  });

  it('returns null when deck is empty and discard has only 1 card', () => {
    const gs = createTestGameState({
      deck: [],
      discardPile: [makeCard('only')],
    });
    const drawn = drawFromDeck(gs);
    expect(drawn).toBeNull();
  });
});

// ============================================================
// drawFromDiscard (F-025)
// ============================================================

describe('drawFromDiscard', () => {
  it('returns the top card (last element)', () => {
    const bottom = makeCard('bottom');
    const top = makeCard('top');
    const gs = createTestGameState({ discardPile: [bottom, top] });

    const drawn = drawFromDiscard(gs);
    expect(drawn).toEqual(top);
  });

  it('removes the drawn card from the discard pile', () => {
    const bottom = makeCard('bottom');
    const top = makeCard('top');
    const gs = createTestGameState({ discardPile: [bottom, top] });

    drawFromDiscard(gs);
    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0].id).toBe('bottom');
  });

  it('returns null when discard pile is empty', () => {
    const gs = createTestGameState({ discardPile: [] });
    const drawn = drawFromDiscard(gs);
    expect(drawn).toBeNull();
  });
});

// ============================================================
// addToDiscard (F-026)
// ============================================================

describe('addToDiscard', () => {
  it('adds a card to the top of the discard pile', () => {
    const existing = makeCard('existing');
    const newCard = makeCard('new');
    const gs = createTestGameState({ discardPile: [existing] });

    addToDiscard(gs, newCard);

    expect(gs.discardPile).toHaveLength(2);
    expect(gs.discardPile[1].id).toBe('new');
  });

  it('works on an empty discard pile', () => {
    const card = makeCard('first');
    const gs = createTestGameState({ discardPile: [] });

    addToDiscard(gs, card);

    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0].id).toBe('first');
  });
});

// ============================================================
// reshuffleDiscard (F-027)
// ============================================================

describe('reshuffleDiscard', () => {
  it('keeps the top discard card in the discard pile', () => {
    const cards = [makeCard('a'), makeCard('b'), makeCard('c'), makeCard('top')];
    const gs = createTestGameState({ deck: [], discardPile: cards });

    reshuffleDiscard(gs);

    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0].id).toBe('top');
  });

  it('moves all other discard cards to the deck', () => {
    const cards = [makeCard('a'), makeCard('b'), makeCard('c'), makeCard('top')];
    const gs = createTestGameState({ deck: [], discardPile: [...cards] });

    reshuffleDiscard(gs);

    // Deck should have the 3 non-top cards (shuffled)
    expect(gs.deck).toHaveLength(3);
    const deckIds = gs.deck.map((c) => c.id).sort();
    expect(deckIds).toEqual(['a', 'b', 'c']);
  });

  it('shuffles the new deck (not in original order)', () => {
    // Use enough cards to make identical order extremely unlikely
    const cards: Card[] = [];
    for (let i = 0; i < 20; i++) {
      cards.push(makeCard(`card-${i}`));
    }
    cards.push(makeCard('top'));

    const originalOrder = cards
      .slice(0, -1)
      .map((c) => c.id)
      .join(',');

    let atLeastOneDifferent = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const gs = createTestGameState({ deck: [], discardPile: [...cards] });
      reshuffleDiscard(gs);
      if (gs.deck.map((c) => c.id).join(',') !== originalOrder) {
        atLeastOneDifferent = true;
        break;
      }
    }
    expect(atLeastOneDifferent).toBe(true);
  });

  it('does nothing when discard pile is empty', () => {
    const gs = createTestGameState({ deck: [], discardPile: [] });
    reshuffleDiscard(gs);
    expect(gs.deck).toHaveLength(0);
    expect(gs.discardPile).toHaveLength(0);
  });

  it('does nothing when discard pile has only 1 card', () => {
    const gs = createTestGameState({
      deck: [],
      discardPile: [makeCard('only')],
    });
    reshuffleDiscard(gs);
    expect(gs.deck).toHaveLength(0);
    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0].id).toBe('only');
  });
});

// ============================================================
// createDebugDeck
// ============================================================

describe('createDebugDeck', () => {
  it('returns exactly 20 cards', () => {
    const deck = createDebugDeck();
    expect(deck).toHaveLength(20);
  });

  it('contains all 13 ranks at least once', () => {
    const deck = createDebugDeck();
    const allRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deckRanks = new Set(deck.map((c) => c.rank));
    for (const rank of allRanks) {
      expect(deckRanks.has(rank as Card['rank'])).toBe(true);
    }
  });

  it('contains NO black face cards (J♠, J♣, Q♠, Q♣, K♠, K♣)', () => {
    const deck = createDebugDeck();
    const blackFaces = deck.filter(
      (c) => ['J', 'Q', 'K'].includes(c.rank) && (c.suit === '♠' || c.suit === '♣'),
    );
    expect(blackFaces).toHaveLength(0);
  });

  it('contains all 6 red face cards (J♥, J♦, Q♥, Q♦, K♥, K♦)', () => {
    const deck = createDebugDeck();
    const redFaces = deck.filter(
      (c) => ['J', 'Q', 'K'].includes(c.rank) && (c.suit === '♥' || c.suit === '♦'),
    );
    expect(redFaces).toHaveLength(6);
  });

  it('has unique card IDs', () => {
    const deck = createDebugDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(20);
  });

  it('correctly assigns isRed for all cards', () => {
    const deck = createDebugDeck();
    for (const card of deck) {
      if (card.suit === '♥' || card.suit === '♦') {
        expect(card.isRed).toBe(true);
      } else {
        expect(card.isRed).toBe(false);
      }
    }
  });

  it('assigns red 10 a value of 0', () => {
    const deck = createDebugDeck();
    const redTen = deck.find((c) => c.rank === '10' && c.isRed);
    expect(redTen).toBeDefined();
    expect(redTen!.value).toBe(0);
  });
});

// ============================================================
// createShuffledDeck
// ============================================================

describe('createShuffledDeck', () => {
  it('returns 54 cards', () => {
    const deck = createShuffledDeck();
    expect(deck).toHaveLength(54);
  });

  it('contains all unique card IDs', () => {
    const deck = createShuffledDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(54);
  });
});

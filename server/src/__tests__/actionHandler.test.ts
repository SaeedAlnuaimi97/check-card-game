import { describe, it, expect } from 'vitest';
import {
  handleDrawFromDeck,
  handleTakeDiscard,
  validateDiscardChoice,
  processDiscardChoice,
  isRedFaceCard,
} from '../game/ActionHandler';
import type { Card, GameState, PlayerState } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function makeCard(id: string, rank: Card['rank'] = '5', suit: Card['suit'] = '♠'): Card {
  const isRed = suit === '♥' || suit === '♦';
  const value = (() => {
    if (rank === 'A') return 1;
    if (rank === '10' && isRed) return 0;
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 10;
    return parseInt(rank, 10) || 5;
  })();
  return { id, suit, rank, value, isRed };
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
    ...overrides,
  };
}

// ============================================================
// isRedFaceCard (F-040)
// ============================================================

describe('isRedFaceCard', () => {
  it('returns true for red Jack', () => {
    expect(isRedFaceCard(makeCard('rj', 'J', '♥'))).toBe(true);
    expect(isRedFaceCard(makeCard('rj2', 'J', '♦'))).toBe(true);
  });

  it('returns true for red Queen', () => {
    expect(isRedFaceCard(makeCard('rq', 'Q', '♥'))).toBe(true);
    expect(isRedFaceCard(makeCard('rq2', 'Q', '♦'))).toBe(true);
  });

  it('returns true for red King', () => {
    expect(isRedFaceCard(makeCard('rk', 'K', '♥'))).toBe(true);
    expect(isRedFaceCard(makeCard('rk2', 'K', '♦'))).toBe(true);
  });

  it('returns false for black face cards', () => {
    expect(isRedFaceCard(makeCard('bj', 'J', '♠'))).toBe(false);
    expect(isRedFaceCard(makeCard('bq', 'Q', '♣'))).toBe(false);
    expect(isRedFaceCard(makeCard('bk', 'K', '♠'))).toBe(false);
  });

  it('returns false for red non-face cards', () => {
    expect(isRedFaceCard(makeCard('r5', '5', '♥'))).toBe(false);
    expect(isRedFaceCard(makeCard('r10', '10', '♦'))).toBe(false);
    expect(isRedFaceCard(makeCard('ra', 'A', '♥'))).toBe(false);
  });

  it('returns false for black non-face cards', () => {
    expect(isRedFaceCard(makeCard('b5', '5', '♠'))).toBe(false);
    expect(isRedFaceCard(makeCard('b10', '10', '♣'))).toBe(false);
  });
});

// ============================================================
// handleDrawFromDeck (F-037)
// ============================================================

describe('handleDrawFromDeck', () => {
  it('draws the top card from the deck and sets pending state', () => {
    const topCard = makeCard('top', '7', '♥');
    const gs = createTestGameState({
      deck: [topCard, makeCard('second')],
    });

    const result = handleDrawFromDeck(gs, 'player1');

    expect(result).toEqual(topCard);
    expect(gs.drawnCard).toEqual(topCard);
    expect(gs.drawnByPlayerId).toBe('player1');
    expect(gs.drawnSource).toBe('deck');
    expect(gs.deck).toHaveLength(1);
  });

  it('returns null if a card is already drawn (pending)', () => {
    const pending = makeCard('pending');
    const gs = createTestGameState({
      deck: [makeCard('top')],
      drawnCard: pending,
      drawnByPlayerId: 'player1',
    });

    const result = handleDrawFromDeck(gs, 'player1');

    expect(result).toBeNull();
    // State should be unchanged
    expect(gs.drawnCard).toEqual(pending);
    expect(gs.deck).toHaveLength(1);
  });

  it('returns null if the deck is empty and cannot reshuffle', () => {
    const gs = createTestGameState({ deck: [], discardPile: [] });

    const result = handleDrawFromDeck(gs, 'player1');

    expect(result).toBeNull();
    expect(gs.drawnCard).toBeNull();
    expect(gs.drawnByPlayerId).toBeNull();
  });

  it('reshuffles discard if deck is empty but discard has cards', () => {
    const discardBottom = makeCard('d-bottom');
    const discardTop = makeCard('d-top');
    const gs = createTestGameState({
      deck: [],
      discardPile: [discardBottom, discardTop],
    });

    const result = handleDrawFromDeck(gs, 'player1');

    // Should draw d-bottom (the only reshuffled card)
    expect(result).not.toBeNull();
    expect(result!.id).toBe('d-bottom');
    expect(gs.drawnCard!.id).toBe('d-bottom');
    expect(gs.drawnByPlayerId).toBe('player1');
    // Top discard stays in discard pile
    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0].id).toBe('d-top');
  });
});

// ============================================================
// handleTakeDiscard (F-041)
// ============================================================

describe('handleTakeDiscard', () => {
  it('takes the top card from the discard pile and sets pending state', () => {
    const topDiscard = makeCard('top-discard', 'Q', '♥');
    const gs = createTestGameState({
      discardPile: [makeCard('bottom'), topDiscard],
    });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toEqual(topDiscard);
    expect(gs.drawnCard).toEqual(topDiscard);
    expect(gs.drawnByPlayerId).toBe('player1');
    expect(gs.drawnSource).toBe('discard');
    expect(gs.discardPile).toHaveLength(1);
  });

  it('returns null if a card is already drawn (pending)', () => {
    const pending = makeCard('pending');
    const gs = createTestGameState({
      discardPile: [makeCard('top')],
      drawnCard: pending,
      drawnByPlayerId: 'player1',
    });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toBeNull();
    expect(gs.drawnCard).toEqual(pending);
    expect(gs.discardPile).toHaveLength(1);
  });

  it('returns null if the discard pile is empty', () => {
    const gs = createTestGameState({ discardPile: [] });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toBeNull();
    expect(gs.drawnCard).toBeNull();
    expect(gs.drawnByPlayerId).toBeNull();
    expect(gs.drawnSource).toBeNull();
  });

  it('sets drawnSource to discard', () => {
    const gs = createTestGameState({
      discardPile: [makeCard('card', '5', '♠')],
    });

    handleTakeDiscard(gs, 'player1');

    expect(gs.drawnSource).toBe('discard');
  });
});

// ============================================================
// validateDiscardChoice (F-038, F-042)
// ============================================================

describe('validateDiscardChoice', () => {
  it('returns null (valid) when discarding the drawn card (slot=null) from deck', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'p1',
      drawnSource: 'deck',
    });

    const error = validateDiscardChoice(gs, 'p1', null);
    expect(error).toBeNull();
  });

  it('returns null (valid) when swapping with a valid hand slot', () => {
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('a') },
      { slot: 'B', card: makeCard('b') },
    ]);
    const gs = createTestGameState({
      players: [player],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'p1',
    });

    const error = validateDiscardChoice(gs, 'p1', 'A');
    expect(error).toBeNull();
  });

  it('returns error when there is no pending drawn card', () => {
    const player = makePlayer('p1', []);
    const gs = createTestGameState({
      players: [player],
      drawnCard: null,
      drawnByPlayerId: null,
    });

    const error = validateDiscardChoice(gs, 'p1', null);
    expect(error).toBe('No pending drawn card');
  });

  it('returns error when the drawn card belongs to a different player', () => {
    const player = makePlayer('p1', []);
    const gs = createTestGameState({
      players: [player],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'p2', // Different player
    });

    const error = validateDiscardChoice(gs, 'p1', null);
    expect(error).toBe('No pending drawn card');
  });

  it('returns error when player is not found', () => {
    const gs = createTestGameState({
      players: [],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'ghost',
    });

    const error = validateDiscardChoice(gs, 'ghost', null);
    expect(error).toBe('Player not found');
  });

  it('returns error for an invalid slot label', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'p1',
    });

    const error = validateDiscardChoice(gs, 'p1', 'Z');
    expect(error).toBe('Invalid slot: Z');
  });

  // --- F-042: takeDiscard must swap ---

  it('returns error when slot is null and drawnSource is discard (must swap)', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'p1',
      drawnSource: 'discard',
    });

    const error = validateDiscardChoice(gs, 'p1', null);
    expect(error).toBe('Must swap with a hand card when taking from discard');
  });

  it('allows swap with hand slot when drawnSource is discard', () => {
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('a') },
      { slot: 'B', card: makeCard('b') },
    ]);
    const gs = createTestGameState({
      players: [player],
      drawnCard: makeCard('drawn'),
      drawnByPlayerId: 'p1',
      drawnSource: 'discard',
    });

    const error = validateDiscardChoice(gs, 'p1', 'A');
    expect(error).toBeNull();
  });
});

// ============================================================
// processDiscardChoice (F-038, F-039, F-040)
// ============================================================

describe('processDiscardChoice', () => {
  it('discards the drawn card when slot is null (keep hand unchanged)', () => {
    const handCardA = makeCard('hand-a', '3', '♠');
    const handCardB = makeCard('hand-b', '7', '♣');
    const drawnCard = makeCard('drawn', '9', '♥');
    const player = makePlayer('p1', [
      { slot: 'A', card: handCardA },
      { slot: 'B', card: handCardB },
    ]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.success).toBe(true);
    expect(result.discardedCard).toEqual(drawnCard);
    expect(result.discardedDrawnCard).toBe(true);
    // Hand should be unchanged
    expect(player.hand[0].card).toEqual(handCardA);
    expect(player.hand[1].card).toEqual(handCardB);
    // Drawn card should be on discard pile
    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0]).toEqual(drawnCard);
    // Pending state should be cleared
    expect(gs.drawnCard).toBeNull();
    expect(gs.drawnByPlayerId).toBeNull();
  });

  it('swaps drawn card with a hand card (slot specified)', () => {
    const handCardA = makeCard('hand-a', '3', '♠');
    const handCardB = makeCard('hand-b', '7', '♣');
    const drawnCard = makeCard('drawn', '9', '♥');
    const player = makePlayer('p1', [
      { slot: 'A', card: handCardA },
      { slot: 'B', card: handCardB },
    ]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', 'A');

    expect(result.success).toBe(true);
    expect(result.discardedCard).toEqual(handCardA);
    expect(result.discardedDrawnCard).toBe(false);
    // Hand slot A should now have the drawn card
    expect(player.hand[0].card).toEqual(drawnCard);
    // Hand slot B should be unchanged
    expect(player.hand[1].card).toEqual(handCardB);
    // Old hand card should be on discard pile
    expect(gs.discardPile).toHaveLength(1);
    expect(gs.discardPile[0]).toEqual(handCardA);
    // Pending state should be cleared
    expect(gs.drawnCard).toBeNull();
    expect(gs.drawnByPlayerId).toBeNull();
  });

  it('triggers special effect when discarding a red face card drawn from deck', () => {
    const drawnCard = makeCard('red-king', 'K', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      drawnSource: 'deck',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.success).toBe(true);
    expect(result.triggersSpecialEffect).toBe(true);
  });

  it('does NOT trigger special effect when swapping with a red face card from hand', () => {
    const handCard = makeCard('red-queen', 'Q', '♦');
    const drawnCard = makeCard('drawn', '5', '♠');
    const player = makePlayer('p1', [{ slot: 'A', card: handCard }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', 'A');

    expect(result.success).toBe(true);
    // The discarded card is the hand card (red queen), but since it wasn't the drawn card,
    // it should NOT trigger a special effect
    expect(result.triggersSpecialEffect).toBe(false);
  });

  it('does NOT trigger special effect when discarding a non-face drawn card', () => {
    const drawnCard = makeCard('drawn', '5', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.success).toBe(true);
    expect(result.triggersSpecialEffect).toBe(false);
  });

  it('does NOT trigger special effect when discarding a black face drawn card', () => {
    const drawnCard = makeCard('black-king', 'K', '♠');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.success).toBe(true);
    expect(result.triggersSpecialEffect).toBe(false);
  });

  it('returns error when validation fails', () => {
    const gs = createTestGameState({
      players: [],
      drawnCard: null,
      drawnByPlayerId: null,
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No pending drawn card');
  });

  it('adds discarded card to existing discard pile', () => {
    const existing = makeCard('existing');
    const drawnCard = makeCard('drawn', '4', '♣');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      discardPile: [existing],
    });

    processDiscardChoice(gs, 'p1', null);

    expect(gs.discardPile).toHaveLength(2);
    expect(gs.discardPile[0]).toEqual(existing);
    expect(gs.discardPile[1]).toEqual(drawnCard);
  });

  it('triggers special effect for red Jack', () => {
    const drawnCard = makeCard('red-jack', 'J', '♦');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      drawnSource: 'deck',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.triggersSpecialEffect).toBe(true);
  });

  it('triggers special effect for red Queen', () => {
    const drawnCard = makeCard('red-queen', 'Q', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      drawnSource: 'deck',
      discardPile: [],
    });

    const result = processDiscardChoice(gs, 'p1', null);

    expect(result.triggersSpecialEffect).toBe(true);
  });

  // --- F-043: No special effects from discard ---

  it('does NOT trigger special effect when discarding a red face card taken from discard', () => {
    const drawnCard = makeCard('red-king', 'K', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      drawnSource: 'discard',
      discardPile: [],
    });

    // When taken from discard, must swap (slot !== null)
    const result = processDiscardChoice(gs, 'p1', 'A');

    expect(result.success).toBe(true);
    // The discarded card is the hand card, not the drawn card, so no special effect anyway
    expect(result.triggersSpecialEffect).toBe(false);
  });

  it('clears drawnSource after processing', () => {
    const drawnCard = makeCard('drawn', '5', '♠');
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      drawnCard,
      drawnByPlayerId: 'p1',
      drawnSource: 'deck',
      discardPile: [],
    });

    processDiscardChoice(gs, 'p1', null);

    expect(gs.drawnSource).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  handleDrawFromDeck,
  handleTakeDiscard,
  validateDiscardChoice,
  processDiscardChoice,
  isRedFaceCard,
  getSpecialEffectType,
  getNextPenaltySlot,
  handleBurnAttempt,
  applyRedJackSwap,
  applyRedQueenPeek,
  drawRedKingCards,
  processRedKingChoice,
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
    pendingEffect: null,
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

// ============================================================
// getSpecialEffectType (F-049 to F-054)
// ============================================================

describe('getSpecialEffectType', () => {
  it('returns redJack for red Jack', () => {
    expect(getSpecialEffectType(makeCard('rj', 'J', '♥'))).toBe('redJack');
    expect(getSpecialEffectType(makeCard('rj2', 'J', '♦'))).toBe('redJack');
  });

  it('returns redQueen for red Queen', () => {
    expect(getSpecialEffectType(makeCard('rq', 'Q', '♥'))).toBe('redQueen');
    expect(getSpecialEffectType(makeCard('rq2', 'Q', '♦'))).toBe('redQueen');
  });

  it('returns redKing for red King', () => {
    expect(getSpecialEffectType(makeCard('rk', 'K', '♥'))).toBe('redKing');
    expect(getSpecialEffectType(makeCard('rk2', 'K', '♦'))).toBe('redKing');
  });

  it('returns null for black face cards', () => {
    expect(getSpecialEffectType(makeCard('bj', 'J', '♠'))).toBeNull();
    expect(getSpecialEffectType(makeCard('bq', 'Q', '♣'))).toBeNull();
    expect(getSpecialEffectType(makeCard('bk', 'K', '♣'))).toBeNull();
  });

  it('returns null for red non-face cards', () => {
    expect(getSpecialEffectType(makeCard('r5', '5', '♥'))).toBeNull();
    expect(getSpecialEffectType(makeCard('ra', 'A', '♦'))).toBeNull();
    expect(getSpecialEffectType(makeCard('r10', '10', '♥'))).toBeNull();
  });
});

// ============================================================
// getNextPenaltySlot (F-047)
// ============================================================

describe('getNextPenaltySlot', () => {
  it('returns E when only A-D exist', () => {
    expect(getNextPenaltySlot(['A', 'B', 'C', 'D'])).toBe('E');
  });

  it('returns F when E is already taken', () => {
    expect(getNextPenaltySlot(['A', 'B', 'C', 'D', 'E'])).toBe('F');
  });

  it('returns E when no slots exist', () => {
    expect(getNextPenaltySlot([])).toBe('E');
  });

  it('skips occupied penalty slots', () => {
    expect(getNextPenaltySlot(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('G');
  });

  it('returns E even when standard slots are missing (after burns)', () => {
    expect(getNextPenaltySlot(['A', 'C', 'D'])).toBe('E');
  });
});

// ============================================================
// handleBurnAttempt (F-044 to F-048)
// ============================================================

describe('handleBurnAttempt', () => {
  it('succeeds when card rank matches top discard', () => {
    const handCard = makeCard('h7', '7', '♣');
    const topDiscard = makeCard('d7', '7', '♥');
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('a', '3') },
      { slot: 'B', card: handCard },
      { slot: 'C', card: makeCard('c', '5') },
      { slot: 'D', card: makeCard('d', '9') },
    ]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
    });

    const result = handleBurnAttempt(gs, 'p1', 'B');

    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(true);
    expect(result.burnedCard).toEqual(handCard);
    expect(result.burnedSlot).toBe('B');
    // Card removed from hand
    expect(player.hand).toHaveLength(3);
    expect(player.hand.find((h) => h.slot === 'B')).toBeUndefined();
    // Card added to discard pile
    expect(gs.discardPile).toHaveLength(2);
    expect(gs.discardPile[1]).toEqual(handCard);
  });

  it('fails when card rank does not match top discard', () => {
    const handCard = makeCard('h5', '5', '♣');
    const topDiscard = makeCard('d7', '7', '♥');
    const player = makePlayer('p1', [
      { slot: 'A', card: handCard },
      { slot: 'B', card: makeCard('b', '3') },
      { slot: 'C', card: makeCard('c', '8') },
      { slot: 'D', card: makeCard('d', '9') },
    ]);
    const penaltyCard = makeCard('penalty', '2', '♠');
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
      deck: [penaltyCard],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');

    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(false);
    // Card stays in hand
    expect(player.hand.find((h) => h.slot === 'A')?.card).toEqual(handCard);
    // Penalty card added
    expect(player.hand).toHaveLength(5);
    expect(result.penaltySlot).toBe('E');
    expect(player.hand.find((h) => h.slot === 'E')?.card).toEqual(penaltyCard);
  });

  it('returns error if player not found', () => {
    const gs = createTestGameState({ players: [] });
    const result = handleBurnAttempt(gs, 'nobody', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Player not found');
  });

  it('returns error if slot does not exist', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [makeCard('d', '5')],
    });

    const result = handleBurnAttempt(gs, 'p1', 'Z');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid slot: Z');
  });

  it('returns error if discard pile is empty', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toBe('No discard card to match against');
  });

  it('matches face cards correctly (J matches J regardless of suit)', () => {
    const handCard = makeCard('hj', 'J', '♠');
    const topDiscard = makeCard('dj', 'J', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: handCard }]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');
    expect(result.burnSuccess).toBe(true);
  });

  it('handles burn failure with empty deck (no penalty card)', () => {
    const handCard = makeCard('h5', '5', '♣');
    const topDiscard = makeCard('d7', '7', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: handCard }]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
      deck: [],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');
    expect(result.success).toBe(true);
    expect(result.burnSuccess).toBe(false);
    expect(result.penaltySlot).toBeUndefined();
    // Hand unchanged
    expect(player.hand).toHaveLength(1);
  });

  it('successful burn with Ace matching Ace', () => {
    const handCard = makeCard('ha', 'A', '♠');
    const topDiscard = makeCard('da', 'A', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: handCard }]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');
    expect(result.burnSuccess).toBe(true);
    expect(player.hand).toHaveLength(0);
  });

  it('marks successfully burned card with isBurned=true on discard pile', () => {
    const handCard = makeCard('h7', '7', '♣');
    const topDiscard = makeCard('d7', '7', '♥');
    const player = makePlayer('p1', [
      { slot: 'A', card: handCard },
      { slot: 'B', card: makeCard('b', '3') },
    ]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');

    expect(result.burnSuccess).toBe(true);
    // The burned card on the discard pile should have isBurned=true
    const burnedOnDiscard = gs.discardPile[gs.discardPile.length - 1];
    expect(burnedOnDiscard.id).toBe('h7');
    expect(burnedOnDiscard.isBurned).toBe(true);
  });

  it('does not mark failed burn card with isBurned', () => {
    const handCard = makeCard('h5', '5', '♣');
    const topDiscard = makeCard('d7', '7', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: handCard }]);
    const gs = createTestGameState({
      players: [player],
      discardPile: [topDiscard],
      deck: [makeCard('penalty')],
    });

    const result = handleBurnAttempt(gs, 'p1', 'A');

    expect(result.burnSuccess).toBe(false);
    // The discard pile top should still be the original card (no isBurned)
    const topCard = gs.discardPile[gs.discardPile.length - 1];
    expect(topCard.id).toBe('d7');
    expect(topCard.isBurned).toBeUndefined();
  });
});

// ============================================================
// handleTakeDiscard — burned card blocking
// ============================================================

describe('handleTakeDiscard — burned card blocking', () => {
  it('returns null when top discard card is burned', () => {
    const burnedCard = makeCard('burned', '7', '♥');
    burnedCard.isBurned = true;
    const gs = createTestGameState({
      discardPile: [makeCard('bottom'), burnedCard],
    });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toBeNull();
    // Discard pile should be unchanged
    expect(gs.discardPile).toHaveLength(2);
    expect(gs.drawnCard).toBeNull();
  });

  it('allows take when top discard card is NOT burned', () => {
    const normalCard = makeCard('normal', '7', '♥');
    const gs = createTestGameState({
      discardPile: [normalCard],
    });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toEqual(normalCard);
    expect(gs.drawnCard).toEqual(normalCard);
    expect(gs.drawnSource).toBe('discard');
  });

  it('allows take when top card has isBurned=false', () => {
    const card = makeCard('card', '5', '♠');
    card.isBurned = false;
    const gs = createTestGameState({
      discardPile: [card],
    });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toEqual(card);
  });

  it('allows take when burned card is NOT on top (another card was discarded on top)', () => {
    const burnedCard = makeCard('burned', '7', '♥');
    burnedCard.isBurned = true;
    const normalTop = makeCard('normal-top', '3', '♠');
    const gs = createTestGameState({
      discardPile: [burnedCard, normalTop],
    });

    const result = handleTakeDiscard(gs, 'player1');

    expect(result).toEqual(normalTop);
    expect(gs.drawnCard).toEqual(normalTop);
  });
});

// ============================================================
// applyRedJackSwap (F-049)
// ============================================================

describe('applyRedJackSwap', () => {
  it('swaps cards between two players', () => {
    const myCard = makeCard('mc', '3', '♠');
    const theirCard = makeCard('tc', '8', '♥');
    const p1 = makePlayer('p1', [
      { slot: 'A', card: myCard },
      { slot: 'B', card: makeCard('b') },
    ]);
    const p2 = makePlayer('p2', [
      { slot: 'A', card: theirCard },
      { slot: 'B', card: makeCard('b2') },
    ]);
    const gs = createTestGameState({ players: [p1, p2] });

    const result = applyRedJackSwap(gs, 'p1', 'A', 'p2', 'A');

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(p1.hand[0].card).toEqual(theirCard);
    expect(p2.hand[0].card).toEqual(myCard);
  });

  it('returns error when swapping with yourself', () => {
    const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [p1] });

    const result = applyRedJackSwap(gs, 'p1', 'A', 'p1', 'B');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot swap with yourself');
  });

  it('returns error when player not found', () => {
    const gs = createTestGameState({ players: [] });
    const result = applyRedJackSwap(gs, 'p1', 'A', 'p2', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Player not found');
  });

  it('returns error when target player not found', () => {
    const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [p1] });

    const result = applyRedJackSwap(gs, 'p1', 'A', 'p2', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Target player not found');
  });

  it('returns error for invalid own slot', () => {
    const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const p2 = makePlayer('p2', [{ slot: 'A', card: makeCard('a2') }]);
    const gs = createTestGameState({ players: [p1, p2] });

    const result = applyRedJackSwap(gs, 'p1', 'Z', 'p2', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid slot: Z');
  });

  it('returns error for invalid target slot', () => {
    const p1 = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const p2 = makePlayer('p2', [{ slot: 'A', card: makeCard('a2') }]);
    const gs = createTestGameState({ players: [p1, p2] });

    const result = applyRedJackSwap(gs, 'p1', 'A', 'p2', 'Z');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid target slot: Z');
  });
});

// ============================================================
// applyRedQueenPeek (F-050)
// ============================================================

describe('applyRedQueenPeek', () => {
  it('returns the card at the requested slot', () => {
    const card = makeCard('hidden', '7', '♥');
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('a') },
      { slot: 'B', card: card },
    ]);
    const gs = createTestGameState({ players: [player] });

    const result = applyRedQueenPeek(gs, 'p1', 'B');

    expect(result.success).toBe(true);
    expect(result.card).toEqual(card);
    expect(result.slot).toBe('B');
  });

  it('does not mutate the game state', () => {
    const card = makeCard('hidden', '7', '♥');
    const player = makePlayer('p1', [{ slot: 'A', card: card }]);
    const gs = createTestGameState({ players: [player] });

    applyRedQueenPeek(gs, 'p1', 'A');

    // Card should still be in hand
    expect(player.hand[0].card).toEqual(card);
  });

  it('returns error for player not found', () => {
    const gs = createTestGameState({ players: [] });
    const result = applyRedQueenPeek(gs, 'nobody', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Player not found');
  });

  it('returns error for invalid slot', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [player] });

    const result = applyRedQueenPeek(gs, 'p1', 'Z');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid slot: Z');
  });
});

// ============================================================
// drawRedKingCards (F-051)
// ============================================================

describe('drawRedKingCards', () => {
  it('draws 2 cards from the deck', () => {
    const c1 = makeCard('c1', '3', '♠');
    const c2 = makeCard('c2', '7', '♥');
    const c3 = makeCard('c3', '9', '♣');
    const gs = createTestGameState({ deck: [c1, c2, c3] });

    const result = drawRedKingCards(gs);

    expect(result.success).toBe(true);
    expect(result.drawnCards).toEqual([c1, c2]);
    expect(gs.deck).toHaveLength(1);
  });

  it('returns error when deck is empty', () => {
    const gs = createTestGameState({ deck: [] });
    const result = drawRedKingCards(gs);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Deck is empty');
  });

  it('returns error when deck has only 1 card', () => {
    const c1 = makeCard('c1', '3', '♠');
    const gs = createTestGameState({ deck: [c1] });

    const result = drawRedKingCards(gs);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not enough cards in deck');
    // Card should be put back
    expect(gs.deck).toHaveLength(1);
    expect(gs.deck[0]).toEqual(c1);
  });
});

// ============================================================
// processRedKingChoice (F-051 to F-053)
// ============================================================

describe('processRedKingChoice', () => {
  const drawn1 = makeCard('d1', '3', '♠');
  const drawn2 = makeCard('d2', '7', '♥');

  it('returnBoth: puts both cards back in deck and shuffles', () => {
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('a', '5') },
      { slot: 'B', card: makeCard('b', '9') },
    ]);
    const gs = createTestGameState({
      players: [player],
      deck: [makeCard('existing')],
    });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], { type: 'returnBoth' });

    expect(result.success).toBe(true);
    expect(result.discardedCards).toEqual([]);
    // Both drawn cards should be in deck (shuffled)
    expect(gs.deck).toHaveLength(3);
    // Hand unchanged
    expect(player.hand[0].card.id).toBe('a');
    expect(player.hand[1].card.id).toBe('b');
  });

  it('keepOne: replaces one hand card, returns other drawn card to deck', () => {
    const handCardA = makeCard('a', '5', '♣');
    const player = makePlayer('p1', [
      { slot: 'A', card: handCardA },
      { slot: 'B', card: makeCard('b', '9') },
    ]);
    const gs = createTestGameState({
      players: [player],
      deck: [],
      discardPile: [],
    });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepOne',
      keepIndex: 0,
      replaceSlot: 'A',
    });

    expect(result.success).toBe(true);
    // Slot A now has drawn1
    expect(player.hand[0].card).toEqual(drawn1);
    // Replaced card goes to discard
    expect(result.discardedCards).toEqual([handCardA]);
    expect(gs.discardPile).toContainEqual(handCardA);
    // Other drawn card returns to deck
    expect(gs.deck).toContainEqual(drawn2);
  });

  it('keepOne: validates keepIndex', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [player] });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepOne',
      keepIndex: undefined,
      replaceSlot: 'A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('keepIndex must be 0 or 1');
  });

  it('keepOne: validates replaceSlot', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [player] });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepOne',
      keepIndex: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('replaceSlot is required for keepOne');
  });

  it('keepOne: validates slot exists', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [player] });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepOne',
      keepIndex: 1,
      replaceSlot: 'Z',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid slot: Z');
  });

  it('keepBoth: replaces two hand cards, no cards return to deck', () => {
    const handA = makeCard('a', '5', '♣');
    const handB = makeCard('b', '9', '♠');
    const player = makePlayer('p1', [
      { slot: 'A', card: handA },
      { slot: 'B', card: handB },
    ]);
    const gs = createTestGameState({
      players: [player],
      deck: [],
      discardPile: [],
    });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepBoth',
      replaceSlots: ['A', 'B'],
    });

    expect(result.success).toBe(true);
    // Both slots replaced
    expect(player.hand[0].card).toEqual(drawn1);
    expect(player.hand[1].card).toEqual(drawn2);
    // Both replaced cards discarded
    expect(result.discardedCards).toEqual([handA, handB]);
    expect(gs.discardPile).toContainEqual(handA);
    expect(gs.discardPile).toContainEqual(handB);
    // No cards in deck
    expect(gs.deck).toHaveLength(0);
  });

  it('keepBoth: rejects duplicate slots', () => {
    const player = makePlayer('p1', [
      { slot: 'A', card: makeCard('a') },
      { slot: 'B', card: makeCard('b') },
    ]);
    const gs = createTestGameState({ players: [player] });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepBoth',
      replaceSlots: ['A', 'A'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('replaceSlots must be distinct');
  });

  it('keepBoth: rejects missing replaceSlots', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [player] });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'keepBoth',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('replaceSlots must have exactly 2 slots');
  });

  it('returns error for player not found', () => {
    const gs = createTestGameState({ players: [] });
    const result = processRedKingChoice(gs, 'nobody', [drawn1, drawn2], {
      type: 'returnBoth',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Player not found');
  });

  it('returns error for invalid choice type', () => {
    const player = makePlayer('p1', [{ slot: 'A', card: makeCard('a') }]);
    const gs = createTestGameState({ players: [player] });

    const result = processRedKingChoice(gs, 'p1', [drawn1, drawn2], {
      type: 'invalid' as never,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid choice type');
  });
});

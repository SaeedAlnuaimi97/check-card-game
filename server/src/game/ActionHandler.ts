import type { Card, GameState, SlotLabel } from '../types/game.types';
import { drawFromDeck, drawFromDiscard, addToDiscard } from './Deck';

// ============================================================
// Draw from Deck — Phase 1 (F-037)
// ============================================================

/**
 * Draws a card from the deck and stores it as a pending drawn card.
 * Returns the drawn card, or null if the deck is empty.
 * Mutates gameState: removes card from deck, sets drawnCard, drawnByPlayerId, drawnSource.
 */
export function handleDrawFromDeck(gameState: GameState, playerId: string): Card | null {
  if (gameState.drawnCard !== null) {
    return null; // Already has a pending drawn card
  }

  const card = drawFromDeck(gameState);
  if (!card) return null;

  gameState.drawnCard = card;
  gameState.drawnByPlayerId = playerId;
  gameState.drawnSource = 'deck';

  return card;
}

// ============================================================
// Take from Discard — Phase 1 (F-041)
// ============================================================

/**
 * Takes the top card from the discard pile and stores it as a pending card.
 * Returns the taken card, or null if the discard pile is empty.
 * Mutates gameState: removes card from discard pile, sets drawnCard, drawnByPlayerId, drawnSource.
 */
export function handleTakeDiscard(gameState: GameState, playerId: string): Card | null {
  if (gameState.drawnCard !== null) {
    return null; // Already has a pending card
  }

  const card = drawFromDiscard(gameState);
  if (!card) return null;

  gameState.drawnCard = card;
  gameState.drawnByPlayerId = playerId;
  gameState.drawnSource = 'discard';

  return card;
}

// ============================================================
// Discard Choice — Phase 2 (F-038, F-039, F-042)
// ============================================================

export interface DiscardChoiceResult {
  success: boolean;
  error?: string;
  /** The card that was placed on the discard pile */
  discardedCard?: Card;
  /** True if the discarded card was the drawn/taken card (not a hand card) */
  discardedDrawnCard?: boolean;
  /** True if the discarded card triggers a special effect (red J/Q/K just drawn from deck) */
  triggersSpecialEffect?: boolean;
}

/**
 * Validates a discard choice after drawing/taking a card.
 * Returns an error string if invalid, null if valid.
 *
 * When drawnSource is 'discard' (takeDiscard), slot must NOT be null
 * — the player must swap with a hand card.
 */
export function validateDiscardChoice(
  gameState: GameState,
  playerId: string,
  slot: string | null,
): string | null {
  if (!gameState.drawnCard || gameState.drawnByPlayerId !== playerId) {
    return 'No pending drawn card';
  }

  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) {
    return 'Player not found';
  }

  // When taken from discard, must swap with a hand card (F-042)
  if (slot === null && gameState.drawnSource === 'discard') {
    return 'Must swap with a hand card when taking from discard';
  }

  // slot === null means "discard the drawn card" (only valid for deck draws)
  if (slot !== null) {
    const handSlot = player.hand.find((h) => h.slot === slot);
    if (!handSlot) {
      return `Invalid slot: ${slot}`;
    }
  }

  return null;
}

/**
 * Processes a discard choice after drawing from deck or taking from discard.
 *
 * - slot === null: discard the drawn card (keep hand unchanged) — only allowed for deck draws
 * - slot === 'A'|'B'|etc: replace that hand card with the drawn/taken card, discard the hand card
 *
 * Mutates gameState. Clears drawnCard/drawnByPlayerId/drawnSource.
 * Returns result with the discarded card and whether it triggers a special effect.
 */
export function processDiscardChoice(
  gameState: GameState,
  playerId: string,
  slot: SlotLabel | null,
): DiscardChoiceResult {
  const validationError = validateDiscardChoice(gameState, playerId, slot);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const drawnCard = gameState.drawnCard!;
  const fromDiscard = gameState.drawnSource === 'discard';
  const player = gameState.players.find((p) => p.playerId === playerId)!;

  let discardedCard: Card;
  let discardedDrawnCard: boolean;

  if (slot === null) {
    // Discard the drawn card itself (only valid for deck draws)
    discardedCard = drawnCard;
    discardedDrawnCard = true;
  } else {
    // Replace hand card with drawn/taken card
    const handSlot = player.hand.find((h) => h.slot === slot)!;
    discardedCard = handSlot.card;
    handSlot.card = drawnCard;
    discardedDrawnCard = false;
  }

  // Place discarded card on discard pile
  addToDiscard(gameState, discardedCard);

  // Check for special effect: red J/Q/K that was just drawn from DECK and then discarded
  // (F-040, F-043) — only triggers when drawn from deck AND the drawn card itself is discarded
  // Never triggers for takeDiscard (F-043)
  const triggersSpecialEffect = discardedDrawnCard && !fromDiscard && isRedFaceCard(discardedCard);

  // Clear pending draw state
  gameState.drawnCard = null;
  gameState.drawnByPlayerId = null;
  gameState.drawnSource = null;

  return {
    success: true,
    discardedCard,
    discardedDrawnCard,
    triggersSpecialEffect,
  };
}

// ============================================================
// Helper: Red Face Card Detection (F-040)
// ============================================================

/**
 * Returns true if the card is a red Jack, Queen, or King.
 * These trigger special effects when drawn from deck and then discarded.
 */
export function isRedFaceCard(card: Card): boolean {
  return card.isRed && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K');
}

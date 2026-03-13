import type { Card, GameState, SlotLabel, SpecialEffectType } from '../types/game.types';
import { drawFromDeck, drawFromDiscard, addToDiscard, shuffleDeck } from './Deck';

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

  // Burned cards on top of the discard pile cannot be picked up
  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  if (topDiscard?.isBurned) {
    return null;
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

/**
 * Returns the SpecialEffectType for a red face card.
 */
export function getSpecialEffectType(card: Card): SpecialEffectType | null {
  if (!card.isRed) return null;
  if (card.rank === 'J') return 'redJack';
  if (card.rank === 'Q') return 'redQueen';
  if (card.rank === 'K') return 'redKing';
  return null;
}

// ============================================================
// Burn Action (F-044 to F-048)
// ============================================================

/** Slot labels for penalty cards: E, F, G, H, ... */
const PENALTY_SLOT_LABELS = 'EFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Gets the next available penalty slot label for a player.
 * Starts at 'E' and increments (E, F, G, ...).
 */
export function getNextPenaltySlot(existingSlots: string[]): string {
  for (const ch of PENALTY_SLOT_LABELS) {
    if (!existingSlots.includes(ch)) {
      return ch;
    }
  }
  // Fallback — shouldn't happen in practice
  return `P${existingSlots.length}`;
}

export interface BurnResult {
  success: boolean;
  error?: string;
  /** Whether the burn matched (card removed) or failed (penalty card added) */
  burnSuccess?: boolean;
  /** The card that was burned (revealed to all on success) */
  burnedCard?: Card;
  /** The slot that was burned */
  burnedSlot?: string;
  /** Penalty slot label added on failure */
  penaltySlot?: string;
}

/**
 * Attempts to burn a card from the player's hand.
 *
 * - F-045: Validates rank match against top discard card
 * - F-046: Success — card removed from hand to discard pile, hand shrinks
 * - F-047: Failure — card stays, penalty card drawn face-down
 * - F-048: No special effects trigger from burns
 *
 * Mutates gameState.
 */
export function handleBurnAttempt(
  gameState: GameState,
  playerId: string,
  slot: SlotLabel,
): BurnResult {
  // Validate player
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) {
    return { success: false, error: 'Player not found' };
  }

  // Validate slot exists
  const handSlotIndex = player.hand.findIndex((h) => h.slot === slot);
  if (handSlotIndex === -1) {
    return { success: false, error: `Invalid slot: ${slot}` };
  }

  // Validate discard pile has cards to match against
  if (gameState.discardPile.length === 0) {
    return { success: false, error: 'No discard card to match against' };
  }

  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];
  const handSlot = player.hand[handSlotIndex];
  const cardToBurn = handSlot.card;

  // F-045: Check rank match (suit irrelevant)
  const ranksMatch = cardToBurn.rank === topDiscard.rank;

  if (ranksMatch) {
    // F-046: Burn success — remove card from hand, add to discard pile
    player.hand.splice(handSlotIndex, 1);
    // Mark the card as burned so it cannot be picked up from the discard pile
    cardToBurn.isBurned = true;
    addToDiscard(gameState, cardToBurn);

    return {
      success: true,
      burnSuccess: true,
      burnedCard: cardToBurn,
      burnedSlot: slot,
    };
  } else {
    // F-047: Burn failure — card stays, penalty card drawn face-down
    const penaltyCard = drawFromDeck(gameState);
    let penaltySlot: string | undefined;

    if (penaltyCard) {
      const existingSlots = player.hand.map((h) => h.slot);
      penaltySlot = getNextPenaltySlot(existingSlots);
      player.hand.push({ slot: penaltySlot, card: penaltyCard });
    }

    return {
      success: true,
      burnSuccess: false,
      burnedCard: cardToBurn,
      burnedSlot: slot,
      penaltySlot,
    };
  }
}

// ============================================================
// Special Effects — Red Face Cards (F-049 to F-054)
// ============================================================

export interface RedJackSwapResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * F-049: Red Jack — blind swap one own card with one opponent card.
 * Neither player sees the swapped cards.
 */
export function applyRedJackSwap(
  gameState: GameState,
  playerId: string,
  mySlot: SlotLabel,
  targetPlayerId: string,
  targetSlot: SlotLabel,
): RedJackSwapResult {
  if (playerId === targetPlayerId) {
    return { success: false, error: 'Cannot swap with yourself' };
  }

  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) return { success: false, error: 'Player not found' };

  const target = gameState.players.find((p) => p.playerId === targetPlayerId);
  if (!target) return { success: false, error: 'Target player not found' };

  const myHandSlot = player.hand.find((h) => h.slot === mySlot);
  if (!myHandSlot) return { success: false, error: `Invalid slot: ${mySlot}` };

  const targetHandSlot = target.hand.find((h) => h.slot === targetSlot);
  if (!targetHandSlot) return { success: false, error: `Invalid target slot: ${targetSlot}` };

  // Blind swap — swap cards between the two slots
  const temp = myHandSlot.card;
  myHandSlot.card = targetHandSlot.card;
  targetHandSlot.card = temp;

  return { success: true, skipped: false };
}

export interface RedQueenPeekResult {
  success: boolean;
  error?: string;
  card?: Card;
  slot?: string;
}

/**
 * F-050: Red Queen — peek at one of your own face-down cards.
 * Returns the card privately. Does not mutate game state.
 */
export function applyRedQueenPeek(
  gameState: GameState,
  playerId: string,
  slot: SlotLabel,
): RedQueenPeekResult {
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) return { success: false, error: 'Player not found' };

  const handSlot = player.hand.find((h) => h.slot === slot);
  if (!handSlot) return { success: false, error: `Invalid slot: ${slot}` };

  return { success: true, card: handSlot.card, slot };
}

export interface RedKingDrawResult {
  success: boolean;
  error?: string;
  drawnCards?: [Card, Card];
}

/**
 * F-051: Red King — draw 2 additional cards from the deck.
 * Returns the 2 cards privately. Does NOT yet place them in hand —
 * the player must choose what to do with them via redKingChoice.
 *
 * Mutates gameState: removes 2 cards from deck.
 */
export function drawRedKingCards(gameState: GameState): RedKingDrawResult {
  const card1 = drawFromDeck(gameState);
  if (!card1) return { success: false, error: 'Deck is empty' };

  const card2 = drawFromDeck(gameState);
  if (!card2) {
    // Put card1 back — shouldn't happen in practice
    gameState.deck.unshift(card1);
    return { success: false, error: 'Not enough cards in deck' };
  }

  return { success: true, drawnCards: [card1, card2] };
}

export interface RedKingChoiceResult {
  success: boolean;
  error?: string;
  discardedCards?: Card[];
}

/**
 * F-051/F-052/F-053: Process the player's Red King choice.
 *
 * - returnBoth: both drawn cards go back to deck (shuffled in)
 * - keepOne: keep 1 drawn card (by index), replace 1 hand slot. Other drawn card returns to deck.
 * - keepBoth: keep both drawn cards, replace 2 hand slots. Both replaced cards go to discard.
 *
 * F-053: Return-to-deck cards are shuffled into random positions.
 */
export function processRedKingChoice(
  gameState: GameState,
  playerId: string,
  drawnCards: [Card, Card],
  choice: {
    type: 'returnBoth' | 'keepOne' | 'keepBoth';
    keepIndex?: 0 | 1;
    replaceSlot?: SlotLabel;
    replaceSlots?: [SlotLabel, SlotLabel];
  },
): RedKingChoiceResult {
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) return { success: false, error: 'Player not found' };

  const discardedCards: Card[] = [];

  if (choice.type === 'returnBoth') {
    // F-053: Both cards go back to deck, shuffled in
    gameState.deck.push(drawnCards[0], drawnCards[1]);
    shuffleDeck(gameState.deck);
    return { success: true, discardedCards: [] };
  }

  if (choice.type === 'keepOne') {
    if (choice.keepIndex === undefined || (choice.keepIndex !== 0 && choice.keepIndex !== 1)) {
      return { success: false, error: 'keepIndex must be 0 or 1' };
    }
    if (!choice.replaceSlot) {
      return { success: false, error: 'replaceSlot is required for keepOne' };
    }

    const handSlot = player.hand.find((h) => h.slot === choice.replaceSlot);
    if (!handSlot) return { success: false, error: `Invalid slot: ${choice.replaceSlot}` };

    const keptCard = drawnCards[choice.keepIndex];
    const returnedCard = drawnCards[choice.keepIndex === 0 ? 1 : 0];

    // Discard the replaced hand card
    discardedCards.push(handSlot.card);
    addToDiscard(gameState, handSlot.card);

    // Put kept card in the slot
    handSlot.card = keptCard;

    // Return the other card to deck (F-053)
    gameState.deck.push(returnedCard);
    shuffleDeck(gameState.deck);

    return { success: true, discardedCards };
  }

  if (choice.type === 'keepBoth') {
    if (!choice.replaceSlots || choice.replaceSlots.length !== 2) {
      return { success: false, error: 'replaceSlots must have exactly 2 slots' };
    }
    if (choice.replaceSlots[0] === choice.replaceSlots[1]) {
      return { success: false, error: 'replaceSlots must be distinct' };
    }

    const handSlot0 = player.hand.find((h) => h.slot === choice.replaceSlots![0]);
    const handSlot1 = player.hand.find((h) => h.slot === choice.replaceSlots![1]);
    if (!handSlot0) return { success: false, error: `Invalid slot: ${choice.replaceSlots[0]}` };
    if (!handSlot1) return { success: false, error: `Invalid slot: ${choice.replaceSlots[1]}` };

    // Discard both replaced hand cards
    discardedCards.push(handSlot0.card, handSlot1.card);
    addToDiscard(gameState, handSlot0.card);
    addToDiscard(gameState, handSlot1.card);

    // Put drawn cards in the slots
    handSlot0.card = drawnCards[0];
    handSlot1.card = drawnCards[1];

    return { success: true, discardedCards };
  }

  return { success: false, error: `Invalid choice type: ${choice.type}` };
}

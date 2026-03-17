import { randomInt } from 'crypto';
import { Card, Rank, Suit, GameState } from '../types/game.types';

// ============================================================
// Constants
// ============================================================

const SUITS: Suit[] = ['♥', '♦', '♠', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED_SUITS: Set<Suit> = new Set(['♥', '♦']);

// ============================================================
// Card Value Lookup
// ============================================================

/**
 * Returns the point value for a given card.
 *
 * - Red 10 (♥10, ♦10) = 0
 * - Ace = 1
 * - 2-9 = face value
 * - Black 10 (♠10, ♣10) = 10
 * - J, Q, K = 10
 */
function getCardValue(suit: Suit, rank: Rank): number {
  if (rank === '10' && RED_SUITS.has(suit)) return 0;
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  // '2' through '10' (black 10 falls through here as parseInt('10') = 10)
  return parseInt(rank, 10);
}

// ============================================================
// F-022: Initialize Deck
// ============================================================

/**
 * Creates a 54-card deck: the standard 52 cards plus 2 extra red 10s
 * (an additional 10♥ and 10♦), giving 4 red 10s (value 0) in total.
 * Cards are returned in a deterministic order (not shuffled).
 */
export function initializeDeck(): Card[] {
  const deck: Card[] = [];
  let cardIndex = 0;

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `card-${cardIndex++}`,
        suit,
        rank,
        value: getCardValue(suit, rank),
        isRed: RED_SUITS.has(suit),
      });
    }
  }

  // Add 2 extra red 10s (one extra 10♥ and one extra 10♦) — value 0 each
  for (const suit of ['♥', '♦'] as Suit[]) {
    deck.push({
      id: `card-${cardIndex++}`,
      suit,
      rank: '10',
      value: 0,
      isRed: true,
    });
  }

  return deck;
}

// ============================================================
// F-023: Shuffle Deck (Fisher-Yates)
// ============================================================

/**
 * Shuffles an array of cards in place using the Fisher-Yates algorithm
 * with a cryptographically secure random number generator (Node.js crypto.randomInt).
 * Returns the same array reference (mutated).
 */
export function shuffleDeck(cards: Card[]): Card[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// ============================================================
// F-024: Draw from Deck
// ============================================================

/**
 * Removes and returns the top card from the deck (index 0).
 * If the deck is empty, triggers reshuffleDiscard first.
 * Returns null only if both deck and discard are empty (should not happen in practice).
 */
export function drawFromDeck(gameState: GameState): Card | null {
  if (gameState.deck.length === 0) {
    reshuffleDiscard(gameState);
  }

  if (gameState.deck.length === 0) {
    // Both deck and discard are empty — theoretically impossible in a real game
    return null;
  }

  return gameState.deck.shift()!;
}

// ============================================================
// F-025: Draw from Discard
// ============================================================

/**
 * Takes and returns the top card from the discard pile (last element).
 * Returns null if the discard pile is empty.
 */
export function drawFromDiscard(gameState: GameState): Card | null {
  if (gameState.discardPile.length === 0) {
    return null;
  }

  return gameState.discardPile.pop()!;
}

// ============================================================
// F-026: Add to Discard Pile
// ============================================================

/**
 * Adds a card to the top of the discard pile (push to end).
 */
export function addToDiscard(gameState: GameState, card: Card): void {
  gameState.discardPile.push(card);
}

// ============================================================
// F-027: Reshuffle Discard into Deck
// ============================================================

/**
 * When the draw pile is empty:
 * 1. Keep the top card of the discard pile (last element) in place.
 * 2. Take all other discard cards and shuffle them into a new draw pile.
 *
 * If the discard pile has 0 or 1 cards, there is nothing to reshuffle.
 */
export function reshuffleDiscard(gameState: GameState): void {
  if (gameState.discardPile.length <= 1) {
    return;
  }

  // Pop the top card (last element) to keep it
  const topCard = gameState.discardPile.pop()!;

  // Move remaining discard cards to deck
  gameState.deck = [...gameState.discardPile];

  // Reset discard pile with only the top card
  gameState.discardPile = [topCard];

  // Shuffle the new deck
  shuffleDeck(gameState.deck);
}

// ============================================================
// Utility: Create a shuffled deck (convenience)
// ============================================================

/**
 * Creates and returns a shuffled 54-card deck.
 * Convenience wrapper around initializeDeck + shuffleDeck.
 */
export function createShuffledDeck(): Card[] {
  return shuffleDeck(initializeDeck());
}

// ============================================================
// Debug Deck — 20-card deck for development/testing
// ============================================================

/**
 * Creates a compact 20-card debug deck that:
 * - Covers every card rank at least once
 * - Includes ONLY red face cards (J♥, J♦, Q♥, Q♦, K♥, K♦) as action cards
 * - Contains no black Jacks, Queens, or Kings
 *
 * Used when process.env.DEBUG_DECK === 'true' to speed up testing of
 * special effects without wading through a full 54-card deck.
 */
export function createDebugDeck(): Card[] {
  const cards: Array<[Suit, Rank]> = [
    // Number cards — one of each rank, mixed suits
    ['♥', 'A'],
    ['♦', '2'],
    ['♠', '3'],
    ['♣', '4'],
    ['♥', '5'],
    ['♦', '6'],
    ['♠', '7'],
    ['♣', '8'],
    ['♥', '9'],
    ['♦', '10'], // red 10 = 0 pts
    ['♠', '10'], // black 10 = 10 pts
    // Extra number cards for hand variety
    ['♣', 'A'],
    ['♥', '2'],
    ['♦', '5'],
    // Red face cards ONLY (trigger special effects)
    ['♥', 'J'],
    ['♦', 'J'],
    ['♥', 'Q'],
    ['♦', 'Q'],
    ['♥', 'K'],
    ['♦', 'K'],
  ];

  let cardIndex = 0;
  const deck: Card[] = cards.map(([suit, rank]) => ({
    id: `debug-card-${cardIndex++}`,
    suit,
    rank,
    value: getCardValue(suit, rank),
    isRed: RED_SUITS.has(suit),
  }));

  return shuffleDeck(deck);
}

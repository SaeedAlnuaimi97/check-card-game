import {
  BotDifficulty,
  ClientGameState,
  ClientPlayerState,
  GameState,
  HandSlot,
  PeekedCard,
  PlayerState,
  SlotLabel,
} from '../types/game.types';
import { createShuffledDeck, createDebugDeck, drawFromDeck } from './Deck';

// ============================================================
// Constants
// ============================================================

const INITIAL_SLOTS: SlotLabel[] = ['A', 'B', 'C', 'D'];
const CARDS_PER_PLAYER = 4;

// ============================================================
// F-028: Deal Cards
// ============================================================

/**
 * Deals CARDS_PER_PLAYER cards from the deck to each player into slots A-D.
 * Mutates the gameState.deck (cards are removed) and each player's hand.
 */
export function dealCards(gameState: GameState): void {
  for (const player of gameState.players) {
    player.hand = [];
    for (let i = 0; i < CARDS_PER_PLAYER; i++) {
      const card = drawFromDeck(gameState);
      if (!card) {
        throw new Error('Not enough cards in deck to deal');
      }
      player.hand.push({
        slot: INITIAL_SLOTS[i],
        card,
      });
    }
  }
}

// ============================================================
// F-029: Select Initial Peek Slots
// ============================================================

const PEEK_SLOTS: SlotLabel[] = ['C', 'D'];

/**
 * Returns the fixed peek slots (C and D) for the initial peek phase.
 * Players always peek at their bottom two cards.
 */
export function selectInitialPeekSlots(_player: PlayerState): SlotLabel[] {
  return [...PEEK_SLOTS];
}

/**
 * Returns the peeked card data for a player based on their peekedSlots.
 */
export function getPeekedCards(player: PlayerState): PeekedCard[] {
  return player.peekedSlots
    .map((slot) => {
      const handSlot = player.hand.find((h) => h.slot === slot);
      if (!handSlot) return null;
      return { slot, card: handSlot.card };
    })
    .filter((pc): pc is PeekedCard => pc !== null);
}

// ============================================================
// F-032: Random First Player Selection
// ============================================================

/**
 * Selects a random starting player index.
 */
export function selectFirstPlayer(playerCount: number): number {
  return Math.floor(Math.random() * playerCount);
}

// ============================================================
// Initialize Full Game State (F-028, F-029, F-032 combined)
// ============================================================

/**
 * Creates a complete initial GameState for a new round.
 *
 * 1. Creates and shuffles a 52-card deck.
 * 2. Creates PlayerState entries for each player.
 * 3. Deals 4 cards to each player (slots A-D).
 * 4. Flips one card to start the discard pile.
 * 5. Selects 2 random peek slots per player.
 * 6. Chooses a random first player.
 * 7. Sets phase to 'peeking'.
 *
 * @param players Array of { id, username } from the room.
 * @param existingScores Optional scores carried over from previous rounds.
 * @param roundNumber The current round number (default 1).
 * @param targetScore Custom score threshold for game end (default 70, F-310).
 */
export function initializeGameState(
  players: { id: string; username: string; isBot?: boolean; botDifficulty?: BotDifficulty }[],
  existingScores?: Record<string, number>,
  roundNumber = 1,
  targetScore = 70,
): GameState {
  const deck = process.env.DEBUG_DECK === 'true' ? createDebugDeck() : createShuffledDeck();

  // Build initial scores map
  const scores: Record<string, number> = {};
  for (const p of players) {
    scores[p.id] = existingScores?.[p.id] ?? 0;
  }

  // Create player states
  const playerStates: PlayerState[] = players.map((p) => ({
    playerId: p.id,
    username: p.username,
    hand: [],
    peekedSlots: [],
    totalScore: scores[p.id],
    ...(p.isBot ? { isBot: true, botDifficulty: p.botDifficulty ?? 'easy' } : {}),
  }));

  const gameState: GameState = {
    deck,
    discardPile: [],
    players: playerStates,
    currentTurnIndex: 0,
    checkCalledBy: null,
    checkCalledAtIndex: null,
    roundNumber,
    scores,
    phase: 'dealing',
    drawnCard: null,
    drawnByPlayerId: null,
    drawnSource: null,
    pendingEffect: null,
    turnStartedAt: null,
    gameStartedAt: roundNumber === 1 ? new Date().toISOString() : null,
    paused: false,
    pausedBy: null,
    pausedAt: null,
    turnTimeRemainingMs: null,
    targetScore,
  };

  // Deal 4 cards to each player (F-028)
  dealCards(gameState);

  // Flip top card of deck to start discard pile
  const firstDiscard = drawFromDeck(gameState);
  if (firstDiscard) {
    gameState.discardPile.push(firstDiscard);
  }

  // Select peek slots for each player (F-029)
  for (const player of gameState.players) {
    player.peekedSlots = selectInitialPeekSlots(player);
  }

  // Select random first player (F-032)
  gameState.currentTurnIndex = selectFirstPlayer(gameState.players.length);

  // Set phase to peeking
  gameState.phase = 'peeking';

  return gameState;
}

// ============================================================
// F-364: Add Player to Active Game (Mid-Game Join)
// ============================================================

/**
 * Adds a new player to an active game. The new player:
 * 1. Is dealt 4 cards (slots A-D) from the current deck.
 * 2. Receives the highest current score among existing players.
 * 3. Gets peek slots C and D (same as initial game setup).
 * 4. Is appended to the end of the players array (doesn't disrupt turn order).
 *
 * Mutates the gameState in place.
 *
 * @returns The newly created PlayerState, or null if cards couldn't be dealt.
 */
export function addPlayerToActiveGame(
  gameState: GameState,
  playerInfo: {
    id: string;
    username: string;
    isBot?: boolean;
    botDifficulty?: BotDifficulty;
  },
): PlayerState | null {
  // Compute the highest current score among existing players
  const highestScore = Math.max(0, ...Object.values(gameState.scores));

  // Create the new player state
  const newPlayer: PlayerState = {
    playerId: playerInfo.id,
    username: playerInfo.username,
    hand: [],
    peekedSlots: [],
    totalScore: highestScore,
    ...(playerInfo.isBot ? { isBot: true, botDifficulty: playerInfo.botDifficulty ?? 'easy' } : {}),
  };

  // Deal 4 cards to the new player
  for (let i = 0; i < CARDS_PER_PLAYER; i++) {
    const card = drawFromDeck(gameState);
    if (!card) {
      // Not enough cards — cannot add player
      return null;
    }
    newPlayer.hand.push({
      slot: INITIAL_SLOTS[i],
      card,
    });
  }

  // Set peek slots (same as initial game setup)
  newPlayer.peekedSlots = selectInitialPeekSlots(newPlayer);

  // Add the player to the game state
  gameState.players.push(newPlayer);
  gameState.scores[playerInfo.id] = highestScore;

  return newPlayer;
}

// ============================================================
// Sanitize Game State for Client (F-014, F-015, F-030)
// ============================================================

/**
 * Creates a sanitized ClientGameState for a specific player.
 * - The requesting player can see their own cards.
 * - All other players' cards are null (hidden).
 */
export function sanitizeGameState(gameState: GameState, _forPlayerId: string): ClientGameState {
  const players: ClientPlayerState[] = gameState.players.map((p) => {
    return {
      playerId: p.playerId,
      username: p.username,
      hand: p.hand.map((h: HandSlot) => ({
        slot: h.slot,
        card: null, // All cards are face-down; visibility is handled via peek/reveal events
      })),
      cardCount: p.hand.length,
      totalScore: p.totalScore,
      isBot: p.isBot || undefined,
    };
  });

  return {
    deckCount: gameState.deck.length,
    discardPile: gameState.discardPile,
    players,
    currentTurnIndex: gameState.currentTurnIndex,
    checkCalledBy: gameState.checkCalledBy,
    roundNumber: gameState.roundNumber,
    scores: { ...gameState.scores },
    phase: gameState.phase,
    turnStartedAt: gameState.turnStartedAt,
    paused: gameState.paused,
    pausedBy: gameState.pausedBy,
    targetScore: gameState.targetScore,
  };
}

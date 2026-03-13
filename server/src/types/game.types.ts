// ============================================================
// Card Types (F-010)
// ============================================================

export type Suit = '\u2665' | '\u2666' | '\u2660' | '\u2663';

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;
  isRed: boolean;
  /** True when this card was successfully burned and placed on the discard pile.
   *  Burned cards on the discard pile cannot be picked up via takeDiscard. */
  isBurned?: boolean;
}

// ============================================================
// Hand Slot Types
// ============================================================

/** Slot labels for player's hand. A-D are initial, E+ are penalty cards. */
export type SlotLabel = string;

export interface HandSlot {
  slot: SlotLabel;
  card: Card;
}

// ============================================================
// Player State (F-011)
// ============================================================

export interface PlayerState {
  playerId: string;
  username: string;
  hand: HandSlot[];
  peekedSlots: SlotLabel[];
  totalScore: number;
}

// ============================================================
// Game State (F-012)
// ============================================================

export type GamePhase = 'dealing' | 'peeking' | 'playing' | 'roundEnd' | 'gameEnd';

export interface PendingEffect {
  type: SpecialEffectType;
  playerId: string;
  card: Card;
  /** For Red King: the 2 cards drawn from deck */
  redKingCards?: [Card, Card];
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: PlayerState[];
  currentTurnIndex: number;
  checkCalledBy: string | null;
  checkCalledAtIndex: number | null;
  roundNumber: number;
  scores: Record<string, number>;
  phase: GamePhase;
  /** Card drawn/taken, pending discard/swap choice (F-037, F-041) */
  drawnCard: Card | null;
  /** Player who drew/took the card (F-037, F-041) */
  drawnByPlayerId: string | null;
  /** Where the pending card came from — determines swap rules and special effects (F-041) */
  drawnSource: 'deck' | 'discard' | null;
  /** Pending special effect awaiting player resolution (F-054) */
  pendingEffect: PendingEffect | null;
}

// ============================================================
// Room Types (F-013)
// ============================================================

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  id: string;
  username: string;
}

export interface Room {
  roomCode: string;
  host: string;
  players: RoomPlayer[];
  gameState: GameState | null;
  status: RoomStatus;
  createdAt: Date;
}

// ============================================================
// Client-Facing Types (F-014, F-015)
// ============================================================

/** A hand slot as seen by a client. Card is null if it belongs to another player. */
export interface ClientHandSlot {
  slot: SlotLabel;
  card: Card | null;
}

/** Sanitized player state sent to clients (F-015). */
export interface ClientPlayerState {
  playerId: string;
  username: string;
  hand: ClientHandSlot[];
  cardCount: number;
  totalScore: number;
}

/** Sanitized game state sent to clients (F-014). */
export interface ClientGameState {
  deckCount: number;
  discardPile: Card[];
  players: ClientPlayerState[];
  currentTurnIndex: number;
  checkCalledBy: string | null;
  roundNumber: number;
  scores: Record<string, number>;
  phase: GamePhase;
}

// ============================================================
// Action Types (used by socket events)
// ============================================================

export type ActionType = 'drawDeck' | 'takeDiscard' | 'burn';

export interface PlayerAction {
  type: ActionType;
  discardSlot?: SlotLabel;
  burnSlot?: SlotLabel;
}

export interface RedKingChoice {
  keepIndices: number[];
  discardSlots: SlotLabel[];
}

// ============================================================
// Socket Event Payloads
// ============================================================

export interface PeekedCard {
  slot: SlotLabel;
  card: Card;
}

export type SpecialEffectType = 'redJack' | 'redQueen' | 'redKing';

import type { Card } from './card.types';
import type { ClientPlayerState, SlotLabel } from './player.types';

// ============================================================
// Game Mode Types
// ============================================================

export type GameMode = 'classic' | 'suddenDeath' | 'bountyHunt' | 'blindRounds';

// ============================================================
// Game Phase
// ============================================================

export type GamePhase = 'dealing' | 'peeking' | 'playing' | 'roundEnd' | 'gameEnd';

// ============================================================
// Client Game State (F-014)
// ============================================================

export interface ClientGameState {
  deckCount: number;
  discardPile: Card[];
  players: ClientPlayerState[];
  currentTurnIndex: number;
  checkCalledBy: string | null;
  roundNumber: number;
  scores: Record<string, number>;
  phase: GamePhase;
  /** Timestamp (ms) when the current turn started — used for turn timer */
  turnStartedAt: number | null;
  /** Whether the game is currently paused (F-271) */
  paused: boolean;
  /** Player ID of who triggered the pause (F-271) */
  pausedBy: string | null;
  /** Custom score threshold at which the game ends (F-310). Defaults to 70. */
  targetScore: number;
  /** The game mode for this game session */
  gameMode: GameMode;
  /** Bounty Hunt: the rank that is the bounty target this round */
  bountyRank?: string;
  /** Bounty Hunt: count of successful bounty burns per player this round */
  bountyBurnCounts?: Record<string, number>;
  /** Blind Rounds: true during blind rounds (every 3rd round) */
  isBlindRound?: boolean;
}

// ============================================================
// Room Types
// ============================================================

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  id: string;
  username: string;
  /** True if this slot is a bot player (F-300) */
  isBot?: boolean;
  /** Bot difficulty level (F-301) */
  botDifficulty?: 'easy' | 'expert';
  /** Whether this player is ready in the lobby (bots are always ready) */
  isReady?: boolean;
}

export interface RoomData {
  roomCode: string;
  host: string;
  players: RoomPlayer[];
  status: RoomStatus;
  /** The game mode for this room */
  gameMode: GameMode;
}

// ============================================================
// Action Types
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
// Socket Event Payload Types
// ============================================================

export interface PeekedCard {
  slot: SlotLabel;
  card: Card;
}

export type SpecialEffectType = 'redJack' | 'redQueen' | 'redKing';

// ============================================================
// Burn Result (F-044 to F-048)
// ============================================================

export interface BurnResultPayload {
  playerId: string;
  slot: string;
  burnSuccess: boolean;
  /** Card revealed to all on success */
  burnedCard?: Card;
  /** Penalty slot added on failure */
  penaltySlot?: string;
}

// ============================================================
// Special Effect Payloads (F-049 to F-054)
// ============================================================

export interface WaitingForSpecialEffectPayload {
  playerId: string;
  effect: SpecialEffectType;
  card: Card;
  redKingCards?: [Card, Card];
  /** Snapshot of turnStartedAt at the moment the effect was triggered (client-side enrichment) */
  turnStartedAt?: number;
}

export interface SpecialEffectResolvedPayload {
  effect: SpecialEffectType;
  playerId: string;
  skipped?: boolean;
  cardsKept?: number;
  discardedCards?: Card[];
  // Red Jack swap details (included when not skipped)
  swapperSlot?: string;
  swapperUsername?: string;
  targetPlayerId?: string;
  targetSlot?: string;
  targetUsername?: string;
}

// ============================================================
// Check & Scoring Payloads (F-055 to F-076)
// ============================================================

export interface CheckCalledPayload {
  playerId: string;
  username: string;
}

export interface PlayerRoundResult {
  playerId: string;
  username: string;
  cards: Card[];
  slots: string[];
  handSum: number;
}

export interface RoundEndedPayload {
  roundNumber: number;
  checkCalledBy: string | null;
  allHands: PlayerRoundResult[];
  roundWinners: string[];
  /** True if the checker's hand sum was doubled (checker was not the lowest) */
  checkerDoubled: boolean;
  updatedScores: Record<string, number>;
  gameEnded: boolean;
  nextRoundStarting: boolean;
}

export interface GameEndedPayload {
  finalScores: Record<string, number>;
  winner: {
    playerId: string;
    username: string;
    score: number;
  };
  loser: {
    playerId: string;
    username: string;
    score: number;
  };
  allHands: PlayerRoundResult[];
}

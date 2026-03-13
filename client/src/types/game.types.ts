import type { Card } from './card.types';
import type { ClientPlayerState, SlotLabel } from './player.types';

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
}

// ============================================================
// Room Types
// ============================================================

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomPlayer {
  id: string;
  username: string;
}

export interface RoomData {
  roomCode: string;
  host: string;
  players: RoomPlayer[];
  status: RoomStatus;
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
}

export interface SpecialEffectResolvedPayload {
  effect: SpecialEffectType;
  playerId: string;
  skipped?: boolean;
  cardsKept?: number;
  discardedCards?: Card[];
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
  checkCalledBy: string;
  allHands: PlayerRoundResult[];
  roundWinners: string[];
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

import type { Card } from './card.types';

// ============================================================
// Hand Slot Types
// ============================================================

export type SlotLabel = string;

/** A hand slot as seen by a client. Card is null if it belongs to another player. */
export interface ClientHandSlot {
  slot: SlotLabel;
  card: Card | null;
}

// ============================================================
// Client Player State (F-015)
// ============================================================

export interface ClientPlayerState {
  playerId: string;
  username: string;
  hand: ClientHandSlot[];
  cardCount: number;
  totalScore: number;
  /** True if this player is a bot */
  isBot?: boolean;
  /** Free Burn power-up available this round */
  hasFreeBurn?: boolean;
}

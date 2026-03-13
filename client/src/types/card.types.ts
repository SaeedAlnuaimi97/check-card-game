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
  /** True when this card was successfully burned — cannot be picked up from discard. */
  isBurned?: boolean;
}

import type { Card, GameState } from '../types/game.types';

// ============================================================
// Hand Value Calculation (F-065)
// ============================================================

/**
 * Calculates the sum of card point values in a player's hand.
 * If hand is empty (all cards burned), returns 0 (F-058).
 */
export function calculateHandValue(hand: { card: Card }[]): number {
  return hand.reduce((sum, slot) => sum + slot.card.value, 0);
}

// ============================================================
// Round Scoring (F-065 to F-070)
// ============================================================

export interface PlayerRoundResult {
  playerId: string;
  username: string;
  cards: Card[];
  slots: string[];
  handSum: number;
}

export interface RoundResult {
  roundNumber: number;
  checkCalledBy: string;
  allHands: PlayerRoundResult[];
  /** PlayerIds of the round winner(s) — lowest sum scores 0 */
  roundWinners: string[];
  /** Updated cumulative scores after this round */
  updatedScores: Record<string, number>;
  /** True if any player hit 100+ and the game should end */
  gameEnded: boolean;
}

/**
 * Computes the round results: reveals all hands, determines winner(s),
 * and updates cumulative scores.
 *
 * Rules (F-066 to F-068):
 * - Lowest hand sum wins the round and scores 0.
 * - Tied lowest → all tied players score 0.
 * - Non-winners add their hand sum to their total score.
 *
 * Mutates gameState: updates scores, player totalScore, and phase.
 */
export function computeRoundResult(gameState: GameState): RoundResult {
  // Build per-player results
  const allHands: PlayerRoundResult[] = gameState.players.map((player) => ({
    playerId: player.playerId,
    username: player.username,
    cards: player.hand.map((h) => h.card),
    slots: player.hand.map((h) => h.slot),
    handSum: calculateHandValue(player.hand),
  }));

  // Find the minimum hand sum (F-066)
  const minSum = Math.min(...allHands.map((h) => h.handSum));

  // Determine winners — all players tied at minSum (F-067)
  const roundWinners = allHands.filter((h) => h.handSum === minSum).map((h) => h.playerId);

  // Update scores (F-068)
  const updatedScores: Record<string, number> = { ...gameState.scores };
  for (const hand of allHands) {
    if (roundWinners.includes(hand.playerId)) {
      // Winner scores 0 for this round — ensure key exists
      if (updatedScores[hand.playerId] === undefined) {
        updatedScores[hand.playerId] = 0;
      }
    } else {
      updatedScores[hand.playerId] = (updatedScores[hand.playerId] ?? 0) + hand.handSum;
    }
  }

  // Apply scores to game state
  gameState.scores = updatedScores;
  for (const player of gameState.players) {
    player.totalScore = updatedScores[player.playerId] ?? 0;
  }

  // Check if game should end (F-071)
  const gameEnded = Object.values(updatedScores).some((score) => score >= 100);

  // Set phase
  gameState.phase = gameEnded ? 'gameEnd' : 'roundEnd';

  return {
    roundNumber: gameState.roundNumber,
    checkCalledBy: gameState.checkCalledBy!,
    allHands,
    roundWinners,
    updatedScores,
    gameEnded,
  };
}

// ============================================================
// Game End Results (F-071 to F-075)
// ============================================================

export interface GameEndResult {
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

/**
 * Determines the game winner and loser.
 *
 * Rules:
 * - F-071: Game ends when any player reaches 100+ total points.
 * - F-072: Player with 100+ loses.
 * - F-073: Multiple at 100+ → highest score loses; tied → all tied lose.
 * - F-074: Winner = player with lowest total score.
 */
export function computeGameEndResult(
  gameState: GameState,
  allHands: PlayerRoundResult[],
): GameEndResult {
  const scores = gameState.scores;

  // Find the loser(s) — highest score among those at 100+ (F-072, F-073)
  const maxScore = Math.max(...Object.values(scores));
  const losers = gameState.players.filter((p) => scores[p.playerId] === maxScore);
  const loser = losers[0]; // If multiple tied, pick first (all tied lose per rules)

  // Find the winner — lowest total score (F-074)
  const minScore = Math.min(...Object.values(scores));
  const winners = gameState.players.filter((p) => scores[p.playerId] === minScore);
  const winner = winners[0];

  return {
    finalScores: { ...scores },
    winner: {
      playerId: winner.playerId,
      username: winner.username,
      score: scores[winner.playerId],
    },
    loser: {
      playerId: loser.playerId,
      username: loser.username,
      score: scores[loser.playerId],
    },
    allHands,
  };
}

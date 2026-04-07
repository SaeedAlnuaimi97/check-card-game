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
  checkCalledBy: string | null;
  allHands: PlayerRoundResult[];
  /** PlayerIds of the round winner(s) — lowest sum scores 0 */
  roundWinners: string[];
  /** True if the checker's hand sum was doubled (checker was not the lowest) */
  checkerDoubled: boolean;
  /** Updated cumulative scores after this round */
  updatedScores: Record<string, number>;
  /** True if any player hit 100+ and the game should end */
  gameEnded: boolean;
}

/**
 * Computes the round results: reveals all hands, determines winner(s),
 * and updates cumulative scores.
 *
 * Scoring rules:
 * - The player(s) with the lowest hand sum score 0 for the round (ties = all get 0).
 * - If the checker has the lowest (or tied lowest) sum: checker scores 0.
 * - If the checker does NOT have the lowest sum: checker's hand sum is DOUBLED.
 * - All other non-lowest players add their hand sum to their total score.
 *
 * Mutates gameState: updates scores, player totalScore, and phase.
 */
export function computeRoundResult(gameState: GameState): RoundResult {
  const isBountyHunt = gameState.gameMode === 'bountyHunt';
  const bountyRank = gameState.bountyRank;

  // Build per-player results
  const allHands: PlayerRoundResult[] = gameState.players.map((player) => {
    let handSum = calculateHandValue(player.hand);

    // Bounty Hunt: double the value of cards matching the bounty rank
    if (isBountyHunt && bountyRank) {
      for (const h of player.hand) {
        if (h.card.rank === bountyRank) {
          handSum += h.card.value; // add value again to effectively double it
        }
      }
    }

    // Bounty Hunt: subtract burn bonuses (-5 per successful bounty burn, floor 0)
    if (isBountyHunt && gameState.bountyBurnCounts) {
      const burnCount = gameState.bountyBurnCounts[player.playerId] ?? 0;
      handSum = Math.max(0, handSum - burnCount * 5);
    }

    return {
      playerId: player.playerId,
      username: player.username,
      cards: player.hand.map((h) => h.card),
      slots: player.hand.map((h) => h.slot),
      handSum,
    };
  });

  // Find the minimum hand sum
  const minSum = Math.min(...allHands.map((h) => h.handSum));

  // Determine winners — all players tied at minSum
  const roundWinners = allHands.filter((h) => h.handSum === minSum).map((h) => h.playerId);

  const checkerId = gameState.checkCalledBy ?? null;
  const checkerIsWinner = checkerId ? roundWinners.includes(checkerId) : true;

  // Sudden Death: no checker doubling
  const isSuddenDeath = gameState.gameMode === 'suddenDeath';

  // Update scores
  const updatedScores: Record<string, number> = { ...gameState.scores };
  for (const hand of allHands) {
    if (roundWinners.includes(hand.playerId)) {
      // Lowest sum scores 0 for this round — ensure key exists
      if (updatedScores[hand.playerId] === undefined) {
        updatedScores[hand.playerId] = 0;
      }
    } else if (!isSuddenDeath && checkerId && hand.playerId === checkerId && !checkerIsWinner) {
      // Checker is NOT the lowest — double their hand sum (not in Sudden Death)
      updatedScores[hand.playerId] = (updatedScores[hand.playerId] ?? 0) + hand.handSum * 2;
    } else {
      updatedScores[hand.playerId] = (updatedScores[hand.playerId] ?? 0) + hand.handSum;
    }
  }

  // Apply scores to game state
  gameState.scores = updatedScores;
  for (const player of gameState.players) {
    player.totalScore = updatedScores[player.playerId] ?? 0;
  }

  // Check if game should end (F-071, F-310) — threshold is configurable (default 70, JSDoc says "100+" but actual default is targetScore)
  // Sudden Death: always ends after 1 round
  const GAME_END_THRESHOLD = gameState.targetScore ?? 70;
  const gameEnded =
    isSuddenDeath || Object.values(updatedScores).some((score) => score >= GAME_END_THRESHOLD);

  // Set phase
  gameState.phase = gameEnded ? 'gameEnd' : 'roundEnd';

  return {
    roundNumber: gameState.roundNumber,
    checkCalledBy: checkerId,
    allHands,
    roundWinners,
    checkerDoubled: !isSuddenDeath && checkerId ? !checkerIsWinner : false,
    updatedScores,
    gameEnded,
  };
}

// ============================================================
// Game End Results (F-071 to F-075)
// ============================================================

export interface GameEndResult {
  finalScores: Record<string, number>;
  /** Primary winner (lowest score) — kept for backward compat with client */
  winner: {
    playerId: string;
    username: string;
    score: number;
  };
  /** Primary loser (highest score) — kept for backward compat with client */
  loser: {
    playerId: string;
    username: string;
    score: number;
  };
  /** All players tied at the lowest score (full list for 6–10 player games) */
  winners: { playerId: string; username: string; score: number }[];
  /** All players tied at the highest score (full list for 6–10 player games) */
  losers: { playerId: string; username: string; score: number }[];
  allHands: PlayerRoundResult[];
}

/**
 * Determines the game winner(s) and loser(s).
 *
 * Rules:
 * - F-071: Game ends when any player reaches targetScore (default 70) total points.
 * - F-072: Player with the highest score loses.
 * - F-073: Multiple at max score → all tied players lose.
 * - F-074: Winner = player(s) with lowest total score.
 */
export function computeGameEndResult(
  gameState: GameState,
  allHands: PlayerRoundResult[],
): GameEndResult {
  const scores = gameState.scores;

  if (gameState.players.length === 0) {
    // Defensive: should never happen, but guard against TypeError
    return {
      finalScores: { ...scores },
      winner: { playerId: '', username: 'Unknown', score: 0 },
      loser: { playerId: '', username: 'Unknown', score: 0 },
      winners: [],
      losers: [],
      allHands,
    };
  }

  // Find the loser(s) — highest score among those at 100+ (F-072, F-073)
  const maxScore = Math.max(...Object.values(scores));
  const loserPlayers = gameState.players.filter((p) => scores[p.playerId] === maxScore);
  const loser = loserPlayers[0]; // primary loser for backward compat

  // Find the winner(s) — lowest total score (F-074)
  const minScore = Math.min(...Object.values(scores));
  const winnerPlayers = gameState.players.filter((p) => scores[p.playerId] === minScore);
  const winner = winnerPlayers[0]; // primary winner for backward compat

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
    winners: winnerPlayers.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      score: scores[p.playerId],
    })),
    losers: loserPlayers.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      score: scores[p.playerId],
    })),
    allHands,
  };
}

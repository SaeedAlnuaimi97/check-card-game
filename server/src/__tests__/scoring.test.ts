import { describe, it, expect } from 'vitest';
import { calculateHandValue, computeRoundResult, computeGameEndResult } from '../game/Scoring';
import { initializeGameState } from '../game/GameSetup';
import type { Card, GameState, HandSlot } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function makeCard(rank: Card['rank'], suit: Card['suit'], value: number): Card {
  return { id: `${rank}-${suit}`, suit, rank, value, isRed: suit === '♥' || suit === '♦' };
}

function createPlayingGameState(playerCount = 2): GameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    username: `Player${i + 1}`,
  }));
  const gs = initializeGameState(players);
  gs.phase = 'playing';
  return gs;
}

/**
 * Sets a player's hand to specific cards for deterministic scoring tests.
 */
function setPlayerHand(gs: GameState, playerIndex: number, cards: Card[]): void {
  gs.players[playerIndex].hand = cards.map((card, i) => ({
    slot: String.fromCharCode(65 + i) as string, // A, B, C, D, ...
    card,
  }));
}

// ============================================================
// calculateHandValue (F-065)
// ============================================================

describe('calculateHandValue', () => {
  it('sums values of all cards in hand', () => {
    const hand: HandSlot[] = [
      { slot: 'A', card: makeCard('5', '♥', 5) },
      { slot: 'B', card: makeCard('3', '♠', 3) },
      { slot: 'C', card: makeCard('7', '♦', 7) },
      { slot: 'D', card: makeCard('A', '♣', 1) },
    ];
    expect(calculateHandValue(hand)).toBe(16);
  });

  it('returns 0 for an empty hand (all cards burned)', () => {
    expect(calculateHandValue([])).toBe(0);
  });

  it('handles single card hand', () => {
    const hand: HandSlot[] = [{ slot: 'A', card: makeCard('K', '♠', 10) }];
    expect(calculateHandValue(hand)).toBe(10);
  });

  it('handles red 10 (value 0)', () => {
    const hand: HandSlot[] = [
      { slot: 'A', card: makeCard('10', '♥', 0) },
      { slot: 'B', card: makeCard('10', '♦', 0) },
      { slot: 'C', card: makeCard('A', '♠', 1) },
      { slot: 'D', card: makeCard('2', '♣', 2) },
    ];
    expect(calculateHandValue(hand)).toBe(3);
  });

  it('handles all aces (value 1 each)', () => {
    const hand: HandSlot[] = [
      { slot: 'A', card: makeCard('A', '♥', 1) },
      { slot: 'B', card: makeCard('A', '♦', 1) },
      { slot: 'C', card: makeCard('A', '♠', 1) },
      { slot: 'D', card: makeCard('A', '♣', 1) },
    ];
    expect(calculateHandValue(hand)).toBe(4);
  });

  it('handles high value cards (all black 10s and face cards)', () => {
    const hand: HandSlot[] = [
      { slot: 'A', card: makeCard('10', '♠', 10) },
      { slot: 'B', card: makeCard('J', '♣', 10) },
      { slot: 'C', card: makeCard('Q', '♠', 10) },
      { slot: 'D', card: makeCard('K', '♣', 10) },
    ];
    expect(calculateHandValue(hand)).toBe(40);
  });

  it('handles hand with penalty slots (more than 4 cards)', () => {
    const hand: HandSlot[] = [
      { slot: 'A', card: makeCard('5', '♥', 5) },
      { slot: 'B', card: makeCard('3', '♠', 3) },
      { slot: 'C', card: makeCard('7', '♦', 7) },
      { slot: 'D', card: makeCard('A', '♣', 1) },
      { slot: 'E', card: makeCard('K', '♠', 10) },
    ];
    expect(calculateHandValue(hand)).toBe(26);
  });
});

// ============================================================
// computeRoundResult (F-065 to F-070)
// ============================================================

describe('computeRoundResult', () => {
  it('determines the round winner (lowest hand sum)', () => {
    const gs = createPlayingGameState(3);
    gs.checkCalledBy = gs.players[0].playerId;

    // Player 0: sum = 4
    setPlayerHand(gs, 0, [
      makeCard('A', '♥', 1),
      makeCard('A', '♦', 1),
      makeCard('A', '♠', 1),
      makeCard('A', '♣', 1),
    ]);
    // Player 1: sum = 20
    setPlayerHand(gs, 1, [
      makeCard('5', '♥', 5),
      makeCard('5', '♦', 5),
      makeCard('5', '♠', 5),
      makeCard('5', '♣', 5),
    ]);
    // Player 2: sum = 10
    setPlayerHand(gs, 2, [
      makeCard('2', '♥', 2),
      makeCard('3', '♦', 3),
      makeCard('2', '♠', 2),
      makeCard('3', '♣', 3),
    ]);

    const result = computeRoundResult(gs);

    expect(result.roundWinners).toEqual([gs.players[0].playerId]);
    expect(result.allHands).toHaveLength(3);
    expect(result.allHands[0].handSum).toBe(4);
    expect(result.allHands[1].handSum).toBe(20);
    expect(result.allHands[2].handSum).toBe(10);
  });

  it('winner scores 0, losers add their hand sum', () => {
    const gs = createPlayingGameState(3);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 10,
      [gs.players[1].playerId]: 20,
      [gs.players[2].playerId]: 15,
    };

    // Player 0: lowest (winner) — sum = 2
    setPlayerHand(gs, 0, [makeCard('A', '♥', 1), makeCard('A', '♦', 1)]);
    // Player 1: sum = 10
    setPlayerHand(gs, 1, [makeCard('5', '♥', 5), makeCard('5', '♦', 5)]);
    // Player 2: sum = 6
    setPlayerHand(gs, 2, [makeCard('3', '♥', 3), makeCard('3', '♦', 3)]);

    const result = computeRoundResult(gs);

    // Winner (p1) keeps previous score (10 + 0 = 10)
    expect(result.updatedScores[gs.players[0].playerId]).toBe(10);
    // Losers add hand sum
    expect(result.updatedScores[gs.players[1].playerId]).toBe(30); // 20 + 10
    expect(result.updatedScores[gs.players[2].playerId]).toBe(21); // 15 + 6
  });

  it('handles ties — all tied players score 0 (F-067)', () => {
    const gs = createPlayingGameState(3);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 0,
      [gs.players[1].playerId]: 0,
      [gs.players[2].playerId]: 0,
    };

    // Player 0 and Player 1 tied at 4 (both win)
    setPlayerHand(gs, 0, [makeCard('2', '♥', 2), makeCard('2', '♦', 2)]);
    setPlayerHand(gs, 1, [makeCard('A', '♥', 1), makeCard('3', '♦', 3)]);
    // Player 2: sum = 10
    setPlayerHand(gs, 2, [makeCard('5', '♥', 5), makeCard('5', '♦', 5)]);

    const result = computeRoundResult(gs);

    expect(result.roundWinners).toContain(gs.players[0].playerId);
    expect(result.roundWinners).toContain(gs.players[1].playerId);
    expect(result.roundWinners).toHaveLength(2);
    expect(result.updatedScores[gs.players[0].playerId]).toBe(0);
    expect(result.updatedScores[gs.players[1].playerId]).toBe(0);
    expect(result.updatedScores[gs.players[2].playerId]).toBe(10);
  });

  it('updates player totalScore on the game state', () => {
    const gs = createPlayingGameState(2);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 5,
      [gs.players[1].playerId]: 10,
    };

    // Player 0 wins with sum = 2, Player 1 has sum = 8
    setPlayerHand(gs, 0, [makeCard('A', '♥', 1), makeCard('A', '♦', 1)]);
    setPlayerHand(gs, 1, [makeCard('4', '♥', 4), makeCard('4', '♦', 4)]);

    computeRoundResult(gs);

    expect(gs.players[0].totalScore).toBe(5); // unchanged (winner)
    expect(gs.players[1].totalScore).toBe(18); // 10 + 8
  });

  it('sets phase to roundEnd when no one reaches 100', () => {
    const gs = createPlayingGameState(2);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 0,
      [gs.players[1].playerId]: 50,
    };

    setPlayerHand(gs, 0, [makeCard('A', '♥', 1)]);
    setPlayerHand(gs, 1, [makeCard('5', '♥', 5)]);

    const result = computeRoundResult(gs);

    expect(result.gameEnded).toBe(false);
    expect(gs.phase).toBe('roundEnd');
  });

  it('sets phase to gameEnd when a player reaches 100+', () => {
    const gs = createPlayingGameState(2);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 0,
      [gs.players[1].playerId]: 90,
    };

    setPlayerHand(gs, 0, [makeCard('A', '♥', 1)]);
    // Player 1 will add 10 → total 100
    setPlayerHand(gs, 1, [makeCard('10', '♠', 10)]);

    const result = computeRoundResult(gs);

    expect(result.gameEnded).toBe(true);
    expect(gs.phase).toBe('gameEnd');
    expect(result.updatedScores[gs.players[1].playerId]).toBe(100);
  });

  it('includes correct round number and checkCalledBy', () => {
    const gs = createPlayingGameState(2);
    gs.roundNumber = 3;
    gs.checkCalledBy = gs.players[1].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 0,
      [gs.players[1].playerId]: 0,
    };

    setPlayerHand(gs, 0, [makeCard('A', '♥', 1)]);
    setPlayerHand(gs, 1, [makeCard('A', '♦', 1)]);

    const result = computeRoundResult(gs);

    expect(result.roundNumber).toBe(3);
    expect(result.checkCalledBy).toBe(gs.players[1].playerId);
  });

  it('reveals all hand cards and slot labels in allHands', () => {
    const gs = createPlayingGameState(2);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 0,
      [gs.players[1].playerId]: 0,
    };

    const card1 = makeCard('5', '♥', 5);
    const card2 = makeCard('3', '♠', 3);
    setPlayerHand(gs, 0, [card1, card2]);
    setPlayerHand(gs, 1, [makeCard('A', '♦', 1)]);

    const result = computeRoundResult(gs);

    expect(result.allHands[0].cards).toEqual([card1, card2]);
    expect(result.allHands[0].slots).toEqual(['A', 'B']);
    expect(result.allHands[0].username).toBe(gs.players[0].username);
  });

  it('handles empty hands (all cards burned) — sum = 0', () => {
    const gs = createPlayingGameState(2);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {
      [gs.players[0].playerId]: 0,
      [gs.players[1].playerId]: 0,
    };

    // Player 0 burned all cards — empty hand
    gs.players[0].hand = [];
    setPlayerHand(gs, 1, [makeCard('5', '♥', 5)]);

    const result = computeRoundResult(gs);

    expect(result.allHands[0].handSum).toBe(0);
    expect(result.roundWinners).toContain(gs.players[0].playerId);
    // Player 1 should add 5 to their score
    expect(result.updatedScores[gs.players[1].playerId]).toBe(5);
  });

  it('initializes scores from 0 for players with no prior score', () => {
    const gs = createPlayingGameState(2);
    gs.checkCalledBy = gs.players[0].playerId;
    gs.scores = {}; // No scores yet

    setPlayerHand(gs, 0, [makeCard('A', '♥', 1)]);
    setPlayerHand(gs, 1, [makeCard('5', '♥', 5)]);

    const result = computeRoundResult(gs);

    // Player 0 wins → stays at 0
    expect(result.updatedScores[gs.players[0].playerId]).toBe(0);
    // Player 1 loses → 0 + 5 = 5
    expect(result.updatedScores[gs.players[1].playerId]).toBe(5);
  });
});

// ============================================================
// computeGameEndResult (F-071 to F-075)
// ============================================================

describe('computeGameEndResult', () => {
  it('determines winner (lowest score) and loser (highest score)', () => {
    const gs = createPlayingGameState(3);
    gs.scores = {
      [gs.players[0].playerId]: 45,
      [gs.players[1].playerId]: 102,
      [gs.players[2].playerId]: 78,
    };

    const allHands = gs.players.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      cards: p.hand.map((h) => h.card),
      slots: p.hand.map((h) => h.slot),
      handSum: calculateHandValue(p.hand),
    }));

    const result = computeGameEndResult(gs, allHands);

    expect(result.winner.playerId).toBe(gs.players[0].playerId);
    expect(result.winner.score).toBe(45);
    expect(result.loser.playerId).toBe(gs.players[1].playerId);
    expect(result.loser.score).toBe(102);
  });

  it('returns finalScores for all players', () => {
    const gs = createPlayingGameState(2);
    gs.scores = {
      [gs.players[0].playerId]: 30,
      [gs.players[1].playerId]: 100,
    };

    const allHands = gs.players.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      cards: [],
      slots: [],
      handSum: 0,
    }));

    const result = computeGameEndResult(gs, allHands);

    expect(result.finalScores[gs.players[0].playerId]).toBe(30);
    expect(result.finalScores[gs.players[1].playerId]).toBe(100);
  });

  it('includes allHands in the result', () => {
    const gs = createPlayingGameState(2);
    gs.scores = {
      [gs.players[0].playerId]: 10,
      [gs.players[1].playerId]: 110,
    };

    const allHands = gs.players.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      cards: p.hand.map((h) => h.card),
      slots: p.hand.map((h) => h.slot),
      handSum: calculateHandValue(p.hand),
    }));

    const result = computeGameEndResult(gs, allHands);

    expect(result.allHands).toBe(allHands);
    expect(result.allHands).toHaveLength(2);
  });

  it('handles multiple players above 100 — highest loses (F-073)', () => {
    const gs = createPlayingGameState(3);
    gs.scores = {
      [gs.players[0].playerId]: 50,
      [gs.players[1].playerId]: 105,
      [gs.players[2].playerId]: 120,
    };

    const allHands = gs.players.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      cards: [],
      slots: [],
      handSum: 0,
    }));

    const result = computeGameEndResult(gs, allHands);

    // Loser is the one with highest score
    expect(result.loser.playerId).toBe(gs.players[2].playerId);
    expect(result.loser.score).toBe(120);
    // Winner is lowest score
    expect(result.winner.playerId).toBe(gs.players[0].playerId);
    expect(result.winner.score).toBe(50);
  });

  it('winner and loser have correct usernames', () => {
    const gs = createPlayingGameState(2);
    gs.scores = {
      [gs.players[0].playerId]: 15,
      [gs.players[1].playerId]: 100,
    };

    const allHands = gs.players.map((p) => ({
      playerId: p.playerId,
      username: p.username,
      cards: [],
      slots: [],
      handSum: 0,
    }));

    const result = computeGameEndResult(gs, allHands);

    expect(result.winner.username).toBe(gs.players[0].username);
    expect(result.loser.username).toBe(gs.players[1].username);
  });
});

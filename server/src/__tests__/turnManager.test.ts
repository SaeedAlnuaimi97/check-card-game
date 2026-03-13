import { describe, it, expect } from 'vitest';
import {
  validatePlayerTurn,
  getAvailableActions,
  advanceTurn,
  isRoundOver,
  transitionFromPeeking,
  getCurrentTurnPlayerId,
  removePlayerFromGame,
  callCheck,
} from '../game/TurnManager';
import { initializeGameState } from '../game/GameSetup';
import type { GameState } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function createPlayingGameState(playerCount = 4): GameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    username: `Player${i + 1}`,
  }));
  const gs = initializeGameState(players);
  gs.phase = 'playing';
  return gs;
}

// ============================================================
// validatePlayerTurn (F-034)
// ============================================================

describe('validatePlayerTurn', () => {
  it("returns null when it is the player's turn", () => {
    const gs = createPlayingGameState();
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;
    expect(validatePlayerTurn(gs, currentPlayerId)).toBeNull();
  });

  it("returns error when it is not the player's turn", () => {
    const gs = createPlayingGameState();
    // Pick a player who is NOT the current turn player
    const otherIndex = (gs.currentTurnIndex + 1) % gs.players.length;
    const otherPlayerId = gs.players[otherIndex].playerId;
    expect(validatePlayerTurn(gs, otherPlayerId)).toBe('It is not your turn');
  });

  it('returns error when game is not in playing phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'peeking';
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;
    expect(validatePlayerTurn(gs, currentPlayerId)).toBe('Game is not in playing phase');
  });

  it('returns error for dealing phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'dealing';
    expect(validatePlayerTurn(gs, gs.players[0].playerId)).toBe('Game is not in playing phase');
  });

  it('returns error for roundEnd phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'roundEnd';
    expect(validatePlayerTurn(gs, gs.players[0].playerId)).toBe('Game is not in playing phase');
  });

  it('returns error for gameEnd phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'gameEnd';
    expect(validatePlayerTurn(gs, gs.players[0].playerId)).toBe('Game is not in playing phase');
  });

  it('returns error for unknown player ID', () => {
    const gs = createPlayingGameState();
    expect(validatePlayerTurn(gs, 'nonexistent')).toBe('It is not your turn');
  });
});

// ============================================================
// getAvailableActions (F-035)
// ============================================================

describe('getAvailableActions', () => {
  it('returns all 3 actions when discard pile is non-empty', () => {
    const gs = createPlayingGameState();
    // initializeGameState already puts one card in the discard pile
    expect(gs.discardPile.length).toBeGreaterThan(0);

    const actions = getAvailableActions(gs);
    expect(actions).toContain('drawDeck');
    expect(actions).toContain('takeDiscard');
    expect(actions).toContain('burn');
    expect(actions).toHaveLength(3);
  });

  it('returns only drawDeck when discard pile is empty', () => {
    const gs = createPlayingGameState();
    gs.discardPile = [];

    const actions = getAvailableActions(gs);
    expect(actions).toEqual(['drawDeck']);
  });

  it('always includes drawDeck', () => {
    const gs = createPlayingGameState();
    gs.discardPile = [];
    expect(getAvailableActions(gs)).toContain('drawDeck');

    gs.discardPile = [gs.deck.pop()!];
    expect(getAvailableActions(gs)).toContain('drawDeck');
  });

  it('excludes takeDiscard when top discard card is burned', () => {
    const gs = createPlayingGameState();
    // Set up a burned card on top of discard pile
    const burnedCard = gs.deck.pop()!;
    burnedCard.isBurned = true;
    gs.discardPile = [burnedCard];

    const actions = getAvailableActions(gs);
    expect(actions).toContain('drawDeck');
    expect(actions).toContain('burn');
    expect(actions).not.toContain('takeDiscard');
    expect(actions).toHaveLength(2);
  });

  it('includes takeDiscard when burned card is NOT on top', () => {
    const gs = createPlayingGameState();
    const burnedCard = gs.deck.pop()!;
    burnedCard.isBurned = true;
    const normalCard = gs.deck.pop()!;
    gs.discardPile = [burnedCard, normalCard]; // normalCard is on top

    const actions = getAvailableActions(gs);
    expect(actions).toContain('takeDiscard');
    expect(actions).toContain('burn');
    expect(actions).toContain('drawDeck');
  });
});

// ============================================================
// advanceTurn (F-033)
// ============================================================

describe('advanceTurn', () => {
  it('advances to the next player', () => {
    const gs = createPlayingGameState();
    gs.currentTurnIndex = 0;

    const nextIndex = advanceTurn(gs);
    expect(nextIndex).toBe(1);
    expect(gs.currentTurnIndex).toBe(1);
  });

  it('wraps around to 0 after the last player', () => {
    const gs = createPlayingGameState(4);
    gs.currentTurnIndex = 3;

    const nextIndex = advanceTurn(gs);
    expect(nextIndex).toBe(0);
    expect(gs.currentTurnIndex).toBe(0);
  });

  it('works with 2 players', () => {
    const gs = createPlayingGameState(2);
    gs.currentTurnIndex = 0;

    advanceTurn(gs);
    expect(gs.currentTurnIndex).toBe(1);

    advanceTurn(gs);
    expect(gs.currentTurnIndex).toBe(0);
  });

  it('handles sequential advances correctly', () => {
    const gs = createPlayingGameState(4);
    gs.currentTurnIndex = 0;

    advanceTurn(gs); // 0 -> 1
    advanceTurn(gs); // 1 -> 2
    advanceTurn(gs); // 2 -> 3
    advanceTurn(gs); // 3 -> 0
    expect(gs.currentTurnIndex).toBe(0);
  });

  it('returns 0 for empty player list', () => {
    const gs = createPlayingGameState();
    gs.players = [];
    expect(advanceTurn(gs)).toBe(0);
  });
});

// ============================================================
// isRoundOver (F-064 prep)
// ============================================================

describe('isRoundOver', () => {
  it('returns false when no one has called check', () => {
    const gs = createPlayingGameState();
    gs.checkCalledBy = null;
    expect(isRoundOver(gs)).toBe(false);
  });

  it('returns true when turn returns to the checker', () => {
    const gs = createPlayingGameState();
    const checkerPlayerId = gs.players[2].playerId;
    gs.checkCalledBy = checkerPlayerId;
    gs.currentTurnIndex = 2; // back to the checker
    expect(isRoundOver(gs)).toBe(true);
  });

  it('returns false when check called but turn is on another player', () => {
    const gs = createPlayingGameState();
    gs.checkCalledBy = gs.players[2].playerId;
    gs.currentTurnIndex = 0; // not the checker
    expect(isRoundOver(gs)).toBe(false);
  });

  it('returns false when check called but turn is on next player', () => {
    const gs = createPlayingGameState();
    gs.checkCalledBy = gs.players[0].playerId;
    gs.currentTurnIndex = 1;
    expect(isRoundOver(gs)).toBe(false);
  });
});

// ============================================================
// transitionFromPeeking
// ============================================================

describe('transitionFromPeeking', () => {
  it('transitions from peeking to playing', () => {
    const gs = createPlayingGameState();
    gs.phase = 'peeking';
    transitionFromPeeking(gs);
    expect(gs.phase).toBe('playing');
  });

  it('does not change phase if already playing', () => {
    const gs = createPlayingGameState();
    gs.phase = 'playing';
    transitionFromPeeking(gs);
    expect(gs.phase).toBe('playing');
  });

  it('does not change phase if in roundEnd', () => {
    const gs = createPlayingGameState();
    gs.phase = 'roundEnd';
    transitionFromPeeking(gs);
    expect(gs.phase).toBe('roundEnd');
  });
});

// ============================================================
// getCurrentTurnPlayerId
// ============================================================

describe('getCurrentTurnPlayerId', () => {
  it('returns the current player ID', () => {
    const gs = createPlayingGameState();
    const expected = gs.players[gs.currentTurnIndex].playerId;
    expect(getCurrentTurnPlayerId(gs)).toBe(expected);
  });

  it('returns null for empty player list', () => {
    const gs = createPlayingGameState();
    gs.players = [];
    expect(getCurrentTurnPlayerId(gs)).toBeNull();
  });

  it('returns correct player after advancing turn', () => {
    const gs = createPlayingGameState();
    gs.currentTurnIndex = 0;
    advanceTurn(gs);
    expect(getCurrentTurnPlayerId(gs)).toBe(gs.players[1].playerId);
  });
});

// ============================================================
// removePlayerFromGame
// ============================================================

describe('removePlayerFromGame', () => {
  it('removes a player from the game and discards their hand', () => {
    const gs = createPlayingGameState(4);
    const playerId = gs.players[1].playerId;
    const handCardCount = gs.players[1].hand.length;
    const discardBefore = gs.discardPile.length;

    const result = removePlayerFromGame(gs, playerId);

    expect(result.removed).toBe(true);
    expect(result.gameEnded).toBe(false);
    expect(gs.players.length).toBe(3);
    expect(gs.players.find((p) => p.playerId === playerId)).toBeUndefined();
    // Hand cards should have been added to discard pile
    expect(gs.discardPile.length).toBe(discardBefore + handCardCount);
  });

  it('returns removed: false for nonexistent player', () => {
    const gs = createPlayingGameState(3);
    const result = removePlayerFromGame(gs, 'nonexistent');
    expect(result.removed).toBe(false);
    expect(gs.players.length).toBe(3);
  });

  it('shifts currentTurnIndex back when a player before the current turn is removed', () => {
    const gs = createPlayingGameState(4);
    gs.currentTurnIndex = 2;
    const currentPlayerId = gs.players[2].playerId;
    const removedPlayerId = gs.players[0].playerId;

    const result = removePlayerFromGame(gs, removedPlayerId);

    expect(result.removed).toBe(true);
    expect(result.turnChanged).toBe(false);
    // Index should have shifted back by 1
    expect(gs.currentTurnIndex).toBe(1);
    // The same player should still have the turn
    expect(gs.players[gs.currentTurnIndex].playerId).toBe(currentPlayerId);
  });

  it('does not shift currentTurnIndex when a player after the current turn is removed', () => {
    const gs = createPlayingGameState(4);
    gs.currentTurnIndex = 0;
    const currentPlayerId = gs.players[0].playerId;
    const removedPlayerId = gs.players[3].playerId;

    const result = removePlayerFromGame(gs, removedPlayerId);

    expect(result.removed).toBe(true);
    expect(result.turnChanged).toBe(false);
    expect(gs.currentTurnIndex).toBe(0);
    expect(gs.players[gs.currentTurnIndex].playerId).toBe(currentPlayerId);
  });

  it('sets turnChanged when the current turn player is removed', () => {
    const gs = createPlayingGameState(4);
    gs.currentTurnIndex = 1;
    const removedPlayerId = gs.players[1].playerId;
    const nextPlayerId = gs.players[2].playerId;

    const result = removePlayerFromGame(gs, removedPlayerId);

    expect(result.removed).toBe(true);
    expect(result.turnChanged).toBe(true);
    // The next player (was at index 2, now at index 1) should have the turn
    expect(gs.players[gs.currentTurnIndex].playerId).toBe(nextPlayerId);
  });

  it('wraps currentTurnIndex when the last player in the array is removed during their turn', () => {
    const gs = createPlayingGameState(3);
    gs.currentTurnIndex = 2;
    const removedPlayerId = gs.players[2].playerId;

    const result = removePlayerFromGame(gs, removedPlayerId);

    expect(result.removed).toBe(true);
    expect(result.turnChanged).toBe(true);
    // Should wrap to index 0
    expect(gs.currentTurnIndex).toBe(0);
  });

  it('ends the game when only 1 player remains', () => {
    const gs = createPlayingGameState(2);
    const removedPlayerId = gs.players[0].playerId;

    const result = removePlayerFromGame(gs, removedPlayerId);

    expect(result.removed).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(gs.phase).toBe('roundEnd');
    expect(gs.players.length).toBe(1);
  });

  it('clears drawnCard when the leaving player had a pending draw', () => {
    const gs = createPlayingGameState(3);
    const removedPlayerId = gs.players[1].playerId;
    const drawnCard = gs.deck.pop()!;
    gs.drawnCard = drawnCard;
    gs.drawnByPlayerId = removedPlayerId;
    gs.drawnSource = 'deck';
    const discardBefore = gs.discardPile.length;
    const handCount = gs.players[1].hand.length;

    const result = removePlayerFromGame(gs, removedPlayerId);

    expect(result.removed).toBe(true);
    expect(gs.drawnCard).toBeNull();
    expect(gs.drawnByPlayerId).toBeNull();
    expect(gs.drawnSource).toBeNull();
    // Drawn card + hand cards should all be in discard
    expect(gs.discardPile.length).toBe(discardBefore + handCount + 1);
  });

  it('does not clear drawnCard when another player had the pending draw', () => {
    const gs = createPlayingGameState(3);
    const removedPlayerId = gs.players[2].playerId;
    const otherPlayerId = gs.players[0].playerId;
    const drawnCard = gs.deck.pop()!;
    gs.drawnCard = drawnCard;
    gs.drawnByPlayerId = otherPlayerId;
    gs.drawnSource = 'deck';

    removePlayerFromGame(gs, removedPlayerId);

    // Drawn card should remain for the other player
    expect(gs.drawnCard).toBe(drawnCard);
    expect(gs.drawnByPlayerId).toBe(otherPlayerId);
    expect(gs.drawnSource).toBe('deck');
  });

  it('clears checkCalledBy when the leaving player called check', () => {
    const gs = createPlayingGameState(4);
    const removedPlayerId = gs.players[1].playerId;
    gs.checkCalledBy = removedPlayerId;
    gs.checkCalledAtIndex = 1;

    removePlayerFromGame(gs, removedPlayerId);

    expect(gs.checkCalledBy).toBeNull();
    expect(gs.checkCalledAtIndex).toBeNull();
  });

  it('preserves checkCalledBy when another player called check', () => {
    const gs = createPlayingGameState(4);
    const removedPlayerId = gs.players[2].playerId;
    const checkerPlayerId = gs.players[0].playerId;
    gs.checkCalledBy = checkerPlayerId;
    gs.checkCalledAtIndex = 0;

    removePlayerFromGame(gs, removedPlayerId);

    expect(gs.checkCalledBy).toBe(checkerPlayerId);
  });

  it('returns the username of the removed player', () => {
    const gs = createPlayingGameState(3);
    const username = gs.players[1].username;

    const result = removePlayerFromGame(gs, gs.players[1].playerId);

    expect(result.username).toBe(username);
  });
});

// ============================================================
// callCheck (F-059 to F-064)
// ============================================================

describe('callCheck', () => {
  it("succeeds when it is the player's turn and no one has called check", () => {
    const gs = createPlayingGameState();
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;

    const result = callCheck(gs, currentPlayerId);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(gs.checkCalledBy).toBe(currentPlayerId);
    expect(gs.checkCalledAtIndex).toBe(gs.currentTurnIndex);
  });

  it('fails when game is not in playing phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'peeking';
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;

    const result = callCheck(gs, currentPlayerId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Game is not in playing phase');
    expect(gs.checkCalledBy).toBeNull();
  });

  it("fails when it is not the player's turn", () => {
    const gs = createPlayingGameState();
    const otherIndex = (gs.currentTurnIndex + 1) % gs.players.length;
    const otherPlayerId = gs.players[otherIndex].playerId;

    const result = callCheck(gs, otherPlayerId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('It is not your turn');
    expect(gs.checkCalledBy).toBeNull();
  });

  it('fails when check has already been called', () => {
    const gs = createPlayingGameState();
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;
    gs.checkCalledBy = 'someone-else';

    const result = callCheck(gs, currentPlayerId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Check has already been called');
  });

  it('fails when player has a pending drawn card', () => {
    const gs = createPlayingGameState();
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;
    gs.drawnCard = { id: 'test', suit: '♥', rank: '5', value: 5, isRed: true };

    const result = callCheck(gs, currentPlayerId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot call check after drawing a card');
    expect(gs.checkCalledBy).toBeNull();
  });

  it('sets checkCalledAtIndex to the current turn index', () => {
    const gs = createPlayingGameState(4);
    gs.currentTurnIndex = 2;
    const currentPlayerId = gs.players[2].playerId;

    callCheck(gs, currentPlayerId);

    expect(gs.checkCalledAtIndex).toBe(2);
  });

  it('does not advance the turn (checker still acts)', () => {
    const gs = createPlayingGameState();
    const originalIndex = gs.currentTurnIndex;
    const currentPlayerId = gs.players[originalIndex].playerId;

    callCheck(gs, currentPlayerId);

    expect(gs.currentTurnIndex).toBe(originalIndex);
  });

  it('fails for roundEnd phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'roundEnd';
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;

    const result = callCheck(gs, currentPlayerId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Game is not in playing phase');
  });

  it('fails for gameEnd phase', () => {
    const gs = createPlayingGameState();
    gs.phase = 'gameEnd';
    const currentPlayerId = gs.players[gs.currentTurnIndex].playerId;

    const result = callCheck(gs, currentPlayerId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Game is not in playing phase');
  });

  it('fails for nonexistent player ID', () => {
    const gs = createPlayingGameState();

    const result = callCheck(gs, 'nonexistent-player');

    expect(result.success).toBe(false);
    expect(result.error).toBe('It is not your turn');
  });
});

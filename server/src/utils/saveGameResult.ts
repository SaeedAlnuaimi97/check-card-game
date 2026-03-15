import { GameResultModel } from '../models/GameResult';
import type { RoomDocument } from '../models/Room';
import type { GameState } from '../types/game.types';

/**
 * Persist game results to the database, excluding bot players.
 * Only human players are included in the saved GameResult document.
 * Non-fatal — errors are logged but never crash the game.
 */
export async function saveGameResult(
  room: RoomDocument,
  gameState: GameState,
  gameEndResult: {
    winner: { playerId: string; username: string; score: number };
    loser: { playerId: string; username: string; score: number };
  },
): Promise<void> {
  try {
    // Build a map from playerId -> guestId using room.players (humans only)
    const guestIdMap = new Map<string, string>();
    const botPlayerIds = new Set<string>();
    for (const rp of room.players) {
      if (rp.isBot) {
        botPlayerIds.add(rp.id);
      } else if (rp.guestId) {
        guestIdMap.set(rp.id, rp.guestId);
      }
    }

    // Filter out bot players — never persist bot stats
    const humanPlayers = gameState.players.filter((p) => !botPlayerIds.has(p.playerId));
    if (humanPlayers.length === 0) {
      // All-bot game — nothing to save
      return;
    }

    // Determine winner/loser guestIds (skip bots)
    const winnerIsBot = botPlayerIds.has(gameEndResult.winner.playerId);
    const loserIsBot = botPlayerIds.has(gameEndResult.loser.playerId);
    const winnerGuestId = winnerIsBot ? undefined : guestIdMap.get(gameEndResult.winner.playerId);
    const loserGuestId = loserIsBot ? undefined : guestIdMap.get(gameEndResult.loser.playerId);

    // If winner is a human but missing guestId, we can't attribute the win — skip
    if (!winnerIsBot && !winnerGuestId) {
      console.warn(
        `Room ${room.roomCode}: Cannot save GameResult — missing guestId for human winner`,
      );
      return;
    }
    // If loser is a human but missing guestId, we can't attribute the loss — skip
    if (!loserIsBot && !loserGuestId) {
      console.warn(
        `Room ${room.roomCode}: Cannot save GameResult — missing guestId for human loser`,
      );
      return;
    }

    const gameResult = new GameResultModel({
      roomCode: room.roomCode,
      startedAt: gameState.gameStartedAt ? new Date(gameState.gameStartedAt) : room.createdAt,
      endedAt: new Date(),
      totalRounds: gameState.roundNumber,
      players: humanPlayers.map((p) => ({
        playerId: p.playerId,
        guestId: guestIdMap.get(p.playerId) ?? 'unknown',
        username: p.username,
        finalScore: p.totalScore,
        isWinner: p.playerId === gameEndResult.winner.playerId,
        isLoser: p.playerId === gameEndResult.loser.playerId,
      })),
      winnerId: winnerGuestId ?? 'bot',
      loserId: loserGuestId ?? 'bot',
      winnerUsername: gameEndResult.winner.username,
      loserUsername: gameEndResult.loser.username,
    });

    await gameResult.save();
    console.log(
      `Room ${room.roomCode}: GameResult saved — winner=${gameEndResult.winner.username}, loser=${gameEndResult.loser.username}`,
    );
  } catch (error) {
    // Non-fatal — log but don't crash the game
    console.error(`Room ${room.roomCode}: Failed to save GameResult:`, error);
  }
}

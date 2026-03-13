import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomModel } from '../models/Room';
import { sanitizeGameState } from '../game/GameSetup';
import {
  validatePlayerTurn,
  getAvailableActions,
  advanceTurn,
  transitionFromPeeking,
  getCurrentTurnPlayerId,
} from '../game/TurnManager';
import { handleDrawFromDeck, handleTakeDiscard, processDiscardChoice } from '../game/ActionHandler';
import { getSocketByPlayer } from './playerMapping';
import type { GameState, ActionType, SlotLabel } from '../types/game.types';

// ============================================================
// Helper: Broadcast personalized game state to all players (F-036)
// ============================================================

export async function broadcastGameState(
  io: SocketIOServer,
  _roomCode: string,
  gameState: GameState,
): Promise<void> {
  for (const player of gameState.players) {
    const socketId = getSocketByPlayer(player.playerId);
    if (!socketId) continue;

    const clientState = sanitizeGameState(gameState, player.playerId);
    io.to(socketId).emit('gameStateUpdated', clientState);
  }
}

/**
 * Sends a 'yourTurn' notification to the current turn player.
 * (F-036)
 */
function emitYourTurn(io: SocketIOServer, gameState: GameState): void {
  const turnPlayerId = getCurrentTurnPlayerId(gameState);
  if (!turnPlayerId) return;

  const socketId = getSocketByPlayer(turnPlayerId);
  if (!socketId) return;

  io.to(socketId).emit('yourTurn', {
    playerId: turnPlayerId,
    canCheck: gameState.checkCalledBy === null,
    availableActions: getAvailableActions(gameState),
  });
}

// ============================================================
// Game Event Handlers (F-033 to F-036)
// ============================================================

export function registerGameHandlers(io: SocketIOServer, socket: Socket): void {
  // ----------------------------------------------------------
  // endPeek — transition from peeking to playing phase
  // ----------------------------------------------------------
  socket.on(
    'endPeek',
    async (
      data: { roomCode: string; playerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Only transition if still in peeking phase
        if (gameState.phase !== 'peeking') {
          callback?.({ success: true }); // Already transitioned, no-op
          return;
        }

        // Validate the player is in this room
        const playerInRoom = gameState.players.some((p) => p.playerId === data.playerId);
        if (!playerInRoom) {
          callback?.({ success: false, error: 'Player not in this game' });
          return;
        }

        // Transition to playing phase
        transitionFromPeeking(gameState);

        // Save updated state
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        callback?.({ success: true });

        // Broadcast the updated state to all players
        await broadcastGameState(io, data.roomCode, gameState);

        // Notify the first player it's their turn
        emitYourTurn(io, gameState);

        console.log(`Room ${data.roomCode}: transitioned from peeking to playing`);
      } catch (error) {
        console.error('Error in endPeek:', error);
        callback?.({ success: false, error: 'Failed to end peek phase' });
      }
    },
  );

  // ----------------------------------------------------------
  // playerAction — validate turn and route to action handler
  // (F-033, F-034, F-037)
  // ----------------------------------------------------------
  socket.on(
    'playerAction',
    async (
      data: { roomCode: string; playerId: string; action: { type: ActionType; slot?: string } },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // F-034: Turn validation
        const turnError = validatePlayerTurn(gameState, data.playerId);
        if (turnError) {
          callback?.({ success: false, error: turnError });
          return;
        }

        // Validate action type
        const available = getAvailableActions(gameState);
        if (!available.includes(data.action.type)) {
          callback?.({ success: false, error: `Action '${data.action.type}' is not available` });
          return;
        }

        // ---- Action: drawDeck (F-037) ----
        if (data.action.type === 'drawDeck') {
          const drawnCard = handleDrawFromDeck(gameState, data.playerId);
          if (!drawnCard) {
            callback?.({ success: false, error: 'Could not draw a card' });
            return;
          }

          // Save state with pending drawn card
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();

          callback?.({ success: true });

          // Send the drawn card privately to the player
          const playerSocketId = getSocketByPlayer(data.playerId);
          if (playerSocketId) {
            io.to(playerSocketId).emit('cardDrawn', { card: drawnCard });
          }

          console.log(`Room ${data.roomCode}: ${data.playerId} drew a card from deck`);
          return;
        }

        // ---- Action: takeDiscard (F-041) ----
        if (data.action.type === 'takeDiscard') {
          const takenCard = handleTakeDiscard(gameState, data.playerId);
          if (!takenCard) {
            callback?.({ success: false, error: 'Could not take from discard' });
            return;
          }

          // Save state with pending taken card
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();

          callback?.({ success: true });

          // Send the taken card privately (player already saw it, but confirms the action)
          const playerSocketId = getSocketByPlayer(data.playerId);
          if (playerSocketId) {
            io.to(playerSocketId).emit('cardDrawn', { card: takenCard, fromDiscard: true });
          }

          console.log(`Room ${data.roomCode}: ${data.playerId} took a card from discard`);
          return;
        }

        // ---- Action: burn (F-044+) ----
        // Will be implemented in Feature 9
        callback?.({
          success: false,
          error: 'Action processing not yet implemented',
        });
      } catch (error) {
        console.error('Error in playerAction:', error);
        callback?.({ success: false, error: 'Failed to process action' });
      }
    },
  );

  // ----------------------------------------------------------
  // discardChoice — after drawing from deck, choose what to discard
  // (F-038, F-039, F-040)
  // ----------------------------------------------------------
  socket.on(
    'discardChoice',
    async (
      data: {
        roomCode: string;
        playerId: string;
        /** Slot to replace in hand, or null to discard the drawn card */
        slot: SlotLabel | null;
      },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Process the discard choice
        const result = processDiscardChoice(gameState, data.playerId, data.slot);
        if (!result.success) {
          callback?.({ success: false, error: result.error });
          return;
        }

        // F-040: Check for special effect (red J/Q/K drawn and discarded)
        if (result.triggersSpecialEffect) {
          // TODO: Trigger special effect in Feature 10
          // For now, just log and continue with normal turn advancement
          console.log(
            `Room ${data.roomCode}: ${data.playerId} discarded a red face card — special effect stub`,
          );
        }

        // Advance turn to the next player
        advanceTurn(gameState);

        // Save updated state
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        callback?.({ success: true });

        // Broadcast updated game state to all players
        await broadcastGameState(io, data.roomCode, gameState);

        // Notify the next player it's their turn
        emitYourTurn(io, gameState);

        console.log(
          `Room ${data.roomCode}: ${data.playerId} completed discard choice (slot: ${data.slot ?? 'drawn'})`,
        );
      } catch (error) {
        console.error('Error in discardChoice:', error);
        callback?.({ success: false, error: 'Failed to process discard choice' });
      }
    },
  );

  // ----------------------------------------------------------
  // debugPeek — reveal a specific card (debug only)
  // ----------------------------------------------------------
  socket.on(
    'debugPeek',
    async (
      data: { roomCode: string; targetPlayerId: string; slot: string },
      callback?: (response: {
        success: boolean;
        card?: import('../types/game.types').Card;
        error?: string;
      }) => void,
    ) => {
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;
        const player = gameState.players.find((p) => p.playerId === data.targetPlayerId);
        if (!player) {
          callback?.({ success: false, error: 'Player not found' });
          return;
        }

        const handSlot = player.hand.find((h) => h.slot === data.slot);
        if (!handSlot) {
          callback?.({ success: false, error: 'Slot not found' });
          return;
        }

        callback?.({ success: true, card: handSlot.card });
      } catch (error) {
        console.error('Error in debugPeek:', error);
        callback?.({ success: false, error: 'Failed to peek' });
      }
    },
  );
}

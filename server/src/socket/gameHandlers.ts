import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomModel } from '../models/Room';
import { sanitizeGameState, initializeGameState } from '../game/GameSetup';
import {
  validatePlayerTurn,
  getAvailableActions,
  advanceTurn,
  isRoundOver,
  callCheck,
  transitionFromPeeking,
  getCurrentTurnPlayerId,
} from '../game/TurnManager';
import {
  handleDrawFromDeck,
  handleTakeDiscard,
  processDiscardChoice,
  handleBurnAttempt,
  getSpecialEffectType,
  applyRedJackSwap,
  applyRedQueenPeek,
  drawRedKingCards,
  processRedKingChoice,
} from '../game/ActionHandler';
import { computeRoundResult, computeGameEndResult } from '../game/Scoring';
import { getSocketByPlayer } from './playerMapping';
import { getRoomMutex } from '../utils/roomLock';
import { getPeekedCards } from '../game/GameSetup';
import type { GameState, ActionType, SlotLabel, Card } from '../types/game.types';

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
// Helper: Advance turn and check for round/game end (F-064)
// ============================================================

/**
 * Advances the turn. If the round is over (turn returns to checker),
 * computes scoring and either starts a new round or ends the game.
 *
 * Returns true if the round ended (caller should NOT emit yourTurn).
 */
async function advanceTurnAndCheckRoundEnd(
  io: SocketIOServer,
  roomCode: string,
  room: InstanceType<typeof RoomModel>,
  gameState: GameState,
): Promise<boolean> {
  advanceTurn(gameState);

  // F-064: Check if round is over (turn returned to checker)
  if (!isRoundOver(gameState)) {
    return false;
  }

  // Round is over — compute scoring
  const roundResult = computeRoundResult(gameState);

  // Save state with updated scores and phase
  room.gameState = gameState;
  room.markModified('gameState');
  await room.save();

  // Broadcast round results to all players (F-070)
  for (const player of gameState.players) {
    const sid = getSocketByPlayer(player.playerId);
    if (sid) {
      io.to(sid).emit('roundEnded', {
        roundNumber: roundResult.roundNumber,
        checkCalledBy: roundResult.checkCalledBy,
        allHands: roundResult.allHands,
        roundWinners: roundResult.roundWinners,
        updatedScores: roundResult.updatedScores,
        gameEnded: roundResult.gameEnded,
        nextRoundStarting: !roundResult.gameEnded,
      });
    }
  }

  if (roundResult.gameEnded) {
    // F-075: Game ended — compute final results
    const gameEndResult = computeGameEndResult(gameState, roundResult.allHands);

    // Update room status
    room.status = 'finished';
    room.markModified('status');
    await room.save();

    // Broadcast game end
    for (const player of gameState.players) {
      const sid = getSocketByPlayer(player.playerId);
      if (sid) {
        io.to(sid).emit('gameEnded', gameEndResult);
      }
    }

    console.log(
      `Room ${roomCode}: GAME ENDED — Winner: ${gameEndResult.winner.username} (${gameEndResult.winner.score}), Loser: ${gameEndResult.loser.username} (${gameEndResult.loser.score})`,
    );
  } else {
    // F-076: Start a new round automatically
    console.log(`Room ${roomCode}: Round ${roundResult.roundNumber} ended. Starting new round...`);

    // Delay new round start to let clients show the round-end modal
    setTimeout(async () => {
      const release = await getRoomMutex(roomCode).acquire();
      try {
        // Re-fetch room to avoid stale state
        const freshRoom = await RoomModel.findOne({ roomCode });
        if (!freshRoom || !freshRoom.gameState) return;

        const oldGameState = freshRoom.gameState as unknown as GameState;

        // Initialize new round with existing scores and incremented round number
        const players = oldGameState.players.map((p) => ({
          id: p.playerId,
          username: p.username,
        }));
        const newGameState = initializeGameState(
          players,
          oldGameState.scores,
          oldGameState.roundNumber + 1,
        );

        // Save new game state
        freshRoom.gameState = newGameState;
        freshRoom.markModified('gameState');
        await freshRoom.save();

        // Send personalized gameStarted events to each player (same as initial start)
        for (const player of newGameState.players) {
          const socketId = getSocketByPlayer(player.playerId);
          if (!socketId) continue;

          const clientState = sanitizeGameState(newGameState, player.playerId);
          const peeked = getPeekedCards(player);

          io.to(socketId).emit('gameStarted', {
            gameState: clientState,
            peekedCards: peeked,
          });
        }

        console.log(`Room ${roomCode}: New round ${newGameState.roundNumber} started`);
      } catch (error) {
        console.error('Error starting new round:', error);
      } finally {
        release();
      }
    }, 5000); // 5-second delay for round-end modal
  }

  return true;
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
      const release = await getRoomMutex(data.roomCode).acquire();
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
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // callCheck — player calls check at start of their turn
  // (F-059 to F-064)
  // ----------------------------------------------------------
  socket.on(
    'callCheck',
    async (
      data: { roomCode: string; playerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const release = await getRoomMutex(data.roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Validate and process check call (F-059, F-061)
        const result = callCheck(gameState, data.playerId);
        if (!result.success) {
          callback?.({ success: false, error: result.error });
          return;
        }

        // Save state with check marked
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        callback?.({ success: true });

        // F-062: Broadcast check notification to all players
        const checker = gameState.players.find((p) => p.playerId === data.playerId);
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('checkCalled', {
              playerId: data.playerId,
              username: checker?.username ?? 'Unknown',
            });
          }
        }

        // Broadcast updated game state (checkCalledBy is now set)
        await broadcastGameState(io, data.roomCode, gameState);

        // F-060: Checker still takes their normal turn — re-emit yourTurn
        emitYourTurn(io, gameState);

        console.log(`Room ${data.roomCode}: ${checker?.username} (${data.playerId}) called CHECK`);
      } catch (error) {
        console.error('Error in callCheck:', error);
        callback?.({ success: false, error: 'Failed to process check call' });
      } finally {
        release();
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
      const release = await getRoomMutex(data.roomCode).acquire();
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

        // ---- Action: burn (F-044 to F-048) ----
        if (data.action.type === 'burn') {
          if (!data.action.slot) {
            callback?.({ success: false, error: 'Burn action requires a slot' });
            return;
          }

          const burnResult = handleBurnAttempt(gameState, data.playerId, data.action.slot);
          if (!burnResult.success) {
            callback?.({ success: false, error: burnResult.error });
            return;
          }

          // Advance turn after burn (F-048: no special effects from burns)
          const burnRoundEnded = await advanceTurnAndCheckRoundEnd(
            io,
            data.roomCode,
            room,
            gameState,
          );

          if (!burnRoundEnded) {
            // Save updated state (only if round didn't end — advanceTurnAndCheckRoundEnd handles save on round end)
            room.gameState = gameState;
            room.markModified('gameState');
            await room.save();
          }

          callback?.({ success: true });

          // Broadcast burn result to all players in the room
          const burnData = {
            playerId: data.playerId,
            slot: burnResult.burnedSlot,
            burnSuccess: burnResult.burnSuccess,
            // Reveal the burned card to everyone on success
            burnedCard: burnResult.burnSuccess ? burnResult.burnedCard : undefined,
            penaltySlot: burnResult.penaltySlot,
          };
          for (const player of gameState.players) {
            const sid = getSocketByPlayer(player.playerId);
            if (sid) {
              io.to(sid).emit('burnResult', burnData);
            }
          }

          if (!burnRoundEnded) {
            // Broadcast updated game state
            await broadcastGameState(io, data.roomCode, gameState);

            // Notify the next player it's their turn
            emitYourTurn(io, gameState);
          }

          console.log(
            `Room ${data.roomCode}: ${data.playerId} burn ${burnResult.burnSuccess ? 'SUCCESS' : 'FAIL'} at slot ${data.action.slot}`,
          );
          return;
        }

        callback?.({
          success: false,
          error: 'Unknown action type',
        });
      } catch (error) {
        console.error('Error in playerAction:', error);
        callback?.({ success: false, error: 'Failed to process action' });
      } finally {
        release();
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
      const release = await getRoomMutex(data.roomCode).acquire();
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
        if (result.triggersSpecialEffect && result.discardedCard) {
          const effectType = getSpecialEffectType(result.discardedCard);
          if (effectType) {
            // Set pending effect on game state — do NOT advance turn yet (F-054)
            gameState.pendingEffect = {
              type: effectType,
              playerId: data.playerId,
              card: result.discardedCard,
            };

            // For Red King: draw 2 additional cards now (F-051)
            let redKingCards: [Card, Card] | undefined;
            if (effectType === 'redKing') {
              const kingDraw = drawRedKingCards(gameState);
              if (kingDraw.success && kingDraw.drawnCards) {
                redKingCards = kingDraw.drawnCards;
                gameState.pendingEffect.redKingCards = redKingCards;
              }
              // If deck is empty, effect is skipped — advance turn normally
              if (!kingDraw.success) {
                gameState.pendingEffect = null;
              }
            }

            if (gameState.pendingEffect) {
              // Save state with pending effect
              room.gameState = gameState;
              room.markModified('gameState');
              await room.save();

              callback?.({ success: true });

              // Broadcast updated state to all players
              await broadcastGameState(io, data.roomCode, gameState);

              // Send waitingForSpecialEffect privately to the acting player
              const effectSocketId = getSocketByPlayer(data.playerId);
              if (effectSocketId) {
                io.to(effectSocketId).emit('waitingForSpecialEffect', {
                  playerId: data.playerId,
                  effect: effectType,
                  card: result.discardedCard,
                  redKingCards,
                });
              }

              // Notify other players that someone is using a special effect
              for (const player of gameState.players) {
                if (player.playerId === data.playerId) continue;
                const sid = getSocketByPlayer(player.playerId);
                if (sid) {
                  io.to(sid).emit('playerUsingSpecialEffect', {
                    playerId: data.playerId,
                    effect: effectType,
                  });
                }
              }

              console.log(
                `Room ${data.roomCode}: ${data.playerId} triggered ${effectType} special effect`,
              );
              return;
            }
          }
        }

        // Advance turn to the next player
        const discardRoundEnded = await advanceTurnAndCheckRoundEnd(
          io,
          data.roomCode,
          room,
          gameState,
        );

        if (!discardRoundEnded) {
          // Save updated state
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();
        }

        callback?.({ success: true });

        if (!discardRoundEnded) {
          // Broadcast updated game state to all players
          await broadcastGameState(io, data.roomCode, gameState);

          // Notify the next player it's their turn
          emitYourTurn(io, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${data.playerId} completed discard choice (slot: ${data.slot ?? 'drawn'})`,
        );
      } catch (error) {
        console.error('Error in discardChoice:', error);
        callback?.({ success: false, error: 'Failed to process discard choice' });
      } finally {
        release();
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

  // ----------------------------------------------------------
  // redJackSwap — Red Jack special effect (F-049)
  // ----------------------------------------------------------
  socket.on(
    'redJackSwap',
    async (
      data: {
        roomCode: string;
        playerId: string;
        skip?: boolean;
        mySlot?: string;
        targetPlayerId?: string;
        targetSlot?: string;
      },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const release = await getRoomMutex(data.roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Validate there's a pending Red Jack effect for this player
        if (
          !gameState.pendingEffect ||
          gameState.pendingEffect.type !== 'redJack' ||
          gameState.pendingEffect.playerId !== data.playerId
        ) {
          callback?.({ success: false, error: 'No pending Red Jack effect for this player' });
          return;
        }

        if (!data.skip) {
          // Validate required fields for swap
          if (!data.mySlot || !data.targetPlayerId || !data.targetSlot) {
            callback?.({
              success: false,
              error: 'mySlot, targetPlayerId, and targetSlot are required',
            });
            return;
          }

          const swapResult = applyRedJackSwap(
            gameState,
            data.playerId,
            data.mySlot,
            data.targetPlayerId,
            data.targetSlot,
          );
          if (!swapResult.success) {
            callback?.({ success: false, error: swapResult.error });
            return;
          }
        }

        // Clear pending effect and advance turn
        gameState.pendingEffect = null;
        const jackRoundEnded = await advanceTurnAndCheckRoundEnd(
          io,
          data.roomCode,
          room,
          gameState,
        );

        if (!jackRoundEnded) {
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();
        }

        callback?.({ success: true });

        // Broadcast swap notification (no card details revealed)
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('specialEffectResolved', {
              effect: 'redJack',
              playerId: data.playerId,
              skipped: data.skip === true,
            });
          }
        }

        if (!jackRoundEnded) {
          // Broadcast updated game state
          await broadcastGameState(io, data.roomCode, gameState);

          // Notify the next player it's their turn
          emitYourTurn(io, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${data.playerId} Red Jack ${data.skip ? 'skipped' : 'swapped'}`,
        );
      } catch (error) {
        console.error('Error in redJackSwap:', error);
        callback?.({ success: false, error: 'Failed to process Red Jack swap' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // redQueenPeek — Red Queen special effect (F-050)
  // ----------------------------------------------------------
  socket.on(
    'redQueenPeek',
    async (
      data: { roomCode: string; playerId: string; slot: string },
      callback?: (response: { success: boolean; card?: Card; error?: string }) => void,
    ) => {
      const release = await getRoomMutex(data.roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Validate there's a pending Red Queen effect for this player
        if (
          !gameState.pendingEffect ||
          gameState.pendingEffect.type !== 'redQueen' ||
          gameState.pendingEffect.playerId !== data.playerId
        ) {
          callback?.({ success: false, error: 'No pending Red Queen effect for this player' });
          return;
        }

        const peekResult = applyRedQueenPeek(gameState, data.playerId, data.slot);
        if (!peekResult.success) {
          callback?.({ success: false, error: peekResult.error });
          return;
        }

        // Clear pending effect and advance turn
        gameState.pendingEffect = null;
        const queenRoundEnded = await advanceTurnAndCheckRoundEnd(
          io,
          data.roomCode,
          room,
          gameState,
        );

        if (!queenRoundEnded) {
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();
        }

        // Send the peeked card privately to the player via callback
        callback?.({ success: true, card: peekResult.card });

        // Broadcast notification (no slot/card details)
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('specialEffectResolved', {
              effect: 'redQueen',
              playerId: data.playerId,
            });
          }
        }

        if (!queenRoundEnded) {
          // Broadcast updated game state
          await broadcastGameState(io, data.roomCode, gameState);

          // Notify the next player it's their turn
          emitYourTurn(io, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${data.playerId} Red Queen peeked at slot ${data.slot}`,
        );
      } catch (error) {
        console.error('Error in redQueenPeek:', error);
        callback?.({ success: false, error: 'Failed to process Red Queen peek' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // redKingChoice — Red King special effect (F-051 to F-053)
  // ----------------------------------------------------------
  socket.on(
    'redKingChoice',
    async (
      data: {
        roomCode: string;
        playerId: string;
        choice: {
          type: 'returnBoth' | 'keepOne' | 'keepBoth';
          keepIndex?: 0 | 1;
          replaceSlot?: string;
          replaceSlots?: [string, string];
        };
      },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const release = await getRoomMutex(data.roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Validate there's a pending Red King effect for this player
        if (
          !gameState.pendingEffect ||
          gameState.pendingEffect.type !== 'redKing' ||
          gameState.pendingEffect.playerId !== data.playerId ||
          !gameState.pendingEffect.redKingCards
        ) {
          callback?.({ success: false, error: 'No pending Red King effect for this player' });
          return;
        }

        const redKingCards = gameState.pendingEffect.redKingCards;

        const choiceResult = processRedKingChoice(gameState, data.playerId, redKingCards, {
          type: data.choice.type,
          keepIndex: data.choice.keepIndex as 0 | 1 | undefined,
          replaceSlot: data.choice.replaceSlot as SlotLabel | undefined,
          replaceSlots: data.choice.replaceSlots as [SlotLabel, SlotLabel] | undefined,
        });

        if (!choiceResult.success) {
          callback?.({ success: false, error: choiceResult.error });
          return;
        }

        // Clear pending effect and advance turn
        gameState.pendingEffect = null;
        const kingRoundEnded = await advanceTurnAndCheckRoundEnd(
          io,
          data.roomCode,
          room,
          gameState,
        );

        if (!kingRoundEnded) {
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();
        }

        callback?.({ success: true });

        // Broadcast notification
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('specialEffectResolved', {
              effect: 'redKing',
              playerId: data.playerId,
              cardsKept:
                data.choice.type === 'returnBoth' ? 0 : data.choice.type === 'keepOne' ? 1 : 2,
              discardedCards: choiceResult.discardedCards,
            });
          }
        }

        if (!kingRoundEnded) {
          // Broadcast updated game state
          await broadcastGameState(io, data.roomCode, gameState);

          // Notify the next player it's their turn
          emitYourTurn(io, gameState);
        }

        console.log(`Room ${data.roomCode}: ${data.playerId} Red King choice: ${data.choice.type}`);
      } catch (error) {
        console.error('Error in redKingChoice:', error);
        callback?.({ success: false, error: 'Failed to process Red King choice' });
      } finally {
        release();
      }
    },
  );
}

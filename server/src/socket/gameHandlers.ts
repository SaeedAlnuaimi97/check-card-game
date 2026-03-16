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
  undoTakeDiscard,
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
import {
  startTurnTimer,
  clearTurnTimer,
  startTurnTimerWithDuration,
  TURN_TIMEOUT_MS,
} from '../game/TurnTimer';
import { scheduleBotTurnIfNeeded } from '../utils/botScheduler';
import type { GameState, ActionType, SlotLabel, Card } from '../types/game.types';

// ============================================================
// Round Countdown Timer — 5-second auto-start between rounds
// ============================================================

/** Delay in ms before the next round starts automatically */
const ROUND_COUNTDOWN_MS = 5_000;

/** Active round countdown timers, keyed by roomCode */
const roundCountdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Cancel any pending round countdown for a room */
export function cancelRoundCountdown(roomCode: string): void {
  const timer = roundCountdownTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    roundCountdownTimers.delete(roomCode);
  }
}

/**
 * Executes the "start next round" logic: initializes a new round from
 * the current gameState, saves to DB, and emits gameStarted to all players.
 * Used by both the auto-countdown timer and the manual startNextRound handler.
 */
async function executeStartNextRound(io: SocketIOServer, roomCode: string): Promise<boolean> {
  const release = await getRoomMutex(roomCode).acquire();
  try {
    const room = await RoomModel.findOne({ roomCode });
    if (!room || !room.gameState) return false;

    if (room.status !== 'playing') return false;

    const oldGameState = room.gameState as unknown as GameState;
    if (oldGameState.phase !== 'roundEnd') return false;

    // Initialize new round with existing scores and incremented round number
    const players = oldGameState.players.map((p) => ({
      id: p.playerId,
      username: p.username,
      isBot: p.isBot,
      botDifficulty: p.botDifficulty,
    }));
    const newGameState = initializeGameState(
      players,
      oldGameState.scores,
      oldGameState.roundNumber + 1,
      oldGameState.targetScore,
    );

    // Preserve gameStartedAt from the first round (F-234)
    if (oldGameState.gameStartedAt) {
      newGameState.gameStartedAt = oldGameState.gameStartedAt;
    }

    // Save new game state
    room.gameState = newGameState;
    room.markModified('gameState');
    await room.save();

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

    console.log(`Room ${roomCode}: Auto-started new round ${newGameState.roundNumber}`);
    return true;
  } catch (error) {
    console.error('Error in executeStartNextRound:', error);
    return false;
  } finally {
    release();
  }
}

/**
 * Schedule the next round to start automatically after ROUND_COUNTDOWN_MS.
 * Emits a 'nextRoundCountdown' event to all players so the client can
 * display a countdown and play audio.
 */
function scheduleNextRoundCountdown(
  io: SocketIOServer,
  roomCode: string,
  gameState: GameState,
): void {
  // Cancel any existing countdown for this room
  cancelRoundCountdown(roomCode);

  const startsAt = Date.now() + ROUND_COUNTDOWN_MS;

  // Notify all players of the countdown
  for (const player of gameState.players) {
    const sid = getSocketByPlayer(player.playerId);
    if (sid) {
      io.to(sid).emit('nextRoundCountdown', { startsAt });
    }
  }

  // Schedule auto-start
  const timer = setTimeout(async () => {
    roundCountdownTimers.delete(roomCode);
    await executeStartNextRound(io, roomCode);
  }, ROUND_COUNTDOWN_MS);

  roundCountdownTimers.set(roomCode, timer);
}

// ============================================================
// Helper: Format card for logging (e.g. "J♥" or "10♠")
// ============================================================

function fmtCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function getUsername(gameState: GameState, playerId: string): string {
  return gameState.players.find((p) => p.playerId === playerId)?.username ?? playerId;
}

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
 * Sends a 'yourTurn' notification to the current turn player and
 * starts the 30-second turn timer.
 * (F-036)
 */
export function emitYourTurn(io: SocketIOServer, roomCode: string, gameState: GameState): void {
  const turnPlayerId = getCurrentTurnPlayerId(gameState);
  if (!turnPlayerId) return;

  // Set the turn start timestamp
  gameState.turnStartedAt = Date.now();

  const currentPlayer = gameState.players.find((p) => p.playerId === turnPlayerId);

  const socketId = getSocketByPlayer(turnPlayerId);

  // Only emit to human players (bots have no socket)
  if (socketId) {
    io.to(socketId).emit('yourTurn', {
      playerId: turnPlayerId,
      canCheck: gameState.checkCalledBy === null,
      availableActions: getAvailableActions(gameState),
      turnStartedAt: gameState.turnStartedAt,
    });
  }

  // Always clear the previous turn timer first — this prevents stale
  // human timers from firing during a bot's turn when transitioning
  // from human → bot.
  clearTurnTimer(roomCode);

  // Start turn timer for human players only.
  // Bot turns are managed by scheduleBotTurnIfNeeded / emitYourTurnFromBot
  // which has its own timer with handleBotTurnTimeout.
  if (!currentPlayer?.isBot) {
    startTurnTimer(roomCode, (rc) => {
      handleTurnTimeout(io, rc);
    });
  }
}

// ============================================================
// Helper: Handle turn timeout — auto-skip the player's turn
// ============================================================

/**
 * Called when the 30-second turn timer fires.
 * Auto-advances the turn (the player forfeits their action).
 */
async function handleTurnTimeout(io: SocketIOServer, roomCode: string): Promise<void> {
  const release = await getRoomMutex(roomCode).acquire();
  try {
    const room = await RoomModel.findOne({ roomCode });
    if (!room || !room.gameState) return;

    const gameState = room.gameState as unknown as GameState;
    if (gameState.phase !== 'playing') return;

    const timedOutPlayer = gameState.players[gameState.currentTurnIndex];
    if (!timedOutPlayer) return;

    // If the player has a pending drawn card, discard it
    if (gameState.drawnCard && gameState.drawnByPlayerId === timedOutPlayer.playerId) {
      processDiscardChoice(gameState, timedOutPlayer.playerId, null);
    }

    // If there's a pending special effect for this player, clear it
    if (gameState.pendingEffect && gameState.pendingEffect.playerId === timedOutPlayer.playerId) {
      // For Red King: return drawn cards to deck
      if (gameState.pendingEffect.redKingCards) {
        gameState.deck.push(...gameState.pendingEffect.redKingCards);
      }
      gameState.pendingEffect = null;
    }

    // Broadcast timeout notification
    for (const player of gameState.players) {
      const sid = getSocketByPlayer(player.playerId);
      if (sid) {
        io.to(sid).emit('turnTimedOut', {
          playerId: timedOutPlayer.playerId,
          username: timedOutPlayer.username,
        });
      }
    }

    // Advance the turn
    const roundEnded = await advanceTurnAndCheckRoundEnd(io, roomCode, room, gameState);

    if (!roundEnded) {
      room.gameState = gameState;
      room.markModified('gameState');
      await room.save();

      emitYourTurn(io, roomCode, gameState);
      scheduleBotTurnIfNeeded(io, roomCode, gameState);
      await broadcastGameState(io, roomCode, gameState);
    }

    console.log(`Room ${roomCode}: ${timedOutPlayer.username} turn timed out`);
  } catch (error) {
    console.error('Error in handleTurnTimeout:', error);
  } finally {
    release();
  }
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

  // Round is over — clear the turn timer
  clearTurnTimer(roomCode);

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
        checkerDoubled: roundResult.checkerDoubled,
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
    // Round ended but game continues — wait for host to start next round
    console.log(
      `Room ${roomCode}: Round ${roundResult.roundNumber} ended. Waiting for host to start next round.`,
    );
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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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

        // Notify the first player it's their turn
        emitYourTurn(io, data.roomCode, gameState);
        scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

        // Broadcast the updated state to all players
        await broadcastGameState(io, data.roomCode, gameState);

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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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

        // F-060: Checker still takes their normal turn — re-emit yourTurn
        emitYourTurn(io, data.roomCode, gameState);
        scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

        // Broadcast updated game state (checkCalledBy is now set)
        await broadcastGameState(io, data.roomCode, gameState);

        console.log(`Room ${data.roomCode}: ${checker?.username ?? 'Unknown'} called CHECK`);
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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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

          console.log(
            `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} drew ${fmtCard(drawnCard)} from deck`,
          );
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

          console.log(
            `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} took ${fmtCard(takenCard)} from discard`,
          );
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

          // Check if player burned all cards — round ends immediately
          const burner = gameState.players.find((p) => p.playerId === data.playerId);
          const emptyHandRoundEnd = burnResult.burnSuccess && burner && burner.hand.length === 0;

          let burnRoundEnded = false;

          if (emptyHandRoundEnd) {
            // Player burned all cards — end round immediately
            clearTurnTimer(data.roomCode);

            const roundResult = computeRoundResult(gameState);

            room.gameState = gameState;
            room.markModified('gameState');
            await room.save();

            // Broadcast round results to all players
            for (const player of gameState.players) {
              const sid = getSocketByPlayer(player.playerId);
              if (sid) {
                io.to(sid).emit('roundEnded', {
                  roundNumber: roundResult.roundNumber,
                  checkCalledBy: roundResult.checkCalledBy,
                  allHands: roundResult.allHands,
                  roundWinners: roundResult.roundWinners,
                  checkerDoubled: roundResult.checkerDoubled,
                  updatedScores: roundResult.updatedScores,
                  gameEnded: roundResult.gameEnded,
                  nextRoundStarting: !roundResult.gameEnded,
                });
              }
            }

            if (roundResult.gameEnded) {
              const gameEndResult = computeGameEndResult(gameState, roundResult.allHands);
              room.status = 'finished';
              room.markModified('status');
              await room.save();

              for (const player of gameState.players) {
                const sid = getSocketByPlayer(player.playerId);
                if (sid) {
                  io.to(sid).emit('gameEnded', gameEndResult);
                }
              }

              console.log(
                `Room ${data.roomCode}: GAME ENDED — Winner: ${gameEndResult.winner.username} (${gameEndResult.winner.score}), Loser: ${gameEndResult.loser.username} (${gameEndResult.loser.score})`,
              );
            } else {
              console.log(
                `Room ${data.roomCode}: Round ${roundResult.roundNumber} ended — ${getUsername(gameState, data.playerId)} burned all cards. Waiting for host to start next round.`,
              );
            }

            burnRoundEnded = true;
          } else {
            // Normal flow — advance turn and check for check-based round end
            burnRoundEnded = await advanceTurnAndCheckRoundEnd(io, data.roomCode, room, gameState);
          }

          if (!burnRoundEnded) {
            // Save updated state (only if round didn't end)
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
            // Notify the next player it's their turn
            emitYourTurn(io, data.roomCode, gameState);
            scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

            // Emit slot modification glow for penalty slot on burn failure
            if (!burnResult.burnSuccess && burnResult.penaltySlot) {
              io.to(data.roomCode).emit('slotsModified', {
                changes: [{ playerId: data.playerId, slot: burnResult.penaltySlot }],
              });
            }

            // Broadcast updated game state
            await broadcastGameState(io, data.roomCode, gameState);
          }

          console.log(
            `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} burn ${burnResult.burnSuccess ? 'SUCCESS' : 'FAIL'} at slot ${data.action.slot}${burnResult.burnedCard ? ` (${fmtCard(burnResult.burnedCard)})` : ''}`,
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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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
              // Pause the turn timer while the special effect is being resolved
              clearTurnTimer(data.roomCode);
              gameState.turnStartedAt = null;

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
                `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} triggered ${effectType} special effect (${result.discardedCard ? fmtCard(result.discardedCard) : 'unknown'})`,
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
          // Notify the next player it's their turn
          emitYourTurn(io, data.roomCode, gameState);
          scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

          // Emit slot modification glow for the swapped slot
          if (data.slot !== null) {
            io.to(data.roomCode).emit('slotsModified', {
              changes: [{ playerId: data.playerId, slot: data.slot }],
            });
          }

          // Broadcast updated game state to all players
          await broadcastGameState(io, data.roomCode, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} completed discard choice — discarded ${result.discardedCard ? fmtCard(result.discardedCard) : 'unknown'} (slot: ${data.slot ?? 'drawn'})`,
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
  // undoTakeDiscard — cancel a pending take-from-discard action
  // Returns the card to the top of the discard pile.
  // Only valid before the player has selected a hand slot to swap.
  // ----------------------------------------------------------
  socket.on(
    'undoTakeDiscard',
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

        // Block while paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

        const result = undoTakeDiscard(gameState, data.playerId);
        if (!result.success) {
          callback?.({ success: false, error: result.error });
          return;
        }

        // Save state with discard card returned
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        callback?.({ success: true });

        // Broadcast updated state so everyone sees the card back on the discard pile
        await broadcastGameState(io, data.roomCode, gameState);

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} undid take-from-discard (${result.returnedCard ? fmtCard(result.returnedCard) : 'unknown'})`,
        );
      } catch (error) {
        console.error('Error in undoTakeDiscard:', error);
        callback?.({ success: false, error: 'Failed to undo take from discard' });
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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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

        // Broadcast swap notification — include slot details so both players know
        const swapperUsername =
          gameState.players.find((p) => p.playerId === data.playerId)?.username ?? 'Unknown';
        const targetUsername =
          !data.skip && data.targetPlayerId
            ? (gameState.players.find((p) => p.playerId === data.targetPlayerId)?.username ??
              'Unknown')
            : undefined;

        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('specialEffectResolved', {
              effect: 'redJack',
              playerId: data.playerId,
              skipped: data.skip === true,
              // Include swap details when not skipped
              ...(!data.skip && {
                swapperSlot: data.mySlot,
                swapperUsername,
                targetPlayerId: data.targetPlayerId,
                targetSlot: data.targetSlot,
                targetUsername,
              }),
            });
          }
        }

        if (!jackRoundEnded) {
          // Notify the next player it's their turn
          emitYourTurn(io, data.roomCode, gameState);
          scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

          // Emit slot modification glow for swapped slots (when not skipped)
          if (!data.skip && data.mySlot && data.targetPlayerId && data.targetSlot) {
            io.to(data.roomCode).emit('slotsModified', {
              changes: [
                { playerId: data.playerId, slot: data.mySlot },
                { playerId: data.targetPlayerId, slot: data.targetSlot },
              ],
            });
          }

          // Broadcast updated game state
          await broadcastGameState(io, data.roomCode, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} Red Jack ${data.skip ? 'skipped' : `swapped slot ${data.mySlot} with ${getUsername(gameState, data.targetPlayerId ?? '')} slot ${data.targetSlot}`}`,
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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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
          // Emit yourTurn first so turnStartedAt is set before broadcast
          emitYourTurn(io, data.roomCode, gameState);
          scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

          // Broadcast updated game state (includes fresh turnStartedAt)
          await broadcastGameState(io, data.roomCode, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} Red Queen peeked at slot ${data.slot}${peekResult.card ? ` (${fmtCard(peekResult.card)})` : ''}`,
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

        // F-275: Block actions while game is paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is paused' });
          return;
        }

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
          // Emit slot modification glow for replaced slots
          const replacedSlots: string[] = [];
          if (data.choice.type === 'keepOne' && data.choice.replaceSlot) {
            replacedSlots.push(data.choice.replaceSlot);
          } else if (data.choice.type === 'keepBoth' && data.choice.replaceSlots) {
            replacedSlots.push(...data.choice.replaceSlots);
          }
          if (replacedSlots.length > 0) {
            io.to(data.roomCode).emit('slotsModified', {
              changes: replacedSlots.map((slot) => ({ playerId: data.playerId, slot })),
            });
          }

          // Emit yourTurn first so turnStartedAt is set before broadcast
          emitYourTurn(io, data.roomCode, gameState);
          scheduleBotTurnIfNeeded(io, data.roomCode, gameState);

          // Broadcast updated game state (includes fresh turnStartedAt)
          await broadcastGameState(io, data.roomCode, gameState);
        }

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} Red King choice: ${data.choice.type} (drew ${fmtCard(redKingCards[0])}, ${fmtCard(redKingCards[1])})`,
        );
      } catch (error) {
        console.error('Error in redKingChoice:', error);
        callback?.({ success: false, error: 'Failed to process Red King choice' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // startNextRound — host triggers next round countdown
  // ----------------------------------------------------------
  socket.on(
    'startNextRound',
    async (
      data: { roomCode: string; playerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      // Cancel any pending auto-start countdown (idempotent)
      cancelRoundCountdown(data.roomCode);

      const release = await getRoomMutex(data.roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        // Only the host can start the next round
        if (room.host !== data.playerId) {
          callback?.({ success: false, error: 'Only the host can start the next round' });
          return;
        }

        // Room must be in 'playing' status
        if (room.status !== 'playing') {
          callback?.({ success: false, error: 'Game is not in progress' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Game state must be in 'roundEnd' phase
        if (gameState.phase !== 'roundEnd') {
          callback?.({ success: false, error: 'Round has not ended yet' });
          return;
        }

        callback?.({ success: true });

        // Schedule countdown — emits nextRoundCountdown to all players,
        // then auto-starts the next round after ROUND_COUNTDOWN_MS
        scheduleNextRoundCountdown(io, data.roomCode, gameState);

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} triggered next round countdown (${ROUND_COUNTDOWN_MS / 1000}s).`,
        );
      } catch (error) {
        console.error('Error in startNextRound:', error);
        callback?.({ success: false, error: 'Failed to start next round' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // endGame — host manually ends the game during roundEnd phase
  // ----------------------------------------------------------
  socket.on(
    'endGame',
    async (
      data: { roomCode: string; playerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      // Cancel any pending auto-start countdown
      cancelRoundCountdown(data.roomCode);

      const release = await getRoomMutex(data.roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode: data.roomCode });
        if (!room || !room.gameState) {
          callback?.({ success: false, error: 'Room or game not found' });
          return;
        }

        // Only the host can end the game
        if (room.host !== data.playerId) {
          callback?.({ success: false, error: 'Only the host can end the game' });
          return;
        }

        // Room must be in 'playing' status
        if (room.status !== 'playing') {
          callback?.({ success: false, error: 'Game is not in progress' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Must be in roundEnd phase
        if (gameState.phase !== 'roundEnd') {
          callback?.({ success: false, error: 'Can only end game between rounds' });
          return;
        }

        // Compute game end result using current scores
        const allHands = gameState.players.map((player) => ({
          playerId: player.playerId,
          username: player.username,
          cards: player.hand.map((h) => h.card),
          slots: player.hand.map((h) => h.slot),
          handSum: player.hand.reduce((sum, h) => sum + h.card.value, 0),
        }));

        const gameEndResult = computeGameEndResult(gameState, allHands);

        // Update room status
        gameState.phase = 'gameEnd';
        room.status = 'finished';
        room.gameState = gameState;
        room.markModified('gameState');
        room.markModified('status');
        await room.save();

        callback?.({ success: true });

        // Broadcast game end to all players
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('gameEnded', gameEndResult);
          }
        }

        console.log(
          `Room ${data.roomCode}: Host manually ended game — Winner: ${gameEndResult.winner.username} (${gameEndResult.winner.score}), Loser: ${gameEndResult.loser.username} (${gameEndResult.loser.score})`,
        );
      } catch (error) {
        console.error('Error in endGame:', error);
        callback?.({ success: false, error: 'Failed to end game' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // pauseGame — host pauses the game (F-272)
  // ----------------------------------------------------------
  socket.on(
    'pauseGame',
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

        // Any player in the room can pause the game
        if (!room.players.find((p) => p.id === data.playerId)) {
          callback?.({ success: false, error: 'Player not in room' });
          return;
        }

        // Room must be in 'playing' status
        if (room.status !== 'playing') {
          callback?.({ success: false, error: 'Game is not in progress' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Can only pause during peeking or playing phases
        if (gameState.phase !== 'peeking' && gameState.phase !== 'playing') {
          callback?.({ success: false, error: 'Cannot pause during this phase' });
          return;
        }

        // Cannot pause if already paused
        if (gameState.paused) {
          callback?.({ success: false, error: 'Game is already paused' });
          return;
        }

        // Rate limit: minimum 3 seconds between pause/resume toggles
        if (gameState.pausedAt && Date.now() - gameState.pausedAt < 3000) {
          callback?.({ success: false, error: 'Please wait before pausing again' });
          return;
        }

        // Calculate remaining turn time
        const now = Date.now();
        const elapsed = gameState.turnStartedAt ? now - gameState.turnStartedAt : 0;
        const remaining = Math.max(TURN_TIMEOUT_MS - elapsed, 0);

        // Set pause state
        gameState.paused = true;
        gameState.pausedBy = data.playerId;
        gameState.pausedAt = now;
        gameState.turnTimeRemainingMs = remaining;

        // Clear the turn timer
        clearTurnTimer(data.roomCode);

        // Save to DB
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        callback?.({ success: true });

        // Broadcast gamePaused to all players (F-274)
        const pauserUsername = getUsername(gameState, data.playerId);
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('gamePaused', {
              pausedBy: data.playerId,
              username: pauserUsername,
            });
          }
        }

        // Also broadcast updated game state so clients see paused=true
        await broadcastGameState(io, data.roomCode, gameState);

        console.log(
          `Room ${data.roomCode}: ${pauserUsername} paused the game (remaining: ${remaining}ms)`,
        );
      } catch (error) {
        console.error('Error in pauseGame:', error);
        callback?.({ success: false, error: 'Failed to pause game' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // resumeGame — host resumes the game (F-273)
  // ----------------------------------------------------------
  socket.on(
    'resumeGame',
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

        // Any player in the room can resume the game
        if (!room.players.find((p) => p.id === data.playerId)) {
          callback?.({ success: false, error: 'Player not in room' });
          return;
        }

        // Room must be in 'playing' status
        if (room.status !== 'playing') {
          callback?.({ success: false, error: 'Game is not in progress' });
          return;
        }

        const gameState = room.gameState as unknown as GameState;

        // Game must be paused
        if (!gameState.paused) {
          callback?.({ success: false, error: 'Game is not paused' });
          return;
        }

        // Rate limit: minimum 3 seconds between pause/resume toggles
        if (gameState.pausedAt && Date.now() - gameState.pausedAt < 3000) {
          callback?.({ success: false, error: 'Please wait before resuming' });
          return;
        }

        const remainingMs = gameState.turnTimeRemainingMs;

        // Clear pause state
        gameState.paused = false;
        gameState.pausedBy = null;
        gameState.turnStartedAt = Date.now(); // Reset for client timer display
        gameState.pausedAt = null;
        gameState.turnTimeRemainingMs = null;

        // Restart the turn timer with remaining time (only during playing phase)
        if (gameState.phase === 'playing' && remainingMs != null && remainingMs > 0) {
          startTurnTimerWithDuration(data.roomCode, remainingMs, (rc) => {
            handleTurnTimeout(io, rc);
          });
        } else if (gameState.phase === 'playing') {
          // Fallback: start a full turn timer
          startTurnTimer(data.roomCode, (rc) => {
            handleTurnTimeout(io, rc);
          });
        }

        // Save to DB
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        callback?.({ success: true });

        // Broadcast gameResumed to all players (F-274)
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('gameResumed', {
              turnStartedAt: gameState.turnStartedAt,
            });
          }
        }

        // Also broadcast updated game state so clients see paused=false
        await broadcastGameState(io, data.roomCode, gameState);

        console.log(
          `Room ${data.roomCode}: ${getUsername(gameState, data.playerId)} resumed the game (remaining: ${remainingMs}ms)`,
        );
      } catch (error) {
        console.error('Error in resumeGame:', error);
        callback?.({ success: false, error: 'Failed to resume game' });
      } finally {
        release();
      }
    },
  );
}

import { Server as SocketIOServer } from 'socket.io';
import { RoomModel } from '../models/Room';
import { getRoomMutex } from '../utils/roomLock';
import {
  chooseBotAction,
  chooseBotSpecialEffectResponse,
  shouldBotCallCheck,
} from '../game/BotPlayer';
import {
  handleDrawFromDeck,
  handleTakeDiscard,
  processDiscardChoice,
  handleBurnAttempt,
  applyRedJackSwap,
  applyRedQueenPeek,
  processRedKingChoice,
} from '../game/ActionHandler';
import {
  validatePlayerTurn,
  advanceTurn,
  isRoundOver,
  getCurrentTurnPlayerId,
  getAvailableActions,
  callCheck,
} from '../game/TurnManager';
import { computeRoundResult, computeGameEndResult } from '../game/Scoring';
import { sanitizeGameState } from '../game/GameSetup';
import { clearTurnTimer, startTurnTimer } from '../game/TurnTimer';
import { getSocketByPlayer } from '../socket/playerMapping';
import type { GameState, BotDifficulty, Card } from '../types/game.types';

// ============================================================
// Bot Think Delays (ms) — makes bot feel more natural
// ============================================================

const BOT_THINK_DELAY_MS: Record<BotDifficulty, number> = {
  easy: 1500,
  expert: 900,
};

const BOT_EFFECT_DELAY_MS = 800;

// ============================================================
// Helpers
// ============================================================

async function broadcastGameState(io: SocketIOServer, gameState: GameState): Promise<void> {
  for (const player of gameState.players) {
    const socketId = getSocketByPlayer(player.playerId);
    if (!socketId) continue;
    const clientState = sanitizeGameState(gameState, player.playerId);
    io.to(socketId).emit('gameStateUpdated', clientState);
  }
}

function emitYourTurnFromBot(io: SocketIOServer, roomCode: string, gameState: GameState): void {
  const turnPlayerId = getCurrentTurnPlayerId(gameState);
  if (!turnPlayerId) return;

  gameState.turnStartedAt = Date.now();

  const currentPlayer = gameState.players.find((p) => p.playerId === turnPlayerId);

  const socketId = getSocketByPlayer(turnPlayerId);
  if (socketId) {
    io.to(socketId).emit('yourTurn', {
      playerId: turnPlayerId,
      canCheck: gameState.checkCalledBy === null,
      availableActions: getAvailableActions(gameState),
      turnStartedAt: gameState.turnStartedAt,
    });
  }

  // Always clear the previous turn timer first to prevent stale
  // timers from a prior human turn firing during a bot transition.
  clearTurnTimer(roomCode);

  // Start a safety turn timer. This acts as a fallback in case a bot
  // gets stuck or a human doesn't act within 30 seconds.
  // Only start the timer for non-bot players (bot turns are managed
  // by scheduleBotTurnIfNeeded which has its own scheduling).
  if (!currentPlayer?.isBot) {
    startTurnTimer(roomCode, (rc) => {
      handleBotTurnTimeout(io, rc).catch((err) => {
        console.error(`Room ${rc}: Turn timeout handler error:`, err);
      });
    });
  }
}

/**
 * Called when a bot's 30-second turn timer fires (bot got stuck).
 * Auto-advances the turn so the game doesn't freeze.
 */
async function handleBotTurnTimeout(io: SocketIOServer, roomCode: string): Promise<void> {
  const release = await getRoomMutex(roomCode).acquire();
  try {
    const room = await RoomModel.findOne({ roomCode });
    if (!room || !room.gameState) return;

    const gameState = room.gameState as unknown as GameState;
    if (gameState.phase !== 'playing') return;

    const timedOutPlayer = gameState.players[gameState.currentTurnIndex];
    if (!timedOutPlayer) return;

    console.log(`Room ${roomCode}: ${timedOutPlayer.username} turn timed out — auto-advancing`);

    // If the bot has a pending drawn card, discard it
    if (gameState.drawnCard && gameState.drawnByPlayerId === timedOutPlayer.playerId) {
      processDiscardChoice(gameState, timedOutPlayer.playerId, null);
    }

    // If there's a pending special effect for this bot, clear it
    if (gameState.pendingEffect && gameState.pendingEffect.playerId === timedOutPlayer.playerId) {
      if (gameState.pendingEffect.redKingCards) {
        gameState.deck.push(...gameState.pendingEffect.redKingCards);
      }
      gameState.pendingEffect = null;
    }

    // Broadcast timeout notification to human players
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
    const roundEnded = await botAdvanceTurnAndCheckRoundEnd(io, roomCode, room, gameState);

    if (!roundEnded) {
      room.gameState = gameState;
      room.markModified('gameState');
      await room.save();

      emitYourTurnFromBot(io, roomCode, gameState);
      await broadcastGameState(io, gameState);
      scheduleBotTurnIfNeeded(io, roomCode, gameState);
    }
  } catch (error) {
    console.error(`Room ${roomCode}: Error in handleBotTurnTimeout:`, error);
  } finally {
    release();
  }
}

async function botAdvanceTurnAndCheckRoundEnd(
  io: SocketIOServer,
  roomCode: string,
  room: InstanceType<typeof RoomModel>,
  gameState: GameState,
): Promise<boolean> {
  advanceTurn(gameState);

  if (!isRoundOver(gameState)) {
    return false;
  }

  clearTurnTimer(roomCode);

  const roundResult = computeRoundResult(gameState);

  room.gameState = gameState;
  room.markModified('gameState');
  await room.save();

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
    room.gameState = gameState;
    room.markModified('gameState');
    await room.save();

    for (const player of gameState.players) {
      const sid = getSocketByPlayer(player.playerId);
      if (sid) {
        io.to(sid).emit('gameEnded', gameEndResult);
      }
    }
  }

  return true;
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * If the current turn player is a bot, schedule their turn after a delay.
 */
export function scheduleBotTurnIfNeeded(
  io: SocketIOServer,
  roomCode: string,
  gameState: GameState,
): void {
  const currentPlayerId = getCurrentTurnPlayerId(gameState);
  if (!currentPlayerId) return;

  const currentPlayer = gameState.players.find((p) => p.playerId === currentPlayerId);
  if (!currentPlayer?.isBot) return;

  const difficulty: BotDifficulty = currentPlayer.botDifficulty ?? 'easy';
  const delay = BOT_THINK_DELAY_MS[difficulty];

  console.log(`Room ${roomCode}: Scheduling bot turn for ${currentPlayerId} in ${delay}ms`);

  setTimeout(() => {
    executeBotTurn(io, roomCode, currentPlayerId, difficulty).catch((err) => {
      console.error(`Room ${roomCode}: Bot turn error for ${currentPlayerId}:`, err);
    });
  }, delay);
}

// ============================================================
// Execute Bot Turn
// ============================================================

async function executeBotTurn(
  io: SocketIOServer,
  roomCode: string,
  botPlayerId: string,
  difficulty: BotDifficulty,
): Promise<void> {
  const release = await getRoomMutex(roomCode).acquire();
  let released = false;
  try {
    const room = await RoomModel.findOne({ roomCode });
    if (!room || !room.gameState) return;

    const gameState = room.gameState as unknown as GameState;

    if (gameState.phase !== 'playing') return;
    if (gameState.paused) return;
    const currentPlayerId = getCurrentTurnPlayerId(gameState);
    if (currentPlayerId !== botPlayerId) return;

    console.log(`Room ${roomCode}: Bot ${botPlayerId} (${difficulty}) executing turn`);

    // Check if the bot should call CHECK before taking their action (F-059)
    if (shouldBotCallCheck(gameState, botPlayerId, difficulty)) {
      const checkResult = callCheck(gameState, botPlayerId);
      if (checkResult.success) {
        // Save check state
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();

        // Broadcast CHECK notification to all players
        const botPlayer = gameState.players.find((p) => p.playerId === botPlayerId);
        for (const player of gameState.players) {
          const sid = getSocketByPlayer(player.playerId);
          if (sid) {
            io.to(sid).emit('checkCalled', {
              playerId: botPlayerId,
              username: botPlayer?.username ?? 'Bot',
            });
          }
        }

        console.log(`Room ${roomCode}: Bot ${botPlayerId} called CHECK (hand value qualifies)`);
      }
    }

    // Choose action
    const action = chooseBotAction(gameState, botPlayerId, difficulty);

    if (action.type === 'burn') {
      const burnSlot = action.burnSlot;
      if (!burnSlot) return;
      if (validatePlayerTurn(gameState, botPlayerId)) return;

      const burnResult = handleBurnAttempt(gameState, botPlayerId, burnSlot);

      io.to(roomCode).emit('burnResult', {
        playerId: botPlayerId,
        slot: burnSlot,
        burnSuccess: burnResult.burnSuccess ?? burnResult.success,
        burnedCard: burnResult.burnedCard,
        penaltySlot: burnResult.penaltySlot,
      });

      const roundEnded = await botAdvanceTurnAndCheckRoundEnd(io, roomCode, room, gameState);
      if (!roundEnded) {
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();
        emitYourTurnFromBot(io, roomCode, gameState);
        await broadcastGameState(io, gameState);
        scheduleBotTurnIfNeeded(io, roomCode, gameState);
      }
    } else if (action.type === 'takeDiscard') {
      const swapSlot = action.swapSlot;
      if (!swapSlot) return;
      if (validatePlayerTurn(gameState, botPlayerId)) return;
      if (gameState.discardPile.length === 0) return;

      // takeDiscard sets drawnCard/drawnSource='discard'
      handleTakeDiscard(gameState, botPlayerId);

      // processDiscardChoice swaps the drawn card into the slot
      processDiscardChoice(gameState, botPlayerId, swapSlot);

      io.to(roomCode).emit('cardTakenFromDiscard', {
        playerId: botPlayerId,
        slot: swapSlot,
      });

      const roundEnded = await botAdvanceTurnAndCheckRoundEnd(io, roomCode, room, gameState);
      if (!roundEnded) {
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();
        emitYourTurnFromBot(io, roomCode, gameState);
        await broadcastGameState(io, gameState);
        scheduleBotTurnIfNeeded(io, roomCode, gameState);
      }
    } else {
      // drawDeck — release lock, execute async draw+discard flow
      if (validatePlayerTurn(gameState, botPlayerId)) return;
      handleDrawFromDeck(gameState, botPlayerId);

      if (!gameState.drawnCard) return;

      io.to(roomCode).emit('cardDrawn', { playerId: botPlayerId });

      // Decide which slot to swap (null = discard drawn card)
      const preferredSlot = action.discardSlot ?? null;
      let swapSlot: string | null = preferredSlot;

      if (preferredSlot) {
        const player = gameState.players.find((p) => p.playerId === botPlayerId);
        const slotCard = player?.hand.find((h) => h.slot === preferredSlot)?.card;
        if (slotCard && gameState.drawnCard.value >= slotCard.value) {
          swapSlot = null; // drawn card isn't better, discard it
        }
      }

      // Save intermediate state (drawnCard pending)
      room.gameState = gameState;
      room.markModified('gameState');
      await room.save();
      // Release lock before sleeping
      released = true;
      release();

      await new Promise((resolve) => setTimeout(resolve, BOT_EFFECT_DELAY_MS));

      // Re-acquire and process discard choice
      const release2 = await getRoomMutex(roomCode).acquire();
      try {
        const freshRoom = await RoomModel.findOne({ roomCode });
        if (!freshRoom || !freshRoom.gameState) return;
        const freshState = freshRoom.gameState as unknown as GameState;

        if (freshState.drawnByPlayerId !== botPlayerId || !freshState.drawnCard) return;

        processDiscardChoice(freshState, botPlayerId, swapSlot);

        const discardedCard = freshState.discardPile[freshState.discardPile.length - 1];
        io.to(roomCode).emit('cardDiscarded', {
          playerId: botPlayerId,
          slot: swapSlot,
          card: discardedCard,
        });

        // Handle any pending special effect
        if (freshState.pendingEffect && freshState.pendingEffect.playerId === botPlayerId) {
          await new Promise((resolve) => setTimeout(resolve, BOT_EFFECT_DELAY_MS));
          await executeBotSpecialEffect(
            io,
            roomCode,
            freshRoom,
            freshState,
            botPlayerId,
            difficulty,
          );
          return;
        }

        const roundEnded = await botAdvanceTurnAndCheckRoundEnd(
          io,
          roomCode,
          freshRoom,
          freshState,
        );
        if (!roundEnded) {
          freshRoom.gameState = freshState;
          freshRoom.markModified('gameState');
          await freshRoom.save();
          emitYourTurnFromBot(io, roomCode, freshState);
          await broadcastGameState(io, freshState);
          scheduleBotTurnIfNeeded(io, roomCode, freshState);
        }
      } finally {
        release2();
      }
      return; // early return — lock was already released above
    }
  } catch (err) {
    console.error(`Room ${roomCode}: Bot turn execution error:`, err);
  } finally {
    // Only release if we haven't already done so in the drawDeck branch
    if (!released) {
      release();
    }
  }
}

// ============================================================
// Bot Special Effect Handler
// ============================================================

async function executeBotSpecialEffect(
  io: SocketIOServer,
  roomCode: string,
  room: InstanceType<typeof RoomModel>,
  gameState: GameState,
  botPlayerId: string,
  difficulty: BotDifficulty,
): Promise<void> {
  const effect = gameState.pendingEffect;
  if (!effect) return;

  if (effect.type === 'redJack') {
    const response = chooseBotSpecialEffectResponse(gameState, botPlayerId, difficulty, 'redJack');

    if (response.skip || !response.ownSlot || !response.targetPlayerId || !response.targetSlot) {
      gameState.pendingEffect = null;
      io.to(roomCode).emit('specialEffectResolved', {
        effect: 'redJack',
        playerId: botPlayerId,
        skipped: true,
      });
    } else {
      applyRedJackSwap(
        gameState,
        botPlayerId,
        response.ownSlot,
        response.targetPlayerId,
        response.targetSlot,
      );
      io.to(roomCode).emit('specialEffectResolved', {
        effect: 'redJack',
        playerId: botPlayerId,
        skipped: false,
        swapperSlot: response.ownSlot,
        targetPlayerId: response.targetPlayerId,
        targetSlot: response.targetSlot,
      });
    }
  } else if (effect.type === 'redQueen') {
    const response = chooseBotSpecialEffectResponse(gameState, botPlayerId, difficulty, 'redQueen');
    if (response.peekSlot) {
      const peekResult = applyRedQueenPeek(gameState, botPlayerId, response.peekSlot);
      if (peekResult.success && peekResult.card) {
        console.log(
          `Room ${roomCode}: Bot ${botPlayerId} peeked slot ${response.peekSlot}: ${peekResult.card.rank}${peekResult.card.suit}`,
        );
      }
    }
    gameState.pendingEffect = null;
    io.to(roomCode).emit('specialEffectResolved', {
      effect: 'redQueen',
      playerId: botPlayerId,
    });
  } else if (effect.type === 'redKing') {
    const redKingCards = effect.redKingCards;
    if (!redKingCards || redKingCards.length < 2) {
      gameState.pendingEffect = null;
    } else {
      const cards: [Card, Card] = [redKingCards[0], redKingCards[1]];
      const response = chooseBotSpecialEffectResponse(
        gameState,
        botPlayerId,
        difficulty,
        'redKing',
        cards,
      );

      const keepIndices = response.keepIndices ?? [];
      const discardSlots = response.discardSlots ?? [];

      let choice: Parameters<typeof processRedKingChoice>[3];

      if (keepIndices.length === 0) {
        choice = { type: 'returnBoth' };
      } else if (keepIndices.length === 1) {
        const keepIndex = keepIndices[0] as 0 | 1;
        choice = {
          type: 'keepOne',
          keepIndex,
          replaceSlot: discardSlots[0],
        };
      } else {
        choice = {
          type: 'keepBoth',
          replaceSlots: [discardSlots[0], discardSlots[1]] as [string, string],
        };
      }

      processRedKingChoice(gameState, botPlayerId, cards, choice);

      io.to(roomCode).emit('specialEffectResolved', {
        effect: 'redKing',
        playerId: botPlayerId,
        cardsKept: keepIndices.length,
      });
    }
  }

  const roundEnded = await botAdvanceTurnAndCheckRoundEnd(io, roomCode, room, gameState);
  if (!roundEnded) {
    room.gameState = gameState;
    room.markModified('gameState');
    await room.save();
    emitYourTurnFromBot(io, roomCode, gameState);
    await broadcastGameState(io, gameState);
    scheduleBotTurnIfNeeded(io, roomCode, gameState);
  }
}

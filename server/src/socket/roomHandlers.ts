import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomModel } from '../models/Room';
import {
  initializeGameState,
  sanitizeGameState,
  getPeekedCards,
  addPlayerToActiveGame,
} from '../game/GameSetup';
import { removePlayerFromGame } from '../game/TurnManager';
import {
  generatePlayerId,
  generateRoomCode,
  validateRoomCode,
  validateUsername,
} from '../utils/helpers';
import { getRoomMutex, deleteRoomMutex } from '../utils/roomLock';
import {
  registerPlayer,
  unregisterPlayer,
  getSocketByPlayer,
  startGracePeriod,
  cancelGracePeriod,
  hasPendingDisconnect,
  reconnectPlayer,
  DISCONNECT_GRACE_MS,
} from './playerMapping';
import { emitYourTurn, broadcastGameState } from './gameHandlers';
import { scheduleBotTurnIfNeeded } from '../utils/botScheduler';
import type { GameState, BotDifficulty, ClientGameState, PeekedCard } from '../types/game.types';

// ============================================================
// Constants
// ============================================================

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

/** Grace period for lobby disconnects (page refresh, tab switch) */
const LOBBY_GRACE_MS = 60_000;

/** Maximum number of rooms that can exist simultaneously */
const MAX_ROOMS = 5;

// ============================================================
// Bot Names — European-inspired random names
// ============================================================

const BOT_NAMES = [
  'Luca',
  'Sofia',
  'Henrik',
  'Elena',
  'Marco',
  'Astrid',
  'Pierre',
  'Ingrid',
  'Klaus',
  'Clara',
  'Hugo',
  'Freya',
  'Lars',
  'Rosa',
  'Felix',
  'Mila',
  'Oscar',
  'Elsa',
  'Anton',
  'Nora',
  'Emil',
  'Alma',
  'Axel',
  'Iris',
  'Leon',
  'Ada',
  'Finn',
  'Vera',
  'Otto',
  'Greta',
];

/**
 * Returns a random bot name that doesn't collide with existing player names.
 */
function getRandomBotName(existingNames: string[]): string {
  const available = BOT_NAMES.filter((name) => !existingNames.includes(name));
  if (available.length === 0) {
    // Fallback if all names are taken (very unlikely with 30 names and max 6 players)
    return `Bot ${Math.floor(Math.random() * 1000)}`;
  }
  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================
// Helper: Broadcast room state to all members (F-020)
// ============================================================

async function broadcastRoomUpdate(io: SocketIOServer, roomCode: string): Promise<void> {
  const room = await RoomModel.findOne({ roomCode });
  if (!room) return;

  io.to(roomCode).emit('roomUpdated', {
    roomCode: room.roomCode,
    host: room.host,
    players: room.players.map((p) => ({
      id: p.id,
      username: p.username,
      isBot: p.isBot ?? false,
      botDifficulty: p.botDifficulty,
      isReady: p.isBot ? true : (p.isReady ?? false),
    })),
    status: room.status,
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
  });
}

// ============================================================
// Room Event Handlers
// ============================================================

export function registerRoomHandlers(io: SocketIOServer, socket: Socket): void {
  // ----------------------------------------------------------
  // F-016: Create Room
  // ----------------------------------------------------------
  socket.on(
    'createRoom',
    async (
      data: { username: string; guestId?: string },
      callback?: (response: {
        success: boolean;
        roomCode?: string;
        playerId?: string;
        room?: {
          roomCode: string;
          host: string;
          players: { id: string; username: string }[];
          status: string;
          maxPlayers: number;
          minPlayers: number;
        };
        error?: string;
        gameState?: ClientGameState;
        peekedCards?: PeekedCard[];
      }) => void,
    ) => {
      // Check room limit before creating
      const existingRoomCount = await RoomModel.countDocuments({
        status: { $in: ['lobby', 'playing'] },
      });
      if (existingRoomCount >= MAX_ROOMS) {
        callback?.({
          success: false,
          error: `Server is full — maximum ${MAX_ROOMS} active rooms allowed`,
        });
        return;
      }

      // Generate room code first (outside lock since it's a new room)
      let roomCode: string;
      let attempts = 0;
      do {
        roomCode = generateRoomCode();
        attempts++;
        if (attempts > 10) {
          callback?.({ success: false, error: 'Failed to generate room code' });
          return;
        }
      } while (await RoomModel.exists({ roomCode }));

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const username = validateUsername(data?.username);
        if (!username) {
          callback?.({ success: false, error: 'Username must be 1-20 characters' });
          return;
        }

        const playerId = generatePlayerId();

        // Create room in DB (F-021: status starts as 'lobby')
        const room = new RoomModel({
          roomCode,
          host: playerId,
          players: [{ id: playerId, username }],
          gameState: null,
          status: 'lobby',
        });
        await room.save();

        // Join socket.io room and register mapping
        await socket.join(roomCode);
        registerPlayer(socket.id, playerId, roomCode, username);

        console.log(`Room ${roomCode} created by ${username} (${playerId})`);

        callback?.({
          success: true,
          roomCode,
          playerId,
          room: {
            roomCode: room.roomCode,
            host: room.host,
            players: room.players.map((p) => ({ id: p.id, username: p.username })),
            status: room.status,
            maxPlayers: MAX_PLAYERS,
            minPlayers: MIN_PLAYERS,
          },
        });
        await broadcastRoomUpdate(io, roomCode);
      } catch (error) {
        console.error('Error creating room:', error);
        callback?.({ success: false, error: 'Failed to create room' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // F-017: Join Room
  // ----------------------------------------------------------
  socket.on(
    'joinRoom',
    async (
      data: { roomCode: string; username: string; guestId?: string },
      callback?: (response: {
        success: boolean;
        playerId?: string;
        room?: {
          roomCode: string;
          host: string;
          players: { id: string; username: string }[];
          status: string;
        };
        error?: string;
        gameState?: ClientGameState;
        peekedCards?: PeekedCard[];
      }) => void,
    ) => {
      const username = validateUsername(data?.username);
      if (!username) {
        callback?.({ success: false, error: 'Username must be 1-20 characters' });
        return;
      }

      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          callback?.({ success: false, error: 'Room not found' });
          return;
        }

        // F-364: Allow joining rooms in 'lobby' or 'playing' status
        if (room.status !== 'lobby' && room.status !== 'playing') {
          callback?.({ success: false, error: 'Cannot join this room' });
          return;
        }

        if (room.players.length >= MAX_PLAYERS) {
          callback?.({ success: false, error: 'Room is full' });
          return;
        }

        // F-364: Block mid-game join during non-playing phases (roundEnd, gameEnd, dealing)
        if (room.status === 'playing' && room.gameState) {
          const gs = room.gameState as unknown as GameState;
          if (gs.phase !== 'playing' && gs.phase !== 'peeking') {
            callback?.({ success: false, error: 'Cannot join during this game phase' });
            return;
          }
        }

        const playerId = generatePlayerId();

        room.players.push({ id: playerId, username });

        // Join socket.io room and register mapping
        await socket.join(roomCode);
        registerPlayer(socket.id, playerId, roomCode, username);

        // F-364: Mid-game join — add player to active game state
        if (room.status === 'playing' && room.gameState) {
          const gameState = room.gameState as unknown as GameState;
          const newPlayer = addPlayerToActiveGame(gameState, { id: playerId, username });

          if (!newPlayer) {
            // Undo: remove the player we just added to the room
            room.players = room.players.filter((p) => p.id !== playerId);
            await room.save();
            callback?.({ success: false, error: 'Not enough cards to join mid-game' });
            return;
          }

          // Save updated game state with new player
          room.gameState = gameState;
          room.markModified('gameState');
          await room.save();

          console.log(
            `${username} (${playerId}) joined active game in room ${roomCode} (mid-game join, score: ${newPlayer.totalScore})`,
          );

          // Send game state to the new player with peeked cards
          const clientState = sanitizeGameState(gameState, playerId);
          const peekedCards = getPeekedCards(newPlayer);

          callback?.({
            success: true,
            playerId,
            room: {
              roomCode: room.roomCode,
              host: room.host,
              players: room.players.map((p) => ({ id: p.id, username: p.username })),
              status: room.status,
            },
            gameState: clientState,
            peekedCards,
          });

          // Notify existing players that someone joined the active game
          socket.to(roomCode).emit('playerJoinedGame', {
            playerId,
            username,
            score: newPlayer.totalScore,
          });

          // Broadcast updated game state to all existing players
          await broadcastGameState(io, roomCode, gameState);
          await broadcastRoomUpdate(io, roomCode);
          return;
        }

        // Standard lobby join path
        await room.save();

        console.log(`${username} (${playerId}) joined room ${roomCode}`);

        callback?.({
          success: true,
          playerId,
          room: {
            roomCode: room.roomCode,
            host: room.host,
            players: room.players.map((p) => ({ id: p.id, username: p.username })),
            status: room.status,
          },
        });
        await broadcastRoomUpdate(io, roomCode);
      } catch (error) {
        console.error('Error joining room:', error);
        callback?.({ success: false, error: 'Failed to join room' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // F-018: Leave Room
  // ----------------------------------------------------------
  socket.on(
    'leaveRoom',
    async (
      data: { roomCode: string; playerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        await handlePlayerLeave(io, socket, roomCode, data.playerId);
        callback?.({ success: true });
      } catch (error) {
        console.error('Error leaving room:', error);
        callback?.({ success: false, error: 'Failed to leave room' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // F-019: Start Game (with full game init — Feature 5)
  // ----------------------------------------------------------
  socket.on(
    'startGame',
    async (
      data: { roomCode: string; playerId: string; targetScore?: number },
      callback?: (response: {
        success: boolean;
        error?: string;
        gameState?: ClientGameState;
        peekedCards?: PeekedCard[];
      }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          callback?.({ success: false, error: 'Room not found' });
          return;
        }

        // Validate host
        if (room.host !== data.playerId) {
          callback?.({ success: false, error: 'Only the host can start the game' });
          return;
        }

        // Validate player count
        if (room.players.length < MIN_PLAYERS) {
          callback?.({
            success: false,
            error: `Need at least ${MIN_PLAYERS} players to start`,
          });
          return;
        }

        // Validate room status (F-021)
        if (room.status !== 'lobby') {
          callback?.({ success: false, error: 'Game already started' });
          return;
        }

        // Validate all human players are ready
        const unreadyHumans = room.players.filter(
          (p) => !p.isBot && p.id !== room.host && !p.isReady,
        );
        if (unreadyHumans.length > 0) {
          callback?.({ success: false, error: 'All players must be ready before starting' });
          return;
        }

        // Validate targetScore (F-310): must be integer between 50 and 150, default 70
        const rawTargetScore = data?.targetScore;
        let targetScore = 70;
        if (rawTargetScore !== undefined) {
          const parsed = Math.floor(Number(rawTargetScore));
          if (!Number.isFinite(parsed) || parsed < 50 || parsed > 150) {
            callback?.({ success: false, error: 'Target score must be between 50 and 150' });
            return;
          }
          targetScore = parsed;
        }

        // Initialize game state (F-028, F-029, F-032)
        const gameState = initializeGameState(
          room.players.map((p) => ({
            id: p.id,
            username: p.username,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty as BotDifficulty | undefined,
          })),
          undefined,
          1,
          targetScore,
        );

        // Update room in DB
        room.status = 'playing';
        room.gameState = gameState;
        await room.save();

        console.log(`Game started in room ${roomCode} by ${data.playerId}`);

        // Build the host's own sanitized state + peeked cards so the
        // callback can carry them — the host doesn't need to rely on
        // receiving the gameStarted event (avoids stale-socket-mapping race).
        const hostPlayer = gameState.players.find((p) => p.playerId === data.playerId);
        const hostClientState = hostPlayer
          ? sanitizeGameState(gameState, data.playerId)
          : undefined;
        const hostPeekedCards = hostPlayer ? getPeekedCards(hostPlayer) : undefined;

        callback?.({
          success: true,
          gameState: hostClientState,
          peekedCards: hostPeekedCards,
        });

        // Emit 'gameStarted' privately to each player with their own
        // sanitized state and peeked cards (F-030)
        for (const player of gameState.players) {
          const socketId = getSocketByPlayer(player.playerId);
          if (!socketId) continue;

          const clientState = sanitizeGameState(gameState, player.playerId);
          const peekedCards = getPeekedCards(player);

          io.to(socketId).emit('gameStarted', {
            gameState: clientState,
            peekedCards,
          });
        }
      } catch (error) {
        console.error('Error starting game:', error);
        callback?.({ success: false, error: 'Failed to start game' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // Disconnect handler — grace period for in-game players
  // ----------------------------------------------------------
  socket.on('disconnect', async () => {
    const mapping = unregisterPlayer(socket.id);
    if (!mapping) return;

    console.log(`Player ${mapping.username} (${mapping.playerId}) disconnected`);

    const release = await getRoomMutex(mapping.roomCode).acquire();
    try {
      const room = await RoomModel.findOne({ roomCode: mapping.roomCode });
      if (!room) return;

      const isInGame = room.status === 'playing' && room.gameState;

      // Use a grace period for BOTH lobby and in-game disconnects.
      // Lobby gets a shorter window (15s) — enough for page refresh / tab switch.
      // In-game gets the full 45s grace period.
      const gracePeriodMs = isInGame ? DISCONNECT_GRACE_MS : LOBBY_GRACE_MS;

      console.log(
        `Starting ${isInGame ? 'game' : 'lobby'} grace period (${gracePeriodMs / 1000}s) for ${mapping.username} (${mapping.playerId}) in room ${mapping.roomCode}`,
      );

      // If disconnecting player is the host, immediately reassign to next
      // human player so host-only actions (start round, kick, pause) are
      // not blocked during the entire grace period.
      const wasHost = room.host === mapping.playerId;
      if (wasHost) {
        const nextHuman = room.players.find((p) => p.id !== mapping.playerId && !p.isBot);
        if (nextHuman) {
          room.host = nextHuman.id;
          await room.save();
          console.log(
            `Host temporarily reassigned from ${mapping.username} to ${nextHuman.username} in room ${mapping.roomCode}`,
          );
        }
      }

      // Notify other players that this player disconnected (but hasn't left yet)
      io.to(mapping.roomCode).emit('playerDisconnected', {
        playerId: mapping.playerId,
        username: mapping.username,
      });

      // Broadcast updated room (includes new host if reassigned)
      if (wasHost) {
        await broadcastRoomUpdate(io, mapping.roomCode);
      }

      startGracePeriod(
        mapping,
        async () => {
          // Grace period expired — remove the player for real
          console.log(
            `Grace period expired for ${mapping.username} (${mapping.playerId}) in room ${mapping.roomCode}`,
          );
          const expireRelease = await getRoomMutex(mapping.roomCode).acquire();
          try {
            await handlePlayerLeave(io, socket, mapping.roomCode, mapping.playerId);
          } catch (error) {
            console.error('Error in grace period expiry handler:', error);
          } finally {
            expireRelease();
          }
        },
        gracePeriodMs,
        wasHost,
      );
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    } finally {
      release();
    }
  });

  // ----------------------------------------------------------
  // F-203/F-306/F-365: Kick Player (host-only, lobby + in-game)
  // ----------------------------------------------------------
  socket.on(
    'kickPlayer',
    async (
      data: { roomCode: string; hostId: string; targetPlayerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          callback?.({ success: false, error: 'Room not found' });
          return;
        }

        if (room.host !== data?.hostId) {
          callback?.({ success: false, error: 'Only the host can kick players' });
          return;
        }

        if (room.status === 'finished') {
          callback?.({ success: false, error: 'Cannot kick players from a finished game' });
          return;
        }

        if (data.targetPlayerId === data.hostId) {
          callback?.({ success: false, error: 'Host cannot kick themselves' });
          return;
        }

        const targetIndex = room.players.findIndex((p) => p.id === data.targetPlayerId);
        if (targetIndex === -1) {
          callback?.({ success: false, error: 'Player not found in room' });
          return;
        }

        const targetUsername = room.players[targetIndex].username;
        room.players.splice(targetIndex, 1);

        // Notify the kicked player via their socket and clean up their mapping
        const targetSocketId = getSocketByPlayer(data.targetPlayerId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('kicked', {
            roomCode,
            reason: 'You were removed by the host',
          });
          unregisterPlayer(targetSocketId);
        }

        console.log(
          `Player ${targetUsername} (${data.targetPlayerId}) kicked from room ${roomCode}`,
        );

        // F-365: Handle in-game kick — remove from active game state
        if (room.gameState && room.status === 'playing') {
          const gameState = room.gameState as unknown as GameState;
          const result = removePlayerFromGame(gameState, data.targetPlayerId);

          if (result.removed) {
            console.log(
              `Player ${targetUsername} removed from active game in room ${roomCode} (kicked)`,
            );

            if (result.gameEnded) {
              room.status = 'finished';
              console.log(`Game ended in room ${roomCode} — not enough players after kick`);
            }

            room.gameState = gameState;
            room.markModified('gameState');
            await room.save();

            // Notify remaining players someone was kicked
            io.to(roomCode).emit('playerLeftGame', {
              username: targetUsername,
              gameEnded: result.gameEnded,
            });

            // Broadcast updated game state to remaining players
            for (const player of gameState.players) {
              const sid = getSocketByPlayer(player.playerId);
              if (!sid) continue;
              const clientState = sanitizeGameState(gameState, player.playerId);
              io.to(sid).emit('gameStateUpdated', clientState);
            }

            // If the turn changed, notify the new current player
            if (result.turnChanged && !result.gameEnded && gameState.phase === 'playing') {
              emitYourTurn(io, roomCode, gameState);
              scheduleBotTurnIfNeeded(io, roomCode, gameState);

              room.gameState = gameState;
              room.markModified('gameState');
              await room.save();
            }

            callback?.({ success: true });
            return;
          }
        }

        // Lobby kick path
        await room.save();
        callback?.({ success: true });
        await broadcastRoomUpdate(io, roomCode);
      } catch (error) {
        console.error('Error kicking player:', error);
        callback?.({ success: false, error: 'Failed to kick player' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // Rejoin Room — reconnect after disconnect (grace period OR lobby refresh)
  // ----------------------------------------------------------
  socket.on(
    'rejoinRoom',
    async (
      data: { playerId: string; roomCode: string },
      callback?: (response: {
        success: boolean;
        room?: {
          roomCode: string;
          host: string;
          players: { id: string; username: string }[];
          status: string;
        };
        gameState?: ReturnType<typeof sanitizeGameState>;
        peekedCards?: ReturnType<typeof getPeekedCards>;
        /** Restored drawn card if the player disconnected mid-draw */
        drawnCard?: import('../types/game.types').Card | null;
        /** Whether the drawn card came from the discard pile */
        drawnFromDiscard?: boolean;
        /** Restored pending special effect if the player disconnected mid-effect */
        pendingEffect?: {
          effect: string;
          playerId: string;
          cards?: import('../types/game.types').Card[];
        } | null;
        error?: string;
      }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      if (!data?.playerId) {
        callback?.({ success: false, error: 'Missing player ID' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          cancelGracePeriod(data.playerId);
          callback?.({ success: false, error: 'Room no longer exists' });
          return;
        }

        // Verify this player is still in the room
        const playerInRoom = room.players.find((p) => p.id === data.playerId);
        if (!playerInRoom) {
          cancelGracePeriod(data.playerId);
          callback?.({ success: false, error: 'Player no longer in room' });
          return;
        }

        const hasPending = hasPendingDisconnect(data.playerId);

        if (hasPending) {
          // In-game reconnect path: cancel grace period, re-register
          const pending = reconnectPlayer(socket.id, data.playerId);
          if (!pending) {
            callback?.({ success: false, error: 'Reconnection failed' });
            return;
          }

          await socket.join(roomCode);
          console.log(
            `Player ${pending.mapping.username} (${data.playerId}) rejoined room ${roomCode} (grace period)`,
          );

          io.to(roomCode).emit('playerReconnected', {
            playerId: data.playerId,
            username: pending.mapping.username,
          });

          // Restore host role if the player was host when they disconnected
          if (pending.wasHost) {
            room.host = data.playerId;
            await room.save();
            await broadcastRoomUpdate(io, roomCode);
            console.log(
              `Host restored to ${pending.mapping.username} (${data.playerId}) in room ${roomCode}`,
            );
          }
        } else {
          // Lobby / fresh-tab path: player is still in DB but has no in-memory
          // mapping (e.g. they refreshed or had a brief disconnect not in a game).
          // Re-register directly with the stored username from the room document.
          registerPlayer(socket.id, data.playerId, roomCode, playerInRoom.username);
          await socket.join(roomCode);
          console.log(
            `Player ${playerInRoom.username} (${data.playerId}) rejoined room ${roomCode} (lobby/refresh)`,
          );
        }

        // Send current state back to the reconnected player
        if (room.status === 'playing' && room.gameState) {
          const gameState = room.gameState as unknown as GameState;
          const clientState = sanitizeGameState(gameState, data.playerId);

          // Restore mid-turn state if this player has a pending drawn card or effect
          let drawnCard: import('../types/game.types').Card | null = null;
          let drawnFromDiscard = false;
          let pendingEffect: {
            effect: string;
            playerId: string;
            cards?: import('../types/game.types').Card[];
          } | null = null;

          if (gameState.drawnByPlayerId === data.playerId && gameState.drawnCard) {
            drawnCard = gameState.drawnCard;
            drawnFromDiscard = gameState.drawnSource === 'discard';
          }

          if (gameState.pendingEffect && gameState.pendingEffect.playerId === data.playerId) {
            pendingEffect = {
              effect: gameState.pendingEffect.type,
              playerId: gameState.pendingEffect.playerId,
              cards: gameState.pendingEffect.redKingCards ?? undefined,
            };
          }

          // Restore peeked cards if still in the peeking phase
          let peekedCards: ReturnType<typeof getPeekedCards> | undefined;
          if (gameState.phase === 'peeking') {
            const player = gameState.players.find((p) => p.playerId === data.playerId);
            if (player) {
              peekedCards = getPeekedCards(player);
            }
          }

          callback?.({
            success: true,
            room: {
              roomCode: room.roomCode,
              host: room.host,
              players: room.players.map((p) => ({ id: p.id, username: p.username })),
              status: room.status,
            },
            gameState: clientState,
            peekedCards,
            drawnCard,
            drawnFromDiscard,
            pendingEffect,
          });

          // If it's this player's turn, re-emit yourTurn
          const currentTurnPlayer = gameState.players[gameState.currentTurnIndex];
          if (currentTurnPlayer?.playerId === data.playerId && gameState.phase === 'playing') {
            emitYourTurn(io, roomCode, gameState);
            scheduleBotTurnIfNeeded(io, roomCode, gameState);
            room.gameState = gameState;
            room.markModified('gameState');
            await room.save();
          }
        } else {
          callback?.({
            success: true,
            room: {
              roomCode: room.roomCode,
              host: room.host,
              players: room.players.map((p) => ({ id: p.id, username: p.username })),
              status: room.status,
            },
          });
        }
      } catch (error) {
        console.error('Error in rejoinRoom handler:', error);
        callback?.({ success: false, error: 'Failed to rejoin room' });
      } finally {
        release();
      }
    },
  );
  // ----------------------------------------------------------
  // F-300/F-301: Add Bot (host-only, lobby only)
  // ----------------------------------------------------------
  socket.on(
    'addBot',
    async (
      data: { roomCode: string; hostId: string; difficulty: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      const difficulty = data?.difficulty as BotDifficulty;
      if (!['easy', 'expert'].includes(difficulty)) {
        callback?.({ success: false, error: 'Invalid bot difficulty. Use easy or expert' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          callback?.({ success: false, error: 'Room not found' });
          return;
        }

        if (room.host !== data?.hostId) {
          callback?.({ success: false, error: 'Only the host can add bots' });
          return;
        }

        if (room.status !== 'lobby') {
          callback?.({ success: false, error: 'Can only add bots in the lobby' });
          return;
        }

        if (room.players.length >= MAX_PLAYERS) {
          callback?.({ success: false, error: 'Room is full' });
          return;
        }

        const botId = generatePlayerId();
        const botUsername = getRandomBotName(room.players.map((p) => p.username));

        room.players.push({
          id: botId,
          username: botUsername,
          isBot: true,
          botDifficulty: difficulty,
          isReady: true,
        });
        await room.save();

        console.log(`Bot ${botUsername} (${botId}) added to room ${roomCode} by host`);

        callback?.({ success: true });
        await broadcastRoomUpdate(io, roomCode);
      } catch (error) {
        console.error('Error adding bot:', error);
        callback?.({ success: false, error: 'Failed to add bot' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // F-300/F-301: Remove Bot (host-only, lobby only)
  // ----------------------------------------------------------
  socket.on(
    'removeBot',
    async (
      data: { roomCode: string; hostId: string; botPlayerId: string },
      callback?: (response: { success: boolean; error?: string }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          callback?.({ success: false, error: 'Room not found' });
          return;
        }

        if (room.host !== data?.hostId) {
          callback?.({ success: false, error: 'Only the host can remove bots' });
          return;
        }

        if (room.status !== 'lobby') {
          callback?.({ success: false, error: 'Can only remove bots in the lobby' });
          return;
        }

        const botIndex = room.players.findIndex(
          (p) => p.id === data.botPlayerId && p.isBot === true,
        );
        if (botIndex === -1) {
          callback?.({ success: false, error: 'Bot not found in room' });
          return;
        }

        const botUsername = room.players[botIndex].username;
        room.players.splice(botIndex, 1);
        await room.save();

        console.log(`Bot ${botUsername} (${data.botPlayerId}) removed from room ${roomCode}`);

        callback?.({ success: true });
        await broadcastRoomUpdate(io, roomCode);
      } catch (error) {
        console.error('Error removing bot:', error);
        callback?.({ success: false, error: 'Failed to remove bot' });
      } finally {
        release();
      }
    },
  );

  // ----------------------------------------------------------
  // Toggle Ready — player toggles their ready status in the lobby
  // ----------------------------------------------------------
  socket.on(
    'toggleReady',
    async (
      data: { roomCode: string; playerId: string },
      callback?: (response: { success: boolean; isReady?: boolean; error?: string }) => void,
    ) => {
      const roomCode = validateRoomCode(data?.roomCode);
      if (!roomCode) {
        callback?.({ success: false, error: 'Invalid room code' });
        return;
      }

      if (!data?.playerId) {
        callback?.({ success: false, error: 'Missing player ID' });
        return;
      }

      const release = await getRoomMutex(roomCode).acquire();
      try {
        const room = await RoomModel.findOne({ roomCode });
        if (!room) {
          callback?.({ success: false, error: 'Room not found' });
          return;
        }

        if (room.status !== 'lobby') {
          callback?.({ success: false, error: 'Can only toggle ready in the lobby' });
          return;
        }

        const player = room.players.find((p) => p.id === data.playerId);
        if (!player) {
          callback?.({ success: false, error: 'Player not found in room' });
          return;
        }

        if (player.isBot) {
          callback?.({ success: false, error: 'Bots are always ready' });
          return;
        }

        // Toggle ready state
        player.isReady = !player.isReady;
        await room.save();

        console.log(
          `Player ${player.username} (${data.playerId}) is now ${player.isReady ? 'ready' : 'not ready'} in room ${roomCode}`,
        );

        callback?.({ success: true, isReady: player.isReady });
        await broadcastRoomUpdate(io, roomCode);
      } catch (error) {
        console.error('Error toggling ready:', error);
        callback?.({ success: false, error: 'Failed to toggle ready status' });
      } finally {
        release();
      }
    },
  );
}

// ============================================================
// Shared: Remove player from room (F-018)
// ============================================================

async function handlePlayerLeave(
  io: SocketIOServer,
  socket: Socket,
  roomCode: string,
  playerId: string,
): Promise<void> {
  const room = await RoomModel.findOne({ roomCode });
  if (!room) return;

  // Remove player from room
  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return;

  room.players.splice(playerIndex, 1);
  socket.leave(roomCode);

  console.log(`Player ${playerId} left room ${roomCode}`);

  // If room is empty, delete it
  if (room.players.length === 0) {
    await RoomModel.deleteOne({ roomCode });
    deleteRoomMutex(roomCode);
    console.log(`Room ${roomCode} deleted (empty)`);
    return;
  }

  // Reassign host if the leaving player was host
  if (room.host === playerId) {
    // Pick the first human player as the new host (bots can't be hosts)
    const nextHuman = room.players.find((p) => !p.isBot);
    if (nextHuman) {
      room.host = nextHuman.id;
      console.log(`Host reassigned to ${nextHuman.username} in room ${roomCode}`);
    } else {
      // No human players left — only bots remain. Delete the room.
      await RoomModel.deleteOne({ roomCode });
      deleteRoomMutex(roomCode);
      console.log(`Room ${roomCode} deleted (no human players remaining)`);
      return;
    }
  }

  // Handle in-game removal if a game is active
  if (room.gameState && room.status === 'playing') {
    const gameState = room.gameState as unknown as GameState;
    const result = removePlayerFromGame(gameState, playerId);

    if (result.removed) {
      console.log(`Player ${result.username} removed from active game in room ${roomCode}`);

      if (result.gameEnded) {
        // Only 1 (or 0) players remain — end the game
        room.status = 'finished';
        console.log(`Game ended in room ${roomCode} — not enough players`);
      }

      // Save updated game state
      room.gameState = gameState;
      room.markModified('gameState');
      await room.save();

      // Notify remaining players someone left
      io.to(roomCode).emit('playerLeftGame', {
        username: result.username,
        gameEnded: result.gameEnded,
      });

      // Broadcast updated game state to remaining players
      for (const player of gameState.players) {
        const sid = getSocketByPlayer(player.playerId);
        if (!sid) continue;
        const clientState = sanitizeGameState(gameState, player.playerId);
        io.to(sid).emit('gameStateUpdated', clientState);
      }

      // If the turn changed and game is still playing, notify the new current player
      if (result.turnChanged && !result.gameEnded && gameState.phase === 'playing') {
        emitYourTurn(io, roomCode, gameState);
        scheduleBotTurnIfNeeded(io, roomCode, gameState);

        // Re-save game state since emitYourTurn sets turnStartedAt
        room.gameState = gameState;
        room.markModified('gameState');
        await room.save();
      }

      return;
    }
  }

  await room.save();
  await broadcastRoomUpdate(io, roomCode);
}

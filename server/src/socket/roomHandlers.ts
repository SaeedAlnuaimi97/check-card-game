import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomModel } from '../models/Room';
import { initializeGameState, sanitizeGameState, getPeekedCards } from '../game/GameSetup';
import { removePlayerFromGame } from '../game/TurnManager';
import { getAvailableActions } from '../game/TurnManager';
import { getCurrentTurnPlayerId } from '../game/TurnManager';
import {
  generatePlayerId,
  generateRoomCode,
  validateRoomCode,
  validateUsername,
} from '../utils/helpers';
import { getRoomMutex, deleteRoomMutex } from '../utils/roomLock';
import { registerPlayer, unregisterPlayer, getSocketByPlayer } from './playerMapping';
import type { GameState } from '../types/game.types';

// ============================================================
// Constants
// ============================================================

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

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
      data: { username: string },
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
      }) => void,
    ) => {
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
      data: { roomCode: string; username: string },
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

        if (room.status !== 'lobby') {
          callback?.({ success: false, error: 'Game already started' });
          return;
        }

        if (room.players.length >= MAX_PLAYERS) {
          callback?.({ success: false, error: 'Room is full' });
          return;
        }

        const playerId = generatePlayerId();

        room.players.push({ id: playerId, username });
        await room.save();

        // Join socket.io room and register mapping
        await socket.join(roomCode);
        registerPlayer(socket.id, playerId, roomCode, username);

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

        // Initialize game state (F-028, F-029, F-032)
        const gameState = initializeGameState(
          room.players.map((p) => ({ id: p.id, username: p.username })),
        );

        // Update room in DB
        room.status = 'playing';
        room.gameState = gameState;
        await room.save();

        console.log(`Game started in room ${roomCode} by ${data.playerId}`);

        callback?.({ success: true });

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
  // Disconnect handler — auto-leave room
  // ----------------------------------------------------------
  socket.on('disconnect', async () => {
    const mapping = unregisterPlayer(socket.id);
    if (!mapping) return;

    console.log(`Player ${mapping.username} (${mapping.playerId}) disconnected`);

    const release = await getRoomMutex(mapping.roomCode).acquire();
    try {
      await handlePlayerLeave(io, socket, mapping.roomCode, mapping.playerId);
    } catch (error) {
      console.error('Error in disconnect handler:', error);
    } finally {
      release();
    }
  });
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
    room.host = room.players[0].id;
    console.log(`Host reassigned to ${room.players[0].username} in room ${roomCode}`);
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
        const turnPlayerId = getCurrentTurnPlayerId(gameState);
        if (turnPlayerId) {
          const sid = getSocketByPlayer(turnPlayerId);
          if (sid) {
            io.to(sid).emit('yourTurn', {
              playerId: turnPlayerId,
              canCheck: gameState.checkCalledBy === null,
              availableActions: getAvailableActions(gameState),
            });
          }
        }
      }

      return;
    }
  }

  await room.save();
  await broadcastRoomUpdate(io, roomCode);
}

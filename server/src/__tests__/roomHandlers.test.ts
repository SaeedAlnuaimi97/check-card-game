import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerRoomHandlers } from '../socket/roomHandlers';
import { GameState } from '../types/game.types';
import { unregisterPlayer, cancelGracePeriod, hasPendingDisconnect } from '../socket/playerMapping';

// ============================================================
// Mock RoomModel
// ============================================================

// In-memory rooms store for the mock
interface MockRoom {
  roomCode: string;
  host: string;
  players: { id: string; username: string }[];
  status: string;
  gameState: GameState | null;
  save: () => Promise<void>;
  markModified: (path: string) => void;
}

let rooms: Record<string, MockRoom> = {};

vi.mock('../models/Room', () => {
  // Must use a regular function (not arrow) so it can be called with `new`
  function MockRoomModel(
    this: MockRoom,
    data: {
      roomCode: string;
      host: string;
      players: { id: string; username: string }[];
      gameState: null;
      status: string;
    },
  ) {
    this.roomCode = data.roomCode;
    this.host = data.host;
    this.players = [...data.players];
    this.gameState = data.gameState;
    this.status = data.status;
    this.save = async () => {
      rooms[this.roomCode] = this;
    };
    this.markModified = () => {};
  }

  // Static methods
  MockRoomModel.exists = async ({ roomCode }: { roomCode: string }) => {
    return roomCode in rooms ? { _id: 'exists' } : null;
  };
  MockRoomModel.findOne = async ({ roomCode }: { roomCode: string }) => {
    return rooms[roomCode] ?? null;
  };
  MockRoomModel.deleteOne = async ({ roomCode }: { roomCode: string }) => {
    delete rooms[roomCode];
  };

  return { RoomModel: MockRoomModel };
});

// ============================================================
// Mock Socket & IO
// ============================================================

function createMockSocket(id = 'socket-1') {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    id,
    join: vi.fn(),
    leave: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: vi.fn(),
    _handlers: handlers,
  };
}

function createMockIO() {
  const toEmit = vi.fn();
  return {
    to: vi.fn(() => ({ emit: toEmit })),
    _toEmit: toEmit,
  };
}

// ============================================================
// Tests
// ============================================================

describe('roomHandlers', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    rooms = {};
    mockSocket = createMockSocket();
    mockIO = createMockIO();

    // Register handlers to capture them
    registerRoomHandlers(mockIO as never, mockSocket as never);
  });

  // Helper to call a registered handler
  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  // ----------------------------------------------------------
  // createRoom
  // ----------------------------------------------------------
  describe('createRoom', () => {
    it('creates a room and returns roomCode + playerId', async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Alice' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          roomCode: expect.any(String),
          playerId: expect.any(String),
        }),
      );

      // Room should exist in our mock store
      const roomCode = callback.mock.calls[0][0].roomCode;
      expect(rooms[roomCode]).toBeDefined();
      expect(rooms[roomCode].host).toBe(callback.mock.calls[0][0].playerId);
      expect(rooms[roomCode].status).toBe('lobby');
    });

    it('rejects empty username', async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: '' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Username must be 1-20 characters',
        }),
      );
    });

    it('rejects username longer than 20 chars', async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'A'.repeat(21) }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Username must be 1-20 characters',
        }),
      );
    });

    it('joins the socket to the room', async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Alice' }, callback);

      expect(mockSocket.join).toHaveBeenCalledWith(callback.mock.calls[0][0].roomCode);
    });

    it('broadcasts roomUpdated to the room', async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Alice' }, callback);

      const roomCode = callback.mock.calls[0][0].roomCode;
      expect(mockIO.to).toHaveBeenCalledWith(roomCode);
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        'roomUpdated',
        expect.objectContaining({
          roomCode,
          status: 'lobby',
          players: expect.arrayContaining([expect.objectContaining({ username: 'Alice' })]),
        }),
      );
    });
  });

  // ----------------------------------------------------------
  // joinRoom
  // ----------------------------------------------------------
  describe('joinRoom', () => {
    let hostId: string;
    let roomCode: string;

    beforeEach(async () => {
      // Create a room first
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, callback);
      roomCode = callback.mock.calls[0][0].roomCode;
      hostId = callback.mock.calls[0][0].playerId;
      vi.clearAllMocks();
    });

    it('joins an existing room', async () => {
      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode, username: 'Bob' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          playerId: expect.any(String),
          room: expect.objectContaining({
            roomCode,
            host: hostId,
          }),
        }),
      );

      expect(rooms[roomCode].players).toHaveLength(2);
    });

    it('rejects invalid room code', async () => {
      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode: 'BAD', username: 'Bob' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Invalid room code' }),
      );
    });

    it('rejects nonexistent room', async () => {
      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode: 'ZZZZZZ', username: 'Bob' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Room not found' }),
      );
    });

    it('rejects when room is full (6 players)', async () => {
      // Add 5 more players (total 6)
      for (let i = 0; i < 5; i++) {
        rooms[roomCode].players.push({ id: `player-${i}`, username: `P${i}` });
      }

      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode, username: 'Extra' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Room is full' }),
      );
    });

    it('rejects when game already started', async () => {
      rooms[roomCode].status = 'playing';

      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode, username: 'Late' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Game already started' }),
      );
    });

    it('rejects empty username', async () => {
      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode, username: '   ' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Username must be 1-20 characters',
        }),
      );
    });
  });

  // ----------------------------------------------------------
  // leaveRoom
  // ----------------------------------------------------------
  describe('leaveRoom', () => {
    let hostId: string;
    let roomCode: string;

    beforeEach(async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, callback);
      roomCode = callback.mock.calls[0][0].roomCode;
      hostId = callback.mock.calls[0][0].playerId;
      // Add a second player directly
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      vi.clearAllMocks();
    });

    it('removes player from room', async () => {
      const callback = vi.fn();
      await emitEvent('leaveRoom', { roomCode, playerId: 'player-2' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(rooms[roomCode].players).toHaveLength(1);
      expect(rooms[roomCode].players[0].id).toBe(hostId);
    });

    it('reassigns host when host leaves', async () => {
      const callback = vi.fn();
      await emitEvent('leaveRoom', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(rooms[roomCode].host).toBe('player-2');
    });

    it('deletes room when last player leaves', async () => {
      // Remove both players
      const cb1 = vi.fn();
      await emitEvent('leaveRoom', { roomCode, playerId: 'player-2' }, cb1);
      const cb2 = vi.fn();
      await emitEvent('leaveRoom', { roomCode, playerId: hostId }, cb2);

      expect(rooms[roomCode]).toBeUndefined();
    });

    it('rejects invalid room code', async () => {
      const callback = vi.fn();
      await emitEvent('leaveRoom', { roomCode: 'X', playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Invalid room code' }),
      );
    });
  });

  // ----------------------------------------------------------
  // startGame
  // ----------------------------------------------------------
  describe('startGame', () => {
    let hostId: string;
    let roomCode: string;

    beforeEach(async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, callback);
      roomCode = callback.mock.calls[0][0].roomCode;
      hostId = callback.mock.calls[0][0].playerId;
      // Add 3 more players (total 4 = minimum)
      for (let i = 2; i <= 4; i++) {
        rooms[roomCode].players.push({ id: `player-${i}`, username: `P${i}` });
      }
      vi.clearAllMocks();
    });

    it('starts game when host requests with enough players', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(rooms[roomCode].status).toBe('playing');
    });

    it('rejects when non-host tries to start', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: 'player-2' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Only the host can start the game',
        }),
      );
    });

    it('rejects when fewer than 2 players', async () => {
      // Remove players to have only 1 (the host)
      rooms[roomCode].players.splice(1);

      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Need at least 2 players to start',
        }),
      );
    });

    it('rejects when game already started', async () => {
      rooms[roomCode].status = 'playing';

      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Game already started',
        }),
      );
    });

    it('rejects nonexistent room', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode: 'ZZZZZZ', playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Room not found',
        }),
      );
    });

    it('emits gameStarted privately to connected players', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      // The host is the only player registered via registerPlayer (socket-1),
      // so io.to should be called with the host socket id.
      expect(mockIO.to).toHaveBeenCalledWith('socket-1');
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        'gameStarted',
        expect.objectContaining({
          gameState: expect.objectContaining({
            deckCount: expect.any(Number),
            phase: 'peeking',
          }),
          peekedCards: expect.any(Array),
        }),
      );
    });

    it('saves gameState to the room', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(rooms[roomCode].gameState).not.toBeNull();
      expect(rooms[roomCode].gameState!.phase).toBe('peeking');
      expect(rooms[roomCode].gameState!.players).toHaveLength(4);
    });
  });

  // ----------------------------------------------------------
  // disconnect (grace period for in-game players)
  // ----------------------------------------------------------
  describe('disconnect', () => {
    let hostId: string;
    let roomCode: string;

    beforeEach(async () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, callback);
      roomCode = callback.mock.calls[0][0].roomCode;
      hostId = callback.mock.calls[0][0].playerId;
      vi.clearAllMocks();
    });

    afterEach(() => {
      // Clean up any pending disconnects
      cancelGracePeriod(hostId);
      vi.useRealTimers();
    });

    it('immediately removes player from lobby on disconnect', async () => {
      // Player is in lobby (not playing) — should be removed immediately
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });

      await emitEvent('disconnect');

      // Host should have been removed
      // The room should still exist with player-2
      expect(rooms[roomCode]).toBeDefined();
      expect(rooms[roomCode].players).toHaveLength(1);
      expect(rooms[roomCode].players[0].id).toBe('player-2');
    });

    it('starts grace period for in-game player on disconnect', async () => {
      // Put room in playing state with a game state
      rooms[roomCode].status = 'playing';
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [],
            peekedSlots: [],
          },
          {
            playerId: 'player-2',
            username: 'Bob',
            hand: [],
            peekedSlots: [],
          },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: {},
        turnStartedAt: null,
      } as unknown as GameState;

      await emitEvent('disconnect');

      // Player should NOT be removed from room
      expect(rooms[roomCode].players).toHaveLength(2);
      // Grace period should be active
      expect(hasPendingDisconnect(hostId)).toBe(true);

      // Notify other players
      expect(mockIO.to).toHaveBeenCalledWith(roomCode);
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        'playerDisconnected',
        expect.objectContaining({
          playerId: hostId,
          username: 'Host',
        }),
      );
    });

    it('removes player after grace period expires', async () => {
      rooms[roomCode].status = 'playing';
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [],
            peekedSlots: [],
          },
          {
            playerId: 'player-2',
            username: 'Bob',
            hand: [],
            peekedSlots: [],
          },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: {},
        turnStartedAt: null,
      } as unknown as GameState;

      await emitEvent('disconnect');

      expect(rooms[roomCode].players).toHaveLength(2);

      // Advance past the grace period
      await vi.advanceTimersByTimeAsync(46000);

      // Player should now be removed
      expect(rooms[roomCode].players).toHaveLength(1);
      expect(rooms[roomCode].players[0].id).toBe('player-2');
      expect(hasPendingDisconnect(hostId)).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // rejoinRoom
  // ----------------------------------------------------------
  describe('rejoinRoom', () => {
    let hostId: string;
    let roomCode: string;

    beforeEach(async () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, callback);
      roomCode = callback.mock.calls[0][0].roomCode;
      hostId = callback.mock.calls[0][0].playerId;
      vi.clearAllMocks();
    });

    afterEach(() => {
      cancelGracePeriod(hostId);
      vi.useRealTimers();
    });

    it('rejects rejoin with invalid room code', async () => {
      const callback = vi.fn();
      await emitEvent('rejoinRoom', { playerId: hostId, roomCode: 'X' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Invalid room code' }),
      );
    });

    it('rejects rejoin when no pending disconnect exists', async () => {
      const callback = vi.fn();
      await emitEvent('rejoinRoom', { playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No pending reconnection for this player',
        }),
      );
    });

    it('successfully rejoins during grace period (in-game)', async () => {
      // Set up in-game state
      rooms[roomCode].status = 'playing';
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [{ slot: 'A', card: { rank: '5', suit: '♥', value: 5 } }],
            peekedSlots: ['C', 'D'],
          },
          {
            playerId: 'player-2',
            username: 'Bob',
            hand: [{ slot: 'A', card: { rank: '3', suit: '♠', value: 3 } }],
            peekedSlots: ['C', 'D'],
          },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 1,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, 'player-2': 0 },
        turnStartedAt: null,
      } as unknown as GameState;

      // Simulate disconnect (starts grace period)
      await emitEvent('disconnect');
      expect(hasPendingDisconnect(hostId)).toBe(true);
      vi.clearAllMocks();

      // Create a new socket for the reconnecting player
      const newSocket = createMockSocket('socket-new');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      // Attempt rejoin
      const callback = vi.fn();
      const rejoinHandler = newSocket._handlers['rejoinRoom'];
      await rejoinHandler({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          room: expect.objectContaining({
            roomCode,
            status: 'playing',
          }),
          gameState: expect.objectContaining({
            deckCount: expect.any(Number),
          }),
        }),
      );

      // Grace period should be cancelled
      expect(hasPendingDisconnect(hostId)).toBe(false);

      // Socket should have joined the room
      expect(newSocket.join).toHaveBeenCalledWith(roomCode);

      // Should emit playerReconnected
      expect(newIO.to).toHaveBeenCalledWith(roomCode);
      expect(newIO._toEmit).toHaveBeenCalledWith(
        'playerReconnected',
        expect.objectContaining({
          playerId: hostId,
          username: 'Host',
        }),
      );

      // Clean up new socket's player mapping
      unregisterPlayer('socket-new');
    });

    it('rejects rejoin with missing playerId', async () => {
      const callback = vi.fn();
      await emitEvent('rejoinRoom', { playerId: '', roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Missing player ID',
        }),
      );
    });
  });
});

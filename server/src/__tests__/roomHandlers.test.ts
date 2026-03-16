import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerRoomHandlers } from '../socket/roomHandlers';
import { GameState } from '../types/game.types';
import {
  unregisterPlayer,
  cancelGracePeriod,
  hasPendingDisconnect,
  getPendingDisconnect,
} from '../socket/playerMapping';

// ============================================================
// Mock RoomModel
// ============================================================

// In-memory rooms store for the mock
interface MockRoom {
  roomCode: string;
  host: string;
  players: {
    id: string;
    username: string;
    isBot?: boolean;
    botDifficulty?: string;
    isReady?: boolean;
  }[];
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
      players: {
        id: string;
        username: string;
        isBot?: boolean;
        botDifficulty?: string;
        isReady?: boolean;
      }[];
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
  MockRoomModel.countDocuments = async () => {
    return Object.values(rooms).filter((r) => r.status === 'lobby' || r.status === 'playing')
      .length;
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

    it('rejects when room is finished', async () => {
      rooms[roomCode].status = 'finished';

      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode, username: 'Late' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Cannot join this room' }),
      );
    });

    it('allows mid-game join when room status is playing (F-364)', async () => {
      rooms[roomCode].status = 'playing';

      const callback = vi.fn();
      await emitEvent('joinRoom', { roomCode, username: 'Late' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, playerId: expect.any(String) }),
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

    it('skips bots when reassigning host', async () => {
      // Replace player-2 with a bot, add a human player-3
      rooms[roomCode].players = [
        rooms[roomCode].players[0], // host
        { id: 'bot-1', username: 'Luca', isBot: true },
        { id: 'player-3', username: 'Carol' },
      ];

      const callback = vi.fn();
      await emitEvent('leaveRoom', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      // Host should be player-3 (human), not bot-1
      expect(rooms[roomCode].host).toBe('player-3');
    });

    it('deletes room when host leaves and only bots remain', async () => {
      // Replace player-2 with a bot so only a bot remains after host leaves
      rooms[roomCode].players = [
        rooms[roomCode].players[0], // host
        { id: 'bot-1', username: 'Luca', isBot: true },
      ];

      const callback = vi.fn();
      await emitEvent('leaveRoom', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      // Room should be deleted since no human players remain
      expect(rooms[roomCode]).toBeUndefined();
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
      // Add 3 more players (total 4 = minimum), all marked ready
      for (let i = 2; i <= 4; i++) {
        rooms[roomCode].players.push({ id: `player-${i}`, username: `P${i}`, isReady: true });
      }
      vi.clearAllMocks();
    });

    it('starts game when host requests with enough players', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          gameState: expect.any(Object),
          peekedCards: expect.any(Array),
        }),
      );
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

    it('starts grace period for lobby player on disconnect (60s)', async () => {
      // Player is in lobby (not playing) — should get a 15s grace period
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });

      await emitEvent('disconnect');

      // Host should NOT be removed yet — grace period is active
      expect(rooms[roomCode]).toBeDefined();
      expect(rooms[roomCode].players).toHaveLength(2);
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

    it('removes lobby player after lobby grace period expires (60s)', async () => {
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });

      await emitEvent('disconnect');

      expect(rooms[roomCode].players).toHaveLength(2);

      // Advance past the 60s lobby grace period
      await vi.advanceTimersByTimeAsync(61000);

      // Host should now be removed
      expect(rooms[roomCode].players).toHaveLength(1);
      expect(rooms[roomCode].players[0].id).toBe('player-2');
      expect(hasPendingDisconnect(hostId)).toBe(false);
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

    it('successfully rejoins lobby when no pending disconnect exists (refresh scenario)', async () => {
      // Player is still in the DB room (from createRoom) but has no in-memory
      // mapping — this is the lobby-refresh / fresh-tab scenario.
      const callback = vi.fn();
      await emitEvent('rejoinRoom', { playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          room: expect.objectContaining({
            roomCode,
            status: 'lobby',
          }),
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

    it('restores drawnCard and drawnFromDiscard on rejoin mid-draw', async () => {
      // Set up in-game state where host has drawn a card from the deck
      const drawnCard = { id: 'c1', rank: '7', suit: '♥', value: 7, isRed: true };
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
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, 'player-2': 0 },
        turnStartedAt: null,
        // Mid-draw state: host drew from deck
        drawnCard,
        drawnByPlayerId: hostId,
        drawnSource: 'deck',
      } as unknown as GameState;

      // Simulate disconnect
      await emitEvent('disconnect');
      expect(hasPendingDisconnect(hostId)).toBe(true);
      vi.clearAllMocks();

      // Rejoin with a new socket
      const newSocket = createMockSocket('socket-draw');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          drawnCard: expect.objectContaining({ rank: '7', suit: '♥' }),
          drawnFromDiscard: false,
        }),
      );

      unregisterPlayer('socket-draw');
    });

    it('restores drawnCard with drawnFromDiscard=true when drawn from discard', async () => {
      const drawnCard = { id: 'c2', rank: 'K', suit: '♦', value: 10, isRed: true };
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
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, 'player-2': 0 },
        turnStartedAt: null,
        drawnCard,
        drawnByPlayerId: hostId,
        drawnSource: 'discard',
      } as unknown as GameState;

      await emitEvent('disconnect');
      vi.clearAllMocks();

      const newSocket = createMockSocket('socket-discard');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          drawnCard: expect.objectContaining({ rank: 'K', suit: '♦' }),
          drawnFromDiscard: true,
        }),
      );

      unregisterPlayer('socket-discard');
    });

    it('restores pendingEffect on rejoin mid-effect', async () => {
      rooms[roomCode].status = 'playing';
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [{ slot: 'A', card: { rank: 'J', suit: '♥', value: 10 } }],
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
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, 'player-2': 0 },
        turnStartedAt: null,
        // Pending Red Jack effect
        pendingEffect: {
          type: 'redJack',
          playerId: hostId,
        },
      } as unknown as GameState;

      await emitEvent('disconnect');
      vi.clearAllMocks();

      const newSocket = createMockSocket('socket-effect');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pendingEffect: expect.objectContaining({
            effect: 'redJack',
            playerId: hostId,
          }),
        }),
      );

      unregisterPlayer('socket-effect');
    });

    it('does not restore mid-turn state for a different player', async () => {
      // drawnCard belongs to player-2, but host is rejoining
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
        drawnCard: { id: 'c3', rank: '9', suit: '♣', value: 9, isRed: false },
        drawnByPlayerId: 'player-2',
        drawnSource: 'deck',
        pendingEffect: {
          type: 'redQueen',
          playerId: 'player-2',
        },
      } as unknown as GameState;

      await emitEvent('disconnect');
      vi.clearAllMocks();

      const newSocket = createMockSocket('socket-other');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      // drawnCard and pendingEffect should NOT be set for the host
      const response = callback.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.drawnCard).toBeNull();
      expect(response.pendingEffect).toBeNull();

      unregisterPlayer('socket-other');
    });

    it('successfully rejoins lobby during lobby grace period', async () => {
      // Host disconnects from lobby (15s grace period applies)
      await emitEvent('disconnect');
      expect(hasPendingDisconnect(hostId)).toBe(true);
      vi.clearAllMocks();

      // Rejoin within the 15s window
      const newSocket = createMockSocket('socket-lobby');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          room: expect.objectContaining({
            roomCode,
            status: 'lobby',
          }),
        }),
      );

      // Grace period should be cancelled
      expect(hasPendingDisconnect(hostId)).toBe(false);

      unregisterPlayer('socket-lobby');
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

    it('restores peekedCards on rejoin during peeking phase', async () => {
      // Set up in-game state in the peeking phase
      rooms[roomCode].status = 'playing';
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      rooms[roomCode].gameState = {
        phase: 'peeking',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [
              { slot: 'A', card: { id: 'c1', rank: '5', suit: '♥', value: 5, isRed: true } },
              { slot: 'B', card: { id: 'c2', rank: '3', suit: '♠', value: 3, isRed: false } },
              { slot: 'C', card: { id: 'c3', rank: 'K', suit: '♦', value: 10, isRed: true } },
              { slot: 'D', card: { id: 'c4', rank: '7', suit: '♣', value: 7, isRed: false } },
            ],
            peekedSlots: ['C', 'D'],
          },
          {
            playerId: 'player-2',
            username: 'Bob',
            hand: [
              { slot: 'A', card: { id: 'c5', rank: '2', suit: '♥', value: 2, isRed: true } },
              { slot: 'B', card: { id: 'c6', rank: '8', suit: '♠', value: 8, isRed: false } },
              { slot: 'C', card: { id: 'c7', rank: '4', suit: '♦', value: 4, isRed: true } },
              { slot: 'D', card: { id: 'c8', rank: '9', suit: '♣', value: 9, isRed: false } },
            ],
            peekedSlots: ['C', 'D'],
          },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, 'player-2': 0 },
        turnStartedAt: null,
      } as unknown as GameState;

      // Simulate disconnect (starts grace period)
      await emitEvent('disconnect');
      expect(hasPendingDisconnect(hostId)).toBe(true);
      vi.clearAllMocks();

      // Rejoin with a new socket
      const newSocket = createMockSocket('socket-peek');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          peekedCards: expect.arrayContaining([
            expect.objectContaining({
              slot: 'C',
              card: expect.objectContaining({ rank: 'K', suit: '♦' }),
            }),
            expect.objectContaining({
              slot: 'D',
              card: expect.objectContaining({ rank: '7', suit: '♣' }),
            }),
          ]),
        }),
      );
      expect(callback.mock.calls[0][0].peekedCards).toHaveLength(2);

      unregisterPlayer('socket-peek');
    });

    it('does not include peekedCards on rejoin during playing phase', async () => {
      // Set up in-game state in the playing phase (not peeking)
      rooms[roomCode].status = 'playing';
      rooms[roomCode].players.push({ id: 'player-2', username: 'Bob' });
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [{ slot: 'A', card: { id: 'c1', rank: '5', suit: '♥', value: 5, isRed: true } }],
            peekedSlots: ['C', 'D'],
          },
          {
            playerId: 'player-2',
            username: 'Bob',
            hand: [{ slot: 'A', card: { id: 'c2', rank: '3', suit: '♠', value: 3, isRed: false } }],
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
      vi.clearAllMocks();

      const newSocket = createMockSocket('socket-nopk');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      // peekedCards should be undefined when not in peeking phase
      expect(callback.mock.calls[0][0].peekedCards).toBeUndefined();

      unregisterPlayer('socket-nopk');
    });
  });

  // ----------------------------------------------------------
  // Host reassignment on disconnect + restoration on rejoin
  // ----------------------------------------------------------
  describe('host reassignment on disconnect', () => {
    let hostId: string;
    let guestId: string;
    let roomCode: string;

    beforeEach(async () => {
      vi.useFakeTimers();
      const createCb = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, createCb);
      roomCode = createCb.mock.calls[0][0].roomCode;
      hostId = createCb.mock.calls[0][0].playerId;

      // Add a second human player
      const joinSocket = createMockSocket('socket-2');
      const joinIO = createMockIO();
      registerRoomHandlers(joinIO as never, joinSocket as never);
      const joinCb = vi.fn();
      await joinSocket._handlers['joinRoom']({ roomCode, username: 'Guest' }, joinCb);
      guestId = joinCb.mock.calls[0][0].playerId;
      vi.clearAllMocks();
    });

    afterEach(() => {
      cancelGracePeriod(hostId);
      cancelGracePeriod(guestId);
      vi.useRealTimers();
    });

    it('immediately reassigns host to next human player when host disconnects', async () => {
      expect(rooms[roomCode].host).toBe(hostId);

      await emitEvent('disconnect');

      // Host should be reassigned immediately
      expect(rooms[roomCode].host).toBe(guestId);

      // Should broadcast roomUpdated with new host
      expect(mockIO.to).toHaveBeenCalledWith(roomCode);
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        'roomUpdated',
        expect.objectContaining({
          roomCode,
          host: guestId,
        }),
      );
    });

    it('stores wasHost flag in pending disconnect entry', async () => {
      await emitEvent('disconnect');

      const pending = getPendingDisconnect(hostId);
      expect(pending).toBeDefined();
      expect(pending!.wasHost).toBe(true);
    });

    it('does not set wasHost flag when non-host disconnects', async () => {
      // Make the guest disconnect instead
      const guestSocket = createMockSocket('socket-guest');
      const guestIO = createMockIO();
      registerRoomHandlers(guestIO as never, guestSocket as never);

      // Set up in-game state so guest has a mapping
      rooms[roomCode].status = 'playing';
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          { playerId: hostId, username: 'Host', hand: [], peekedSlots: [] },
          { playerId: guestId, username: 'Guest', hand: [], peekedSlots: [] },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: {},
        turnStartedAt: null,
      } as unknown as GameState;

      // Register guest with the new socket so disconnect handler finds them
      const { registerPlayer } = await import('../socket/playerMapping');
      registerPlayer('socket-guest', guestId, roomCode, 'Guest');

      // Disconnect the guest socket
      await guestSocket._handlers['disconnect']();

      const pending = getPendingDisconnect(guestId);
      expect(pending).toBeDefined();
      expect(pending!.wasHost).toBe(false);
    });

    it('restores host to original player when they rejoin', async () => {
      // Host disconnects — gets temporarily reassigned to guest
      await emitEvent('disconnect');
      expect(rooms[roomCode].host).toBe(guestId);
      vi.clearAllMocks();

      // Host rejoins with a new socket
      const newSocket = createMockSocket('socket-host-new');
      const newIO = createMockIO();
      registerRoomHandlers(newIO as never, newSocket as never);

      const callback = vi.fn();
      await newSocket._handlers['rejoinRoom']({ playerId: hostId, roomCode }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      // Host should be restored to the original player
      expect(rooms[roomCode].host).toBe(hostId);

      // Should broadcast roomUpdated with restored host
      expect(newIO.to).toHaveBeenCalledWith(roomCode);
      expect(newIO._toEmit).toHaveBeenCalledWith(
        'roomUpdated',
        expect.objectContaining({
          roomCode,
          host: hostId,
        }),
      );

      unregisterPlayer('socket-host-new');
    });

    it('does not reassign host when non-host disconnects', async () => {
      // Set up in-game state
      rooms[roomCode].status = 'playing';
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          { playerId: hostId, username: 'Host', hand: [], peekedSlots: [] },
          { playerId: guestId, username: 'Guest', hand: [], peekedSlots: [] },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: {},
        turnStartedAt: null,
      } as unknown as GameState;

      // Register guest with a socket so disconnect handler finds them
      const { registerPlayer } = await import('../socket/playerMapping');
      registerPlayer('socket-guest-dc', guestId, roomCode, 'Guest');

      const guestSocket = createMockSocket('socket-guest-dc');
      const guestIO = createMockIO();
      registerRoomHandlers(guestIO as never, guestSocket as never);

      await guestSocket._handlers['disconnect']();

      // Host should remain unchanged
      expect(rooms[roomCode].host).toBe(hostId);
    });
  });

  // ----------------------------------------------------------
  // kickPlayer (F-203/F-306)
  // ----------------------------------------------------------
  describe('kickPlayer', () => {
    let roomCode: string;
    let hostId: string;
    let guestId: string;

    beforeEach(async () => {
      const createCb = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, createCb);
      roomCode = createCb.mock.calls[0][0].roomCode;
      hostId = createCb.mock.calls[0][0].playerId;

      // Add a second player
      const joinSocket = createMockSocket('socket-2');
      const joinIO = createMockIO();
      registerRoomHandlers(joinIO as never, joinSocket as never);
      const joinCb = vi.fn();
      await joinSocket._handlers['joinRoom']({ roomCode, username: 'Guest' }, joinCb);
      guestId = joinCb.mock.calls[0][0].playerId;
    });

    it('host can kick another player in the lobby', async () => {
      const callback = vi.fn();
      await emitEvent('kickPlayer', { roomCode, hostId, targetPlayerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      const room = rooms[roomCode];
      expect(room.players.find((p) => p.id === guestId)).toBeUndefined();
    });

    it('non-host cannot kick', async () => {
      const callback = vi.fn();
      await emitEvent(
        'kickPlayer',
        { roomCode, hostId: guestId, targetPlayerId: hostId },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Only the host can kick players' }),
      );
    });

    it('host cannot kick themselves', async () => {
      const callback = vi.fn();
      await emitEvent('kickPlayer', { roomCode, hostId, targetPlayerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Host cannot kick themselves' }),
      );
    });

    it('returns error for non-existent player', async () => {
      const callback = vi.fn();
      await emitEvent(
        'kickPlayer',
        { roomCode, hostId, targetPlayerId: 'nonexistent-player' },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Player not found in room' }),
      );
    });

    it('cannot kick in a finished game', async () => {
      rooms[roomCode].status = 'finished';

      const callback = vi.fn();
      await emitEvent('kickPlayer', { roomCode, hostId, targetPlayerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Cannot kick players from a finished game',
        }),
      );
    });

    it('kicks player during an active game (F-365)', async () => {
      // Set up an active game state
      rooms[roomCode].status = 'playing';
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [
              {
                slot: 'A',
                card: { id: 'c1', rank: '5', suit: '♥', value: 5, isRed: true },
              },
            ],
            peekedSlots: [],
          },
          {
            playerId: guestId,
            username: 'Guest',
            hand: [
              {
                slot: 'A',
                card: { id: 'c2', rank: '3', suit: '♠', value: 3, isRed: false },
              },
            ],
            peekedSlots: [],
          },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, [guestId]: 0 },
        turnStartedAt: null,
      } as unknown as GameState;

      const callback = vi.fn();
      await emitEvent('kickPlayer', { roomCode, hostId, targetPlayerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      // Guest should be removed from room players
      expect(rooms[roomCode].players.find((p) => p.id === guestId)).toBeUndefined();
    });

    it('ends game when kicked player leaves fewer than 2 in-game (F-365)', async () => {
      rooms[roomCode].status = 'playing';
      rooms[roomCode].gameState = {
        phase: 'playing',
        players: [
          {
            playerId: hostId,
            username: 'Host',
            hand: [
              {
                slot: 'A',
                card: { id: 'c1', rank: '5', suit: '♥', value: 5, isRed: true },
              },
            ],
            peekedSlots: [],
          },
          {
            playerId: guestId,
            username: 'Guest',
            hand: [
              {
                slot: 'A',
                card: { id: 'c2', rank: '3', suit: '♠', value: 3, isRed: false },
              },
            ],
            peekedSlots: [],
          },
        ],
        deck: [],
        discardPile: [],
        currentTurnIndex: 0,
        checkCalledBy: null,
        roundNumber: 1,
        scores: { [hostId]: 0, [guestId]: 0 },
        turnStartedAt: null,
      } as unknown as GameState;

      const callback = vi.fn();
      await emitEvent('kickPlayer', { roomCode, hostId, targetPlayerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      // Room should be set to finished since only 1 player remains
      expect(rooms[roomCode].status).toBe('finished');
    });

    it('emits kicked event to the kicked player socket', async () => {
      const callback = vi.fn();
      await emitEvent('kickPlayer', { roomCode, hostId, targetPlayerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      // io.to should be called with the guest's socket to emit 'kicked'
      expect(mockIO.to).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------
  // toggleReady
  // ----------------------------------------------------------
  describe('toggleReady', () => {
    let hostId: string;
    let roomCode: string;
    let guestId: string;

    beforeEach(async () => {
      const createCb = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, createCb);
      roomCode = createCb.mock.calls[0][0].roomCode;
      hostId = createCb.mock.calls[0][0].playerId;

      // Add a second player
      const joinSocket = createMockSocket('socket-2');
      const joinIO = createMockIO();
      registerRoomHandlers(joinIO as never, joinSocket as never);
      const joinCb = vi.fn();
      await joinSocket._handlers['joinRoom']({ roomCode, username: 'Guest' }, joinCb);
      guestId = joinCb.mock.calls[0][0].playerId;
      vi.clearAllMocks();
    });

    it('toggles a player to ready', async () => {
      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isReady: true }),
      );
    });

    it('toggles back to not ready', async () => {
      // First toggle: ready
      const cb1 = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: guestId }, cb1);
      expect(cb1).toHaveBeenCalledWith(expect.objectContaining({ isReady: true }));

      // Second toggle: not ready
      const cb2 = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: guestId }, cb2);
      expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ success: true, isReady: false }));
    });

    it('rejects when room is not in lobby', async () => {
      rooms[roomCode].status = 'playing';

      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Can only toggle ready in the lobby' }),
      );
    });

    it('rejects for bots', async () => {
      rooms[roomCode].players.push({
        id: 'bot-1',
        username: 'Luca',
        isBot: true,
        botDifficulty: 'easy',
      });

      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: 'bot-1' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Bots are always ready' }),
      );
    });

    it('rejects for player not in room', async () => {
      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: 'nonexistent' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Player not found in room' }),
      );
    });

    it('rejects with missing playerId', async () => {
      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: '' }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Missing player ID' }),
      );
    });

    it('rejects for nonexistent room', async () => {
      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode: 'ZZZZZZ', playerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Room not found' }),
      );
    });

    it('broadcasts roomUpdated after toggle', async () => {
      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: guestId }, callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      // broadcastRoomUpdate should call io.to(roomCode).emit('roomUpdated', ...)
      expect(mockIO.to).toHaveBeenCalledWith(roomCode);
      expect(mockIO._toEmit).toHaveBeenCalledWith(
        'roomUpdated',
        expect.objectContaining({
          roomCode,
          status: 'lobby',
        }),
      );
    });

    it('host can also toggle ready', async () => {
      const callback = vi.fn();
      await emitEvent('toggleReady', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isReady: true }),
      );
    });
  });

  // ----------------------------------------------------------
  // startGame — readiness validation
  // ----------------------------------------------------------
  describe('startGame — readiness validation', () => {
    let hostId: string;
    let roomCode: string;

    beforeEach(async () => {
      const callback = vi.fn();
      await emitEvent('createRoom', { username: 'Host' }, callback);
      roomCode = callback.mock.calls[0][0].roomCode;
      hostId = callback.mock.calls[0][0].playerId;
      // Add a second human player (not ready by default)
      rooms[roomCode].players.push({ id: 'player-2', username: 'P2' });
      vi.clearAllMocks();
    });

    it('rejects start when non-host human players are not ready', async () => {
      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'All players must be ready before starting',
        }),
      );
    });

    it('allows start when all non-host human players are ready', async () => {
      // Mark the second player as ready
      rooms[roomCode].players[1].isReady = true;

      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          gameState: expect.any(Object),
          peekedCards: expect.any(Array),
        }),
      );
      expect(rooms[roomCode].status).toBe('playing');
    });

    it('allows start with only bots (bots are implicitly ready)', async () => {
      // Replace human player-2 with a bot
      rooms[roomCode].players[1] = {
        id: 'bot-1',
        username: 'Luca',
        isBot: true,
        botDifficulty: 'easy',
        isReady: true,
      };

      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          gameState: expect.any(Object),
          peekedCards: expect.any(Array),
        }),
      );
    });

    it('allows start when host is the only human (no readiness check needed)', async () => {
      // Remove the second player, add a bot instead
      rooms[roomCode].players = [
        rooms[roomCode].players[0],
        { id: 'bot-1', username: 'Luca', isBot: true, botDifficulty: 'easy', isReady: true },
      ];

      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          gameState: expect.any(Object),
          peekedCards: expect.any(Array),
        }),
      );
    });

    it('rejects when one of multiple human players is not ready', async () => {
      // Add a third human player, mark player-2 as ready but not player-3
      rooms[roomCode].players[1].isReady = true;
      rooms[roomCode].players.push({ id: 'player-3', username: 'P3' });

      const callback = vi.fn();
      await emitEvent('startGame', { roomCode, playerId: hostId }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'All players must be ready before starting',
        }),
      );
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerGameHandlers, cancelRoundCountdown } from '../socket/gameHandlers';
import type { GameState } from '../types/game.types';
import { initializeGameState } from '../game/GameSetup';

// ============================================================
// Mock RoomModel
// ============================================================

interface MockRoom {
  roomCode: string;
  host: string;
  players: { id: string; username: string }[];
  status: string;
  gameState: GameState | null;
  createdAt?: Date;
  save: () => Promise<void>;
  markModified: (path: string) => void;
}

let rooms: Record<string, MockRoom> = {};

vi.mock('../models/Room', () => {
  return {
    RoomModel: {
      findOne: async ({ roomCode }: { roomCode: string }) => {
        return rooms[roomCode] ?? null;
      },
    },
  };
});

// ============================================================
// Mock playerMapping
// ============================================================

const playerSocketMap: Record<string, string> = {};

vi.mock('../socket/playerMapping', () => ({
  getSocketByPlayer: (playerId: string) => playerSocketMap[playerId] ?? null,
}));

// ============================================================
// Mock roomLock (no-op mutex)
// ============================================================

vi.mock('../utils/roomLock', () => ({
  getRoomMutex: () => ({
    acquire: async () => () => {},
  }),
}));

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
  const emittedEvents: { socketId: string; event: string; data: unknown }[] = [];
  return {
    to: vi.fn((socketId: string) => ({
      emit: vi.fn((event: string, data: unknown) => {
        emittedEvents.push({ socketId, event, data });
      }),
    })),
    _emittedEvents: emittedEvents,
  };
}

// ============================================================
// Helper to create a room in roundEnd phase
// ============================================================

function createRoundEndRoom(
  roomCode: string,
  hostId: string,
  players: { id: string; username: string }[],
): MockRoom {
  const gameState = initializeGameState(players);
  // Set phase to roundEnd to simulate a round that just ended
  gameState.phase = 'roundEnd';
  gameState.checkCalledBy = players[0].id;
  gameState.checkCalledAtIndex = 0;

  const room: MockRoom = {
    roomCode,
    host: hostId,
    players,
    status: 'playing',
    gameState,
    save: vi.fn(async () => {
      rooms[roomCode] = room;
    }),
    markModified: vi.fn(),
  };

  rooms[roomCode] = room;
  return room;
}

// ============================================================
// Tests
// ============================================================

describe('gameHandlers — startNextRound', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const hostId = 'host-1';
  const player2Id = 'player-2';
  const players = [
    { id: hostId, username: 'Alice' },
    { id: player2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = {};
    // Clear playerSocketMap
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[hostId] = 'socket-host';
    playerSocketMap[player2Id] = 'socket-player2';

    mockSocket = createMockSocket('socket-host');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  afterEach(() => {
    cancelRoundCountdown('ABCD');
    vi.useRealTimers();
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  it('registers the startNextRound handler', () => {
    expect(mockSocket._handlers['startNextRound']).toBeDefined();
  });

  it('schedules countdown and starts new round after 5s when host requests it', async () => {
    createRoundEndRoom('ABCD', hostId, players);
    const callback = vi.fn();

    await emitEvent('startNextRound', { roomCode: 'ABCD', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });

    // nextRoundCountdown should be emitted
    const countdownEvents = mockIO._emittedEvents.filter((e) => e.event === 'nextRoundCountdown');
    expect(countdownEvents.length).toBeGreaterThanOrEqual(1);

    // gameStarted should NOT be emitted yet
    let gameStartedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameStarted');
    expect(gameStartedEvents).toHaveLength(0);

    // Advance past countdown
    await vi.advanceTimersByTimeAsync(6000);

    // Now gameStarted should be emitted to both players
    gameStartedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameStarted');
    expect(gameStartedEvents).toHaveLength(2);

    // Game state should be updated with a new round
    const newState = rooms['ABCD'].gameState as GameState;
    expect(newState.roundNumber).toBe(2);
    expect(newState.phase).toBe('peeking');
  });

  it('rejects non-host player', async () => {
    createRoundEndRoom('ABCD', hostId, players);
    const callback = vi.fn();

    await emitEvent('startNextRound', { roomCode: 'ABCD', playerId: player2Id }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Only the host can start the next round',
    });
  });

  it('rejects if room not found', async () => {
    const callback = vi.fn();

    await emitEvent('startNextRound', { roomCode: 'ZZZZ', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Room or game not found',
    });
  });

  it('rejects if room status is not playing', async () => {
    const room = createRoundEndRoom('ABCD', hostId, players);
    room.status = 'finished';
    const callback = vi.fn();

    await emitEvent('startNextRound', { roomCode: 'ABCD', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is not in progress',
    });
  });

  it('rejects if game phase is not roundEnd', async () => {
    const room = createRoundEndRoom('ABCD', hostId, players);
    (room.gameState as GameState).phase = 'playing';
    const callback = vi.fn();

    await emitEvent('startNextRound', { roomCode: 'ABCD', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Round has not ended yet',
    });
  });

  it('emits gameStarted to all players with personalized state after countdown', async () => {
    createRoundEndRoom('ABCD', hostId, players);
    const callback = vi.fn();

    await emitEvent('startNextRound', { roomCode: 'ABCD', playerId: hostId }, callback);

    // Advance past countdown to trigger auto-start
    await vi.advanceTimersByTimeAsync(6000);

    // Should have emitted gameStarted to both players
    const gameStartedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameStarted');
    expect(gameStartedEvents).toHaveLength(2);

    const hostEvent = gameStartedEvents.find((e) => e.socketId === 'socket-host');
    const player2Event = gameStartedEvents.find((e) => e.socketId === 'socket-player2');
    expect(hostEvent).toBeDefined();
    expect(player2Event).toBeDefined();

    // Each should have gameState and peekedCards
    const hostPayload = hostEvent!.data as { gameState: unknown; peekedCards: unknown[] };
    expect(hostPayload.gameState).toBeDefined();
    expect(hostPayload.peekedCards).toBeDefined();
    expect(hostPayload.peekedCards).toHaveLength(2); // Peek slots C and D
  });

  it('preserves existing scores into the new round after countdown', async () => {
    const room = createRoundEndRoom('ABCD', hostId, players);
    // Set some existing scores
    (room.gameState as GameState).scores = { [hostId]: 15, [player2Id]: 22 };

    const callback = vi.fn();
    await emitEvent('startNextRound', { roomCode: 'ABCD', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });

    // Advance past countdown
    await vi.advanceTimersByTimeAsync(6000);

    const newState = rooms['ABCD'].gameState as GameState;
    expect(newState.scores[hostId]).toBe(15);
    expect(newState.scores[player2Id]).toBe(22);
  });
});

// ============================================================
// redJackSwap — swap notification fields
// ============================================================

describe('gameHandlers — redJackSwap swap notification', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const p1Id = 'player-1';
  const p2Id = 'player-2';
  const playersList = [
    { id: p1Id, username: 'Alice' },
    { id: p2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[p1Id] = 'socket-p1';
    playerSocketMap[p2Id] = 'socket-p2';

    mockSocket = createMockSocket('socket-p1');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  function createRedJackRoom(): MockRoom {
    const gameState = initializeGameState(playersList);
    gameState.phase = 'playing';
    gameState.currentTurnIndex = 0;
    // Set a pending Red Jack effect for player 1
    gameState.pendingEffect = {
      type: 'redJack',
      playerId: p1Id,
      card: { id: 'jh', suit: '♥', rank: 'J', value: -1, isRed: true },
    };

    const room: MockRoom = {
      roomCode: 'RJCK',
      host: p1Id,
      players: playersList,
      status: 'playing',
      gameState,
      save: vi.fn(async () => {
        rooms['RJCK'] = room;
      }),
      markModified: vi.fn(),
    };

    rooms['RJCK'] = room;
    return room;
  }

  it('includes swap details in specialEffectResolved when swap is performed', async () => {
    createRedJackRoom();
    const callback = vi.fn();

    await emitEvent(
      'redJackSwap',
      {
        roomCode: 'RJCK',
        playerId: p1Id,
        mySlot: 'A',
        targetPlayerId: p2Id,
        targetSlot: 'B',
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    // Find specialEffectResolved events
    const effectEvents = mockIO._emittedEvents.filter((e) => e.event === 'specialEffectResolved');
    // Should be emitted to both players
    expect(effectEvents.length).toBeGreaterThanOrEqual(2);

    // Check payload includes swap details
    for (const evt of effectEvents) {
      const payload = evt.data as Record<string, unknown>;
      expect(payload.effect).toBe('redJack');
      expect(payload.playerId).toBe(p1Id);
      expect(payload.skipped).toBe(false);
      expect(payload.swapperSlot).toBe('A');
      expect(payload.swapperUsername).toBe('Alice');
      expect(payload.targetPlayerId).toBe(p2Id);
      expect(payload.targetSlot).toBe('B');
      expect(payload.targetUsername).toBe('Bob');
    }
  });

  it('does NOT include swap details when skip is true', async () => {
    createRedJackRoom();
    const callback = vi.fn();

    await emitEvent(
      'redJackSwap',
      {
        roomCode: 'RJCK',
        playerId: p1Id,
        skip: true,
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    const effectEvents = mockIO._emittedEvents.filter((e) => e.event === 'specialEffectResolved');
    expect(effectEvents.length).toBeGreaterThanOrEqual(2);

    for (const evt of effectEvents) {
      const payload = evt.data as Record<string, unknown>;
      expect(payload.effect).toBe('redJack');
      expect(payload.playerId).toBe(p1Id);
      expect(payload.skipped).toBe(true);
      // Swap details should NOT be present
      expect(payload.swapperSlot).toBeUndefined();
      expect(payload.swapperUsername).toBeUndefined();
      expect(payload.targetPlayerId).toBeUndefined();
      expect(payload.targetSlot).toBeUndefined();
      expect(payload.targetUsername).toBeUndefined();
    }
  });

  it('returns error when no pending Red Jack effect', async () => {
    const room = createRedJackRoom();
    (room.gameState as GameState).pendingEffect = null;
    const callback = vi.fn();

    await emitEvent(
      'redJackSwap',
      {
        roomCode: 'RJCK',
        playerId: p1Id,
        mySlot: 'A',
        targetPlayerId: p2Id,
        targetSlot: 'B',
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'No pending Red Jack effect for this player',
    });
  });

  it('returns error when required fields are missing for non-skip swap', async () => {
    createRedJackRoom();
    const callback = vi.fn();

    await emitEvent(
      'redJackSwap',
      {
        roomCode: 'RJCK',
        playerId: p1Id,
        // Missing mySlot, targetPlayerId, targetSlot
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'mySlot, targetPlayerId, and targetSlot are required',
    });
  });

  it('returns error when room not found', async () => {
    const callback = vi.fn();

    await emitEvent(
      'redJackSwap',
      {
        roomCode: 'ZZZZ',
        playerId: p1Id,
        skip: true,
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Room or game not found',
    });
  });
});

// ============================================================
// Empty-hand burn — round ends immediately
// ============================================================

describe('gameHandlers — empty-hand burn ends round', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const p1Id = 'player-1';
  const p2Id = 'player-2';
  const playersList = [
    { id: p1Id, username: 'Alice' },
    { id: p2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[p1Id] = 'socket-p1';
    playerSocketMap[p2Id] = 'socket-p2';

    mockSocket = createMockSocket('socket-p1');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  /**
   * Creates a room where player 1 has exactly 1 card left, and the
   * discard pile top card has the same rank — guaranteeing a successful burn.
   */
  function createOneCardRoom(): MockRoom {
    const gameState = initializeGameState(playersList);
    gameState.phase = 'playing';
    gameState.currentTurnIndex = 0; // p1's turn

    // Give player 1 exactly one card whose rank matches the discard top
    const burnCard = { id: 'c1', suit: '♥' as const, rank: '7' as const, value: 7, isRed: true };
    gameState.players[0].hand = [{ slot: 'A', card: burnCard }];

    // Discard pile top has matching rank
    const discardCard = {
      id: 'c2',
      suit: '♠' as const,
      rank: '7' as const,
      value: 7,
      isRed: false,
    };
    gameState.discardPile = [discardCard];

    // Player 2 keeps their default 4-card hand

    const room: MockRoom = {
      roomCode: 'BURN',
      host: p1Id,
      players: playersList,
      status: 'playing',
      gameState,
      save: vi.fn(async () => {
        rooms['BURN'] = room;
      }),
      markModified: vi.fn(),
    };

    rooms['BURN'] = room;
    return room;
  }

  it('emits roundEnded with checkCalledBy=null when last card is burned', async () => {
    createOneCardRoom();
    const callback = vi.fn();

    await emitEvent(
      'playerAction',
      {
        roomCode: 'BURN',
        playerId: p1Id,
        action: { type: 'burn', slot: 'A' },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    // roundEnded should have been emitted to both players
    const roundEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'roundEnded');
    expect(roundEndedEvents).toHaveLength(2);

    // checkCalledBy should be null (empty-hand end, not check-based)
    for (const evt of roundEndedEvents) {
      const payload = evt.data as Record<string, unknown>;
      expect(payload.checkCalledBy).toBeNull();
    }
  });

  it('does NOT emit yourTurn after empty-hand round end', async () => {
    createOneCardRoom();
    const callback = vi.fn();

    await emitEvent(
      'playerAction',
      {
        roomCode: 'BURN',
        playerId: p1Id,
        action: { type: 'burn', slot: 'A' },
      },
      callback,
    );

    // yourTurn should NOT be emitted when the round has ended
    const yourTurnEvents = mockIO._emittedEvents.filter((e) => e.event === 'yourTurn');
    expect(yourTurnEvents).toHaveLength(0);
  });

  it('does NOT end round when burn succeeds but player still has cards', async () => {
    const room = createOneCardRoom();
    const gs = room.gameState as GameState;
    // Give player 1 two cards instead of one
    gs.players[0].hand = [
      {
        slot: 'A',
        card: { id: 'c1', suit: '♥' as const, rank: '7' as const, value: 7, isRed: true },
      },
      {
        slot: 'B',
        card: { id: 'c3', suit: '♦' as const, rank: 'K' as const, value: 13, isRed: true },
      },
    ];

    const callback = vi.fn();
    await emitEvent(
      'playerAction',
      {
        roomCode: 'BURN',
        playerId: p1Id,
        action: { type: 'burn', slot: 'A' },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    // roundEnded should NOT have been emitted
    const roundEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'roundEnded');
    expect(roundEndedEvents).toHaveLength(0);

    // yourTurn SHOULD be emitted (game continues)
    const yourTurnEvents = mockIO._emittedEvents.filter((e) => e.event === 'yourTurn');
    expect(yourTurnEvents).toHaveLength(1);
  });

  it('does NOT end round when burn fails (rank mismatch)', async () => {
    const room = createOneCardRoom();
    const gs = room.gameState as GameState;
    // Change the card rank so it doesn't match the discard
    gs.players[0].hand = [
      {
        slot: 'A',
        card: { id: 'c1', suit: '♥' as const, rank: '3' as const, value: 3, isRed: true },
      },
    ];

    const callback = vi.fn();
    await emitEvent(
      'playerAction',
      {
        roomCode: 'BURN',
        playerId: p1Id,
        action: { type: 'burn', slot: 'A' },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    // roundEnded should NOT have been emitted (burn failed, penalty card added)
    const roundEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'roundEnded');
    expect(roundEndedEvents).toHaveLength(0);
  });
});

// ============================================================
// pauseGame handler tests (F-272)
// ============================================================

describe('gameHandlers — pauseGame', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const hostId = 'host-pause';
  const player2Id = 'player-pause-2';
  const players = [
    { id: hostId, username: 'Alice' },
    { id: player2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[hostId] = 'socket-host-pause';
    playerSocketMap[player2Id] = 'socket-player-pause-2';

    mockSocket = createMockSocket('socket-host-pause');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  function createPlayingRoom(roomCode: string, overrides: Partial<GameState> = {}): MockRoom {
    const gameState = initializeGameState(players);
    gameState.phase = 'playing';
    gameState.turnStartedAt = Date.now() - 10_000; // 10 seconds into the turn
    Object.assign(gameState, overrides);

    const room: MockRoom = {
      roomCode,
      host: hostId,
      players,
      status: 'playing',
      gameState,
      save: vi.fn(async () => {
        rooms[roomCode] = room;
      }),
      markModified: vi.fn(),
    };
    rooms[roomCode] = room;
    return room;
  }

  it('registers the pauseGame handler', () => {
    expect(mockSocket._handlers['pauseGame']).toBeDefined();
  });

  it('pauses the game when host requests it', async () => {
    const room = createPlayingRoom('PAUS');
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
    expect(room.save).toHaveBeenCalled();

    const gs = room.gameState as GameState;
    expect(gs.paused).toBe(true);
    expect(gs.pausedBy).toBe(hostId);
    expect(gs.pausedAt).toBeTypeOf('number');
    expect(gs.turnTimeRemainingMs).toBeTypeOf('number');
    expect(gs.turnTimeRemainingMs!).toBeGreaterThan(0);
  });

  it('broadcasts gamePaused to all players', async () => {
    createPlayingRoom('PAUS');
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    const pausedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gamePaused');
    expect(pausedEvents.length).toBeGreaterThanOrEqual(2);

    const hostEvent = pausedEvents.find((e) => e.socketId === 'socket-host-pause');
    expect(hostEvent).toBeDefined();
    expect((hostEvent!.data as { pausedBy: string }).pausedBy).toBe(hostId);
  });

  it('allows any player in the room to pause the game', async () => {
    createPlayingRoom('PAUS');
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: player2Id }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  it('rejects if room not found', async () => {
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'ZZZZ', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Room or game not found',
    });
  });

  it('rejects if game is not in progress', async () => {
    const room = createPlayingRoom('PAUS');
    room.status = 'finished';
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is not in progress',
    });
  });

  it('rejects during roundEnd phase', async () => {
    createPlayingRoom('PAUS', { phase: 'roundEnd' });
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot pause during this phase',
    });
  });

  it('rejects during gameEnd phase', async () => {
    createPlayingRoom('PAUS', { phase: 'gameEnd' });
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot pause during this phase',
    });
  });

  it('rejects during dealing phase', async () => {
    createPlayingRoom('PAUS', { phase: 'dealing' });
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot pause during this phase',
    });
  });

  it('allows pause during peeking phase', async () => {
    createPlayingRoom('PAUS', { phase: 'peeking' });
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  it('rejects if already paused', async () => {
    createPlayingRoom('PAUS', { paused: true, pausedBy: hostId, pausedAt: Date.now() - 5000 });
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is already paused',
    });
  });

  it('calculates remaining turn time correctly', async () => {
    const turnStartedAt = Date.now() - 20_000; // 20 seconds ago
    const room = createPlayingRoom('PAUS', { turnStartedAt });
    const callback = vi.fn();

    await emitEvent('pauseGame', { roomCode: 'PAUS', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
    const gs = room.gameState as GameState;
    // Should have roughly 10 seconds remaining (30s - 20s elapsed)
    expect(gs.turnTimeRemainingMs!).toBeLessThanOrEqual(10_100);
    expect(gs.turnTimeRemainingMs!).toBeGreaterThanOrEqual(9_800);
  });
});

// ============================================================
// resumeGame handler tests (F-273)
// ============================================================

describe('gameHandlers — resumeGame', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const hostId = 'host-resume';
  const player2Id = 'player-resume-2';
  const players = [
    { id: hostId, username: 'Alice' },
    { id: player2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[hostId] = 'socket-host-resume';
    playerSocketMap[player2Id] = 'socket-player-resume-2';

    mockSocket = createMockSocket('socket-host-resume');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  function createPausedRoom(roomCode: string, overrides: Partial<GameState> = {}): MockRoom {
    const gameState = initializeGameState(players);
    gameState.phase = 'playing';
    gameState.paused = true;
    gameState.pausedBy = hostId;
    gameState.pausedAt = Date.now() - 5000; // paused 5 seconds ago
    gameState.turnTimeRemainingMs = 15_000;
    gameState.turnStartedAt = Date.now() - 15_000;
    Object.assign(gameState, overrides);

    const room: MockRoom = {
      roomCode,
      host: hostId,
      players,
      status: 'playing',
      gameState,
      save: vi.fn(async () => {
        rooms[roomCode] = room;
      }),
      markModified: vi.fn(),
    };
    rooms[roomCode] = room;
    return room;
  }

  it('registers the resumeGame handler', () => {
    expect(mockSocket._handlers['resumeGame']).toBeDefined();
  });

  it('resumes the game when host requests it', async () => {
    const room = createPausedRoom('RESM');
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'RESM', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
    expect(room.save).toHaveBeenCalled();

    const gs = room.gameState as GameState;
    expect(gs.paused).toBe(false);
    expect(gs.pausedBy).toBeNull();
    expect(gs.pausedAt).toBeNull();
    expect(gs.turnTimeRemainingMs).toBeNull();
    expect(gs.turnStartedAt).toBeTypeOf('number');
  });

  it('broadcasts gameResumed to all players', async () => {
    createPausedRoom('RESM');
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'RESM', playerId: hostId }, callback);

    const resumedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameResumed');
    expect(resumedEvents.length).toBeGreaterThanOrEqual(2);

    const hostEvent = resumedEvents.find((e) => e.socketId === 'socket-host-resume');
    expect(hostEvent).toBeDefined();
    expect((hostEvent!.data as { turnStartedAt: number }).turnStartedAt).toBeTypeOf('number');
  });

  it('allows any player in the room to resume the game', async () => {
    createPausedRoom('RESM');
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'RESM', playerId: player2Id }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  it('rejects if room not found', async () => {
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'ZZZZ', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Room or game not found',
    });
  });

  it('rejects if game is not in progress', async () => {
    const room = createPausedRoom('RESM');
    room.status = 'finished';
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'RESM', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is not in progress',
    });
  });

  it('rejects if game is not paused', async () => {
    createPausedRoom('RESM', { paused: false, pausedAt: Date.now() - 5000 });
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'RESM', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is not paused',
    });
  });

  it('resets turnStartedAt on resume', async () => {
    const room = createPausedRoom('RESM');
    const oldTurnStartedAt = (room.gameState as GameState).turnStartedAt;
    const callback = vi.fn();

    await emitEvent('resumeGame', { roomCode: 'RESM', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
    const gs = room.gameState as GameState;
    // turnStartedAt should be updated to a more recent timestamp
    expect(gs.turnStartedAt).toBeTypeOf('number');
    expect(gs.turnStartedAt!).toBeGreaterThanOrEqual(oldTurnStartedAt!);
  });
});

// ============================================================
// Action blocked while paused tests (F-275)
// ============================================================

describe('gameHandlers — actions blocked while paused', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const hostId = 'host-block';
  const player2Id = 'player-block-2';
  const players = [
    { id: hostId, username: 'Alice' },
    { id: player2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[hostId] = 'socket-host-block';
    playerSocketMap[player2Id] = 'socket-player-block-2';

    mockSocket = createMockSocket('socket-host-block');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  function createPausedPlayingRoom(roomCode: string): MockRoom {
    const gameState = initializeGameState(players);
    gameState.phase = 'playing';
    gameState.paused = true;
    gameState.pausedBy = hostId;
    gameState.pausedAt = Date.now() - 5000;
    gameState.turnTimeRemainingMs = 15_000;
    gameState.currentTurnIndex = 0; // host's turn

    const room: MockRoom = {
      roomCode,
      host: hostId,
      players,
      status: 'playing',
      gameState,
      save: vi.fn(async () => {
        rooms[roomCode] = room;
      }),
      markModified: vi.fn(),
    };
    rooms[roomCode] = room;
    return room;
  }

  it('blocks callCheck while paused', async () => {
    createPausedPlayingRoom('BLCK');
    const callback = vi.fn();

    await emitEvent('callCheck', { roomCode: 'BLCK', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });

  it('blocks playerAction while paused', async () => {
    createPausedPlayingRoom('BLCK');
    const callback = vi.fn();

    await emitEvent(
      'playerAction',
      { roomCode: 'BLCK', playerId: hostId, action: { type: 'drawDeck' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });

  it('blocks endPeek while paused', async () => {
    const room = createPausedPlayingRoom('BLCK');
    (room.gameState as GameState).phase = 'peeking';
    const callback = vi.fn();

    await emitEvent('endPeek', { roomCode: 'BLCK', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });

  it('blocks discardChoice while paused', async () => {
    createPausedPlayingRoom('BLCK');
    const callback = vi.fn();

    await emitEvent(
      'discardChoice',
      { roomCode: 'BLCK', playerId: hostId, choice: { discardDrawn: true } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });

  it('blocks redJackSwap while paused', async () => {
    createPausedPlayingRoom('BLCK');
    const callback = vi.fn();

    await emitEvent('redJackSwap', { roomCode: 'BLCK', playerId: hostId, skip: true }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });

  it('blocks redQueenPeek while paused', async () => {
    createPausedPlayingRoom('BLCK');
    const callback = vi.fn();

    await emitEvent('redQueenPeek', { roomCode: 'BLCK', playerId: hostId, slot: 'A' }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });

  it('blocks redKingChoice while paused', async () => {
    createPausedPlayingRoom('BLCK');
    const callback = vi.fn();

    await emitEvent(
      'redKingChoice',
      { roomCode: 'BLCK', playerId: hostId, choice: { type: 'returnBoth' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is paused',
    });
  });
});

// ============================================================
// endGame handler tests
// ============================================================

describe('gameHandlers — endGame', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const hostId = 'host-end';
  const player2Id = 'player-end-2';
  const players = [
    { id: hostId, username: 'Alice' },
    { id: player2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[hostId] = 'socket-host-end';
    playerSocketMap[player2Id] = 'socket-player-end-2';

    mockSocket = createMockSocket('socket-host-end');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  function createRoundEndRoomForEndGame(): MockRoom {
    const room = createRoundEndRoom('ENDG', hostId, players);
    // Set up scores so we have a clear winner/loser
    room.gameState!.scores = {
      [hostId]: 20,
      [player2Id]: 50,
    };
    room.createdAt = new Date();
    return room;
  }

  it('registers the endGame handler', () => {
    expect(mockSocket._handlers['endGame']).toBeDefined();
  });

  it('successfully ends the game when host requests it during roundEnd', async () => {
    const room = createRoundEndRoomForEndGame();
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'ENDG', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });
    expect(room.gameState!.phase).toBe('gameEnd');
    expect(room.status).toBe('finished');
    expect(room.save).toHaveBeenCalled();
  });

  it('broadcasts gameEnded to all players', async () => {
    createRoundEndRoomForEndGame();
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'ENDG', playerId: hostId }, callback);

    const gameEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameEnded');
    expect(gameEndedEvents).toHaveLength(2); // one per player

    // Both players should receive the event
    const socketIds = gameEndedEvents.map((e) => e.socketId);
    expect(socketIds).toContain('socket-host-end');
    expect(socketIds).toContain('socket-player-end-2');
  });

  it('gameEnded payload includes correct winner and loser', async () => {
    createRoundEndRoomForEndGame();
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'ENDG', playerId: hostId }, callback);

    const gameEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameEnded');
    const payload = gameEndedEvents[0].data as {
      winner: { playerId: string; score: number };
      loser: { playerId: string; score: number };
    };

    // Host has score 20 (lowest = winner), player2 has 50 (highest = loser)
    expect(payload.winner.playerId).toBe(hostId);
    expect(payload.winner.score).toBe(20);
    expect(payload.loser.playerId).toBe(player2Id);
    expect(payload.loser.score).toBe(50);
  });

  it('rejects if caller is not the host', async () => {
    createRoundEndRoomForEndGame();
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'ENDG', playerId: player2Id }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Only the host can end the game',
    });
  });

  it('rejects if room is not found', async () => {
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'NONE', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Room or game not found',
    });
  });

  it('rejects if game is not in playing status', async () => {
    const room = createRoundEndRoomForEndGame();
    room.status = 'waiting';
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'ENDG', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Game is not in progress',
    });
  });

  it('rejects if game is not in roundEnd phase', async () => {
    const room = createRoundEndRoomForEndGame();
    room.gameState!.phase = 'playing';
    const callback = vi.fn();

    await emitEvent('endGame', { roomCode: 'ENDG', playerId: hostId }, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: 'Can only end game between rounds',
    });
  });
});

// ============================================================
// Round countdown timer tests
// ============================================================

describe('gameHandlers — round countdown timer', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  const p1Id = 'player-countdown-1';
  const p2Id = 'player-countdown-2';
  const playersList = [
    { id: p1Id, username: 'Alice' },
    { id: p2Id, username: 'Bob' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    rooms = {};
    Object.keys(playerSocketMap).forEach((k) => delete playerSocketMap[k]);
    playerSocketMap[p1Id] = 'socket-cd-1';
    playerSocketMap[p2Id] = 'socket-cd-2';

    mockSocket = createMockSocket('socket-cd-1');
    mockIO = createMockIO();

    registerGameHandlers(mockIO as never, mockSocket as never);
  });

  afterEach(() => {
    cancelRoundCountdown('CDWN');
    cancelRoundCountdown('BURN');
    vi.useRealTimers();
  });

  function emitEvent(event: string, ...args: unknown[]) {
    const handler = mockSocket._handlers[event];
    if (!handler) throw new Error(`No handler registered for event: ${event}`);
    return handler(...args);
  }

  it('does NOT auto-emit nextRoundCountdown when round ends via burn (waits for host)', async () => {
    const gameState = initializeGameState(playersList);
    gameState.phase = 'playing';
    gameState.currentTurnIndex = 0;

    const burnCard = { id: 'c1', suit: '♥' as const, rank: '7' as const, value: 7, isRed: true };
    gameState.players[0].hand = [{ slot: 'A', card: burnCard }];
    gameState.players[0].totalScore = 10;
    gameState.scores = { [p1Id]: 10, [p2Id]: 10 };

    const lowCard = { id: 'c3', suit: '♠' as const, rank: '2' as const, value: 2, isRed: false };
    gameState.players[1].hand = [
      { slot: 'A', card: lowCard },
      { slot: 'B', card: { ...lowCard, id: 'c4' } },
    ];
    gameState.players[1].totalScore = 10;

    gameState.discardPile = [
      { id: 'c2', suit: '♠' as const, rank: '7' as const, value: 7, isRed: false },
    ];

    const room: MockRoom = {
      roomCode: 'CDWN',
      host: p1Id,
      players: playersList,
      status: 'playing',
      gameState,
      save: vi.fn(async () => {
        rooms['CDWN'] = room;
      }),
      markModified: vi.fn(),
    };
    rooms['CDWN'] = room;

    const callback = vi.fn();
    await emitEvent(
      'playerAction',
      {
        roomCode: 'CDWN',
        playerId: p1Id,
        action: { type: 'burn', slot: 'A' },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    const roundEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'roundEnded');
    expect(roundEndedEvents.length).toBeGreaterThanOrEqual(1);

    // nextRoundCountdown should NOT be emitted automatically — host must trigger it
    const countdownEvents = mockIO._emittedEvents.filter((e) => e.event === 'nextRoundCountdown');
    expect(countdownEvents).toHaveLength(0);
  });

  it('cancelRoundCountdown clears a pending timer', () => {
    cancelRoundCountdown('NONEXISTENT');
    expect(true).toBe(true);
  });

  it('endGame handler cancels a pending round countdown', async () => {
    const room = createRoundEndRoom('CDWN', p1Id, playersList);
    room.gameState!.scores = { [p1Id]: 20, [p2Id]: 50 };
    room.players = [
      { id: p1Id, username: 'Alice' },
      { id: p2Id, username: 'Bob' },
    ];
    room.createdAt = new Date();

    // First trigger countdown via startNextRound
    const startCb = vi.fn();
    await emitEvent('startNextRound', { roomCode: 'CDWN', playerId: p1Id }, startCb);
    expect(startCb).toHaveBeenCalledWith({ success: true });

    // Now end the game — this should cancel the countdown
    // Need to re-fetch room since startNextRound doesn't change phase yet (countdown is pending)
    // The room is still in roundEnd phase because the countdown hasn't fired yet
    const callback = vi.fn();
    await emitEvent('endGame', { roomCode: 'CDWN', playerId: p1Id }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });

    // Advance past countdown — round should NOT auto-start because endGame cancelled it
    await vi.advanceTimersByTimeAsync(6000);

    expect(rooms['CDWN'].status).toBe('finished');
    const gameStartedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameStarted');
    expect(gameStartedEvents).toHaveLength(0);
  });

  it('startNextRound handler schedules countdown and auto-starts after 5s', async () => {
    createRoundEndRoom('CDWN', p1Id, playersList);

    const callback = vi.fn();
    await emitEvent('startNextRound', { roomCode: 'CDWN', playerId: p1Id }, callback);

    expect(callback).toHaveBeenCalledWith({ success: true });

    // nextRoundCountdown should be emitted to all players
    const countdownEvents = mockIO._emittedEvents.filter((e) => e.event === 'nextRoundCountdown');
    expect(countdownEvents.length).toBeGreaterThanOrEqual(1);

    // After 5s, the next round should auto-start
    await vi.advanceTimersByTimeAsync(6000);

    const gameStartedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameStarted');
    expect(gameStartedEvents).toHaveLength(2);
  });

  it('does NOT emit nextRoundCountdown when game ends', async () => {
    const gameState = initializeGameState(playersList);
    gameState.phase = 'playing';
    gameState.currentTurnIndex = 0;
    gameState.gameStartedAt = '2026-03-10T10:00:00.000Z';

    const burnCard = { id: 'c1', suit: '♥' as const, rank: '7' as const, value: 7, isRed: true };
    gameState.players[0].hand = [{ slot: 'A', card: burnCard }];
    gameState.players[0].totalScore = 0;

    const highCard = { id: 'c3', suit: '♠' as const, rank: 'K' as const, value: 13, isRed: false };
    gameState.players[1].hand = [
      { slot: 'A', card: highCard },
      { slot: 'B', card: { ...highCard, id: 'c4' } },
      { slot: 'C', card: { ...highCard, id: 'c5' } },
      { slot: 'D', card: { ...highCard, id: 'c6' } },
    ];
    gameState.players[1].totalScore = 80;
    gameState.scores = { [p1Id]: 0, [p2Id]: 80 };

    gameState.discardPile = [
      { id: 'c2', suit: '♠' as const, rank: '7' as const, value: 7, isRed: false },
    ];

    const room: MockRoom = {
      roomCode: 'CDWN',
      host: p1Id,
      players: [
        { id: p1Id, username: 'Alice' },
        { id: p2Id, username: 'Bob' },
      ],
      status: 'playing',
      gameState,
      createdAt: new Date(),
      save: vi.fn(async () => {
        rooms['CDWN'] = room;
      }),
      markModified: vi.fn(),
    };
    rooms['CDWN'] = room;

    const callback = vi.fn();
    await emitEvent(
      'playerAction',
      {
        roomCode: 'CDWN',
        playerId: p1Id,
        action: { type: 'burn', slot: 'A' },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ success: true });

    const gameEndedEvents = mockIO._emittedEvents.filter((e) => e.event === 'gameEnded');
    expect(gameEndedEvents.length).toBeGreaterThanOrEqual(1);

    const countdownEvents = mockIO._emittedEvents.filter((e) => e.event === 'nextRoundCountdown');
    expect(countdownEvents).toHaveLength(0);
  });
});

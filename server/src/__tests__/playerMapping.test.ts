import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  registerPlayer,
  unregisterPlayer,
  getPlayerBySocket,
  getSocketByPlayer,
  isPlayerConnected,
  startGracePeriod,
  cancelGracePeriod,
  hasPendingDisconnect,
  getPendingDisconnect,
  reconnectPlayer,
} from '../socket/playerMapping';

// The module uses module-level Maps, so we need to clean up between tests.
// Since there's no exported clear function, we unregister all known sockets manually.

describe('playerMapping', () => {
  // Track registered socket IDs so we can clean up
  const registeredSockets: string[] = [];
  // Track players with pending disconnects so we can clean up
  const pendingPlayers: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    // Clean up any previously registered mappings
    for (const socketId of registeredSockets) {
      unregisterPlayer(socketId);
    }
    registeredSockets.length = 0;
    // Clean up any pending disconnects
    for (const playerId of pendingPlayers) {
      cancelGracePeriod(playerId);
    }
    pendingPlayers.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function register(socketId: string, playerId: string, roomCode: string, username: string) {
    registerPlayer(socketId, playerId, roomCode, username);
    registeredSockets.push(socketId);
  }

  describe('registerPlayer', () => {
    it('stores socket-to-player mapping', () => {
      register('socket-1', 'player-1', 'ROOM01', 'Alice');
      const mapping = getPlayerBySocket('socket-1');
      expect(mapping).toEqual({
        playerId: 'player-1',
        roomCode: 'ROOM01',
        username: 'Alice',
      });
    });

    it('stores player-to-socket mapping', () => {
      register('socket-1', 'player-1', 'ROOM01', 'Alice');
      expect(getSocketByPlayer('player-1')).toBe('socket-1');
    });

    it('handles multiple players', () => {
      register('socket-1', 'player-1', 'ROOM01', 'Alice');
      register('socket-2', 'player-2', 'ROOM01', 'Bob');

      expect(getPlayerBySocket('socket-1')?.playerId).toBe('player-1');
      expect(getPlayerBySocket('socket-2')?.playerId).toBe('player-2');
      expect(getSocketByPlayer('player-1')).toBe('socket-1');
      expect(getSocketByPlayer('player-2')).toBe('socket-2');
    });
  });

  describe('unregisterPlayer', () => {
    it('removes both mappings and returns the player info', () => {
      register('socket-1', 'player-1', 'ROOM01', 'Alice');

      const result = unregisterPlayer('socket-1');
      expect(result).toEqual({
        playerId: 'player-1',
        roomCode: 'ROOM01',
        username: 'Alice',
      });

      expect(getPlayerBySocket('socket-1')).toBeUndefined();
      expect(getSocketByPlayer('player-1')).toBeUndefined();
    });

    it('returns undefined for unknown socket ID', () => {
      expect(unregisterPlayer('unknown-socket')).toBeUndefined();
    });
  });

  describe('getPlayerBySocket', () => {
    it('returns undefined for unknown socket', () => {
      expect(getPlayerBySocket('nonexistent')).toBeUndefined();
    });
  });

  describe('getSocketByPlayer', () => {
    it('returns undefined for unknown player', () => {
      expect(getSocketByPlayer('nonexistent')).toBeUndefined();
    });
  });

  describe('isPlayerConnected', () => {
    it('returns true for registered player', () => {
      register('socket-1', 'player-1', 'ROOM01', 'Alice');
      expect(isPlayerConnected('player-1')).toBe(true);
    });

    it('returns false for unregistered player', () => {
      expect(isPlayerConnected('unknown')).toBe(false);
    });

    it('returns false after player is unregistered', () => {
      register('socket-1', 'player-1', 'ROOM01', 'Alice');
      unregisterPlayer('socket-1');
      expect(isPlayerConnected('player-1')).toBe(false);
    });
  });

  // ============================================================
  // Grace period tests
  // ============================================================

  describe('startGracePeriod', () => {
    it('marks player as having a pending disconnect', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire = vi.fn();

      startGracePeriod(mapping, onExpire, 30000);
      pendingPlayers.push('player-1');

      expect(hasPendingDisconnect('player-1')).toBe(true);
    });

    it('calls onExpire after grace period elapses', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire = vi.fn();

      startGracePeriod(mapping, onExpire, 30000);
      pendingPlayers.push('player-1');

      expect(onExpire).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30000);

      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(hasPendingDisconnect('player-1')).toBe(false);
    });

    it('does not call onExpire before grace period elapses', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire = vi.fn();

      startGracePeriod(mapping, onExpire, 30000);
      pendingPlayers.push('player-1');

      vi.advanceTimersByTime(29999);

      expect(onExpire).not.toHaveBeenCalled();
      expect(hasPendingDisconnect('player-1')).toBe(true);
    });

    it('replaces existing grace period for same player', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire1 = vi.fn();
      const onExpire2 = vi.fn();

      startGracePeriod(mapping, onExpire1, 30000);
      pendingPlayers.push('player-1');

      // Start a new grace period before the first expires
      vi.advanceTimersByTime(15000);
      startGracePeriod(mapping, onExpire2, 30000);

      // First timer should have been cancelled
      vi.advanceTimersByTime(15000);
      expect(onExpire1).not.toHaveBeenCalled();

      // Second timer should fire after its full duration
      vi.advanceTimersByTime(15000);
      expect(onExpire2).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelGracePeriod', () => {
    it('cancels the grace period timer and returns pending info', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire = vi.fn();

      startGracePeriod(mapping, onExpire, 30000);
      pendingPlayers.push('player-1');

      const pending = cancelGracePeriod('player-1');

      expect(pending).toBeDefined();
      expect(pending!.mapping).toEqual(mapping);
      expect(hasPendingDisconnect('player-1')).toBe(false);

      // Timer should not fire after cancellation
      vi.advanceTimersByTime(30000);
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('returns undefined if no grace period exists', () => {
      expect(cancelGracePeriod('unknown-player')).toBeUndefined();
    });
  });

  describe('getPendingDisconnect', () => {
    it('returns pending disconnect info', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire = vi.fn();

      startGracePeriod(mapping, onExpire, 30000);
      pendingPlayers.push('player-1');

      const pending = getPendingDisconnect('player-1');
      expect(pending).toBeDefined();
      expect(pending!.mapping).toEqual(mapping);
      expect(pending!.disconnectedAt).toBeGreaterThan(0);
    });

    it('returns undefined for player without pending disconnect', () => {
      expect(getPendingDisconnect('unknown')).toBeUndefined();
    });
  });

  describe('reconnectPlayer', () => {
    it('cancels grace period and re-registers player with new socket', () => {
      const mapping = { playerId: 'player-1', roomCode: 'ROOM01', username: 'Alice' };
      const onExpire = vi.fn();

      startGracePeriod(mapping, onExpire, 30000);
      pendingPlayers.push('player-1');

      const pending = reconnectPlayer('new-socket-1', 'player-1');
      registeredSockets.push('new-socket-1');

      expect(pending).toBeDefined();
      expect(pending!.mapping).toEqual(mapping);

      // Player should be re-registered with new socket
      expect(getSocketByPlayer('player-1')).toBe('new-socket-1');
      expect(getPlayerBySocket('new-socket-1')).toEqual(mapping);
      expect(isPlayerConnected('player-1')).toBe(true);

      // Grace period should be cancelled
      expect(hasPendingDisconnect('player-1')).toBe(false);
      vi.advanceTimersByTime(30000);
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('returns undefined if player has no pending disconnect', () => {
      const result = reconnectPlayer('new-socket', 'unknown-player');
      expect(result).toBeUndefined();

      // Should NOT register anything
      expect(getPlayerBySocket('new-socket')).toBeUndefined();
    });
  });

  // ============================================================
  // Multi-tab / duplicate socket tests
  // ============================================================

  describe('multi-tab handling', () => {
    it('registerPlayer cleans up old socket when same playerId re-registers', () => {
      register('socket-tab1', 'player-1', 'ROOM01', 'Alice');
      expect(getSocketByPlayer('player-1')).toBe('socket-tab1');
      expect(getPlayerBySocket('socket-tab1')).toBeDefined();

      // Second tab registers with the same playerId
      register('socket-tab2', 'player-1', 'ROOM01', 'Alice');

      // playerToSocket should point to the new socket
      expect(getSocketByPlayer('player-1')).toBe('socket-tab2');
      // Old socket's orphan entry should be cleaned up
      expect(getPlayerBySocket('socket-tab1')).toBeUndefined();
      // New socket should be mapped correctly
      expect(getPlayerBySocket('socket-tab2')).toEqual({
        playerId: 'player-1',
        roomCode: 'ROOM01',
        username: 'Alice',
      });
    });

    it('unregisterPlayer does not remove playerToSocket when a newer tab owns the mapping', () => {
      register('socket-tab1', 'player-1', 'ROOM01', 'Alice');
      register('socket-tab2', 'player-1', 'ROOM01', 'Alice');

      // Old tab disconnects — unregister its socket
      // (registerPlayer already cleaned up socket-tab1 from socketToPlayer,
      //  so this should return undefined and be a no-op)
      const result = unregisterPlayer('socket-tab1');
      expect(result).toBeUndefined();

      // The active tab's mapping should remain intact
      expect(getSocketByPlayer('player-1')).toBe('socket-tab2');
      expect(getPlayerBySocket('socket-tab2')).toBeDefined();
      expect(isPlayerConnected('player-1')).toBe(true);
    });

    it('closing the active tab still triggers proper disconnect', () => {
      register('socket-tab1', 'player-1', 'ROOM01', 'Alice');
      register('socket-tab2', 'player-1', 'ROOM01', 'Alice');

      // Active tab disconnects
      const result = unregisterPlayer('socket-tab2');
      expect(result).toEqual({
        playerId: 'player-1',
        roomCode: 'ROOM01',
        username: 'Alice',
      });

      expect(getSocketByPlayer('player-1')).toBeUndefined();
      expect(isPlayerConnected('player-1')).toBe(false);
    });

    it('three tabs — only the latest survives', () => {
      register('socket-a', 'player-1', 'ROOM01', 'Alice');
      register('socket-b', 'player-1', 'ROOM01', 'Alice');
      register('socket-c', 'player-1', 'ROOM01', 'Alice');

      // Only socket-c should be active
      expect(getSocketByPlayer('player-1')).toBe('socket-c');
      expect(getPlayerBySocket('socket-a')).toBeUndefined();
      expect(getPlayerBySocket('socket-b')).toBeUndefined();
      expect(getPlayerBySocket('socket-c')).toBeDefined();

      // Closing old tabs is a no-op
      expect(unregisterPlayer('socket-a')).toBeUndefined();
      expect(unregisterPlayer('socket-b')).toBeUndefined();
      expect(isPlayerConnected('player-1')).toBe(true);

      // Closing the active tab properly disconnects
      expect(unregisterPlayer('socket-c')).toBeDefined();
      expect(isPlayerConnected('player-1')).toBe(false);
    });
  });
});

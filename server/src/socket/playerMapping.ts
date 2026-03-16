/**
 * Bidirectional mapping between socket IDs and player/room info.
 * Allows quick lookups in both directions for disconnect handling.
 *
 * Also manages a grace period for disconnected players so they can
 * rejoin before being fully removed from the game.
 */

export interface PlayerMapping {
  playerId: string;
  roomCode: string;
  username: string;
}

/** Grace period entry for a disconnected player awaiting reconnection */
export interface PendingDisconnect {
  mapping: PlayerMapping;
  timer: ReturnType<typeof setTimeout>;
  disconnectedAt: number;
}

/** Default grace period: 45 seconds */
export const DISCONNECT_GRACE_MS = 45_000;

/** socketId -> { playerId, roomCode, username } */
const socketToPlayer = new Map<string, PlayerMapping>();

/** playerId -> socketId */
const playerToSocket = new Map<string, string>();

/** playerId -> pending disconnect info (grace period) */
const pendingDisconnects = new Map<string, PendingDisconnect>();

export function registerPlayer(
  socketId: string,
  playerId: string,
  roomCode: string,
  username: string,
): void {
  // Clean up any previous socket mapping for this player (e.g. second
  // tab or page refresh) so no orphan entry remains in socketToPlayer.
  const oldSocketId = playerToSocket.get(playerId);
  if (oldSocketId && oldSocketId !== socketId) {
    socketToPlayer.delete(oldSocketId);
  }

  socketToPlayer.set(socketId, { playerId, roomCode, username });
  playerToSocket.set(playerId, socketId);
}

export function unregisterPlayer(socketId: string): PlayerMapping | undefined {
  const mapping = socketToPlayer.get(socketId);
  if (mapping) {
    socketToPlayer.delete(socketId);
    // Only remove the playerToSocket entry if it still points to THIS
    // socket — a newer tab may have already overwritten it.
    if (playerToSocket.get(mapping.playerId) === socketId) {
      playerToSocket.delete(mapping.playerId);
    }
  }
  return mapping;
}

export function getPlayerBySocket(socketId: string): PlayerMapping | undefined {
  return socketToPlayer.get(socketId);
}

export function getSocketByPlayer(playerId: string): string | undefined {
  return playerToSocket.get(playerId);
}

export function isPlayerConnected(playerId: string): boolean {
  return playerToSocket.has(playerId);
}

// ============================================================
// Grace period helpers
// ============================================================

/**
 * Start a grace period for a disconnected player.
 * If the player doesn't rejoin within `gracePeriodMs`, `onExpire` is called.
 */
export function startGracePeriod(
  mapping: PlayerMapping,
  onExpire: () => void,
  gracePeriodMs: number = DISCONNECT_GRACE_MS,
): void {
  // Cancel any existing grace period for this player
  cancelGracePeriod(mapping.playerId);

  const timer = setTimeout(() => {
    pendingDisconnects.delete(mapping.playerId);
    onExpire();
  }, gracePeriodMs);

  pendingDisconnects.set(mapping.playerId, {
    mapping,
    timer,
    disconnectedAt: Date.now(),
  });
}

/**
 * Cancel a pending grace period (e.g. player rejoined).
 * Returns the pending disconnect info if one existed.
 */
export function cancelGracePeriod(playerId: string): PendingDisconnect | undefined {
  const pending = pendingDisconnects.get(playerId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDisconnects.delete(playerId);
  }
  return pending;
}

/**
 * Check if a player has a pending disconnect (is in grace period).
 */
export function hasPendingDisconnect(playerId: string): boolean {
  return pendingDisconnects.has(playerId);
}

/**
 * Get the pending disconnect info for a player.
 */
export function getPendingDisconnect(playerId: string): PendingDisconnect | undefined {
  return pendingDisconnects.get(playerId);
}

/**
 * Re-register a reconnecting player with their new socket ID.
 * Cancels the grace period and restores the player mapping.
 * Returns the pending disconnect info if the player was in grace period.
 */
export function reconnectPlayer(
  newSocketId: string,
  playerId: string,
): PendingDisconnect | undefined {
  const pending = cancelGracePeriod(playerId);
  if (pending) {
    registerPlayer(newSocketId, playerId, pending.mapping.roomCode, pending.mapping.username);
  }
  return pending;
}

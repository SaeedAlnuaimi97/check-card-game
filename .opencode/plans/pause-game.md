# Pause Game Plan

## Overview

Allow the host to pause and resume an active game. While paused, no player actions are accepted and the turn timer is frozen. Any player can request a pause, but only the host can actually pause/unpause. This prevents griefing while still giving everyone a voice.

---

## 1. Game State Changes

### New Phase Value: `'paused'`

**Do NOT add `'paused'` to the `GamePhase` type.** The pause state is orthogonal to the game phase — a game can be paused during `'peeking'`, `'playing'`, or while a `pendingEffect` is active. Adding it as a phase would lose the information about what phase to resume to.

Instead, add a dedicated `paused` field to `GameState`:

#### `server/src/types/game.types.ts`

```typescript
export interface GameState {
  // ... existing fields ...
  paused: boolean;
  pausedBy: string | null; // playerId of who triggered the pause
  pausedAt: number | null; // timestamp when paused
  turnTimeRemainingMs: number | null; // remaining turn time when paused (to resume timer accurately)
}
```

#### `client/src/types/game.types.ts`

```typescript
export interface ClientGameState {
  // ... existing fields ...
  paused: boolean;
  pausedBy: string | null;
}
```

### Feature IDs

- **F-270**: Add `paused`, `pausedBy`, `pausedAt`, `turnTimeRemainingMs` to GameState
- **F-271**: Add `paused`, `pausedBy` to ClientGameState

---

## 2. Server Logic

### New Socket Events

#### `pauseGame` (client → server)

- **Payload:** `{ roomCode: string }`
- **Validation:**
  - Room exists and status is `'playing'`
  - Game phase is `'peeking'` or `'playing'` (not `'roundEnd'`, `'gameEnd'`, `'dealing'`)
  - Game is not already paused
  - Emitting player is the host
- **Action:**
  1. Set `gameState.paused = true`, `pausedBy = playerId`, `pausedAt = Date.now()`
  2. Calculate remaining turn time: `turnTimeRemainingMs = TURN_TIMEOUT_MS - (Date.now() - turnStartedAt)`
  3. Clear the turn timer (`clearTurnTimer(roomCode)`)
  4. Save room to DB
  5. Broadcast `gamePaused` to all players in the room

#### `resumeGame` (client → server)

- **Payload:** `{ roomCode: string }`
- **Validation:**
  - Room exists and status is `'playing'`
  - Game is currently paused (`gameState.paused === true`)
  - Emitting player is the host
- **Action:**
  1. Set `gameState.paused = false`, `pausedBy = null`, `pausedAt = null`
  2. Set `gameState.turnStartedAt = Date.now()` (reset for the client timer display)
  3. Restart the turn timer with `turnTimeRemainingMs` as the duration (not the full 30s)
  4. Clear `turnTimeRemainingMs = null`
  5. Save room to DB
  6. Broadcast `gameResumed` to all players in the room

#### `gamePaused` (server → client)

- **Payload:** `{ pausedBy: string, username: string }`
- Clients freeze all UI interactions and show a "Game Paused" overlay

#### `gameResumed` (server → client)

- **Payload:** `{ turnStartedAt: number }`
- Clients hide the overlay and resume normal play

### Action Blocking

In every game action handler (`drawDeck`, `takeDiscard`, `burn`, `callCheck`, `resolveRedJack`, `resolveRedQueen`, `resolveRedKing`, `peekedCards`), add a guard at the top:

```typescript
if (room.gameState?.paused) {
  socket.emit('actionError', { message: 'Game is paused' });
  return;
}
```

This is a single utility check added early in each handler, inside the existing room mutex lock.

### Turn Timer Integration

In `TurnTimer.ts`, add a new function for resuming with remaining time:

```typescript
export function startTurnTimerWithDuration(
  roomCode: string,
  durationMs: number,
  onTimeout: (roomCode: string) => void,
): void {
  clearTurnTimer(roomCode);
  const clamped = Math.max(durationMs, 1000); // at least 1 second
  const handle = setTimeout(() => {
    turnTimers.delete(roomCode);
    onTimeout(roomCode);
  }, clamped);
  turnTimers.set(roomCode, handle);
}
```

### Feature IDs

- **F-272**: `pauseGame` socket event handler (host-only, clear timer, save state)
- **F-273**: `resumeGame` socket event handler (host-only, restore timer with remaining time)
- **F-274**: `gamePaused` / `gameResumed` server → client broadcast events
- **F-275**: Block all game actions while paused (guard in every handler)
- **F-276**: `startTurnTimerWithDuration` in TurnTimer.ts for resume with remaining time

---

## 3. Client UI

### Pause/Resume Button

- **Location:** In the game controls area of `GameBoard.tsx`, visible only to the host
- **Appearance:** A simple icon button (e.g., "⏸" / "▶") positioned in the top-right corner of the game board
- **Behavior:**
  - If game is not paused → shows "⏸" → emits `pauseGame`
  - If game is paused → shows "▶" → emits `resumeGame`
  - Only rendered for the host player
  - Disabled during `'roundEnd'`, `'gameEnd'`, `'dealing'` phases

### Pause Overlay

- **When `gameState.paused === true`:** Show a semi-transparent overlay over the entire game board
- **Content:**
  - "Game Paused" heading
  - "Paused by {username}" subtitle
  - If current player is host: "Resume" button (▶)
  - If current player is NOT host: "Waiting for host to resume..."
- **The overlay blocks all card interactions** (pointer-events: none on the game area beneath)
- Uses Chakra UI `Modal` or a positioned `Box` with `zIndex`

### Turn Timer Freeze

- The client-side turn timer display should freeze when `paused === true`
- On resume, `turnStartedAt` is reset by the server so the client timer recalculates correctly

### Toast Notifications

- On `gamePaused`: show toast "{username} paused the game"
- On `gameResumed`: show toast "Game resumed"

### Feature IDs

- **F-277**: Pause/Resume button (host-only, top-right corner)
- **F-278**: Pause overlay with "Game Paused" message
- **F-279**: Freeze turn timer display while paused
- **F-280**: Toast notifications for pause/resume events

---

## 4. Sanitization

In `GameSetup.ts` → `sanitizeGameState()`:

- Include `paused` and `pausedBy` in the client-facing state
- Exclude `pausedAt` and `turnTimeRemainingMs` (server-internal only)

### Feature ID

- **F-281**: Sanitize pause fields in client game state

---

## 5. Mongoose Schema Update

In `server/src/models/Room.ts` → `GameStateSchema`:

```typescript
paused: { type: Boolean, default: false },
pausedBy: { type: String, default: null },
pausedAt: { type: Number, default: null },
turnTimeRemainingMs: { type: Number, default: null },
```

### Feature ID

- **F-282**: Add pause fields to GameState Mongoose schema

---

## 6. Edge Cases

| Scenario                            | Behavior                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Host disconnects while paused       | Grace period applies (45s). If host doesn't return, game stays paused. New host (if implemented) or players leave. |
| Player disconnects while paused     | Normal grace period. They can rejoin. Game remains paused.                                                         |
| Pause during peeking phase          | Allowed. Timer freezes. Players cannot peek while paused.                                                          |
| Pause during pending special effect | Allowed. The pending effect remains. Player resolves it after resume.                                              |
| Host spams pause/resume             | Rate limit: minimum 3 seconds between pause/resume toggles (server-side check using `pausedAt` timestamp).         |
| Round ends while paused             | Not possible — turn timer is cleared, no actions can be taken.                                                     |
| Pause after check called            | Allowed. The "final round" continues after resume.                                                                 |

---

## 7. Implementation Order

### Branch: `feature/pause-game`

| Step | Features            | Description                                         |
| ---- | ------------------- | --------------------------------------------------- |
| 1    | F-270, F-271, F-282 | Type definitions + Mongoose schema for pause fields |
| 2    | F-276               | `startTurnTimerWithDuration` in TurnTimer.ts        |
| 3    | F-272, F-273, F-274 | Pause/resume socket event handlers + broadcasts     |
| 4    | F-275               | Add pause guard to all game action handlers         |
| 5    | F-281               | Sanitize pause fields for client                    |
| 6    | F-277, F-278        | Pause button + overlay UI                           |
| 7    | F-279, F-280        | Timer freeze + toast notifications                  |
| 8    | —                   | Tests, type checks, verification                    |

### Tests Required (server)

- `turnTimer.test.ts` — Add tests for `startTurnTimerWithDuration`
- `gameHandlers.test.ts` — Add tests for `pauseGame` and `resumeGame` handlers (validation, timer behavior, broadcast)
- `gameHandlers.test.ts` — Add tests for action-blocked-while-paused
- `gameSetup.test.ts` — Verify sanitization includes/excludes correct pause fields

### Estimated File Changes

- **New files (0)** — All changes go into existing files
- **Modified files (~10):** `game.types.ts` (both), `Room.ts`, `TurnTimer.ts`, `gameHandlers.ts` (or new `pauseHandlers.ts`), `GameSetup.ts`, `GameBoard.tsx`, `SocketContext.tsx`, `socket/index.ts`, test files

---

## 8. FEATURES.md Entries to Add

```markdown
### Pause Game

- [ ] **F-270**: Add paused, pausedBy, pausedAt, turnTimeRemainingMs to server GameState
- [ ] **F-271**: Add paused, pausedBy to ClientGameState
- [ ] **F-272**: pauseGame socket event handler (host-only)
- [ ] **F-273**: resumeGame socket event handler (host-only, restore timer)
- [ ] **F-274**: gamePaused / gameResumed broadcast events
- [ ] **F-275**: Block all game actions while paused
- [ ] **F-276**: startTurnTimerWithDuration for resume with remaining time
- [ ] **F-277**: Pause/Resume button (host-only, top-right)
- [ ] **F-278**: Pause overlay with "Game Paused" message
- [ ] **F-279**: Freeze turn timer display while paused
- [ ] **F-280**: Toast notifications for pause/resume
- [ ] **F-281**: Sanitize pause fields in client game state
- [ ] **F-282**: Add pause fields to GameState Mongoose schema
```

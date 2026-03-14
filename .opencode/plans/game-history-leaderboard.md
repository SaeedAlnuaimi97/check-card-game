# Game History + Leaderboard Plan

## Overview

Save completed game results and provide an all-time leaderboard. Guest-based identity — no user accounts. Returning players are recognized via `username + device fingerprint` combination stored in `localStorage`.

---

## 1. Guest Identity (Device Fingerprint)

### Problem

Currently `playerId` is a fresh UUID generated per session (`generatePlayerId()` in `helpers.ts`). There is no way to track a returning player across sessions.

### Solution — Stable Guest ID

- Generate a **stable guest ID** on the client using a lightweight device fingerprint (screen resolution + timezone + language + userAgent hash). Store it in `localStorage` as `guestId`.
- On every `createRoom` / `joinRoom` event, send `guestId` alongside `username`.
- The server stores `guestId` on the Room player entry and in game results.
- **No user accounts, no login, no passwords.** The `guestId` is best-effort — if a user clears localStorage they get a new identity. This is acceptable for a casual game.

### Client Changes

- New file: `client/src/utils/fingerprint.ts`
  - `getOrCreateGuestId(): string` — hash of `navigator.userAgent + screen.width + screen.height + Intl.DateTimeFormat().resolvedOptions().timeZone + navigator.language`, stored in `localStorage` under key `checkgame_guest_id`.
  - Use a simple hash function (djb2 or similar), no external dependency needed.
- `SocketContext.tsx`: Include `guestId` in `createRoom` and `joinRoom` payloads.

### Server Changes

- Add `guestId: string` field to `RoomPlayerSchema` and `PlayerState`.
- Validate `guestId` exists on `createRoom`/`joinRoom`; reject if missing.
- Pass `guestId` through to game results when saving.

### Feature IDs

- **F-230**: Client-side stable guest ID generation and persistence
- **F-231**: Server-side guestId validation and storage on room join

---

## 2. Game Result Model

### New Mongoose Model: `GameResult`

File: `server/src/models/GameResult.ts`

```typescript
interface GameResultPlayer {
  playerId: string; // ephemeral session ID
  guestId: string; // stable device fingerprint
  username: string;
  finalScore: number;
  isWinner: boolean;
  isLoser: boolean; // the player who hit 100+
}

interface IGameResult {
  roomCode: string;
  startedAt: Date;
  endedAt: Date;
  totalRounds: number;
  players: GameResultPlayer[];
  winnerId: string; // guestId of winner
  loserId: string; // guestId of loser
  winnerUsername: string;
  loserUsername: string;
}
```

- Indexed on: `endedAt` (descending), `players.guestId`, `winnerId`, `loserId`.
- TTL index: None (keep forever — documents are small, ~500 bytes each).

### When to Save

- In `gameHandlers.ts`, after `computeGameEndResult` is called and phase becomes `'gameEnd'`, create and save a `GameResult` document.
- Extract `guestId` from the room's player list (match by `playerId`).
- Set `startedAt` from `room.updatedAt` when game started (or add a `gameStartedAt` field to `GameState`).
- Set `endedAt` to `new Date()`.

### Feature IDs

- **F-232**: GameResult Mongoose model with indexes
- **F-233**: Save game result on game end (gameHandlers.ts integration)
- **F-234**: Add `gameStartedAt` timestamp to GameState

---

## 3. Leaderboard API

### New REST Endpoints

File: `server/src/routes/leaderboard.ts`

#### `GET /api/leaderboard`

Returns top 50 players by win count.

**Query params:** `limit` (default 50, max 100)

**Response:**

```json
{
  "leaderboard": [
    {
      "rank": 1,
      "guestId": "abc123",
      "username": "LastUsedName",
      "gamesPlayed": 25,
      "wins": 15,
      "losses": 3,
      "winRate": 60.0,
      "avgScore": 42.5,
      "lastPlayedAt": "2026-03-13T..."
    }
  ]
}
```

**Implementation:** MongoDB aggregation pipeline on `GameResult`:

1. `$unwind` players array
2. `$group` by `players.guestId` — count games, sum wins/losses, avg score, max date, last username
3. `$sort` by wins descending
4. `$limit`

#### `GET /api/stats/:guestId`

Returns personal stats for a specific guest.

**Response:**

```json
{
  "guestId": "abc123",
  "username": "LastUsedName",
  "gamesPlayed": 25,
  "wins": 15,
  "losses": 3,
  "winRate": 60.0,
  "avgScore": 42.5,
  "recentGames": [
    {
      "roomCode": "ABCDEF",
      "endedAt": "2026-03-13T...",
      "totalRounds": 5,
      "playerCount": 4,
      "myScore": 35,
      "winnerUsername": "Alice",
      "isWin": true
    }
  ]
}
```

**Implementation:** Two queries:

1. Aggregation for summary stats (same as leaderboard but filtered by guestId)
2. `GameResult.find({ 'players.guestId': guestId }).sort({ endedAt: -1 }).limit(20)` for recent games

#### Route Registration

- Register in `server/src/server.ts` alongside existing health route.

### Feature IDs

- **F-235**: GET /api/leaderboard endpoint with aggregation
- **F-236**: GET /api/stats/:guestId endpoint with recent games

---

## 4. Client UI

### 4a. Leaderboard Page

File: `client/src/pages/Leaderboard.tsx`

- New route: `/leaderboard`
- Table showing rank, username, games played, wins, losses, win rate, avg score
- Top 3 highlighted with gold/silver/bronze colors
- "Your Stats" button at top if guestId exists → navigates to personal stats
- Back button → home
- Auto-refresh every 30 seconds (or manual refresh button)
- Mobile-responsive: horizontal scroll on narrow screens or card layout

### 4b. Personal Stats Section

Component within Leaderboard page (or a tab/modal):

- Summary card: games played, wins, losses, win rate, avg score
- Recent games list (last 20): date, room code, player count, my score, winner, W/L badge
- Accessible from leaderboard page or from a "My Stats" link on the home page

### 4c. Game End Modal Enhancement

In `GameBoard.tsx` game-end modal:

- Add "View Leaderboard" button
- Show "Game saved!" confirmation text after game result is persisted

### 4d. Home Page Link

In `client/src/pages/Home.tsx`:

- Add "Leaderboard" navigation button/link below the create/join room buttons

### Feature IDs

- **F-237**: Leaderboard page with top 50 table
- **F-238**: Personal stats view with recent games
- **F-239**: Game end modal — leaderboard link + save confirmation
- **F-240**: Home page — leaderboard navigation link

---

## 5. Implementation Order

### Branch: `feature/game-history-leaderboard`

| Step | Features     | Description                                      |
| ---- | ------------ | ------------------------------------------------ |
| 1    | F-230, F-231 | Guest ID: client fingerprint + server validation |
| 2    | F-232, F-234 | GameResult model + gameStartedAt field           |
| 3    | F-233        | Save game result on game end                     |
| 4    | F-235, F-236 | REST API endpoints (leaderboard + stats)         |
| 5    | F-237, F-238 | Leaderboard page + personal stats UI             |
| 6    | F-239, F-240 | Game end modal enhancement + home page link      |
| 7    | —            | Tests, type checks, final verification           |

### Tests Required (server)

- `gameResult.test.ts` — Model validation, index verification
- `leaderboard.test.ts` — API endpoint tests (mock DB), aggregation correctness
- `gameHandlers.test.ts` — Add tests for game result saving on game end
- `fingerprint.test.ts` — guestId validation on join/create

### Estimated File Changes

- **New files (4):** `client/src/utils/fingerprint.ts`, `server/src/models/GameResult.ts`, `server/src/routes/leaderboard.ts`, `client/src/pages/Leaderboard.tsx`
- **Modified files (~8):** `SocketContext.tsx`, `Home.tsx`, `GameBoard.tsx`, `roomHandlers.ts`, `gameHandlers.ts`, `game.types.ts` (both client/server), `server.ts`, `App.tsx` (router)

---

## 6. FEATURES.md Entries to Add

```markdown
### Game History & Leaderboard

- [ ] **F-230**: Client-side stable guest ID generation and persistence
- [ ] **F-231**: Server-side guestId validation and storage on room join
- [ ] **F-232**: GameResult Mongoose model with indexes
- [ ] **F-233**: Save game result on game end
- [ ] **F-234**: Add gameStartedAt timestamp to GameState
- [ ] **F-235**: GET /api/leaderboard endpoint with aggregation
- [ ] **F-236**: GET /api/stats/:guestId endpoint with recent games
- [ ] **F-237**: Leaderboard page with top 50 table
- [ ] **F-238**: Personal stats view with recent games
- [ ] **F-239**: Game end modal — leaderboard link and save confirmation
- [ ] **F-240**: Home page — leaderboard navigation link
```

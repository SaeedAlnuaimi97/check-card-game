# Challenge Modes — Detailed Implementation Plan

> **Baseline:** The game currently supports 2–10 players, a single rule set (4 cards, standard 52-card deck, Red J/Q/K effects), and one configurable setting (`targetScore` 30–150). There is no concept of "game mode" anywhere. All modes below build on top of the existing room/lobby system.

---

## Table of Contents

1. [Shared Infrastructure](#1-shared-infrastructure)
2. [Mode A — Sudden Death](#2-mode-a--sudden-death) (2+ players)
3. [Mode B — Bounty Hunt](#3-mode-b--bounty-hunt) (2+ players)
4. [Mode C — Blind Rounds (Fog of War)](#4-mode-c--blind-rounds-fog-of-war) (2+ players)
5. [Mode D — Knockout Tournament](#5-mode-d--knockout-tournament) (4–10 players)
6. [Priority & Sequencing](#6-priority--sequencing)

---

## 1. Shared Infrastructure

Before any mode can be implemented, the codebase needs a `gameMode` concept threaded through the stack.

### 1.1 Type Changes

**Server `game.types.ts`:**

```ts
type GameMode = 'classic' | 'suddenDeath' | 'bountyHunt' | 'blindRounds' | 'knockout';

// Add to GameState (line ~68):
interface GameState {
  // ... existing fields
  gameMode: GameMode;
}

// Add to Room (line ~119):
interface Room {
  // ... existing fields
  gameMode: GameMode;
}
```

**Client `game.types.ts`:**

```ts
// Add GameMode type and add to ClientGameState + RoomData
type GameMode = 'classic' | 'suddenDeath' | 'bountyHunt' | 'blindRounds' | 'knockout';

interface ClientGameState {
  // ... existing fields
  gameMode: GameMode;
}

interface RoomData {
  // ... existing fields
  gameMode: GameMode;
}
```

### 1.2 Room Creation & Lobby Flow

- **`createRoom` handler** (`roomHandlers.ts:126`): Accept optional `gameMode` in payload, default `'classic'`. Store on Room doc.
- **`startGame` handler** (`roomHandlers.ts:452`): Read `room.gameMode`, pass to `initializeGameState()`.
- **`broadcastRoomUpdate`** (`roomHandlers.ts:98`): Include `gameMode` in emitted payload.
- **Mongoose schema** (`Room.ts`): Add `gameMode` field with enum validation and default `'classic'`.

### 1.3 Lobby UI Changes

- **`RoomLobby.tsx`**: Add a game mode selector (segmented control or dropdown) alongside the existing `targetScore` slider. Only the host can change it. Show mode description/rules summary below the selector.
- **`SocketContext.tsx`**: Update `createRoom()` and `startGame()` to pass `gameMode`.

### 1.4 Game Initialization

- **`GameSetup.ts:initializeGameState()`**: Accept `gameMode` parameter, store in `GameState`. Mode-specific setup logic branches here (e.g., hand size for Sudden Death, bounty card for Bounty Hunt).

### 1.5 Sanitization

- **`GameSetup.ts:sanitizeGameState()`** (~line 220): Include `gameMode` in `ClientGameState`.

### 1.6 Files Touched

| File                                   | Change                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| `server/src/types/game.types.ts`       | Add `GameMode` type, add field to `GameState`, `Room`           |
| `client/src/types/game.types.ts`       | Add `GameMode` type, add field to `ClientGameState`, `RoomData` |
| `server/src/models/Room.ts`            | Add `gameMode` to Mongoose schemas                              |
| `server/src/game/GameSetup.ts`         | Accept and store `gameMode` in init                             |
| `server/src/socket/roomHandlers.ts`    | Pass `gameMode` through create/start/broadcast                  |
| `client/src/context/SocketContext.tsx` | Pass `gameMode` in create/start calls                           |
| `client/src/pages/RoomLobby.tsx`       | Mode selector UI                                                |

**Estimated effort:** 1 day

---

## 2. Mode A — Sudden Death

**Player count:** 2+ players
**Core idea:** One round. Bigger hand. Harsher penalties. Instant-reveal check.

### 2.1 Rules

| Rule                | Classic                        | Sudden Death                                 |
| ------------------- | ------------------------------ | -------------------------------------------- |
| Rounds              | Multi-round until threshold    | **1 round only**                             |
| Cards per player    | 4 (A–D)                        | **6 (A–F)**                                  |
| Initial peek        | 2 cards                        | **2 cards** (same, but out of 6 — less info) |
| Failed burn penalty | +1 card                        | **+2 cards**                                 |
| Check behavior      | Others get 1 more turn each    | **Instant reveal — no extra turns**          |
| Scoring             | Cumulative, loser at threshold | **Single round — lowest sum wins**           |
| Target score slider | Shown                          | **Hidden (irrelevant)**                      |

### 2.2 Server Changes

**`GameSetup.ts`:**

- When `gameMode === 'suddenDeath'`:
  - Set `CARDS_PER_PLAYER = 6` (deal 6 slots: A–F)
  - Initial peek still picks 2 random slots out of 6
  - Store a flag or let mode drive the logic downstream

**`ActionHandler.ts` — `processBurnFailure()`** (~line 200):

- When `gameMode === 'suddenDeath'`: draw **2** penalty cards instead of 1, assign consecutive slot labels (e.g., G and H).

**`gameHandlers.ts` — check / round-end logic:**

- When `gameMode === 'suddenDeath'` and check is called:
  - Skip the "each other player gets one more turn" phase
  - Immediately end the round (set `phase = 'roundEnd'`, compute scores)
  - After scoring, set `phase = 'gameEnd'` (no next round)

**`Scoring.ts` — `computeRoundResult()`:**

- When `gameMode === 'suddenDeath'`:
  - No checker-doubling penalty (there's only one round, and check is a deliberate strategy)
  - Game always ends after this round (`gameEnded = true`)

### 2.3 Client Changes

**`RoomLobby.tsx`:**

- Hide `targetScore` slider when mode is `suddenDeath`
- Show mode description: "One round. 6 cards. Harsh penalties. Instant check reveal."

**`GameBoard.tsx`:**

- Show a "SUDDEN DEATH" badge/indicator in the header area
- The hand area naturally handles 6+ slots (already supports E, F, G, etc. from penalty cards)
- Hide round counter (or show "Final Round")

### 2.4 Edge Cases

- With 6 cards per player, a 10-player game needs 60 cards — exceeds the 52-card deck. **Constraint:** Sudden Death mode must cap players at **8** (48 cards dealt, 4 remaining for draw pile). Alternatively, use 2 decks for 7+ players.
- Instant check + 0-card hand: if someone burns all 6 cards, they win immediately (0 sum, round ends)

### 2.5 Files Touched

| File                                | Change                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `server/src/game/GameSetup.ts`      | 6-card deal, 2-of-6 peek                                           |
| `server/src/game/ActionHandler.ts`  | Double penalty on failed burn                                      |
| `server/src/socket/gameHandlers.ts` | Instant check (skip remaining turns), force game end after 1 round |
| `server/src/game/Scoring.ts`        | No checker doubling, always `gameEnded = true`                     |
| `client/src/pages/RoomLobby.tsx`    | Hide target score, show mode info, player cap warning              |
| `client/src/pages/GameBoard.tsx`    | "SUDDEN DEATH" indicator, hide round counter                       |

**Estimated effort:** 1–2 days

---

## 3. Mode B — Bounty Hunt

**Player count:** 2+ players
**Core idea:** Each round has a public bounty rank. Holding it costs double. Burning it earns a bonus.

### 3.1 Rules

- At the start of each round, the server draws a **bounty card** from the deck before dealing. This card is shown face-up to all players, then shuffled back into the deck.
- The **bounty rank** (e.g., "7") is active for the entire round.
- All other rules are identical to Classic mode, with these scoring modifiers:

| Situation                                                                  | Effect                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Player holds a card matching the bounty rank at round end                  | That card's value is **doubled**                                            |
| Player successfully burns a card matching the bounty rank during the round | Player gets a **−5 point bonus** (subtracted from their round score, min 0) |
| Multiple bounty-rank cards in hand                                         | Each one is doubled independently                                           |
| Multiple successful bounty burns in one round                              | Each gives −5 (stacks)                                                      |

### 3.2 Server Changes

**`GameSetup.ts` — `initializeGameState()`:**

- When `gameMode === 'bountyHunt'`:
  - After creating the deck, draw 1 card to determine `bountyRank`
  - Shuffle that card back into the deck
  - Store `bountyRank: Rank` on `GameState`

**New field on `GameState`:**

```ts
bountyRank?: Rank;  // e.g., '7', 'J', 'K' — only set in bountyHunt mode
```

**`Scoring.ts` — `computeRoundResult()`:**

- When `gameMode === 'bountyHunt'`:
  - For each player's hand, find cards matching `bountyRank` and double their value in the sum
  - Track `bountyBurnBonuses` per player (from a new field on GameState, see below)
  - Subtract `5 * bountyBurnCount` from the player's round score (min 0)
  - Apply this before winner determination

**`ActionHandler.ts` — `processBurnSuccess()`:**

- When `gameMode === 'bountyHunt'` and the burned card's rank matches `bountyRank`:
  - Increment a per-player counter: `GameState.bountyBurnCounts[playerId]++`
  - This counter resets each round (initialized in `GameSetup`)

**New fields on `GameState`:**

```ts
bountyRank?: Rank;
bountyBurnCounts?: Record<string, number>;  // playerId -> count of successful bounty burns this round
```

### 3.3 Client Changes

**`RoomLobby.tsx`:**

- Show mode description: "Each round has a bounty rank. Hold it at your peril — or burn it for a bonus."

**`GameBoard.tsx`:**

- Display the **bounty rank** prominently (e.g., a card-shaped badge near the draw/discard area showing the rank and text "BOUNTY")
- On successful bounty burn, show a brief "BOUNTY BURN −5" toast/animation
- At round end, in the score breakdown, highlight bounty-doubled cards and burn bonuses

**`ClientGameState`:**

- Add `bountyRank?: string` to the sanitized state

### 3.4 Edge Cases

- Bounty rank is a face card (J/Q/K): value 10, doubled to 20. High risk to hold.
- Bounty rank is Ace: value 1, doubled to 2. Low-stakes bounty, but the −5 burn bonus is still attractive.
- Bounty rank is Red 10: value 0, doubled is still 0. Holding it is harmless, but burning it still gives −5 — a free bonus if you can match the discard.
- Burn failure on a bounty-rank card: no bonus, player gets penalty card as normal.

### 3.5 Files Touched

| File                               | Change                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| `server/src/types/game.types.ts`   | Add `bountyRank`, `bountyBurnCounts` to `GameState`      |
| `client/src/types/game.types.ts`   | Add `bountyRank` to `ClientGameState`                    |
| `server/src/game/GameSetup.ts`     | Draw bounty card, store rank, init burn counts           |
| `server/src/game/Scoring.ts`       | Double bounty-rank card values, subtract burn bonuses    |
| `server/src/game/ActionHandler.ts` | Track successful bounty burns                            |
| `server/src/models/Room.ts`        | Add bounty fields to Mongoose schema                     |
| `client/src/pages/RoomLobby.tsx`   | Mode description                                         |
| `client/src/pages/GameBoard.tsx`   | Bounty rank display, burn animation, round-end breakdown |

**Estimated effort:** 2 days

---

## 4. Mode C — Blind Rounds (Fog of War)

**Player count:** 2+ players
**Core idea:** Periodic rounds strip away information. No initial peek. No Red Queen. Memory and nerve only.

### 4.1 Rules

- Every **3rd round** (rounds 3, 6, 9, ...) is a "Blind Round"
- Non-blind rounds play exactly like Classic

| Rule                 | Normal Round     | Blind Round                                       |
| -------------------- | ---------------- | ------------------------------------------------- |
| Initial peek         | 2 cards          | **0 cards** (no peek phase)                       |
| Red Queen effect     | Peek at own card | **Disabled** — Red Queen discarded with no effect |
| Opponent card counts | Visible          | **Hidden** (show "?" instead of card count)       |
| Red Jack swap        | Works normally   | Works normally (already blind)                    |
| Red King effect      | Works normally   | Works normally                                    |
| Burning              | Works normally   | Works normally (pure gamble without info)         |
| Check / scoring      | Normal           | Normal                                            |

### 4.2 Server Changes

**`GameSetup.ts` — `initializeGameState()`:**

- When `gameMode === 'blindRounds'`:
  - Compute `isBlindRound = (roundNumber % 3 === 0)` (rounds 3, 6, 9, ...)
  - If blind round: skip the peek phase entirely (set `phase = 'playing'` directly after deal, no `peekSlots`)
  - Store `isBlindRound: boolean` on `GameState`

**New field on `GameState`:**

```ts
isBlindRound?: boolean;
```

**`ActionHandler.ts` — `processRedQueen()`:**

- When `gameState.isBlindRound === true`:
  - Skip the peek — immediately resolve with no card revealed
  - Optionally emit a message: "Red Queen has no effect during blind rounds"

**`GameSetup.ts` — `sanitizeGameState()`:**

- When `isBlindRound`:
  - For opponent players, omit `hand.length` / card count (or send a flag so the client shows "?")
  - Add `isBlindRound` to `ClientGameState`

### 4.3 Client Changes

**`RoomLobby.tsx`:**

- Mode description: "Every 3rd round is a Blind Round — no peek, no Red Queen, no opponent card counts. Pure memory."

**`GameBoard.tsx`:**

- When `isBlindRound`:
  - Show a "BLIND ROUND" banner/badge (dark, ominous styling — maybe a fog/eye-slash icon)
  - Skip the peek countdown UI entirely (no `peekProgress` bar)
  - In opponent rows, show "?" instead of card count numbers
  - If Red Queen modal opens, show "No effect — Blind Round" and auto-close

**`ClientGameState`:**

- Add `isBlindRound?: boolean`

### 4.4 Edge Cases

- Round 1 and 2 are always normal — players get comfortable before the first blind round hits
- Red Queen drawn during blind round: the card still gets discarded (triggering the effect), but the effect is a no-op. The player wasted their draw. This is intentional — it adds risk to drawing blindly.
- If a player joins mid-game during a blind round, they get no peek (consistent with the mode)
- Opponent card counts are hidden but the player's own hand size is always visible (they can count their own slots)

### 4.5 Files Touched

| File                               | Change                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `server/src/types/game.types.ts`   | Add `isBlindRound` to `GameState`                                           |
| `client/src/types/game.types.ts`   | Add `isBlindRound` to `ClientGameState`                                     |
| `server/src/game/GameSetup.ts`     | Compute blind round flag, skip peek phase, hide opponent counts in sanitize |
| `server/src/game/ActionHandler.ts` | Disable Red Queen during blind rounds                                       |
| `client/src/pages/RoomLobby.tsx`   | Mode description                                                            |
| `client/src/pages/GameBoard.tsx`   | Blind round banner, hide opponent counts, skip peek UI, Queen no-op         |

**Estimated effort:** 1–2 days

---

## 5. Mode D — Knockout Tournament

**Player count:** 4–10 players (minimum 4 for meaningful elimination)
**Core idea:** Multi-stage elimination bracket. Bottom players are eliminated each stage. Last ones standing win.

### 5.1 Rules Overview

```
Stage 1:  8 players → 2 tables of 4
          Play N rounds per table (or until someone hits threshold)
          Bottom 1 player per table eliminated (6 remain)

Stage 2:  6 players → 2 tables of 3
          Bottom 1 per table eliminated (4 remain)

Stage 3:  4 players → 1 final table
          Play until someone hits threshold
          Last player standing wins
```

The exact bracket structure depends on player count:

| Players | Stage 1                          | Stage 2                | Final                                         |
| ------- | -------------------------------- | ---------------------- | --------------------------------------------- |
| 4       | 1 table of 4 → eliminate 1       | —                      | 3-player final                                |
| 5       | 1 table of 5 → eliminate 2       | —                      | 3-player final                                |
| 6       | 2 tables of 3 → eliminate 1 each | —                      | 4-player final                                |
| 7       | 1×4 + 1×3 → eliminate 1 each     | —                      | 5-player final → eliminate 2 → 3-player final |
| 8       | 2×4 → eliminate 1 each           | 2×3 → eliminate 1 each | 4-player final                                |
| 9       | 3×3 → eliminate 1 each           | 2×3 → eliminate 1 each | 4-player final                                |
| 10      | 2×5 → eliminate 2 each           | 2×3 → eliminate 1 each | 4-player final                                |

### 5.2 Stage Rules

- Each stage plays like a mini Classic game: multiple rounds until someone hits the **stage threshold** (configurable, default 40 — lower than classic to keep stages short)
- When the threshold is hit, the stage ends
- The player(s) with the **highest cumulative score** in that stage are **eliminated**
- Scores reset to 0 for the next stage
- Eliminated players become spectators (can still watch, react, chat)
- Between stages, a 15-second intermission shows the bracket, eliminated players, and next-stage matchups

### 5.3 Data Model

**New types:**

```ts
interface TournamentState {
  stages: TournamentStage[];
  currentStageIndex: number;
  eliminatedPlayerIds: string[];
  spectators: string[]; // eliminated players watching
  stageThreshold: number; // default 40
}

interface TournamentStage {
  stageNumber: number;
  tables: TournamentTable[];
  status: 'pending' | 'playing' | 'completed';
}

interface TournamentTable {
  tableId: string;
  playerIds: string[];
  gameState: GameState | null; // each table has its own game state
  eliminatedFromTable: string[]; // players eliminated at end of this table's stage
}
```

**Add to `Room`:**

```ts
interface Room {
  // ... existing
  tournamentState?: TournamentState; // only set when gameMode === 'knockout'
}
```

### 5.4 Server Changes

**New file: `server/src/game/Tournament.ts`**

Responsible for:

- `generateBracket(playerIds: string[], stageThreshold: number): TournamentState` — builds the full bracket structure based on player count
- `assignTables(remainingPlayers: string[], stageNumber: number): TournamentTable[]` — splits players into balanced tables (randomized)
- `processStageEnd(tournament: TournamentState, stageIndex: number): { eliminated: string[], nextStage: TournamentStage | null }` — determines who is eliminated, builds next stage
- `isTableStageOver(table: TournamentTable): boolean` — checks if any player at the table hit the stage threshold

**`roomHandlers.ts` — `startGame`:**

- When `gameMode === 'knockout'`:
  - Validate minimum 4 players
  - Call `generateBracket()` to create tournament state
  - Create separate `GameState` for each table in stage 1
  - All players in the same socket.io room still, but game actions are scoped to their table

**`gameHandlers.ts` — round end / game end:**

- When `gameMode === 'knockout'`:
  - On round end: check if the table's stage threshold is hit
  - If yes: mark table as completed, determine eliminated player(s)
  - When ALL tables in a stage are completed: emit `stageEnded` event, start intermission countdown
  - After intermission: call `assignTables()` for next stage, create new game states, emit `stageStarted`
  - On final stage game end: emit `tournamentEnded` with final rankings

**Action scoping:**

- Each game action (draw, burn, discard, check, etc.) must route to the correct table's `GameState`
- This is the biggest architectural challenge — currently there's one `GameState` per room
- Solution: `Room.tournamentState.stages[current].tables[i].gameState` replaces `Room.gameState`
- Need a lookup function: `getTableForPlayer(room, playerId) → TournamentTable`

### 5.5 Socket Events

| Event               | Direction       | Payload                                            |
| ------------------- | --------------- | -------------------------------------------------- |
| `tournamentBracket` | Server → Client | Full bracket structure (stages, tables, players)   |
| `stageEnded`        | Server → Client | `{ stageNumber, eliminated[], standings }`         |
| `stageStarted`      | Server → Client | `{ stageNumber, tables[], yourTableId }`           |
| `tournamentEnded`   | Server → Client | `{ rankings[], winner, finalScores }`              |
| `spectatorUpdate`   | Server → Client | Game state updates for spectators watching a table |

### 5.6 Client Changes

**New component: `TournamentBracket.tsx`**

- Visual bracket display showing all stages, tables, and player positions
- Highlighted: current stage, player's table, eliminated players (grayed out / crossed)
- Shown during intermissions and accessible via a "Bracket" button in the game header

**`GameBoard.tsx`:**

- Show current stage number and table in the header (e.g., "Stage 2 — Table A")
- Show "ELIMINATED" overlay when the player is knocked out, with option to spectate
- During intermission: show bracket, countdown to next stage, who was eliminated
- Spectator mode: read-only game view with no action buttons

**`RoomLobby.tsx`:**

- Mode description: "Knockout tournament. Bottom players eliminated each stage. Last one standing wins."
- Show stage threshold slider (default 40, range 20–70) instead of the normal target score
- Show minimum player warning if < 4 players
- Show bracket preview before starting

### 5.7 Spectator System

Eliminated players transition to spectator mode:

- They remain in the socket.io room
- They receive `gameStateUpdated` events for a chosen table (default: the table with the most remaining players, or the final table)
- No action handlers fire for spectators
- Chat and reactions still work
- A "Watch Table X" selector lets spectators switch between active tables

### 5.8 Edge Cases

- Player disconnects mid-tournament: existing grace-period reconnect applies. If they don't reconnect, they're treated as eliminated (or replaced by bot if in early stage).
- 2 players tied for highest score at stage end: both eliminated (aggressive elimination). If this would leave < 2 players at a table, only eliminate the single highest.
- All tables in a stage must finish before advancing — slower tables hold up the tournament. Consider a stage time limit (e.g., 10 minutes) with forced check if exceeded.
- Bots in tournament: allowed, but bots are always eliminated before humans if tied (humans get priority survival).

### 5.9 Files Touched

| File                                          | Change                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `server/src/types/game.types.ts`              | `TournamentState`, `TournamentStage`, `TournamentTable` types               |
| `client/src/types/game.types.ts`              | Client-side tournament types                                                |
| `server/src/game/Tournament.ts`               | **New file** — bracket generation, table assignment, elimination logic      |
| `server/src/models/Room.ts`                   | Tournament state in Mongoose schema                                         |
| `server/src/socket/roomHandlers.ts`           | Tournament start flow, bracket creation                                     |
| `server/src/socket/gameHandlers.ts`           | Table-scoped actions, stage transitions, spectator broadcasts               |
| `client/src/pages/RoomLobby.tsx`              | Mode selector, bracket preview, stage threshold slider                      |
| `client/src/pages/GameBoard.tsx`              | Stage/table header, eliminated overlay, intermission screen, spectator mode |
| `client/src/components/TournamentBracket.tsx` | **New file** — bracket visualization                                        |
| `client/src/context/SocketContext.tsx`        | Tournament events, spectator state, table switching                         |

**Estimated effort:** 5–7 days

---

## 6. Priority & Sequencing

### Player Count Classification

| Mode                    | Min Players | Max Players | Works with 2? | Best With |
| ----------------------- | ----------- | ----------- | ------------- | --------- |
| **Sudden Death**        | 2           | 8           | Yes           | 3–6       |
| **Bounty Hunt**         | 2           | 10          | Yes           | 3–8       |
| **Blind Rounds**        | 2           | 10          | Yes           | 3–6       |
| **Knockout Tournament** | 4           | 10          | No            | 6–10      |

### Recommended Build Order

```
Week 1:
  ├── Shared Infrastructure (gameMode plumbing)     ~1 day
  ├── Mode A: Sudden Death                          ~1-2 days
  └── Mode B: Bounty Hunt                           ~2 days

Week 2:
  ├── Mode C: Blind Rounds                          ~1-2 days
  └── Mode D: Knockout Tournament                   ~5-7 days
```

**Rationale:**

1. **Shared infra first** — everything depends on the `gameMode` field existing
2. **Sudden Death** is the simplest mode change (mostly config tweaks) and validates the mode system works
3. **Bounty Hunt** adds the most strategic depth with moderate effort — good second mode
4. **Blind Rounds** is simple but less impactful — build after the first two prove the system
5. **Knockout Tournament** is the most complex (multi-table state, spectators, bracket UI) but the most compelling for large groups — save for last when the foundation is solid

### Testing Strategy

Each mode needs:

- Unit tests for mode-specific scoring logic (`Scoring.test.ts`)
- Unit tests for mode-specific setup (`GameSetup.test.ts`)
- Unit tests for mode-specific action handling (`ActionHandler.test.ts`)
- For Tournament: integration tests for bracket generation, stage transitions, elimination
- Manual playtesting with bots for each mode before marking complete

### Dependencies

```
Shared Infrastructure
  ├── Sudden Death (independent)
  ├── Bounty Hunt (independent)
  ├── Blind Rounds (independent)
  └── Knockout Tournament (depends on all above being stable)
```

Sudden Death, Bounty Hunt, and Blind Rounds are fully independent of each other and can be built in any order or in parallel. Knockout Tournament should come last because it requires the most confidence in the game mode system.

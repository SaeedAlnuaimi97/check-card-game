# Challenge Modes — Detailed Implementation Plan

> **Baseline:** The game currently supports 2–10 players, a single rule set (4 cards, 54-card deck with 2 extra red 10s, Red J/Q/K effects), and one configurable setting (`targetScore` 30–150). There is no concept of "game mode" anywhere. All modes below build on top of the existing room/lobby system.

> **Scope:** Build Shared Infrastructure + Sudden Death + Bounty Hunt + Blind Rounds. Knockout Tournament is deferred to a future phase.

---

## Table of Contents

1. [Resolved Design Decisions](#1-resolved-design-decisions)
2. [Shared Infrastructure](#2-shared-infrastructure)
3. [Mode A — Sudden Death](#3-mode-a--sudden-death) (2–6 players)
4. [Mode B — Bounty Hunt](#4-mode-b--bounty-hunt) (2–10 players)
5. [Mode C — Blind Rounds (Fog of War)](#5-mode-c--blind-rounds-fog-of-war) (2–10 players)
6. [Mode D — Knockout Tournament (DEFERRED)](#6-mode-d--knockout-tournament-deferred)
7. [Priority & Sequencing](#7-priority--sequencing)
8. [Art Direction](#8-art-direction)

---

## 1. Resolved Design Decisions

These decisions were resolved through design review and apply across all modes:

| Decision                        | Resolution                                                                                                                                                   | Rationale                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Build scope**                 | Shared infra + Sudden Death + Bounty Hunt + Blind Rounds. Knockout deferred.                                                                                 | Highest fun-per-effort ratio. Three diverse modes validate the system.                         |
| **Mode combinations**           | **No.** Modes are mutually exclusive.                                                                                                                        | Avoids combinatorial edge cases. Can revisit later if demanded.                                |
| **When mode is chosen**         | At room creation. Locked in after that (not changeable in lobby).                                                                                            | Simplifies flow. Joiners see mode read-only in lobby.                                          |
| **Mode selection UI**           | Dedicated mode picker screen after "Create Room" button. Vertical list of wide horizontal cards (320×120px) with full-bleed background art and text overlay. | Clean, visual, doesn't clutter existing home page flow.                                        |
| **Mode visibility for joiners** | Mode name + description shown read-only at top of lobby.                                                                                                     | Players should know what they're signing up for.                                               |
| **Mid-game join**               | Disabled for ALL challenge modes. Only Classic allows mid-game join.                                                                                         | Avoids edge cases (e.g., joining blind round with a peek, joining SD near end).                |
| **Code organization**           | Inline if/switch branches in existing files (GameSetup.ts, Scoring.ts, etc.).                                                                                | Modes are small variations, not full rewrites. Strategy pattern is overengineered for 3 modes. |
| **Test organization**           | Dedicated test file per mode (SuddenDeath.test.ts, BountyHunt.test.ts, BlindRounds.test.ts).                                                                 | Isolation, easy to run individually, keeps existing test files clean.                          |
| **Classic peek slots**          | No change — Classic stays hardcoded to C/D.                                                                                                                  | Don't change existing behavior.                                                                |
| **Bot changes**                 | No bot AI changes for any challenge mode. Bots play with the same logic as Classic.                                                                          | Simpler implementation. Bot AI is a separate concern.                                          |

---

## 2. Shared Infrastructure

Before any mode can be implemented, the codebase needs a `gameMode` concept threaded through the stack.

### 2.1 Type Changes

**Server `game.types.ts`:**

```ts
type GameMode = 'classic' | 'suddenDeath' | 'bountyHunt' | 'blindRounds';

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
type GameMode = 'classic' | 'suddenDeath' | 'bountyHunt' | 'blindRounds';

interface ClientGameState {
  // ... existing fields
  gameMode: GameMode;
}

interface RoomData {
  // ... existing fields
  gameMode: GameMode;
}
```

### 2.2 Room Creation & Lobby Flow

- **`createRoom` handler** (`roomHandlers.ts:126`): Accept required `gameMode` in payload (sent from the mode picker screen). Validate against the enum. Store on Room doc.
- **`startGame` handler** (`roomHandlers.ts:452`): Read `room.gameMode`, pass to `initializeGameState()`. Enforce mode-specific player caps (e.g., max 6 for Sudden Death).
- **`broadcastRoomUpdate`** (`roomHandlers.ts:98`): Include `gameMode` in emitted payload.
- **Mongoose schema** (`Room.ts`): Add `gameMode` field with enum validation and default `'classic'`.
- **Mid-game join gate** (`roomHandlers.ts`, `joinRoom` handler): When `room.gameMode !== 'classic'` and `room.status === 'playing'`, reject the join with error "Mid-game join is not available in this mode."

### 2.3 Mode Picker Screen

**New page: `client/src/pages/ModePicker.tsx`**

- Shown after user clicks "Create Room" on the home page
- Vertical scrollable list of 4 mode cards (Classic, Sudden Death, Bounty Hunt, Blind Rounds)
- Each card: 320×120px, full-bleed background illustration with dark gradient overlay from left, mode title + 1-line description overlaid on the left side
- Tapping a card creates the room with that mode and navigates to the lobby
- Back button to return to home

**Route:** `/create` (between Home `/` and Lobby `/room/:code`)

### 2.4 Lobby UI Changes

- **`RoomLobby.tsx`**: Show selected mode name + description as read-only info at the top of the lobby (not editable). Mode-specific settings appear below (e.g., hide `targetScore` slider for Sudden Death).
- **`SocketContext.tsx`**: Update `createRoom()` to accept and pass `gameMode`.

### 2.5 Game Initialization

- **`GameSetup.ts:initializeGameState()`**: Accept `gameMode` parameter, store in `GameState`. Mode-specific setup logic branches here.

### 2.6 Sanitization

- **`GameSetup.ts:sanitizeGameState()`** (~line 220): Include `gameMode` in `ClientGameState`.

### 2.7 Files Touched

| File                                   | Change                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `server/src/types/game.types.ts`       | Add `GameMode` type, add field to `GameState`, `Room`                               |
| `client/src/types/game.types.ts`       | Add `GameMode` type, add field to `ClientGameState`, `RoomData`                     |
| `server/src/models/Room.ts`            | Add `gameMode` to Mongoose schemas                                                  |
| `server/src/game/GameSetup.ts`         | Accept and store `gameMode` in init                                                 |
| `server/src/socket/roomHandlers.ts`    | Pass `gameMode` through create/start/broadcast, block mid-game join for non-classic |
| `client/src/context/SocketContext.tsx` | Pass `gameMode` in create calls                                                     |
| `client/src/pages/ModePicker.tsx`      | **New file** — mode selection screen                                                |
| `client/src/pages/RoomLobby.tsx`       | Show mode info read-only                                                            |
| Router config                          | Add `/create` route for ModePicker                                                  |

**Estimated effort:** 1–2 days

---

## 3. Mode A — Sudden Death

**Player count:** 2–6 players (capped at 6 due to deck size: 6 cards × 6 players = 36 dealt, 18 remaining from 54-card deck)
**Core idea:** One round. Bigger hand. Harsher penalties. Instant-reveal check.

### 3.1 Rules

| Rule                | Classic                                           | Sudden Death                                                              |
| ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Rounds              | Multi-round until threshold                       | **1 round only**                                                          |
| Cards per player    | 4 (A–D)                                           | **6 (A–F)**                                                               |
| Initial peek        | 2 cards (C, D)                                    | **2 cards (E, F)** — always the last two dealt slots                      |
| Failed burn penalty | +1 card                                           | **+2 cards**                                                              |
| Check behavior      | Checker acts, then others get 1 more turn each    | **Checker acts, then round ends instantly — no other players get a turn** |
| Checker doubling    | Score doubled if checker doesn't have lowest hand | **No doubling** — check is purely about timing                            |
| Scoring             | Cumulative, loser at threshold                    | **Single round — lowest sum wins**                                        |
| Target score slider | Shown (30–150)                                    | **Hidden (irrelevant)**                                                   |
| Max players         | 10                                                | **6**                                                                     |

### 3.2 Server Changes

**`GameSetup.ts`:**

- When `gameMode === 'suddenDeath'`:
  - Set `CARDS_PER_PLAYER = 6` (deal 6 slots: A–F)
  - Set `PEEK_SLOTS = ['E', 'F']` (last two slots)
  - Initial peek picks E and F

**`ActionHandler.ts` — `processBurnFailure()`** (~line 200):

- When `gameMode === 'suddenDeath'`: draw **2** penalty cards instead of 1, assign consecutive slot labels (e.g., G and H).

**`gameHandlers.ts` — check / round-end logic:**

- When `gameMode === 'suddenDeath'` and check is called:
  - Checker takes their normal turn action as usual
  - After the checker's turn completes, end the round immediately (no other players get a turn)
  - Set `phase = 'roundEnd'`, compute scores, then set `phase = 'gameEnd'` (no next round)

**`Scoring.ts` — `computeRoundResult()`:**

- When `gameMode === 'suddenDeath'`:
  - No checker-doubling penalty
  - Game always ends after this round (`gameEnded = true`)

**`roomHandlers.ts` — `startGame`:**

- When `gameMode === 'suddenDeath'`: validate `players.length <= 6`. Reject with error if >6.

### 3.3 Client Changes

**`RoomLobby.tsx`:**

- Hide `targetScore` slider when mode is `suddenDeath`
- Show max player warning if lobby has >6 players (shouldn't happen if creation enforces it, but guard the UI)

**`GameBoard.tsx`:**

- Show a "SUDDEN DEATH" indicator in the header area
- The hand area naturally handles 6+ slots (already supports E, F, G, etc. from penalty cards)
- Hide round counter (show "SUDDEN DEATH" instead of "Round: 1")
- Reuse the existing round-end modal for game-over display — swap "Start Next Round" button for game-over text (winner announcement). No new screen needed.

### 3.4 Edge Cases

- 6 cards × 6 players = 36 cards. Deck has 54. Leaves 18 for draw pile — healthy.
- 6 cards × 2 players = 12 cards. Leaves 42 — plenty.
- Instant check + 0-card hand: if someone burns all 6 cards, round ends immediately (0 sum, they win).
- Failed burn draws 2 penalty cards. If the deck is running low (<2 cards), `reshuffleDiscard` triggers as normal.

### 3.5 Files Touched

| File                                       | Change                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `server/src/game/GameSetup.ts`             | 6-card deal, E/F peek                                                             |
| `server/src/game/ActionHandler.ts`         | Double penalty on failed burn                                                     |
| `server/src/socket/gameHandlers.ts`        | Instant check (skip remaining turns), force game end after 1 round                |
| `server/src/socket/roomHandlers.ts`        | Player cap validation (max 6)                                                     |
| `server/src/game/Scoring.ts`               | No checker doubling, always `gameEnded = true`                                    |
| `client/src/pages/RoomLobby.tsx`           | Hide target score, show mode info                                                 |
| `client/src/pages/GameBoard.tsx`           | "SUDDEN DEATH" indicator, hide round counter, reuse round-end modal for game-over |
| `server/src/__tests__/SuddenDeath.test.ts` | **New file** — setup, scoring, check behavior, burn penalty tests                 |

**Estimated effort:** 1–2 days

---

## 4. Mode B — Bounty Hunt

**Player count:** 2–10 players
**Core idea:** Each round has a public bounty rank. Holding it costs double. Burning it earns a bonus.

### 4.1 Rules

- At the start of each round, the server draws a **bounty card** from the deck (random draw) before dealing. The card's rank becomes the bounty rank. The card is shuffled back into the deck.
- The **bounty rank** is revealed to all players **during the peek phase** — players see the bounty and their peeked cards simultaneously.
- All other rules are identical to Classic mode, with these scoring modifiers:

| Situation                                                                  | Effect                                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Player holds a card matching the bounty rank at round end                  | That card's value is **doubled**                                              |
| Player successfully burns a card matching the bounty rank during the round | Player gets a **−5 point bonus** (subtracted from their round score, floor 0) |
| Multiple bounty-rank cards in hand                                         | Each one is doubled independently                                             |
| Multiple successful bounty burns in one round                              | Each gives −5 (stacks)                                                        |
| Failed burn attempt on a bounty-rank card                                  | No bonus. Normal penalty (+1 card) applies.                                   |

### 4.2 Server Changes

**`GameSetup.ts` — `initializeGameState()`:**

- When `gameMode === 'bountyHunt'`:
  - After creating the deck, draw 1 card to determine `bountyRank`
  - Shuffle that card back into the deck
  - Store `bountyRank: Rank` on `GameState`
  - Initialize `bountyBurnCounts: {}` (empty record)

**New fields on `GameState`:**

```ts
bountyRank?: Rank;                          // e.g., '7', 'J', 'K' — only set in bountyHunt mode
bountyBurnCounts?: Record<string, number>;  // playerId -> count of successful bounty burns this round
```

**`Scoring.ts` — `computeRoundResult()`:**

- When `gameMode === 'bountyHunt'`:
  - For each player's hand, find cards matching `bountyRank` and double their value in the sum
  - Read `bountyBurnCounts[playerId]` and subtract `5 * count` from the player's round score (floor 0)
  - Apply bounty modifiers BEFORE winner determination

**`ActionHandler.ts` — `processBurnSuccess()`:**

- When `gameMode === 'bountyHunt'` and the burned card's rank matches `bountyRank`:
  - Increment: `gameState.bountyBurnCounts[playerId] = (gameState.bountyBurnCounts[playerId] ?? 0) + 1`

### 4.3 Client Changes

**`RoomLobby.tsx`:**

- Show mode description: "Each round has a bounty rank. Hold it at your peril — or burn it for a bonus."
- `targetScore` slider remains visible (multi-round game, threshold still applies)

**`GameBoard.tsx`:**

- Display the **bounty rank** prominently near the draw/discard area (card-shaped badge showing the rank + "BOUNTY" text)
- Bounty is visible during the peek phase alongside the peeked cards
- On successful bounty burn, show a brief inline "BOUNTY BURN −5" animation/notification
- At round end, in the score breakdown:
  - Bounty-rank cards highlighted with a distinct border (gold/orange)
  - Doubled value annotation shown (e.g., "7 → 14")
  - Burn bonuses shown as a "−5" line item under the player's round total

**`ClientGameState`:**

- Add `bountyRank?: string` to the sanitized state
- Add `bountyBurnCounts?: Record<string, number>` (so the client can display burn bonuses at round end)

### 4.4 Edge Cases

- Bounty rank is a face card (J/Q/K): value 10, doubled to 20. High risk to hold.
- Bounty rank is Ace: value 1, doubled to 2. Low-stakes bounty, but −5 burn bonus is still attractive.
- Bounty rank is Red 10: value 0, doubled is still 0. Holding it is harmless, but burning it gives −5 — a free bonus if the discard top is a 10. The asymmetry with Black 10 (10 doubled = 20) is intentional — it creates a memory/knowledge challenge.
- Burn failure on a bounty-rank card: no bonus, normal penalty card.
- Bounty rank is the same multiple rounds in a row: possible (random draw). No exclusion logic.

### 4.5 Files Touched

| File                                      | Change                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `server/src/types/game.types.ts`          | Add `bountyRank`, `bountyBurnCounts` to `GameState`                  |
| `client/src/types/game.types.ts`          | Add `bountyRank`, `bountyBurnCounts` to `ClientGameState`            |
| `server/src/game/GameSetup.ts`            | Draw bounty card, store rank, init burn counts                       |
| `server/src/game/Scoring.ts`              | Double bounty-rank card values, subtract burn bonuses                |
| `server/src/game/ActionHandler.ts`        | Track successful bounty burns                                        |
| `server/src/models/Room.ts`               | Add bounty fields to Mongoose schema                                 |
| `client/src/pages/RoomLobby.tsx`          | Mode description                                                     |
| `client/src/pages/GameBoard.tsx`          | Bounty rank display, burn animation, round-end breakdown annotations |
| `server/src/__tests__/BountyHunt.test.ts` | **New file** — bounty scoring, burn tracking, edge case tests        |

**Estimated effort:** 2 days

---

## 5. Mode C — Blind Rounds (Fog of War)

**Player count:** 2–10 players
**Core idea:** Every 3rd round strips away information. No initial peek. Hidden opponent cards. Red Queen still works (becomes extra valuable).

### 5.1 Rules

- Every **3rd round** (rounds 3, 6, 9, ...) is a "Blind Round" (deterministic, not random)
- Rounds 1 and 2 are always normal — players get comfortable before the first blind round
- Non-blind rounds play exactly like Classic

| Rule                     | Normal Round                        | Blind Round                                                                                               |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Initial peek             | 2 cards (C, D)                      | **0 cards** (no peek phase — phase skips directly to playing)                                             |
| Red Queen effect         | Peek at own card                    | **Works normally** — Red Queen is the only way to gain info during blind rounds, making it extra valuable |
| Opponent card indicators | Card back pips + card count visible | **Hidden entirely** — no card pips, no card count number shown                                            |
| Red Jack swap            | Works normally                      | Works normally (already blind)                                                                            |
| Red King effect          | Works normally                      | Works normally                                                                                            |
| Burning                  | Works normally                      | Works normally (pure gamble without info)                                                                 |
| Check / scoring          | Normal                              | Normal                                                                                                    |
| Card backs               | Standard indigo diamond grid        | **Blind-round variant** — darker blue (#1a1a3a) with crossed-out eye icon replacing the diamond pattern   |

### 5.2 Server Changes

**`GameSetup.ts` — `initializeGameState()`:**

- When `gameMode === 'blindRounds'`:
  - Compute `isBlindRound = (roundNumber % 3 === 0)` (rounds 3, 6, 9, ...)
  - If blind round: skip the peek phase entirely — set `phase = 'playing'` directly after deal, set `peekSlots = []`
  - Store `isBlindRound: boolean` on `GameState`

**New field on `GameState`:**

```ts
isBlindRound?: boolean;  // true during blind rounds (every 3rd round in blindRounds mode)
```

**`GameSetup.ts` — `sanitizeGameState()`:**

- When `isBlindRound`:
  - For opponent players, set hand to an empty array or a flag — the client must not know opponent card counts
  - Add `isBlindRound` to `ClientGameState`

### 5.3 Client Changes

**`RoomLobby.tsx`:**

- Mode description: "Every 3rd round is a Blind Round — no peek, hidden opponents. Red Queen is your only source of intel."

**`GameBoard.tsx`:**

- When `isBlindRound`:
  - Skip the peek countdown UI entirely (no `peekProgress` bar, no "memorize" pill)
  - In opponent rows, hide card back pips and card count number entirely (just show opponent name/avatar)
  - At the previous round's end screen, show a warning: "Next round: BLIND ROUND — no peek, hidden opponent counts"

**`CardBack.tsx`:**

- Accept new prop: `isBlindRound?: boolean`
- When `isBlindRound`:
  - Background color changes from `#2a2a4a` to **`#1a1a3a`** (darker blue)
  - Replace the diamond grid pattern and center diamond accent with a **crossed-out eye icon** (SVG, white at ~15% opacity)
  - This applies to ALL face-down card backs: player's own hand cards and opponent card backs

**`ClientGameState`:**

- Add `isBlindRound?: boolean`

### 5.4 Edge Cases

- Round 1 and 2 are always normal — first blind round is round 3
- Red Queen works normally during blind rounds. This is intentional — it becomes the most valuable action card. Drawing one is a huge advantage.
- If a player joins mid-game during a blind round: blocked (mid-game join disabled for all challenge modes)
- Opponent card counts are hidden but the player's own hand size is always visible (they can count their own slots)
- A player who peeked at their cards in round 2 (normal) enters round 3 (blind) with only the memory of what they saw — no refresh

### 5.5 Files Touched

| File                                       | Change                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `server/src/types/game.types.ts`           | Add `isBlindRound` to `GameState`                                                      |
| `client/src/types/game.types.ts`           | Add `isBlindRound` to `ClientGameState`                                                |
| `server/src/game/GameSetup.ts`             | Compute blind round flag, skip peek phase, hide opponent counts in sanitize            |
| `client/src/pages/RoomLobby.tsx`           | Mode description                                                                       |
| `client/src/pages/GameBoard.tsx`           | Skip peek UI, hide opponent card indicators, blind round warning on previous round-end |
| `client/src/components/cards/CardBack.tsx` | `isBlindRound` prop — darker bg + crossed-out eye icon                                 |
| `server/src/__tests__/BlindRounds.test.ts` | **New file** — blind round detection, peek skipping, opponent count hiding tests       |

**Estimated effort:** 1–2 days

---

## 6. Mode D — Knockout Tournament (DEFERRED)

**Status:** Deferred to a future phase. Not in the current build scope.

**Player count:** 4–10 players
**Core idea:** Multi-stage elimination bracket. Bottom players eliminated each stage. Last ones standing win.

**Why deferred:**

- Most complex mode (5–7 days estimated)
- Requires multi-table game state scoping (biggest architectural change)
- Requires spectator system, bracket UI, intermission screens
- Should only be built after the simpler modes prove the `gameMode` system is solid

**Key design notes for future implementation:**

- Stage threshold configurable (default 40, range 20–70)
- Scores reset between stages
- Eliminated players become spectators (chat/reactions still work)
- 15-second intermission between stages
- All tables in a stage must finish before advancing
- See original plan notes preserved below for reference

<details>
<summary>Original Knockout Tournament notes (collapsed)</summary>

### Rules Overview

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

### Bracket Structure

| Players | Stage 1                          | Stage 2                | Final                                         |
| ------- | -------------------------------- | ---------------------- | --------------------------------------------- |
| 4       | 1 table of 4 → eliminate 1       | —                      | 3-player final                                |
| 5       | 1 table of 5 → eliminate 2       | —                      | 3-player final                                |
| 6       | 2 tables of 3 → eliminate 1 each | —                      | 4-player final                                |
| 7       | 1×4 + 1×3 → eliminate 1 each     | —                      | 5-player final → eliminate 2 → 3-player final |
| 8       | 2×4 → eliminate 1 each           | 2×3 → eliminate 1 each | 4-player final                                |
| 9       | 3×3 → eliminate 1 each           | 2×3 → eliminate 1 each | 4-player final                                |
| 10      | 2×5 → eliminate 2 each           | 2×3 → eliminate 1 each | 4-player final                                |

### Key Technical Challenges

- Multiple `GameState` objects per room (one per table)
- Action routing: `getTableForPlayer(room, playerId) → TournamentTable`
- Spectator system: eliminated players watch chosen tables
- Bracket UI component: `TournamentBracket.tsx`
- Stage transitions and intermission timing

**Estimated effort:** 5–7 days

</details>

---

## 7. Priority & Sequencing

### Player Count Classification

| Mode             | Min Players | Max Players | Works with 2? | Best With |
| ---------------- | ----------- | ----------- | ------------- | --------- |
| **Classic**      | 2           | 10          | Yes           | 3–6       |
| **Sudden Death** | 2           | 6           | Yes           | 3–5       |
| **Bounty Hunt**  | 2           | 10          | Yes           | 3–8       |
| **Blind Rounds** | 2           | 10          | Yes           | 3–6       |

### Build Order

```
Phase 1 (current):
  ├── Shared Infrastructure (gameMode plumbing + mode picker screen)   ~1-2 days
  ├── Mode A: Sudden Death                                              ~1-2 days
  ├── Mode B: Bounty Hunt                                               ~2 days
  └── Mode C: Blind Rounds                                              ~1-2 days

Phase 2 (future):
  └── Mode D: Knockout Tournament                                       ~5-7 days
```

### Testing Strategy

Each mode gets a dedicated test file:

- `server/src/__tests__/SuddenDeath.test.ts` — 6-card deal, E/F peek, double burn penalty, instant check, no doubling, single-round game-end
- `server/src/__tests__/BountyHunt.test.ts` — bounty rank selection, card value doubling, burn bonus tracking, scoring with bounty modifiers, edge cases (Red 10, Ace, face cards)
- `server/src/__tests__/BlindRounds.test.ts` — blind round detection (every 3rd), peek phase skipping, opponent count hiding in sanitized state

Manual playtesting with bots for each mode before marking complete.

### Dependencies

```
Shared Infrastructure
  ├── Sudden Death (independent)
  ├── Bounty Hunt (independent)
  └── Blind Rounds (independent)
```

All three modes are fully independent of each other and can be built in any order or in parallel.

---

## 8. Art Direction

Mode selection uses a vertical list of full-bleed illustrated cards (640×240px at 2x retina, renders at 320×120px). A dark CSS gradient overlay from left (opaque) to right (transparent) sits on top of the art, with mode title + description text overlaid on the left ~60%.

### Art Specifications

**Global style:** Dark, moody, atmospheric. Painterly/stylized digital art (not cartoonish, not photorealistic). Think Balatro, Inscryption, or premium poker app key art. No text in illustrations. No human faces or hands. Each mode must feel distinct at a glance.

**CLASSIC**

- Mood: Warm, familiar, strategic, inviting
- Dominant hues: Gold (#c9a227) and deep purple (#6c55c9) on near-black
- Imagery: Spread of face-down cards with indigo diamond-grid pattern, subtle golden glow from center, faint purple ambient haze, geometric patterns (diamonds, suit symbols)

**SUDDEN DEATH**

- Mood: Tense, electric, high-stakes, dangerous
- Dominant hues: Deep crimson red (#c0392b, #cf5e5e) and stark black
- Imagery: A single card standing on edge or cards shattering/cracking apart, red energy pulses, thin warning lines, sense of fragility and finality. Cold, clinical danger.

**BOUNTY HUNT**

- Mood: Cunning, opportunistic, treasure-hunter energy
- Dominant hues: Amber/orange (#d4a020, #e8a030) and dark brown/sepia (#2a1a08)
- Imagery: Card with crosshair/target over it, gold dust particles, wanted-poster aesthetic, single face-up card glowing among face-down cards. Warm but greedy — firelight, not sunlight.

**BLIND ROUNDS**

- Mood: Eerie, disorienting, fog-of-war
- Dominant hues: Deep desaturated blue (#1a1a3a, #0d0d2a) and cold grey (#3a3a5a)
- Imagery: Cards dissolving into mist/shadow, crossed-out eye symbol partially visible through fog, card silhouettes behind frosted glass, faint suit symbols fading in haze. Cold, unsettling, beautiful.

### Asset Files

```
client/public/modes/mode_classic.png        (640×240px)
client/public/modes/mode_sudden_death.png   (640×240px)
client/public/modes/mode_bounty_hunt.png    (640×240px)
client/public/modes/mode_blind_rounds.png   (640×240px)
```

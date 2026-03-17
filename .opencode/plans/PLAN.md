# CHECK CARD GAME - Development Plan

## Project Overview

A multiplayer online card game for 4-6 players where the goal is to have the lowest card value sum when a round ends. Players can call "check" to end the round, and red face cards have special abilities when drawn and played.

---

## Complete Game Mechanics

### Setup
- Standard 52-card deck
- 4-6 players per game
- Each player starts with 4 cards dealt face down in slots **A, B, C, D**
- At game start: players peek at 2 of their 4 cards, then place face down
- Random starting player

### Card Values (Goal: Lowest sum)
- Red 10s (♥10, ♦10): **0 points**
- Aces: **1 point**
- 2-9: **Face value**
- Black 10 (♠10, ♣10): **10 points**
- All J/Q/K: **10 points**

### Turn Flow

1. **Before taking action**: Player can call "CHECK" to initiate final round
   - The checker still takes their normal turn action afterward

2. **Choose one of 3 actions**:

   **Option A: Draw from deck (blind)**
   - Draw 1 card from draw pile (face down)
   - Then discard 1 card (can be the drawn card or any card from hand)
   - If discarding a **red J/Q/K** that was just drawn: special effect triggers

   **Option B: Take from discard pile**
   - Take the top visible card from discard pile
   - Must discard 1 card from hand to discard pile

   **Option C: Burn a card**
   - Attempt to match top discard pile card by rank (7→7, K→K, etc.)
   - Face cards: J→J, Q→Q, K→K (color irrelevant)
   - **Success**: Card goes to discard pile, hand shrinks by 1
   - **Fail**: Card stays in hand + draw 1 penalty card face-down (player does NOT see it, hand grows)

### Red Face Card Special Effects

*(Only trigger when drawn from deck and then discarded - NOT on burn)*

- **Red Jack (♥J, ♦J)**: 
  - Optional: Swap one of your cards with any opponent's card (blind swap)
  - Can choose not to swap

- **Red Queen (♥Q, ♦Q)**: 
  - Peek at one of your own face-down cards

- **Red King (♥K, ♦K)**: 
  - Draw 2 additional cards (only you see them)
  - Options:
    - Return both to draw pile (shuffled back in)
    - Keep 1 → discard 1 from hand → return other to draw pile
    - Keep 2 → discard 2 from hand

### Hand Management
- Main hand starts at 4 cards (slots A, B, C, D)
- Can grow: penalties add cards (E, F, G...)
- Can shrink: successful burns reduce hand size (down to 0 theoretically)
- Slot labels persist — if slot B is burned, remaining slots are A, C, D (NOT re-labeled)
- Players must remember which cards they peeked initially

### Ending a Round

1. Any player calls "CHECK" at start of their turn (before action)
2. Play continues in turn order until it returns to the checker
3. All players reveal hands simultaneously
4. Lowest sum wins the round (no points added)
5. If multiple players tie for lowest sum, ALL tied players score 0
6. All other players add their hand sum to their total score
7. **Game ends when any player reaches 100+ total points**:
   - That player loses
   - If multiple players reach 100+ in the same round, the highest score loses
   - If tied at 100+, all tied players lose
   - The player with the lowest total score wins

### Special Scenarios
- **Draw pile empty**: Shuffle discard pile into new draw pile (keep top card visible)
- **Disconnection**: Handle gracefully (Phase 2)

---

## Technology Stack

### Core Technologies
- **Frontend**: React + TypeScript, Vite (fast dev), React Router
- **UI Library**: **Chakra UI** (modern, game-friendly, great DX)
- **State Management**: React Context API (simple, sufficient for this scope)
- **Backend**: Node.js + Express + TypeScript
- **Real-time**: Socket.io (WebSockets with fallbacks)
- **Database**: MongoDB + Mongoose

### Deployment (Phase 2)
- **Frontend**: Vercel/Netlify
- **Backend**: Railway/Render
- **Database**: MongoDB Atlas

---

## Project Structure

```
check-card-game/
├── package.json              # Root workspace config
├── client/                   # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Card.tsx
│   │   │   ├── PlayerHand.tsx
│   │   │   ├── OpponentDisplay.tsx
│   │   │   ├── DiscardPile.tsx
│   │   │   ├── ActionButtons.tsx
│   │   │   ├── CheckButton.tsx
│   │   │   ├── SpecialEffectModal.tsx
│   │   │   ├── RoundEndModal.tsx
│   │   │   └── GameEndModal.tsx
│   │   ├── pages/            # Route pages
│   │   │   ├── HomePage.tsx
│   │   │   ├── RoomLobby.tsx
│   │   │   └── GameBoard.tsx
│   │   ├── context/          # Game state (Context API)
│   │   │   ├── GameContext.tsx
│   │   │   └── SocketContext.tsx
│   │   ├── services/         # Socket.io client
│   │   │   └── socket.ts
│   │   ├── types/            # TypeScript interfaces
│   │   │   ├── game.types.ts
│   │   │   ├── player.types.ts
│   │   │   └── card.types.ts
│   │   ├── utils/            # Helpers
│   │   │   └── helpers.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/                   # Express + Socket.io
│   ├── src/
│   │   ├── models/           # MongoDB schemas
│   │   │   ├── Room.ts
│   │   │   ├── GameState.ts
│   │   │   └── Player.ts
│   │   ├── routes/           # REST endpoints
│   │   │   └── health.ts
│   │   ├── socket/           # Socket.io handlers
│   │   │   ├── roomHandlers.ts
│   │   │   ├── gameHandlers.ts
│   │   │   └── index.ts
│   │   ├── game/             # Game logic engine
│   │   │   ├── Deck.ts
│   │   │   ├── GameState.ts
│   │   │   ├── Player.ts
│   │   │   ├── validators.ts
│   │   │   └── effects.ts
│   │   ├── utils/
│   │   │   └── helpers.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── .gitignore
├── README.md
└── PLAN.md                   # This file
```

---

## Data Models

### MongoDB Schemas

#### Room Schema
```typescript
{
  roomCode: string;           // 6-char unique code
  host: string;               // Player ID of room creator
  players: PlayerId[];        // Array of player IDs (4-6)
  gameState: GameState;       // Current game state
  status: 'lobby' | 'playing' | 'finished';
  createdAt: Date;
}
```

#### GameState Schema
```typescript
{
  deck: Card[];               // Remaining cards in draw pile
  discardPile: Card[];        // Discarded cards (top is last)
  players: PlayerState[];     // All player states
  currentTurnIndex: number;   // Index of current player
  checkCalledBy: string | null; // Player ID who called check
  roundNumber: number;        // Current round (starts at 1)
  scores: Record<string, number>; // Total scores
}
```

#### PlayerState Schema
```typescript
{
  playerId: string;
  username: string;
  hand: {
    slot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
    card: Card;
    revealed: boolean;        // For initial peek tracking
  }[];
  peekedSlots: string[];      // Which 2 slots they saw initially
  totalScore: number;
}
```

#### Card Schema
```typescript
{
  id: string;                 // Unique identifier
  suit: '♥' | '♦' | '♠' | '♣';
  rank: 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
  value: number;              // Point value for scoring
  isRed: boolean;             // Helper for special effects
}
```

#### ClientGameState Schema (sanitized state sent to clients)
```typescript
{
  deckCount: number;             // How many cards remain (NOT the cards themselves)
  discardPile: Card[];           // Discard pile (top is visible to all)
  players: ClientPlayerState[];  // Sanitized player states
  currentTurnIndex: number;
  checkCalledBy: string | null;
  roundNumber: number;
  scores: Record<string, number>; // Total scores (plain object, not Map)
}
```

#### ClientPlayerState Schema
```typescript
{
  playerId: string;
  username: string;
  hand: {
    slot: string;
    card: Card | null;           // Card data for own cards, null for other players' hidden cards
  }[];
  cardCount: number;
  totalScore: number;
}
```

> **Note:** The server constructs a per-player `ClientGameState` where the requesting
> player's own cards are included but all other players' cards are `null`.

---

## Game Logic Engine (Server-side)

### Core Functions

#### Deck Management
- `initializeDeck()`: Create and shuffle 52 cards
- `shuffleDeck(cards: Card[])`: Fisher-Yates shuffle
- `drawFromDeck(gameState: GameState)`: Remove and return top card
- `drawFromDiscard(gameState: GameState)`: Take top discard card
- `addToDiscard(gameState: GameState, card: Card)`: Add to discard pile
- `reshuffleDiscard(gameState: GameState)`: When deck empty

#### Game State
- `dealCards(gameState: GameState)`: Deal 4 to each player
- `selectInitialPeekSlots(playerId: string)`: Randomly pick 2 slots
- `advanceTurn(gameState: GameState)`: Move to next player
- `isGameEnded(gameState: GameState)`: Check if anyone ≥100 points

#### Actions & Validation
- `validateBurn(gameState: GameState, playerId: string, slotId: string)`: Check if ranks match
- `attemptBurn(gameState: GameState, playerId: string, slotId: string)`: Execute burn (success/fail)
- `processDraw(gameState: GameState, playerId: string, discardSlot: string)`: Draw from deck
- `processTakeDiscard(gameState: GameState, playerId: string, discardSlot: string)`: Take from discard

#### Special Effects
- `isRedFaceCard(card: Card)`: Check if red J/Q/K
- `applyRedJackEffect(gameState: GameState, playerId: string, targetPlayerId: string, mySlot: string, targetSlot: string)`: Swap cards
- `applyRedQueenEffect(gameState: GameState, playerId: string, slotId: string)`: Reveal card to player
- `applyRedKingEffect(gameState: GameState, playerId: string, choices: KingChoices)`: Handle 2-card draw choices

#### Round & Scoring
- `callCheck(gameState: GameState, playerId: string)`: Mark check caller
- `isRoundEnded(gameState: GameState)`: Check if back to checker's turn
- `revealAllHands(gameState: GameState)`: Flip all cards
- `calculateHandValue(hand: Card[])`: Sum card values
- `calculateRoundWinner(gameState: GameState)`: Find lowest sum
- `updateScores(gameState: GameState)`: Add points to losers
- `startNewRound(gameState: GameState)`: Reset for next round

---

## Socket.io Event System

### Client → Server Events

#### Room Management
```typescript
'createRoom' → { username: string }
  ← { roomCode: string, playerId: string }

'joinRoom' → { roomCode: string, username: string }
  ← { success: boolean, error?: string }

'leaveRoom' → { roomCode: string, playerId: string }

'startGame' → { roomCode: string }
  ← (broadcast) 'gameStarted'
```

#### Game Actions
```typescript
// Primary action — for drawDeck, this only initiates the draw (phase 1)
'playerAction' → {
  roomCode: string,
  playerId: string,
  action: {
    type: 'drawDeck' | 'takeDiscard' | 'burn',
    discardSlot?: string,  // Required for takeDiscard (which hand slot to replace)
    burnSlot?: string      // Required for burn (which hand slot to attempt)
  }
}

// Phase 2 of drawDeck: after seeing the drawn card, player decides what to discard
'discardAfterDraw' → {
  roomCode: string,
  playerId: string,
  discardSlot: string      // 'drawn' to discard the drawn card, or 'A'/'B'/etc. to replace a hand card
}

'callCheck' → { roomCode: string, playerId: string }

'redJackSwap' → {
  roomCode: string,
  playerId: string,
  mySlot: string,
  targetPlayerId: string,
  targetSlot: string,
  skipSwap: boolean  // If player chooses not to swap
}

'redQueenPeek' → {
  roomCode: string,
  playerId: string,
  slotId: string
}

'redKingChoice' → {
  roomCode: string,
  playerId: string,
  choice: {
    keepIndices: number[],     // Indices (0 and/or 1) of the 2 drawn cards to keep
    discardSlots: string[]     // Slots from hand to discard (must match keepIndices.length)
  }
}
```

### Server → Client Events

#### Room Updates
```typescript
'roomUpdated' → {
  roomCode: string,
  host: string,
  players: { id: string, username: string }[],
  status: string
}

'error' → { message: string }
```

#### Game State
```typescript
'gameStarted' → {
  gameState: ClientGameState,  // Sanitized state (no hidden card data)
  peekedCards: {               // ONLY the 2 cards the player is allowed to see
    slot: string,
    card: Card
  }[]
}

'gameStateUpdated' → {
  gameState: ClientGameState    // Sanitized: own cards visible, others hidden
}

'yourTurn' → { playerId: string }

'cardDrawn' → {
  playerId: string,
  card: Card | null,         // The drawn card (private); null for penalty draws (player cannot see penalty cards)
  isPenalty: boolean,        // true if this is a burn-failure penalty draw
  awaitingDiscard: boolean   // true if client must now emit 'discardAfterDraw'
}

'waitingForSpecialEffect' → {
  playerId: string,
  effect: 'redJack' | 'redQueen' | 'redKing',
  card: Card
}

'roundEnded' → {
  allHands: { playerId: string, cards: Card[], sum: number }[],
  winner: string,
  updatedScores: Record<string, number>
}

'gameEnded' → {
  finalScores: Record<string, number>,
  winner: string,           // Player with lowest score
  loser: string             // Player who hit 100+
}
```

---

## Frontend UI Components

### Pages

#### 1. HomePage (`/`)
- Input for guest username
- "Create Room" button → creates room, navigates to lobby
- "Join Room" input + button → joins by code
- Basic branding/title

#### 2. RoomLobby (`/room/:code`)
- Display room code with copy button
- Player list (4-6 slots)
  - Show usernames
  - Indicate host
  - Show empty slots
- "Start Game" button (host only, 4+ players required)
- "Leave Room" button
- Real-time updates when players join/leave

#### 3. GameBoard (`/game/:code`)
**Layout:**
- **Top**: Opponent displays (3-5 players)
- **Center**: Draw pile (left) + Discard pile (right)
- **Bottom**: Your hand + action panel
- **Sidebar**: Scores, current turn indicator

**Your Hand Section:**
- Cards in slots (A, B, C, D, E...)
- Slot labels visible
- Initially: 2 cards revealed for 3 seconds, then all face down
- Click to select for discard/burn
- Selected card highlighted

**Opponent Displays:**
- Username
- Card count (e.g., "4 cards")
- Card backs representing their hand
- Total score

**Center Area:**
- Draw pile: Face-down deck, click to draw
- Discard pile: Stacked cards, top card visible, click to take

**Action Panel:**
- "Draw from Deck" button
- "Take from Discard" button
- "Burn Card" button (shows validation hint)
- "Call CHECK" button (prominent, top of actions)
- Disabled when not your turn

**Modals:**
- **Red Jack Modal**: Choose player + slot to swap (or skip)
- **Red Queen Modal**: Choose which of your slots to peek
- **Red King Modal**: Show 2 drawn cards, choose what to keep/discard
- **Round End Modal**: Show all revealed hands, scores, winner
- **Game End Modal**: Final scores, winner, loser, "Play Again" option

### Key Components

```typescript
// Card display component
<Card 
  card={card} 
  faceUp={boolean}
  slot={string}
  selected={boolean}
  onClick={handler}
/>

// Player's hand
<PlayerHand 
  cards={Card[]}
  slots={string[]}
  onCardSelect={handler}
  selectedSlot={string | null}
/>

// Opponent display
<OpponentDisplay 
  username={string}
  cardCount={number}
  score={number}
  isCurrentTurn={boolean}
/>

// Discard pile
<DiscardPile 
  cards={Card[]}
  topCard={Card}
  onTake={handler}
  canTake={boolean}
/>

// Action buttons
<ActionButtons 
  onDrawDeck={handler}
  onTakeDiscard={handler}
  onBurn={handler}
  disabled={boolean}
/>

// Check button
<CheckButton 
  onCheck={handler}
  canCheck={boolean}
/>

// Special effect modals
<RedJackModal />
<RedQueenModal />
<RedKingModal />
<RoundEndModal />
<GameEndModal />
```

---

## Core Gameplay Flow

### 1. Game Start Sequence

```
1. Host clicks "Start Game" in lobby
2. Server creates initial game state:
   - Shuffle deck
   - Deal 4 cards to each player (slots A/B/C/D)
   - Select random first player
   - For each player: randomly pick 2 slots to peek
3. Server emits 'gameStarted' to each client (individually) with:
   - Sanitized game state (no hidden card data)
   - Only the 2 peeked cards and their slots (NOT all 4 cards)
4. Clients receive event:
   - Navigate to game board
   - Display 4 cards face down
   - Reveal specified 2 cards for 3 seconds
   - Flip back to face down
   - Player must remember positions
5. First turn begins
```

### 2. Turn Execution Flow

```
Current player's turn:
1. Client enables action buttons
2. Player can:
   a. Call "CHECK" (before action) → then still choose an action below
   b. Choose one of 3 actions

Action A: Draw from Deck
1. Click "Draw from Deck"
2. Server draws card, sends privately to player
3. Client shows drawn card to player
4. Player selects slot to discard (drawn or from hand)
5. Server validates, updates state
6. If discarded card is red J/Q/K just drawn:
   → Trigger special effect flow
7. Broadcast updated state
8. Next turn

Action B: Take from Discard
1. Click "Take from Discard"
2. Client shows discard pile top card
3. Player selects slot from hand to discard
4. Server validates, swaps cards
5. Broadcast updated state
6. Next turn

Action C: Burn Card
1. Player selects card from hand
2. Click "Burn Card"
3. Server validates rank match:
   - SUCCESS: Card removed, hand shrinks
   - FAIL: Card stays, draw penalty card face-down (player does NOT see it)
4. Broadcast updated state
5. Next turn
```

### 3. Special Effect Flow

```
Red Jack (Swap):
1. Server emits 'waitingForSpecialEffect' with 'redJack'
2. Client shows modal:
   - List other players
   - Select target player
   - Select your slot (A/B/C...)
   - Select their slot (A/B/C...)
   - Or "Skip" button
3. Player makes choice
4. Client emits 'redJackSwap'
5. Server swaps cards blindly (neither sees)
6. Broadcast updated state
7. Continue to next turn

Red Queen (Peek):
1. Server emits 'waitingForSpecialEffect' with 'redQueen'
2. Client shows modal:
   - Display your hand slots
   - Select which slot to peek
3. Player selects slot
4. Client emits 'redQueenPeek'
5. Server reveals card to player (private)
6. Client shows card briefly
7. Continue to next turn

Red King (Draw 2):
1. Server draws 2 more cards, sends privately
2. Server emits 'waitingForSpecialEffect' with 'redKing'
3. Client shows modal:
   - Display 2 drawn cards
   - Options:
     a. "Return Both" → both go back to deck
     b. "Keep 1" → select 1 drawn, select 1 hand slot to discard
     c. "Keep 2" → select 2 hand slots to discard
4. Player makes choice
5. Client emits 'redKingChoice'
6. Server processes choice:
   - Return unwanted cards to deck (shuffle)
   - Add kept cards to hand
   - Discard selected hand cards
7. Broadcast updated state
8. Continue to next turn
```

### 4. Check Flow

```
1. Player clicks "Call CHECK" at start of their turn
2. Client emits 'callCheck'
3. Server marks checker ID, records turn index
4. Server broadcasts check was called
5. Client shows notification: "[Player] called CHECK!"
6. Checker then takes their normal turn action (draw, take discard, or burn)
7. Game continues normal turn order from next player
8. Each subsequent turn:
   - Server checks if currentTurnIndex == checkerTurnIndex
   - If NO: continue normal turn
   - If YES: End round (checker does NOT take another action)
8. Round end sequence:
   - Server reveals all hands
   - Calculate sums
   - Determine winner (lowest sum)
   - Update scores (add losers' sums)
   - Check if anyone ≥100 points
9. Server emits 'roundEnded'
10. Clients show RoundEndModal:
    - All players' hands visible
    - Scores displayed
    - Winner highlighted
11. If game not ended:
    - Server starts new round
    - Repeat game start sequence
12. If game ended (someone ≥100):
    - Server emits 'gameEnded'
    - Client shows GameEndModal
    - Display final scores, winner, loser
    - "Play Again" option
```

### 5. Initial Peek Mechanic

```
At game start, for each player:
1. Server randomly selects 2 slots (e.g., 'A' and 'C')
2. Send to client in 'gameStarted' event
3. Client receives:
   - 4 cards in slots A/B/C/D
   - peekSlots: ['A', 'C']
4. Client displays:
   - Show all 4 cards face down
   - Flip slots A and C face up
   - Show for 3 seconds (countdown timer)
   - Flip both back to face down
5. Player must remember:
   - Which slots they saw
   - What cards were in those slots
6. During gameplay:
   - All cards appear face down
   - Player relies on memory
   - Red Queen can reveal 1 card again
```

---

## MVP Development Plan (Phase 1)

### Scope
Focus on core game loop with multiplayer functionality. No user accounts, leaderboards, or bots initially.

### Implementation Order

#### **Week 1-2: Foundation**

1. **Monorepo Setup**
   - Initialize npm workspaces
   - Configure TypeScript for client and server
   - Set up Vite for client
   - Configure ESLint and Prettier
   - Create basic folder structure

2. **Backend Foundation**
   - Initialize Express server
   - Set up Socket.io
   - Connect to MongoDB (local or Atlas)
   - Environment variables (.env)
   - Health check endpoint

3. **Frontend Foundation**
   - Create React app with Vite + TypeScript
   - Install Chakra UI
   - Set up React Router
   - Configure Socket.io client
   - Basic layout and theme

4. **Dev Environment**
   - Concurrent dev scripts (run client + server)
   - Hot reload for both
   - Debug configurations

#### **Week 3-4: Game Engine**

5. **Data Models**
   - Define TypeScript interfaces
   - Create MongoDB schemas (Room, GameState, Player)
   - Mongoose models

6. **Deck & Card Logic**
   - `initializeDeck()`: Create 52 cards
   - `shuffleDeck()`: Fisher-Yates shuffle
   - Card value assignments
   - `drawFromDeck()`, `drawFromDiscard()`

7. **Game State Management**
   - `dealCards()`: Deal 4 to each player
   - `selectInitialPeekSlots()`: Random 2 slots
   - `advanceTurn()`: Sequential turn order
   - `reshuffleDiscard()`: When deck empty

8. **Action Validators**
   - `validateBurn()`: Check rank match
   - Action type validation
   - Turn order validation
   - Slot existence validation

9. **Action Processors**
   - `processDraw()`: Draw from deck + discard
   - `processTakeDiscard()`: Take top + discard
   - `attemptBurn()`: Success/fail logic with penalty

10. **Special Effects**
    - `applyRedJackEffect()`: Card swap
    - `applyRedQueenEffect()`: Reveal card
    - `applyRedKingEffect()`: Handle 2-card draw choices
    - Effect trigger detection

11. **Scoring System**
    - `calculateHandValue()`: Sum card values
    - `calculateRoundWinner()`: Find lowest sum
    - `updateScores()`: Add points to losers
    - `isGameEnded()`: Check 100+ threshold

12. **Check Mechanism**
    - `callCheck()`: Mark checker
    - `isRoundEnded()`: Detect return to checker
    - `revealAllHands()`: Show all cards
    - `startNewRound()`: Reset game state

#### **Week 5-6: UI Development**

13. **Home Page**
    - Username input
    - Create room button
    - Join room input + button
    - Basic styling with Chakra

14. **Room Lobby**
    - Display room code + copy button
    - Player list (4-6 slots)
    - Show host indicator
    - Start game button (host, 4+ players)
    - Leave room button
    - Real-time player join/leave updates

15. **Game Board Layout**
    - Grid layout: opponents (top), center (piles), you (bottom)
    - Responsive design
    - Score panel
    - Turn indicator

16. **Card Components**
    - `Card`: Face up/down, slot label, selection
    - `PlayerHand`: Your 4+ cards with slots
    - `OpponentDisplay`: Username, card backs, score
    - Card styling (suits, colors, values)

17. **Pile Components**
    - `DrawPile`: Face-down deck, clickable
    - `DiscardPile`: Stacked cards, top visible, clickable
    - Pile counts

18. **Action UI**
    - `ActionButtons`: Draw, Take, Burn buttons
    - `CheckButton`: Prominent styling
    - Disabled states
    - Tooltips/hints

19. **Special Effect Modals**
    - `RedJackModal`: Player + slot selection, skip option
    - `RedQueenModal`: Slot selection for peek
    - `RedKingModal`: 2 cards shown, choice buttons
    - Chakra Modal components

20. **End Game Modals**
    - `RoundEndModal`: All hands revealed, scores, winner
    - `GameEndModal`: Final scores, winner/loser, play again
    - Animations (optional)

#### **Week 7-8: Integration & Polish**

21. **Socket.io Integration**
    - Implement all client → server events
    - Implement all server → client events
    - Connect UI actions to socket emits
    - Handle server responses in UI

22. **Room Management Flow**
    - Create room → lobby → start game
    - Join room flow
    - Leave/disconnect handling
    - Room state synchronization

23. **Game Flow Integration**
    - Initial peek mechanic (3-second reveal)
    - Turn-based action execution
    - Special effect flows (J/Q/K)
    - Check calling and round end
    - Multi-round play
    - Game end condition

24. **Validation & Error Handling**
    - Client-side action validation
    - Server-side validation (authoritative)
    - Error messages via toast notifications
    - Invalid action feedback

25. **State Synchronization**
    - Real-time game state updates
    - Optimistic UI updates
    - Conflict resolution
    - Stale state handling

26. **Edge Cases**
    - Deck runs out → reshuffle
    - Player disconnects mid-game
    - All players but one leave
    - Invalid room codes
    - Concurrent action attempts

27. **Testing with Multiple Clients**
    - Test with 4, 5, 6 players
    - Test all 3 action types
    - Test special effects (all J/Q/K)
    - Test burn success/fail
    - Test check flow
    - Test multi-round game
    - Test game end (100+ points)

28. **Polish & UX**
    - Loading states
    - Smooth transitions
    - Responsive design (mobile/tablet/desktop)
    - Accessibility basics
    - Clear visual feedback
    - Turn timer (optional)

29. **Basic Documentation**
    - README with setup instructions
    - Game rules summary
    - Development guide
    - Deployment notes

---

## Phase 2 Features (Post-MVP)

After core game loop works and is tested with real players:

### Priority 1: Stability
1. **Reconnection Logic**
   - Save game state in DB
   - Allow players to rejoin if disconnected
   - Resume from current state
   - Timeout for disconnected players

2. **Room Management**
   - Room expiration (24 hours)
   - Kick player (host privilege)
   - Spectator mode
   - Custom room settings

### Priority 2: Enhancements
3. **Bot Players**
   - Basic AI strategy
   - Fill empty slots
   - Practice mode
   - Difficulty levels

4. **User Accounts**
   - Email/password registration
   - Guest-to-registered migration
   - Profile management
   - Avatar selection

5. **Leaderboard**
   - Global rankings
   - Personal stats (wins, losses, games)
   - Win rate calculation
   - Recent games list

### Priority 3: Polish
6. **Animations**
   - Card draw/discard animations
   - Card flip animations
   - Smooth transitions
   - Victory animations

7. **Sound Effects**
   - Card sounds
   - Turn notifications
   - Special effect sounds
   - Mute option

8. **Advanced Features**
   - Game history
   - Replay viewer
   - Custom target scores
   - Tournament mode
   - Friend system
   - Direct invites

### Priority 4: Performance
9. **Optimization**
   - Code splitting
   - Lazy loading
   - WebSocket optimization
   - Database indexing
   - Caching strategies

10. **Testing**
    - Unit tests (game logic)
    - Integration tests (API)
    - E2E tests (Playwright/Cypress)
    - Load testing

### Priority 5: Deployment
11. **Production Setup**
    - Frontend: Vercel/Netlify
    - Backend: Railway/Render
    - Database: MongoDB Atlas
    - Environment configs
    - CI/CD pipeline

12. **Security**
    - Input validation
    - Rate limiting
    - Room access control
    - Anti-cheat measures
    - HTTPS/WSS

---

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Follow ESLint rules
- Consistent naming conventions
- Comment complex logic
- Write descriptive commit messages

### Git Workflow
- Feature branches
- Pull requests for review
- Squash commits when merging
- Semantic versioning

### Testing Strategy
- Test game logic thoroughly (pure functions)
- Validate all user inputs server-side
- Test edge cases (empty deck, penalties, etc.)
- Manual testing with multiple browser tabs
- Real multiplayer testing with friends

### Security Considerations
- Never trust client state
- Server is authoritative for all game logic
- Validate every action server-side
- Prevent cheating (card visibility, turn order)
- Rate limit socket events

### Performance Tips
- Keep socket events lean (minimize data)
- Update only what changed
- Use MongoDB indexes (roomCode, playerId)
- Optimize re-renders (React.memo, useMemo)
- Lazy load modals

---

## Success Criteria

### MVP is Complete When:
- [ ] 4-6 players can create/join rooms
- [ ] Game starts with 4-card deal and 2-card peek
- [ ] All 3 turn actions work (draw, take, burn)
- [ ] Burn success/fail logic works with penalties
- [ ] Red J/Q/K special effects function correctly
- [ ] Check mechanism ends rounds properly
- [ ] Scoring calculates correctly
- [ ] Multi-round play works until 100+ points
- [ ] Game declares winner/loser at end
- [ ] UI is responsive and intuitive
- [ ] No critical bugs in multiplayer

### Ready for Real Testing When:
- [ ] 3+ concurrent games can run
- [ ] Players can reconnect after refresh (Phase 2)
- [ ] Error handling is robust
- [ ] Performance is smooth
- [ ] Game rules are clear to new players

---

## Timeline Estimate

**Optimistic (experienced dev):** 6-8 weeks part-time

**Realistic (learning as you go):** 10-12 weeks part-time

**Conservative (new to stack):** 14-16 weeks part-time

Full-time development could reduce this by 50%.

---

## Next Steps

1. ✅ Review plan and clarify questions
2. ✅ Create PLAN.md file
3. ⏭️ Set up development environment
4. ⏭️ Initialize monorepo structure
5. ⏭️ Begin Week 1-2 foundation work
6. ⏭️ Iterate based on testing feedback

---

## Questions & Clarifications

Before starting implementation, confirm:

- [x] Chakra UI approved as component library
- [ ] MongoDB Atlas free tier sufficient for MVP?
- [ ] Any visual design preferences (colors, style)?
- [ ] Target browser support (modern browsers only)?
- [ ] Mobile-first or desktop-first design priority?
- [ ] Any additional game rules or edge cases?

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-13  
**Status:** Ready for Implementation

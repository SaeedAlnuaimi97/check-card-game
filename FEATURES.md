# CHECK CARD GAME - Feature List

Derived from PLAN.md. Features are grouped by domain and ordered by implementation priority.

---

## Phase 1: MVP

### 1. Project Foundation

- [ ] **F-001**: Monorepo setup with npm workspaces (client + server)
- [ ] **F-002**: TypeScript configuration for both client and server
- [ ] **F-003**: Vite dev server for React client
- [ ] **F-004**: ESLint + Prettier configuration
- [ ] **F-005**: Express server with Socket.io
- [ ] **F-006**: MongoDB connection with Mongoose
- [ ] **F-007**: Health check REST endpoint
- [ ] **F-008**: Concurrent dev scripts (client + server hot reload)
- [ ] **F-009**: Environment variable configuration (.env)

### 2. Data Models & Types

- [ ] **F-010**: Card type — id, suit, rank, value, isRed
- [ ] **F-011**: PlayerState schema — playerId, username, hand (slots + cards), peekedSlots, totalScore
- [ ] **F-012**: GameState schema — deck, discardPile, players, currentTurnIndex, checkCalledBy, roundNumber, scores
- [ ] **F-013**: Room schema — roomCode, host, players, gameState, status, createdAt
- [ ] **F-014**: ClientGameState type — sanitized state for clients (deckCount instead of deck, hidden cards as null)
- [ ] **F-015**: ClientPlayerState type — own cards visible, other players' cards null

### 3. Room Management

- [ ] **F-016**: Create room — generates 6-char unique room code, assigns host
- [ ] **F-017**: Join room — join by room code, validate 4-6 player limit
- [ ] **F-018**: Leave room — remove player, reassign host if needed
- [ ] **F-019**: Start game — host-only, requires 4+ players
- [ ] **F-020**: Real-time room updates — broadcast player join/leave to all room members
- [ ] **F-021**: Room status tracking — lobby / playing / finished

### 4. Deck & Card Engine

- [ ] **F-022**: Initialize deck — create standard 52-card deck with correct values (red 10 = 0, ace = 1, face cards = 10)
- [ ] **F-023**: Shuffle deck — Fisher-Yates shuffle
- [ ] **F-024**: Draw from deck — remove and return top card
- [ ] **F-025**: Draw from discard — take top visible card
- [ ] **F-026**: Add to discard pile
- [ ] **F-027**: Reshuffle discard into deck — when draw pile is empty, keep top discard card, shuffle rest into new draw pile

### 5. Game Setup & Initial Peek

- [ ] **F-028**: Deal 4 cards to each player into slots A, B, C, D
- [ ] **F-029**: Randomly select 2 peek slots per player (server-side)
- [ ] **F-030**: Send only peeked cards to each client (not all 4) via `gameStarted` event
- [ ] **F-031**: Client-side 3-second peek reveal — show 2 cards face up, then flip back down
- [ ] **F-032**: Random first player selection

### 6. Turn System

- [ ] **F-033**: Turn order management — sequential, advance to next player after action
- [ ] **F-034**: Turn validation — server rejects actions from non-current player
- [ ] **F-035**: Action button enable/disable based on turn state
- [ ] **F-036**: `yourTurn` event — notify current player

### 7. Action: Draw from Deck (Two-Phase)

- [ ] **F-037**: Phase 1 — player emits `playerAction` with `type: 'drawDeck'`, server draws card and sends privately via `cardDrawn` event
- [ ] **F-038**: Phase 2 — player sees drawn card, emits `discardAfterDraw` with slot choice ('drawn' to discard drawn card, or slot label to replace hand card)
- [ ] **F-039**: Server validates discard choice and updates game state
- [ ] **F-040**: Red face card effect detection — if discarded card is a red J/Q/K that was just drawn, trigger special effect

### 8. Action: Take from Discard

- [ ] **F-041**: Player takes top discard pile card (visible)
- [ ] **F-042**: Player must discard one card from hand to replace
- [ ] **F-043**: No special effects trigger from discard take

### 9. Action: Burn a Card

- [ ] **F-044**: Player selects hand slot to attempt burn
- [ ] **F-045**: Server validates rank match against top discard card (number = exact, face = exact face, suit irrelevant)
- [ ] **F-046**: Burn success — card removed from hand to discard pile, hand shrinks
- [ ] **F-047**: Burn failure — card stays in hand, penalty card drawn face-down (player does NOT see it)
- [ ] **F-048**: No special effects trigger from burns

### 10. Special Effects (Red Face Cards)

- [ ] **F-049**: Red Jack — optional blind swap of one own card with one opponent card; neither player sees swapped cards
- [ ] **F-050**: Red Queen — peek at one of own face-down cards (private reveal)
- [ ] **F-051**: Red King — draw 2 additional cards privately; choose to return both, keep 1 (discard 1 from hand), or keep 2 (discard 2 from hand)
- [ ] **F-052**: Red King choice uses indices (0/1) to identify drawn cards — server resolves, never trust client card data
- [ ] **F-053**: Return-to-deck cards shuffled back into random positions
- [ ] **F-054**: `waitingForSpecialEffect` event — pauses game for effect resolution

### 11. Hand Management

- [ ] **F-055**: Dynamic hand size — starts at 4, grows with penalties, shrinks with burns
- [ ] **F-056**: Slot label persistence — burned slot labels are not re-assigned (A, C, D stays A, C, D)
- [ ] **F-057**: New penalty slots labeled sequentially (E, F, G, H...)
- [ ] **F-058**: Hand size zero is valid — player has 0 cards and scores 0

### 12. Check Mechanism

- [ ] **F-059**: Player calls CHECK at start of their turn (before action)
- [ ] **F-060**: Checker still takes their normal turn action after calling check
- [ ] **F-061**: Server marks checker ID and turn index
- [ ] **F-062**: Broadcast check notification to all players
- [ ] **F-063**: Each remaining player gets one more turn
- [ ] **F-064**: Round ends when turn returns to checker (no action taken on return)

### 13. Scoring & Round End

- [ ] **F-065**: Calculate hand value — sum of all card point values per player
- [ ] **F-066**: Round winner — lowest sum scores 0
- [ ] **F-067**: Tied lowest sum — all tied players score 0
- [ ] **F-068**: All non-winners add their hand sum to total score
- [ ] **F-069**: Reveal all hands simultaneously at round end
- [ ] **F-070**: `roundEnded` event with all hands, sums, winner, updated scores

### 14. Game End

- [ ] **F-071**: Game ends when any player reaches 100+ total points
- [ ] **F-072**: Player with 100+ loses
- [ ] **F-073**: Multiple players at 100+ — highest score loses; if tied, all tied players lose
- [ ] **F-074**: Winner is player with lowest total score
- [ ] **F-075**: `gameEnded` event with final scores, winner, loser
- [ ] **F-076**: Multi-round play — new round starts automatically until game end condition

### 15. State Sanitization & Anti-Cheat

- [ ] **F-077**: Server constructs per-player `ClientGameState` — own cards included, others' cards null
- [ ] **F-078**: Deck contents never sent to client (only `deckCount`)
- [ ] **F-079**: Penalty card draws send `card: null` to client
- [ ] **F-080**: All game logic server-authoritative — client cannot modify game state directly
- [ ] **F-081**: Server validates every action (turn order, slot existence, action type)

### 16. Socket Event System

- [ ] **F-082**: Client → Server: `createRoom`, `joinRoom`, `leaveRoom`, `startGame`
- [ ] **F-083**: Client → Server: `playerAction` (drawDeck / takeDiscard / burn)
- [ ] **F-084**: Client → Server: `discardAfterDraw` (phase 2 of deck draw)
- [ ] **F-085**: Client → Server: `callCheck`
- [ ] **F-086**: Client → Server: `redJackSwap`, `redQueenPeek`, `redKingChoice`
- [ ] **F-087**: Server → Client: `roomUpdated`, `error`
- [ ] **F-088**: Server → Client: `gameStarted`, `gameStateUpdated`, `yourTurn`
- [ ] **F-089**: Server → Client: `cardDrawn` (with isPenalty and awaitingDiscard flags)
- [ ] **F-090**: Server → Client: `waitingForSpecialEffect`, `roundEnded`, `gameEnded`
- [ ] **F-091**: All `Record<string, number>` for scores (not Map — JSON-serializable)

### 17. UI: Pages

- [ ] **F-092**: Home page — username input, create room button, join room input + button
- [ ] **F-093**: Room lobby — room code display with copy, player list (4-6 slots), host indicator, start/leave buttons
- [ ] **F-094**: Game board — opponents (top), draw/discard piles (center), player hand + actions (bottom), scores sidebar

### 18. UI: Game Board Components

- [ ] **F-095**: Card component — face up/down, slot label, selected state, click handler
- [ ] **F-096**: PlayerHand — own cards with slot labels, click to select for discard/burn
- [ ] **F-097**: OpponentDisplay — username, card count, card backs, score, current turn indicator
- [ ] **F-098**: DrawPile — face-down deck, clickable to draw
- [ ] **F-099**: DiscardPile — stacked cards, top card visible, clickable to take
- [ ] **F-100**: ActionButtons — Draw from Deck, Take from Discard, Burn Card (with disabled states)
- [ ] **F-101**: CheckButton — prominent styling, disabled when not your turn

### 19. UI: Modals

- [ ] **F-102**: Red Jack modal — select target player + their slot + your slot, or skip
- [ ] **F-103**: Red Queen modal — select which of your slots to peek
- [ ] **F-104**: Red King modal — show 2 drawn cards, choose return both / keep 1 / keep 2
- [ ] **F-105**: Round end modal — all hands revealed, scores, winner highlighted
- [ ] **F-106**: Game end modal — final scores, winner, loser, play again option

### 20. UI: Polish & UX

- [ ] **F-107**: Loading states for async operations
- [ ] **F-108**: Error messages via toast notifications
- [ ] **F-109**: Responsive design (mobile / tablet / desktop)
- [ ] **F-110**: Turn indicator — clear visual of whose turn it is
- [ ] **F-111**: Check notification banner
- [ ] **F-112**: Card selection highlighting

---

## Phase 2: Post-MVP

### Stability
- [ ] **F-200**: Reconnection logic — save state to DB, rejoin after disconnect, resume from current state
- [ ] **F-201**: Disconnection timeout — auto-kick after timeout
- [ ] **F-202**: Room expiration (24 hours)
- [ ] **F-203**: Host can kick players
- [ ] **F-204**: Spectator mode

### Enhancements
- [ ] **F-210**: Bot players — basic AI strategy, fill empty slots
- [ ] **F-211**: Bot difficulty levels
- [ ] **F-212**: User accounts — email/password registration
- [ ] **F-213**: Guest-to-registered account migration
- [ ] **F-214**: Player profiles and avatar selection
- [ ] **F-215**: Global leaderboard and rankings
- [ ] **F-216**: Personal stats — wins, losses, win rate, recent games

### Polish
- [ ] **F-220**: Card draw/discard/flip animations
- [ ] **F-221**: Victory animations
- [ ] **F-222**: Sound effects — card sounds, turn notifications, special effects, mute option
- [ ] **F-223**: Game history and replay viewer
- [ ] **F-224**: Custom target scores (configurable game end threshold)
- [ ] **F-225**: Tournament mode
- [ ] **F-226**: Friend system and direct invites

### Performance & Infrastructure
- [ ] **F-230**: Code splitting and lazy loading
- [ ] **F-231**: WebSocket optimization
- [ ] **F-232**: Database indexing (roomCode, playerId)
- [ ] **F-233**: Unit tests (game logic)
- [ ] **F-234**: Integration tests (API/socket events)
- [ ] **F-235**: E2E tests (Playwright/Cypress)
- [ ] **F-236**: Load testing

### Deployment
- [ ] **F-240**: Frontend deployment (Vercel/Netlify)
- [ ] **F-241**: Backend deployment (Railway/Render)
- [ ] **F-242**: MongoDB Atlas production database
- [ ] **F-243**: CI/CD pipeline
- [ ] **F-244**: Input validation and rate limiting
- [ ] **F-245**: HTTPS/WSS enforcement

---

**Total MVP Features:** 112  
**Total Phase 2 Features:** 26  
**Document Version:** 1.0  
**Last Updated:** 2026-03-13

# CHECK CARD GAME - Feature List

Derived from PLAN.md. Features are grouped by domain and ordered by implementation priority.

---

## Phase 1: MVP

### 1. Project Foundation

- [x] **F-001**: Monorepo setup with npm workspaces (client + server)
- [x] **F-002**: TypeScript configuration for both client and server
- [x] **F-003**: Vite dev server for React client
- [x] **F-004**: ESLint + Prettier configuration
- [x] **F-005**: Express server with Socket.io
- [x] **F-006**: MongoDB connection with Mongoose
- [x] **F-007**: Health check REST endpoint
- [x] **F-008**: Concurrent dev scripts (client + server hot reload)
- [x] **F-009**: Environment variable configuration (.env)

### 2. Data Models & Types

- [x] **F-010**: Card type — id, suit, rank, value, isRed
- [x] **F-011**: PlayerState schema — playerId, username, hand (slots + cards), peekedSlots, totalScore
- [x] **F-012**: GameState schema — deck, discardPile, players, currentTurnIndex, checkCalledBy, roundNumber, scores
- [x] **F-013**: Room schema — roomCode, host, players, gameState, status, createdAt
- [x] **F-014**: ClientGameState type — sanitized state for clients (deckCount instead of deck, hidden cards as null)
- [x] **F-015**: ClientPlayerState type — own cards visible, other players' cards null

### 3. Room Management

- [x] **F-016**: Create room — generates 6-char unique room code, assigns host
- [x] **F-017**: Join room — join by room code, validate 4-6 player limit
- [x] **F-018**: Leave room — remove player, reassign host if needed
- [x] **F-019**: Start game — host-only, requires 4+ players
- [x] **F-020**: Real-time room updates — broadcast player join/leave to all room members
- [x] **F-021**: Room status tracking — lobby / playing / finished

### 4. Deck & Card Engine

- [x] **F-022**: Initialize deck — create standard 52-card deck with correct values (red 10 = 0, ace = 1, face cards = 10)
- [x] **F-023**: Shuffle deck — Fisher-Yates shuffle
- [x] **F-024**: Draw from deck — remove and return top card
- [x] **F-025**: Draw from discard — take top visible card
- [x] **F-026**: Add to discard pile
- [x] **F-027**: Reshuffle discard into deck — when draw pile is empty, keep top discard card, shuffle rest into new draw pile

### 5. Game Setup & Initial Peek

- [x] **F-028**: Deal 4 cards to each player into slots A, B, C, D
- [x] **F-029**: Select peek slots C and D per player (server-side)
- [x] **F-030**: Send only peeked cards to each client (not all 4) via `gameStarted` event
- [x] **F-031**: Client-side 3-second peek reveal — show 2 cards face up, then flip back down
- [x] **F-032**: Random first player selection

### 6. Turn System

- [x] **F-033**: Turn order management — sequential, advance to next player after action
- [x] **F-034**: Turn validation — server rejects actions from non-current player
- [x] **F-035**: Action button enable/disable based on turn state
- [x] **F-036**: `yourTurn` event — notify current player

### 7. Action: Draw from Deck (Two-Phase)

- [x] **F-037**: Phase 1 — player emits `playerAction` with `type: 'drawDeck'`, server draws card and sends privately via `cardDrawn` event
- [x] **F-038**: Phase 2 — player sees drawn card, emits `discardAfterDraw` with slot choice ('drawn' to discard drawn card, or slot label to replace hand card)
- [x] **F-039**: Server validates discard choice and updates game state
- [x] **F-040**: Red face card effect detection — if discarded card is a red J/Q/K that was just drawn, trigger special effect

### 8. Action: Take from Discard

- [x] **F-041**: Player takes top discard pile card (visible)
- [x] **F-042**: Player must discard one card from hand to replace
- [x] **F-043**: No special effects trigger from discard take

### 9. Action: Burn a Card

- [x] **F-044**: Player selects hand slot to attempt burn
- [x] **F-045**: Server validates rank match against top discard card (number = exact, face = exact face, suit irrelevant)
- [x] **F-046**: Burn success — card removed from hand to discard pile, hand shrinks
- [x] **F-047**: Burn failure — card stays in hand, penalty card drawn face-down (player does NOT see it)
- [x] **F-048**: No special effects trigger from burns

### 10. Special Effects (Red Face Cards)

- [x] **F-049**: Red Jack — optional blind swap of one own card with one opponent card; neither player sees swapped cards
- [x] **F-050**: Red Queen — peek at one of own face-down cards (private reveal)
- [x] **F-051**: Red King — draw 2 additional cards privately; choose to return both, keep 1 (discard 1 from hand), or keep 2 (discard 2 from hand)
- [x] **F-052**: Red King choice uses indices (0/1) to identify drawn cards — server resolves, never trust client card data
- [x] **F-053**: Return-to-deck cards shuffled back into random positions
- [x] **F-054**: `waitingForSpecialEffect` event — pauses game for effect resolution

### 11. Hand Management

- [x] **F-055**: Dynamic hand size — starts at 4, grows with penalties, shrinks with burns
- [x] **F-056**: Slot label persistence — burned slot labels are not re-assigned (A, C, D stays A, C, D)
- [x] **F-057**: New penalty slots labeled sequentially (E, F, G, H...)
- [x] **F-058**: Hand size zero is valid — player has 0 cards and scores 0

### 12. Check Mechanism

- [x] **F-059**: Player calls CHECK at start of their turn (before action)
- [x] **F-060**: Checker still takes their normal turn action after calling check
- [x] **F-061**: Server marks checker ID and turn index
- [x] **F-062**: Broadcast check notification to all players
- [x] **F-063**: Each remaining player gets one more turn
- [x] **F-064**: Round ends when turn returns to checker (no action taken on return)

### 13. Scoring & Round End

- [x] **F-065**: Calculate hand value — sum of all card point values per player
- [x] **F-066**: Round winner — lowest sum scores 0
- [x] **F-067**: Tied lowest sum — all tied players score 0
- [x] **F-068**: All non-winners add their hand sum to total score
- [x] **F-069**: Reveal all hands simultaneously at round end
- [x] **F-070**: `roundEnded` event with all hands, sums, winner, updated scores

### 14. Game End

- [x] **F-071**: Game ends when any player reaches 70+ total points
- [x] **F-072**: Player with 70+ loses
- [x] **F-073**: Multiple players at 70+ — highest score loses; if tied, all tied players lose
- [x] **F-074**: Winner is player with lowest total score
- [x] **F-075**: `gameEnded` event with final scores, winner, loser
- [x] **F-076**: Multi-round play — new round starts automatically until game end condition
- [x] **F-077**: Host can manually end the game during round-end phase via "End Game" button

### 15. State Sanitization & Anti-Cheat

- [x] **F-077**: Server constructs per-player `ClientGameState` — own cards included, others' cards null
- [x] **F-078**: Deck contents never sent to client (only `deckCount`)
- [x] **F-079**: Penalty card draws send `card: null` to client
- [x] **F-080**: All game logic server-authoritative — client cannot modify game state directly
- [x] **F-081**: Server validates every action (turn order, slot existence, action type)

### 16. Socket Event System

- [x] **F-082**: Client → Server: `createRoom`, `joinRoom`, `leaveRoom`, `startGame`
- [x] **F-083**: Client → Server: `playerAction` (drawDeck / takeDiscard / burn)
- [x] **F-084**: Client → Server: `discardAfterDraw` (phase 2 of deck draw)
- [x] **F-085**: Client → Server: `callCheck`
- [x] **F-086**: Client → Server: `redJackSwap`, `redQueenPeek`, `redKingChoice`
- [x] **F-087**: Server → Client: `roomUpdated`, `error`
- [x] **F-088**: Server → Client: `gameStarted`, `gameStateUpdated`, `yourTurn`
- [x] **F-089**: Server → Client: `cardDrawn` (with isPenalty and awaitingDiscard flags)
- [x] **F-090**: Server → Client: `waitingForSpecialEffect`, `roundEnded`, `gameEnded`
- [x] **F-091**: All `Record<string, number>` for scores (not Map — JSON-serializable)

### 17. UI: Pages

- [x] **F-092**: Home page — username input, create room button, join room input + button
- [x] **F-093**: Room lobby — room code display with copy, player list (4-6 slots), host indicator, start/leave buttons
- [x] **F-094**: Game board — opponents (top), draw/discard piles (center), player hand + actions (bottom), scores sidebar

### 18. UI: Game Board Components

- [x] **F-095**: Card component — face up/down, slot label, selected state, click handler
- [x] **F-096**: PlayerHand — own cards with slot labels, click to select for discard/burn
- [x] **F-097**: OpponentDisplay — username, card count, card backs, score, current turn indicator
- [x] **F-098**: DrawPile — face-down deck, clickable to draw
- [x] **F-099**: DiscardPile — stacked cards, top card visible, clickable to take
- [x] **F-100**: ActionButtons — Draw from Deck, Take from Discard, Burn Card (with disabled states)
- [x] **F-101**: CheckButton — prominent styling, disabled when not your turn

### 19. UI: Modals

- [x] **F-102**: Red Jack modal — select target player + their slot + your slot, or skip
- [x] **F-103**: Red Queen modal — select which of your slots to peek
- [x] **F-104**: Red King modal — show 2 drawn cards, choose return both / keep 1 / keep 2
- [x] **F-105**: Round end modal — all hands revealed, scores, winner highlighted
- [x] **F-106**: Game end modal — final scores, winner, loser, play again option

### 20. UI: Polish & UX

- [x] **F-107**: Loading states for async operations
- [x] **F-108**: Error messages via toast notifications
- [x] **F-109**: Responsive design (mobile / tablet / desktop)
- [x] **F-110**: Turn indicator — clear visual of whose turn it is
- [x] **F-111**: Check notification banner
- [x] **F-112**: Card selection highlighting

---

## Gameplay Enhancements

### 21. Scoring Rule Change

- [x] **E-001**: Checker-doubling scoring — if the checker does NOT have the lowest sum, their hand sum is doubled
- [x] **E-002**: Lowest-sum player(s) always score 0 (including ties)
- [x] **E-003**: Round end modal shows doubled score for checker when applicable

### 22. Reconnection

- [x] **E-004**: Socket reconnection with infinite retries and exponential backoff
- [x] **E-005**: Auto-reconnect on tab visibility change (visibilitychange event)

### 23. Hand Scrolling

- [x] **E-006**: Horizontal scroll for player hand cards — prevents overflow from penalty cards

### 24. Burn Confirmation

- [x] **E-007**: Confirmation modal before burning a card — prevents accidental penalties

### 25. Sound Effects

- [x] **E-008**: Pick sound effect plays on card draw, take, burn, and swap

### 27. Turn Timer

- [x] **E-010**: 30-second turn timer (server-side) — auto-skips turn on timeout
- [x] **E-011**: Turn timer handles pending drawn cards and special effects on timeout
- [x] **E-012**: Countdown progress bar shown to all players during gameplay
- [x] **E-013**: Toast notification when a turn times out
- [x] **E-014**: Timer clears on round end

---

## UI/UX Improvements

### 28. Card Back Redesign

- [x] **UI-001**: Replace "CHECK" text on card backs with a diamond grid geometric pattern to avoid confusion with the Call CHECK action

### 29. Card Selection Lift

- [x] **UI-002**: Selected cards lift upward (translateY -12px) to visually indicate selection state

### 30. Safe Area Handling

- [x] **UI-003**: Add `env(safe-area-inset-bottom)` padding and `viewport-fit=cover` meta tag for mobile notch/nav bar protection

### 31. Haptic Feedback

- [x] **UI-004**: Trigger vibration API — success pulse on burn success, warning double-pulse on penalty, subtle tap on draw/swap

### 32. Final Round Banner

- [x] **UI-005**: Sticky high-contrast red banner when CHECK is called: "[NAME] CALLED CHECK — FINAL TURN"

### 33. Red Card Flash Effect

- [x] **UI-006**: Brief full-screen red tint/flash overlay when a Red J/Q/K special effect triggers

### 34. Framer Motion Transitions

- [x] **UI-007**: Modal slide-in animations via `motionPreset="slideInBottom"` on all game modals
- [x] **UI-008**: Card flip animation (CSS 3D rotateY) for initial peek and Red Queen peek reveals
- [x] **UI-009**: Replace green boxShadow glow with CSS animated gradient sweep (top→bottom, ~2s) on card swap for opponent and own hand
- [x] **UI-010**: Remove hold-to-take from discard pile — simple tap/click to take instead of 2-second long press
- [x] **UI-011**: Remove all in-game toast notifications except Red Jack swap notification and error toasts
- [x] **UI-012**: Show both "End Game" and "Start Next Round" buttons immediately for host in round-end modal
- [x] **UI-013**: Replace CHECK IconButton with text `<Button size="xs">CHECK</Button>` in header
- [x] **UI-014**: Remove "Room: XXXXX" from game header
- [x] **UI-015**: Add sound toggle — localStorage-persisted (`checkgame_sound_enabled`), Switch control in hamburger menu
- [x] **UI-016**: New theme colors — purple/dark tonal palette with primary `#6c55c9`, surface tonal `#1b1922`, success `#47d5a6`, warning `#d7ac61`, danger `#d94a4a`

### 35. Desktop Layout Improvements

- [x] **UI-017**: Desktop opponent display — clean layout without bordered box, larger opponent cards
- [x] **UI-018**: Desktop player hand cards — `lg` size (100x140) on desktop, `md` (80x112) on mobile
- [x] **UI-019**: Desktop header — inline pause/sound/exit icon buttons alongside menu button
- [x] **UI-020**: Move How to Play from header icon into the game menu modal
- [x] **UI-021**: Use `thumbnail.png` as browser tab favicon
- [x] **UI-022**: Fix homepage vertical scroll — `h="100dvh"` + `overflow="hidden"`

### 36. CardBack Compact Sizes & Header Polish

- [x] **UI-023**: Add `2xs` (20x28) and `xs` (36x50) sizes to CardBack with compact rendering (no inner frame/center diamond)
- [x] **UI-024**: Use CardBack components for opponent face-down cards — `xs` on desktop, `2xs` on mobile
- [x] **UI-025**: Enlarge desktop header — increased padding, font sizes, icon button sizes, and spacing
- [x] **UI-026**: Replace fullscreen pause overlay with inline PAUSED header badge — menu stays open when toggling pause/resume

---

## Phase 2: Post-MVP

### Stability

- [x] **F-200**: Reconnection logic — save state to DB, rejoin after disconnect, resume from current state
- [x] **F-201**: Disconnection timeout — auto-kick after timeout (45s grace period)
- [x] **F-202**: Room expiration (24 hours)
- [x] **F-203**: Host can kick players
- [ ] **F-204**: Spectator mode

### Cloud Deployment

- [x] **F-250**: Cosmos DB compatible database connection
- [x] **F-251**: Verify aggregation pipelines for Cosmos DB
- [x] **F-252**: Server production build configuration
- [x] **F-253**: CORS hardening for production
- [x] **F-254**: Azure App Service deployment configuration
- [x] **F-255**: Client production build with configurable server URL
- [x] **F-256**: Static Web App configuration (SPA fallback)
- [x] **F-257**: Azure Static Web Apps deployment
- [x] **F-258**: GitHub Actions CI pipeline
- [x] **F-259**: GitHub Actions CD — server deploy
- [x] **F-260**: GitHub Actions CD — client deploy
- [x] **F-261**: Rate limiting on REST endpoints
- [x] **F-262**: Security headers and compression
- [x] **F-263**: Structured logging
- [x] **F-264**: Global error handling middleware

### Pause Game

- [x] **F-270**: Add paused, pausedBy, pausedAt, turnTimeRemainingMs to server GameState
- [x] **F-271**: Add paused, pausedBy to ClientGameState
- [x] **F-272**: pauseGame socket event handler (host-only)
- [x] **F-273**: resumeGame socket event handler (host-only, restore timer)
- [x] **F-274**: gamePaused / gameResumed broadcast events
- [x] **F-275**: Block all game actions while paused
- [x] **F-276**: startTurnTimerWithDuration for resume with remaining time
- [x] **F-277**: Pause/Resume button (host-only, top-right)
- [x] **F-278**: Pause overlay with "Game Paused" message
- [x] **F-279**: Freeze turn timer display while paused
- [x] **F-280**: Toast notifications for pause/resume
- [x] **F-281**: Sanitize pause fields in client game state
- [x] **F-282**: Add pause fields to GameState Mongoose schema

### UX Improvements

- [x] **F-320**: Lobby reconnection fix — `rejoinRoom` supports fresh-tab / lobby-refresh path (no grace period required)
- [x] **F-321**: Client rejoin navigation — navigate to `/room` when rejoining a lobby, `/game` when rejoining a game
- [x] **F-322**: Undo take-from-discard — `undoTakeDiscard` server action and socket handler; undo button on GameBoard when `drawnFromDiscard`
- [x] **F-323**: Long-press discard take — 2-second hold required to take from discard pile; visual progress overlay
- [x] **F-324**: How to Play modal — accessible from home page; covers goal, setup, card values, turn actions, special effects, scoring
- [x] **F-325**: MongoDB local setup guide — `MONGODB_SETUP.md` with install instructions for macOS, Ubuntu, Windows, and Docker

### Future Enhancements

- [x] **F-300**: Bot players — basic AI strategy, fill empty slots
- [x] **F-301**: Bot difficulty levels
- [ ] **F-302**: User accounts — email/password registration
- [x] **F-304**: Player profiles and avatar selection — avatar picker on home page, display in lobby/game
- [x] **F-305**: Room expiration (24 hours)
- [x] **F-306**: Host can kick players
- [x] **F-308**: Card draw/discard/flip animations
- [x] **F-309**: Victory animations
- [x] **F-310**: Custom target scores (configurable game end threshold)
- [ ] **F-311**: Tournament mode — bracket/round-robin tournament system with lobby, progression tracking, and bracket display
- [ ] **F-312**: Friend system and direct invites — friend list, friend requests, direct game invites via socket

### Bot Enhancements

- [x] **F-314**: Bot difficulty simplified to Easy/Expert (removed medium/hard)
- [x] **F-315**: Randomized European bot names with collision avoidance
- [x] **F-316**: Distinct purple styling and BOT badge for bot players in-game
- [x] **F-317**: Target score slider (50–150 range, step 5)

### Bug Fixes

- [x] **F-318**: Fix bots not playing on their turn — emitYourTurn no longer skips timer for bots
- [x] **F-319**: Fix game stuck on bot timeout — proper timeout handling for pending draws/effects
- [x] **F-330**: Fix green glow effect clipping on current player's hand cards
- [x] **F-331**: Fix bot turn timer duplication — emitYourTurn only starts timer for human players; bot turns managed by botScheduler
- [x] **F-360**: Fix bot stuck after pause/resume — resumeGame handler must call scheduleBotTurnIfNeeded when current turn is a bot
- [x] **F-361**: Fix multi-tab disconnect — registerPlayer cleans up orphan socket entries; unregisterPlayer guards against removing newer tab's mapping

### Room & Game Stability

- [x] **F-340**: Lobby disconnect grace period — 60s grace period for lobby disconnects (page refresh, tab switch) instead of immediate removal
- [x] **F-341**: localStorage session persistence — session credentials survive tab close and browser restart (migrated from sessionStorage)
- [x] **F-342**: Mid-turn state restoration on rejoin — drawnCard, drawnFromDiscard, and pendingEffect restored when player reconnects during their turn
- [x] **F-343**: URL-based game rejoin — `/game/:roomCode` route allows players to rejoin by navigating directly to the game URL
- [x] **F-344**: rejoinWithCode context method — SocketContext exposes rejoinWithCode for programmatic room rejoin with full state restoration
- [x] **F-345**: Host reassignment skips bots — when host disconnects, new host is always a human player; room deleted if only bots remain
- [x] **F-346**: Max 5 simultaneous rooms — createRoom rejects with error if 5 rooms already exist
- [x] **F-347**: Fix bot turns silently failing — inverted validatePlayerTurn check in botScheduler caused all bot actions to exit immediately
- [x] **F-348**: Fix stale human turn timer firing for bot turns — clearTurnTimer called before bot guard in emitYourTurn to prevent old timers from timing out bots
- [x] **F-349**: Fix emitYourTurnFromBot timer cleanup — clear previous timer before starting safety timer for next player's turn
- [x] **F-350**: Fix human turn unresponsive after bot plays — bot cardDrawn broadcast set drawnCard to undefined on human client, blocking all actions until page refresh
- [x] **F-351**: Fix emitYourTurnFromBot timer for human players — only start 30s turn timer when next player is human, not for bots (bots use scheduleBotTurnIfNeeded)
- [x] **F-352**: Fix stale score on player removal — removePlayerFromGame now deletes removed player's entry from gameState.scores to prevent phantom game-end triggers

### Notification System

- [x] **F-361**: Notification overhaul — replace distracting toasts with subtle inline banners/snackbar, add close button to all notifications
- [x] **F-362**: Fix duplicate notifications — prevent same notification from showing twice

### Tablet & iPad Optimization

- [x] **F-370**: Tablet-responsive card sizes — use `lg` breakpoint (992px) to differentiate tablet from desktop; increase card sizes for iPad/tablet viewports
- [x] **F-371**: Tablet board space — increase padding, gaps, and opponent card sizes for tablet breakpoints; lift maxW constraint
- [x] **F-372**: Tablet opponent display — larger opponent card backs and username font on tablet

### Player Profiles & Social

- [x] **F-304**: Player profiles and avatar selection — avatar picker on home page, display in lobby/game
- [x] **F-363**: Country flag from IP — detect player country via IP geolocation on connect, display flag emoji in lobby/game

### Mid-Game Join & Host Management

- [x] **F-364**: Mid-game join — allow players to join active games if capacity remains; new joiners get highest current score and are dealt 4 cards
- [x] **F-365**: Host player management menu — in-game hamburger menu for host to kick players or manage access during gameplay

### Lobby Ready Toggle

- [x] **F-366**: Lobby ready toggle — non-host players must toggle ready before host can start; bots auto-ready; ready status badges in lobby UI
- [x] **F-367**: Start game readiness validation — server rejects startGame when any non-host human player is not ready

### Round Transition Timer

- [x] **F-368**: Host-triggered round countdown — host clicks "Next Round" to start 5-second countdown with audio cue; server auto-starts next round after countdown; non-hosts see "Waiting for host..."
- [x] **F-369**: Cancel round countdown — endGame handler cancels pending countdown; host can end game during countdown

### Round-End UI Polish

- [x] **UI-027**: Card point values on round-end/game-end cards — small score label in bottom-right corner of each card; red 10s (0 pts) highlighted in green

### Rejoin Stabilization

- [x] **F-380**: Peek phase restoration on rejoin — peekedCards returned in rejoinRoom callback when game is in peeking phase, client restores them in both rejoin paths
- [x] **F-381**: Double rejoin deduplication — rejoinInFlightRef prevents duplicate rejoinRoom emissions when main connect handler and rejoinWithCode fire concurrently
- [x] **F-382**: Faster host reassignment on disconnect — host immediately reassigned to next human player on disconnect (not blocked for entire grace period); restored to original player on rejoin

---

## UI Reskin

Design system source of truth: `reskin/` folder (spec MD + two HTML mockups). Skill: `design-system`.

### 37. High Priority Reskin (🔴)

- [x] **RS-001**: Turn timer — replace thin progress bar with circular SVG countdown ring (36×36px, r=14); green > amber > red color transitions at 60%/30%; numeric seconds inside ring
- [x] **RS-002**: Red King modal UX — numbered step indicator (Step 1 / Step 2); gold ring on selected drawn card; disable confirm until both selections made; all three option buttons neutral outline (no yellow bias)
- [x] **RS-003**: CHECK button redesign — gold (`#c9a227`) top-bar button replacing current salmon style; confirmation tooltip on hover/tap explaining effect
- [x] **RS-004**: Room code input distinct styling — uppercase monospace, gold typed text, letter-spacing; Join Room button disabled until characters typed

### 38. Medium Priority Reskin (🟡)

- [x] **RS-005**: Table center zone — visually distinct felt-surface area (`#13191a` bg, `#1a2a22` border, 14px radius) grouping draw pile, discard pile, and timer
- [x] **RS-006**: Burn action feedback — success animation/banner ("✓ Burned!"); failure inline banner ("✗ No match! +1 penalty card"); penalty card slot highlighted on arrival
- [x] **RS-007**: Known vs unknown card distinction — gold border + eye badge (14×14px gold circle with SVG eye icon) on cards the player has peeked at
- [x] **RS-008**: Lobby slider labels — show `30` and `100` at track ends; Start Game button visually disabled until ≥2 players/bots present
- [x] **RS-009**: Lobby dot color system + kick hover-only — green = human online, purple = bot, gray = empty; kick ✕ hidden at rest, red on hover
- [x] **RS-010**: Menu sound default ON + Exit Game danger styling — sound toggle defaults to on (green); Exit Game uses full red/danger treatment with divider above

### 39. Low Priority Reskin (🟢)

- [x] **RS-011**: Landing page logo glow + focus states — radial glow pulse beneath logo; gold/purple inner glow on username input focus
- [x] **RS-012**: Opponent card size + count badge — increase mini card visibility; count badge showing card count on each opponent panel
- [x] **RS-013**: Polish animations — staggered card deal at round start; 3D flip on peek/round-end reveal; full-width CHECK announcement banner
- [x] **RS-014**: Menu score summary panel — running scores for all players visible inside the in-game menu

### 40. Multi-Player Layout (🔴)

- [x] **RS-015**: Mobile slim opponent rows — replace card-based opponent display with 30px slim horizontal rows (turn pip, avatar, name, card count pips, score); active/danger states with 2px left accent bar
- [x] **RS-016**: Mobile score bar — horizontal scrolling pill strip between opponent list and table; "You" pill in purple, opponent pills with colored avatar dots, danger pills in red
- [x] **RS-017**: Desktop oval 3-column grid — CSS grid layout (1fr 1fr 1fr) with top arc opponents, left/right side opponents, center table surface, bottom hand zone, and score strip
- [x] **RS-018**: Discard history strip — last 5 discards shown as mini cards inside table surface (mobile: 20×28px, desktop: 30×42px); newest at full opacity, older at 35%

---

**Total Phase 2 Features:** 54  
**UX Improvements:** 17  
**Bot, Bug Fixes & Stability:** 22  
**Notifications:** 2  
**Tablet Optimization:** 3  
**Player Profiles & Social:** 2  
**Mid-Game & Host Management:** 2  
**Lobby Ready Toggle:** 2  
**Round Transition Timer:** 2  
**Round-End UI Polish:** 1  
**Rejoin Stabilization:** 3  
**UI Reskin:** 18  
**Document Version:** 1.14  
**Last Updated:** 2026-03-17

---

### 41. Chat Feature (🔴)

- [x] **CHAT-001**: Server chat handlers — in-memory `chatStore` (Map, 200-msg cap per room), `sendChatMessage` socket handler (validates room membership, sanitizes text, broadcasts `chatMessage`), `getChatHistory` socket handler; unit tests for all store functions
- [x] **CHAT-002**: SocketContext chat integration — `chatMessages` state, `lastChatMessage` state (drives toast preview), `sendChatMessage()` method, `getChatHistory()` method, `clearLastChatMessage()` helper; `chatMessage` socket event listener
- [x] **CHAT-003**: ChatDrawer component — slide-up drawer with 4 snap states (closed/peek/half/full), drag gesture handling with velocity-based close, backdrop with proportional opacity, header with player avatars, message list with auto-scroll + "↓ new messages" pill, consecutive message grouping, system event pills, empty state, input row with send button, quick-react chips strip, Escape key handler, popIn animation on new bubbles
- [x] **CHAT-004**: GameBoard integration — chat bubble button in top bar (next to emoji button), unread badge (red pill, capped at `9+`), toast preview (slide-up pill with sender name + text, 3s auto-dismiss, tap to open drawer)

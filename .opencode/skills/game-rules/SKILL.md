---
name: game-rules
description: Complete Check Card Game rules, mechanics, card values, turn actions, special effects, and scoring reference for accurate implementation
---

## Overview

Check Card Game is a multiplayer card game for 4-6 players. The goal is to have the lowest card value sum when a round ends. Players manage a hand of face-down cards they must remember, and can call "check" to trigger the final round.

---

## Setup

- Standard 52-card deck
- 4-6 players per game
- Each player is dealt 4 cards face down into slots A, B, C, D
- At game start, each player peeks at exactly 2 of their 4 cards (randomly chosen by server), then all cards go face down
- Players must remember which cards they saw and in which slots
- First player is chosen randomly

---

## Card Values

| Card                            | Value     |
| ------------------------------- | --------- |
| Red 10 (hearts 10, diamonds 10) | 0 points  |
| Ace                             | 1 point   |
| 2                               | 2 points  |
| 3                               | 3 points  |
| 4                               | 4 points  |
| 5                               | 5 points  |
| 6                               | 6 points  |
| 7                               | 7 points  |
| 8                               | 8 points  |
| 9                               | 9 points  |
| Black 10 (spades 10, clubs 10)  | 10 points |
| Jack (all suits)                | 10 points |
| Queen (all suits)               | 10 points |
| King (all suits)                | 10 points |

---

## Turn Flow

At the start of a player's turn, BEFORE taking any action, the player may optionally call "CHECK" to initiate the final round. The checker still takes their normal turn action afterward.

Then the player must choose exactly ONE of 3 actions:

### Action 1: Draw from Deck (Blind Draw)

1. Player draws 1 card from the top of the draw pile (face down, blind)
2. Player sees the drawn card privately
3. Player must discard exactly 1 card:
   - Either discard the drawn card itself (keep hand unchanged)
   - Or replace a card in hand with the drawn card (discard the hand card)
4. The discarded card goes to the discard pile
5. If the discarded card is a Jack, Queen, or King (any suit) that was JUST DRAWN from the deck, its special effect triggers (see Special Effects below)

### Action 2: Take from Discard Pile

1. Player takes the top visible card from the discard pile
2. Player must discard exactly 1 card from their hand to the discard pile
3. The taken card replaces the discarded card's slot
4. No special effects trigger from this action

### Action 3: Burn a Card

1. Player selects a card from their hand to attempt to burn
2. The selected card's RANK must match the RANK of the top card on the discard pile
   - Number cards: exact match (7 matches 7, 3 matches 3)
   - Face cards: exact face match (J matches J, Q matches Q, K matches K)
   - Color/suit does NOT matter for matching
3. **Success** (ranks match):
   - The card is removed from the player's hand and placed on the discard pile
   - Player's hand shrinks by 1 card
4. **Failure** (ranks do NOT match):
   - The card stays in the player's hand (returned to its slot)
   - Player draws 1 penalty card from the draw pile
   - Penalty card is added to the hand as a new slot (E, F, G, etc.)
   - Player does NOT see the penalty card (it is face down)
5. No special effects trigger from burning, even if burning a red face card

---

## Special Effects (Face Cards — All Suits)

Special effects ONLY trigger when:

- The card is drawn from the DECK (Action 1)
- AND the player chooses to discard that drawn card (not keep it)

Special effects NEVER trigger:

- When burning a card (Action 3)
- When taking from discard pile (Action 2)
- When discarding a card from hand that was not just drawn

### Jack (All suits — Hearts, Diamonds, Spades, Clubs)

- **Effect**: Swap one of your cards with any opponent's card
- **This is optional** - the player can choose to skip the swap
- **Blind swap**: Neither player sees what card was swapped
- The player chooses:
  1. One of their own slots (A, B, C, D, E...)
  2. A target opponent
  3. One of the target opponent's slots
- The cards are swapped without being revealed to either player

### Queen (All suits — Hearts, Diamonds, Spades, Clubs)

- **Effect**: Peek at one of your own face-down cards
- The player chooses one of their own slots to peek at
- Only the player sees the card (privately)
- The card stays in its slot

### King (All suits — Hearts, Diamonds, Spades, Clubs)

- **Effect**: Draw 2 additional cards from the deck
- Only the player sees the 2 drawn cards
- The player then chooses one of three options:
  1. **Return both**: Both drawn cards go back to the draw pile (shuffled back in). No hand changes.
  2. **Keep 1**: Keep 1 drawn card, replace 1 card from hand. The replaced hand card goes to discard pile. The other drawn card goes back to draw pile (shuffled in).
  3. **Keep 2**: Keep both drawn cards, replace 2 cards from hand. Both replaced hand cards go to discard pile.

---

## Super Powers

### Free Burn

- **How to earn**: Score a perfect round — finish a round with a hand sum of exactly **0 points** (e.g., all red 10s)
- **What it does**: Allows the player to burn **any card** from their hand regardless of the top discard card's rank. No rank matching required — the burn always succeeds.
- **One-time use**: The Free Burn token is consumed when used, whether the card would have matched or not
- **Persists across rounds**: The token carries over to the next round if not used
- **Visible to all**: All players can see who has a Free Burn token
- **UI indicator**: A gold "Free Burn" pill is shown below the player's hand; tapping it opens an info modal explaining the power

---

## Hand Management

- Players start with 4 cards in slots A, B, C, D
- Hand can GROW via penalty cards (failed burns add slot E, F, G, H...)
- Hand can SHRINK via successful burns (card removed, slot disappears)
- Slot labels persist with their cards - if slot B is burned, remaining slots are still A, C, D (not re-labeled)
- Players must remember their cards - they cannot look at face-down cards without a Red Queen peek
- The order/position of cards matters for swaps and burns

---

## Check Mechanism

1. A player calls "CHECK" at the START of their turn, BEFORE taking any action
2. The checker then takes their normal turn action (draw, take discard, or burn) as usual
3. Play continues in normal turn order — each remaining player gets exactly one more turn
4. When it is the checker's turn again, the round ends immediately (no action taken)
5. All players reveal their hands simultaneously

---

## Scoring

1. After reveal, calculate the sum of all card values in each player's hand
2. The player with the LOWEST sum wins the round
3. The winner adds 0 points to their total score
4. All OTHER players add their hand sum to their total score
5. Scores accumulate across rounds

### Game End Condition

- The game ends when any player's total score reaches **70 or more points** (default; configurable 50–150 via lobby slider)
- That player LOSES the game
- The player with the LOWEST total score at that point wins

---

## Edge Cases

### Draw Pile Empty

- When the draw pile runs out, take all cards from the discard pile EXCEPT the top card
- Shuffle those cards to form a new draw pile
- The top discard card remains as the only card in the discard pile

### Tie on Round Score

- If multiple players tie for lowest sum, all tied players score 0 for the round
- All non-tied players still add their sums

### Hand Size Zero

- If a player successfully burns all their cards, they have 0 cards and a score of 0 for that round
- They can still call check

### Multiple Players Hit 70+

- If multiple players reach 70+ (or the configured threshold) in the same round, the one with the highest score loses
- If tied at 100+, all tied players lose

---

## Important Implementation Notes

- The server is AUTHORITATIVE for all game logic - never trust the client
- Card visibility must be enforced server-side: players should only receive card data they are allowed to see
- Other players' cards should be sent as hidden/masked objects (only card count and slot labels)
- The initial 2-card peek slots should be randomly selected server-side
- Red King return-to-deck cards must be shuffled back into random positions in the deck
- Penalty cards from failed burns are drawn face-down - the player does NOT see them
- Free Burn tokens are awarded by `computeRoundResult` (Scoring.ts) and carried over between rounds by `executeStartNextRound` (gameHandlers.ts)

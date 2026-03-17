# Check Card Game — Layout Specifications
## Mobile (6-Player) & Desktop/Tablet Views

---

## Part 1: Mobile Layout — 6 Players

### Overview

The mobile layout is a single vertical column divided into four zones stacked top to bottom: the top bar, the opponent list, the table center, and the player hand. With 6 players (5 opponents), every zone must be space-efficient without sacrificing readability or gameplay clarity.

---

### Zone 1: Top Bar

The top bar is a fixed-height strip (~38px) pinned to the top of the screen at all times. It contains three elements:

- **Left:** Round indicator — "Round: 1" in small muted text
- **Center/Right:** CHECK button — gold background (`#c9a227`), dark text, small padding. This is always visible regardless of scroll position.
- **Far right:** Hamburger menu icon (☰) to open the in-game menu

The top bar never scrolls away. Its background is slightly elevated (`#13131a`) with a subtle bottom border to separate it from the content below.

---

### Zone 2: Opponent List

This is the most significant change from the 2-player layout. Rather than stacking opponents into chunky cards or a 2+3 grid, each opponent occupies a single slim horizontal row approximately **30px tall**. All 5 opponents fit within roughly 165px of vertical space — compact enough to leave the table and hand zones fully visible without any scrolling.

#### Row Structure

Each opponent row contains the following elements left to right:

1. **Turn pip** — a 5px circular dot, gold (`#c9a227`) when it is that player's turn, invisible otherwise. This sits at the very left edge of the row before the avatar.
2. **Avatar circle** — 20px diameter, colored by player with initials (2 characters). Color assignments are consistent across the session so each player always has the same color identity.
3. **Player name** — 11px medium weight, truncated with ellipsis if too long. BOT players show a small inline tag in muted purple after the name.
4. **Card count pips** — a row of small rectangles (9×13px each) representing the number of cards currently in that player's hand. These shrink and disappear as cards are burned. No number label is needed — the visual count is immediately readable.
5. **Score** — right-aligned, 10px, color-coded by urgency (see Danger State below).

#### Row Height and Spacing

- Row height: ~30px
- Internal vertical padding: 4px top and bottom
- Rows are separated by a 0.5px border in `#13131e` (barely visible, just enough to delineate rows)
- No external padding between the list and the top bar — the list sits flush below the top bar border

#### Section Header

A minimal two-column header sits above the row list: "opponents" label on the left (9px, uppercase, `#333`) and the count "5 / 5" on the right in very muted text. This header is 5px tall and purely informational.

#### Turn State

When it is a specific opponent's turn:

- The row receives a **2px gold left accent bar** (`#c9a227`) using an `::before` pseudo-element spanning the full row height
- The row background shifts to a very subtle warm tint (`#17150a`)
- The turn pip becomes visible (gold dot)
- No other changes — the row height stays the same

#### Danger State

When a player's score reaches a threshold indicating they are close to the loss condition (e.g. 75 points or above, exact threshold configurable):

- The row receives a **2px red left accent bar** (`#cf5e5e`)
- The row background shifts to a very subtle red tint (`#140a0a`)
- The score text turns red and appends a `!` character (e.g. "87 !")
- If both turn state and danger state apply simultaneously, danger takes visual priority (red bar overrides gold)

#### Avatar Color System

Each player is assigned a color at session creation and it never changes mid-game. Suggested palette:

| Color name | Avatar bg | Initials color | Use for |
|---|---|---|---|
| Green | `#1a3a2a` | `#5ecf5e` | Player 1 |
| Blue/Purple | `#1a1a3a` | `#7a7aee` | Player 2 / Bots |
| Red | `#3a1a1a` | `#cf5e5e` | Player 3 |
| Gold | `#2a1f00` | `#c9a227` | Player 4 |
| Teal | `#0a2a2a` | `#5ecfcf` | Player 5 |
| Pink | `#2a1a2a` | `#ee7aee` | Player 6 |

The same color is used in the score strip, discard history attribution (if implemented), and any toast notifications referencing that player.

---

### Zone 3: Table Center

The table center is the visual heart of the game — a dark inset surface (`#0a0a10` background) that holds the timer, the draw pile, the discard pile, and the discard history strip. It stretches to fill all remaining vertical space between the opponent list and the player hand.

#### Timer

The timer sits at the top of the table surface as a row containing:

- A **30px circular SVG ring** on the left. The ring depletes clockwise as time runs out. Color transitions:
  - Green (`#4ecb4e`) when more than 50% time remains
  - Amber (`#c9a227`) between 20–50%
  - Red (`#cf5e5e`) below 20%, with a subtle pulse animation
- A **text countdown** (e.g. "28") rendered inside the ring at 9px
- A **thin progress bar** (4px height) to the right of the ring for players who prefer a linear indicator. It uses the same color transitions as the ring.
- A **status label** above the bar: "your turn · 28s" when it is the player's turn, or "[Player name]'s turn" during other turns. The label is 10px and matches the timer color.

#### Draw and Discard Piles

The two piles sit centered side by side with a subtle bidirectional arrow (⇄) between them. Cards are 48×66px on mobile.

**Draw pile:**
- Rendered as a face-down card back (purple/indigo pattern)
- A small label beneath reads "draw · N left" where N is the current deck count
- Tapping the draw pile initiates the draw action

**Discard pile:**
- Rendered face-up showing the top card's rank and suit
- Red suits use `#c0392b`, black suits use `#222`
- Corner rank/suit labels are shown in all four corners (top-left and bottom-right mirrored)
- A small "discard" label sits beneath
- Tapping the discard pile selects it for a swap action (see interaction flows)

When the draw pile is low (fewer than 6 cards remaining), the count label turns amber as a reshuffle warning.

#### Discard History Strip

This is a new element not present in the original design. It sits below the pile area inside the table surface and shows the **last 5 discarded cards** in chronological order, oldest to newest (left to right).

**Visual treatment:**
- Each history card is 20×28px with a 3px border radius
- Cards are rendered as mini face-up cards with rank+suit text at 7px
- The oldest 4 cards are rendered at **35% opacity** (faded)
- The most recent card (rightmost) is rendered at **full opacity** — this matches the current top of the discard pile visually, reinforcing continuity
- A small "recent:" label in very muted text (`#2a2a3a`) precedes the strip on the left

**Why this matters:**
The discard history gives players critical strategic information. Knowing what cards were recently discarded helps players decide whether to burn (they can see if a matching rank was recently discarded), whether to take from the discard pile, and whether to call CHECK. In the original design this history is completely invisible, forcing players to rely on memory for information that should be visible.

**Implementation note:** The history only needs to persist for the current round. It resets at the start of each new round. The strip does not scroll — only the last 5 cards are shown. If fewer than 5 cards have been discarded so far in the round, the strip shows only what's available, left-aligned.

---

### Zone 4: Player Hand

The player hand sits anchored at the bottom of the screen. On mobile with 6 players, the hand maintains the same card size as the 2-player layout (48×66px) to ensure cards remain tappable.

- Cards are arranged in a single horizontal row, centered
- Slot labels (A, B, C, D) sit below each card at 9px
- Known cards (previously peeked) show a gold border and a small eye badge (12px gold circle with an eye SVG) in the top-right corner of the card
- Unknown cards have a plain purple/indigo back with no badge
- A single line of hint text at 9px in very muted text sits below the row: "tap draw pile · tap discard then hand · tap card to burn"

If a player's hand grows beyond 4 cards (due to failed burns), additional slots (E, F, etc.) are added to the right. If the row exceeds the screen width, the hand row becomes horizontally scrollable with a subtle fade mask on the right edge indicating overflow.

---

### Vertical Space Budget (approximate, 640px total screen height)

| Zone | Height |
|---|---|
| Top bar | 38px |
| Opponent list header | 18px |
| 5 opponent rows × 30px | 150px |
| Table center (flexible) | ~310px |
| Player hand zone | ~124px |
| **Total** | **~640px** |

This budget leaves the table center with enough room for the timer, both piles at full size, and the discard history strip without any scrolling required.

---

---

## Part 2: Desktop / Tablet Layout

### Overview

The desktop layout abandons the vertical column entirely in favor of an **oval table metaphor** — the most natural spatial arrangement for a card game. Players are distributed around the table, the game surface occupies the center, and the local player's hand anchors the bottom. This layout targets screens 768px and wider.

---

### Structural Grid

The layout uses a 3-column, 3-row CSS grid:

```
[ left opponent ]  [ table center ]  [ right opponent ]
[ left opponent ]  [ table center ]  [ right opponent ]
[         player hand (full width)                    ]
```

With 6 players (5 opponents), the positions are:

- **Top row (spans all 3 columns):** 3 opponents sitting "across the table"
- **Middle left column:** 1 opponent on the left side
- **Middle center column:** The game table surface
- **Middle right column:** 1 opponent on the right side
- **Bottom row (spans all 3 columns):** The local player's hand

This creates a natural oval seating arrangement where opponents feel positioned around the table rather than stacked in a list.

---

### Top Bar (Desktop)

Same elements as mobile but with more breathing room:

- **Left:** Round indicator + player count ("Round: 1 · 6 players")
- **Right:** CHECK button (gold) and menu icon
- Height: ~40px
- Background: `#13131a` with bottom border

---

### Top Opponent Cards (3 players)

The 3 opponents across the top are displayed as compact cards (~110px wide each) arranged horizontally with equal spacing. Each card contains:

- **Header row:** Avatar circle (30px) + player name + score
- A "TURN" badge in gold replaces the turn pip when it is that player's turn
- A "BOT" badge in muted purple for bot players
- **Card count row:** A row of mini card rectangles (16×22px) showing hand size
- The active turn card gets a subtle warm background tint and gold border

---

### Side Opponent Cards (1 player each side)

The left and right opponents each get a slightly taller card that includes:

- Avatar (30px) + name + score in a header row
- Score below name at 11px in muted color
- A row of mini card backs (16×22px) showing hand size below
- For the danger state (near loss threshold): red border on the card, red score text with "danger!" appended

The side columns are approximately 140px wide, leaving the center table column with ~460–480px of width on a 780px frame.

---

### Table Center (Desktop)

The center table surface is the largest element on screen. It is a dark inset panel with a slightly green-tinted border to evoke a card table felt surface.

#### Timer (Desktop)

Same ring + bar design as mobile but scaled up:

- Ring: 36px diameter
- Bar: 5px height, full width of the timer row
- Status label: 11px, "your turn · 28s" or opponent name during their turn

#### Draw and Discard Piles (Desktop)

Cards scale up to **62×86px** on desktop — noticeably larger than mobile. The increased size makes suits and ranks easier to read from a distance and gives the table more visual weight. The ⇄ separator between piles is slightly larger.

Labels beneath each pile are 10px:
- Draw pile: "draw pile" + "N cards" on separate lines
- Discard pile: "discard"

#### Discard History Strip (Desktop)

The same concept as mobile but with larger history cards:

- Each history card: 30×42px
- Last 5 discards shown, oldest faded to 35% opacity
- Most recent at full opacity
- Label: "last discards:" in muted text to the left
- Cards are rendered centered within the table surface, below the pile area

On desktop the larger card size means rank and suit text is more readable — history cards use 10px text versus 7px on mobile. This makes the history strip genuinely useful for tracking ranks when deciding whether to attempt a burn.

**Strategic value on desktop:** With a larger screen, players can comfortably read the discard history at a glance without leaning in. The history strip should be considered a core information layer on desktop, not a secondary detail. Consider expanding to show the last 7 cards on desktop if horizontal space allows.

---

### Player Hand (Desktop)

The player hand spans the full bottom width of the frame in its own row.

- Cards scale to **64×88px** — the largest size in the game
- Slots are labeled A, B, C, D at 11px below each card
- Known cards show gold border + 14px eye badge
- Cards have a `:hover` lift animation (translateY -4px + border brightening) since desktop users have precise cursor control
- Hint text at 11px in very muted color: "click draw pile to draw · click discard then a card to swap · click a card to attempt burn"
- The hand zone has its own slightly elevated background panel (`#13131a`) with a rounded top border to visually anchor it as the player's personal area

---

### Score Strip (Desktop)

A persistent score strip is pinned to the very bottom edge of the game frame, below the player hand. It contains a pill for each player showing:

- A 6px colored dot (matching their avatar color)
- Player name in muted text
- Score value in slightly brighter text

The local player's pill uses the purple accent color for name and score to stand out. Players near the loss threshold have their pill rendered in red. The strip is separated from the hand zone by a 0.5px border.

This strip is always visible — it never scrolls or disappears — giving every player a persistent standings overview without interrupting the game flow.

---

### Tablet Considerations (768–1024px)

On tablets the same grid layout applies but with adjusted proportions:

- Side columns shrink to ~120px
- Center table column gets priority width
- Cards in hand may reduce to 58×80px if the frame is below 700px wide
- The top opponent cards may stack to a 2+1 arrangement if the top row becomes too narrow (below 600px)
- The score strip remains full width but pill text reduces to 10px

The layout should never collapse into the mobile single-column layout until the screen width drops below 640px.

---

### Responsive Breakpoints Summary

| Screen width | Layout |
|---|---|
| < 640px | Mobile single column |
| 640–767px | Mobile single column (wider, more breathing room) |
| 768–1023px | Desktop oval grid, reduced card sizes |
| 1024px+ | Desktop oval grid, full card sizes, expanded discard history |

---

## Summary of Key Changes vs Original Design

| Feature | Original | Mobile 6-player | Desktop |
|---|---|---|---|
| Opponent display | Single chip block | 5 slim rows, 30px each | Oval placement, 3 top + 1 each side |
| Turn indicator | None visible | Gold left accent bar | Gold "TURN" badge on card |
| Danger indicator | None | Red left accent bar + red score | Red card border + red score |
| Card sizes (hand) | Small (~40px wide) | 48px wide | 64px wide |
| Discard history | Not present | Last 5 cards, 20×28px | Last 5–7 cards, 30×42px |
| Score visibility | Bottom footer only | Inline in opponent rows | Persistent score strip |
| Timer | Thin green bar | Ring + bar, color transitions | Ring + bar, color transitions |
| Layout direction | Single column | Single column | 3-column oval grid |

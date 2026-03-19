# Chat Drawer — Design Specification

**Component:** Slide-up chat drawer for multiplayer card game  
**Platform:** Mobile-first (portrait), progressive enhancement for tablet  
**Version:** 1.0

---

## Overview

A persistent but non-intrusive chat panel that slides up from the bottom of the screen. The game remains visible and dimmed behind the drawer. Players can read and send messages without leaving the game context.

---

## Trigger & Entry Point

### Bottom bar tab
- The game's existing bottom bar gains a **Chat** tab on the right side
- Tab displays: chat bubble icon + label `"chat"`
- **Unread badge:** red pill above the icon showing unread count (`1–9`, then `9+`)
- Badge disappears when drawer is opened
- When a new message arrives and drawer is closed, a **toast preview** slides up 40px above the bottom bar for 3 seconds, then fades out

### Toast preview
```
╭─────────────────────────────╮
│  FE  Felix: gg no way lol   │
╰─────────────────────────────╯
```
- Height: 36px
- Background: `#1a1a2e` with `0.5px` border `#2a2a50`
- Border radius: `18px` (pill)
- Font size: `12px`, color `#c8c8e8`
- Player initials avatar on the left (14×14px)
- Auto-dismisses after `3000ms`
- Tapping the toast opens the drawer

---

## Drawer Anatomy

```
┌─────────────────────────────────┐  ← phone edge
│         [game content]          │  ← dimmed to 35% opacity
│                                 │
│                                 │
├─────────────────────────────────┤  ← drawer top edge (rounded 16px)
│  ━━━━━  drag handle  ━━━━━     │  24px zone
├─────────────────────────────────┤
│  ● TABLE CHAT        FE MI YO  │  header bar (40px)
├─────────────────────────────────┤
│                                 │
│        message list             │  flex-grow, scrollable
│                                 │
├─────────────────────────────────┤
│  [  say something...      →  ] │  input row (48px)
├─────────────────────────────────┤
│  [😂] [🔥] [gg] [no way!]     │  quick-react chips (40px)
└─────────────────────────────────┘  ← bottom safe area
```

---

## Drawer States

| State | Height | Description |
|---|---|---|
| **Closed** | 0 (off-screen) | Fully hidden below screen edge |
| **Peek** | 120px | Partial reveal — shows header + 1–2 messages. Drag up to expand. |
| **Half** | 55vh | Default open state. Shows ~5–6 messages comfortably. |
| **Full** | 90vh | Fully expanded. Triggered by dragging up past 70vh. |

Transitions between states use `cubic-bezier(0.32, 0.72, 0, 1)` over `320ms`.

---

## Gestures

| Gesture | Action |
|---|---|
| Tap chat tab | Open to **Half** state |
| Drag handle up | Expand toward **Full** |
| Drag handle down (from Half) | Collapse to **Peek** |
| Drag handle down (from Peek) | Close entirely |
| Tap dimmed game area | Close entirely |
| Swipe down fast (velocity > 500px/s) | Close regardless of position |
| Tap toast preview | Open to **Half** |

---

## Visual Design

### Colors (all inherit from existing game palette)

| Token | Value | Usage |
|---|---|---|
| `--drawer-bg` | `#0f0f20` | Drawer surface |
| `--drawer-surface` | `#12121f` | Message list background |
| `--drawer-border` | `#1e1e35` | Dividers, input border |
| `--drawer-handle` | `#2a2a50` | Drag handle pill |
| `--msg-other-bg` | `#1e1e35` | Opponent message bubble |
| `--msg-other-text` | `#c8c8e8` | Opponent message text |
| `--msg-you-bg` | `#1a3b2b` | Your message bubble |
| `--msg-you-text` | `#a8f0c8` | Your message text |
| `--msg-system-text` | `#555580` | System event pills |
| `--badge-bg` | `#e74c3c` | Unread count badge |
| `--send-btn` | `#3b4fd4` | Send button fill |

### Typography

| Element | Size | Weight | Color |
|---|---|---|---|
| Section label ("TABLE CHAT") | `10px` | `500` | `#a0a0c0` |
| Player name (above bubble) | `10px` | `400` | `#555580` |
| Message text | `13px` | `400` | per token above |
| System event text | `11px` | `400` | `#555580` |
| Input placeholder | `13px` | `400` | `#444460` |
| Quick-react labels | `12px` | `500` | `#7070a0` |
| Unread badge | `7px` | `600` | `#ffffff` |

---

## Header Bar

- Height: `40px`, padding `0 14px`
- Left: online indicator dot (`8px`, `#4ade80`) + "TABLE CHAT" label
- Right: avatar stack — each player's initials circle (`24×24px`, `border-radius: 50%`)
  - Felix `FE`: bg `#1f2b5e`, text `#7b8cde`
  - Mila `MI`: bg `#3b1f3b`, text `#c07bd0`
  - You `YO`: bg `#1a3b2b`, text `#4ade80`
- Bottom border: `0.5px solid #1e1e35`

---

## Message List

- Background: `#12121f`
- Padding: `12px`
- Gap between messages: `10px`
- Scrollable, scroll position is maintained between open/close
- Auto-scrolls to bottom on new messages **only if** user is already at the bottom (within 60px)
- If user has scrolled up, new messages show a **"↓ new messages"** pill that scrolls to bottom on tap

### Message bubble — opponent
```
[AV]
     Name
     ╭──────────────────╮
     │ message text     │
     ╰──────────────────╯
```
- Avatar: 22×22px, left of bubble
- Name label: 10px, `#555580`, shown above bubble
- Bubble: `border-radius: 10px 10px 10px 2px` (flat bottom-left corner)
- Max width: `75%`

### Message bubble — you
```
                        Name
     ╭──────────────────╮
     │ message text     │  [AV]
     ╰──────────────────╯
```
- Right-aligned, avatar on right
- Bubble: `border-radius: 10px 10px 2px 10px` (flat bottom-right corner)
- Background: `--msg-you-bg`

### System event pill
```
      ─── Felix played a card ───
```
- Centered, `background: #1e1e2e`, `border-radius: 20px`, `padding: 4px 10px`
- Font: `11px`, `#555580`
- Appears inline in message timeline

### Consecutive messages
- If the same player sends multiple messages within 60 seconds, hide the name label and avatar on all but the first
- Reduce gap between consecutive bubbles from `10px` to `4px`

---

## Input Row

- Height: `48px`, padding `0 12px`
- Background: `--drawer-bg`
- Top border: `0.5px solid #1e1e35`

### Text input
- Background: `#1e1e35`, `border-radius: 20px`, `padding: 8px 14px`
- Border: `0.5px solid #2a2a50`
- Font size: `13px`, color `#c8c8e8`
- Placeholder: "say something...", color `#444460`
- `flex: 1`

### Send button
- 34×34px circle, `background: #3b4fd4`
- Disabled state: `background: #1e1e35`, icon color `#2a2a50`
- Enabled when input has text
- Icon: right-arrow SVG, `14×14px`, `stroke: white`

---

## Quick-React Chips

- Strip below input, `padding: 6px 12px`, `gap: 6px`, horizontally scrollable
- Chip style: `background: #1e1e35`, `border: 0.5px solid #2a2a50`, `border-radius: 20px`, `padding: 5px 12px`
- Tapping a chip sends that message instantly (no need to press send)
- Default chips: `😂` `🔥` `gg` `no way!` `nice` `rip`

---

## Drag Handle

- Centered pill, `40×4px`, `background: #2a2a50`, `border-radius: 2px`
- Contained in a `24px` tall tap target zone at the very top of the drawer
- Hit area is full drawer width for easier grabbing

---

## Backdrop

- Full-screen overlay behind drawer: `background: rgba(0,0,0,0.55)`
- Opacity animates in sync with drawer height: `opacity = drawerHeight / maxHeight * 0.55`
- Tap to close

---

## Animations

| Event | Animation |
|---|---|
| Drawer open | Slide up from bottom, `320ms`, `cubic-bezier(0.32, 0.72, 0, 1)` |
| Drawer close | Slide down, `260ms`, `cubic-bezier(0.4, 0, 1, 1)` |
| New message bubble | Fade + scale from `0.92` to `1`, `180ms ease-out` |
| Toast preview | Slide up `40px`, hold `3s`, fade out `200ms` |
| Send button enable | `background` transition `150ms` |
| Badge appear | Scale from `0` to `1`, `200ms spring` |

---

## Accessibility

- Drawer has `role="dialog"` and `aria-label="Table chat"`
- Focus trap when drawer is open
- Input is focused automatically when drawer opens to **Full** state
- `Escape` key closes the drawer
- All interactive elements meet minimum `44×44px` touch target

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Keyboard opens (mobile) | Drawer shrinks to avoid keyboard overlap; input stays visible |
| No messages yet | Empty state: centered icon + "no messages yet — say something!" in `#555580` |
| Player offline | Avatar dims to 40% opacity; name shows `(offline)` suffix |
| Long message | Wraps naturally; max width `75%` of drawer; no truncation |
| Message during your turn timer | Toast appears; timer continues; drawer does not auto-open |
| 9+ unread | Badge shows `9+` instead of count |

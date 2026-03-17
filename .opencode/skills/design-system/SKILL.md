---
name: design-system
description: UI component conventions, Chakra UI patterns, file structure, responsive design, and styling guidelines for the Check Card Game
---

## Overview

The Check Card Game frontend uses React with TypeScript, Chakra UI as the component library, and Vite as the build tool. This skill defines the conventions for building consistent, responsive, and accessible UI components.

The visual design follows the **reskin design system** — a dark near-black base with gold accent, purple player accent, and color-coded interactive states. All new components must use this design system. Source of truth: `reskin/` folder.

---

## Project Structure

Current source tree (18 files — do not invent subdirectories that don't exist):

```
client/src/
  components/
    GameNotification.tsx
    cards/
      Card.tsx
      CardBack.tsx
      FlippableCard.tsx
  context/
    SocketContext.tsx
  pages/
    GameBoard.tsx
    GameRejoin.tsx
    HomePage.tsx
    RoomLobby.tsx
  services/
    socket.ts
  theme/
    index.ts
  types/
    card.types.ts
    game.types.ts
    player.types.ts
  utils/
    haptics.ts
    sound.ts
  App.tsx
  main.tsx
```

Add new files into existing subdirectories. Do **not** create new subdirectory layers unless explicitly required.

---

## Component Conventions

### File Naming

- Components: PascalCase (`Card.tsx`, `PlayerHand.tsx`)
- Utilities: camelCase (`haptics.ts`, `sound.ts`)
- Types: camelCase with `.types.ts` suffix (`game.types.ts`)
- One component per file
- Export components as **named exports**, not default

### Component Pattern

```tsx
import { Box, Text } from '@chakra-ui/react';
import { FC } from 'react';

interface PlayerHandProps {
  cards: CardSlotData[];
  selectedSlot: string | null;
  onCardSelect: (slot: string) => void;
  isMyTurn: boolean;
}

export const PlayerHand: FC<PlayerHandProps> = ({
  cards,
  selectedSlot,
  onCardSelect,
  isMyTurn,
}) => {
  return (
    <Box display="flex" gap={3} justifyContent="center" p={4}>
      {cards.map((card) => (
        <CardSlot
          key={card.slot}
          card={card}
          isSelected={selectedSlot === card.slot}
          onClick={() => isMyTurn && onCardSelect(card.slot)}
          isDisabled={!isMyTurn}
        />
      ))}
    </Box>
  );
};
```

### Props Guidelines

- Always define a TypeScript interface named `ComponentNameProps`
- Use explicit types — avoid `any`
- Destructure props in function signature
- Provide sensible defaults where appropriate

---

## Design Tokens

All new UI must use these exact values. Do not invent new colors.

### Color Palette

| Token       | Hex                  | Usage                                                               |
| ----------- | -------------------- | ------------------------------------------------------------------- |
| `#0f0f14`   | base bg              | Phone/app background (game board)                                   |
| `#0f0f16`   | base bg alt          | Alternate dark bg (lobby/landing)                                   |
| `#13131a`   | surface primary      | Top bar, opponent zone, player zone                                 |
| `#1c1c26`   | surface secondary    | Opponent card rows                                                  |
| `#1c1c28`   | surface modal        | Modal sheets                                                        |
| `#16162a`   | surface tertiary     | Slot choice buttons (unselected)                                    |
| `#13191a`   | surface table felt   | Draw/discard table area                                             |
| `#0d0d12`   | surface table center | Table center bg behind felt surface                                 |
| `#2a2a3a`   | border default       | Default borders                                                     |
| `#1a2a22`   | border felt          | Table surface border                                                |
| `#c9a227`   | gold                 | CHECK button, known-card border, selected state, room code          |
| `#1f1a0a`   | gold bg              | Gold selection background                                           |
| `#c9a22740` | gold dim             | Gold glow/shadow                                                    |
| `#7a7aee`   | purple               | Player accent — welcome name, YOU badge, bot dot, room code display |
| `#c0392b`   | card red             | Red suit card text                                                  |
| `#d4351c`   | logo red             | Logo lettering                                                      |
| `#4ecb4e`   | timer green          | Turn timer (>60% time)                                              |
| `#5ecf5e`   | success green        | Burn success, match tag                                             |
| `#4a8a5a`   | btn green            | Primary button bg, slider fill                                      |
| `#cf5e5e`   | burn red             | Burn selection border, burn confirm button                          |
| `#5eb8cf`   | swap blue            | Swap selection border, opponent slot selected                       |
| `#0a1a1f`   | swap blue bg         | Swap selection background                                           |
| `#eee`      | text primary         | Main text                                                           |
| `#ccc`      | text secondary       | Opponent names, player names                                        |
| `#aaa`      | text muted           | Round label, top bar labels                                         |
| `#888`      | text dimmer          | Connection status, secondary labels                                 |
| `#555`      | text dim             | Pile labels, slot labels, modal desc                                |
| `#444`      | text ghost           | Row labels, pile sub-text                                           |
| `#333`      | text faint           | Drag handle, ghost elements                                         |
| `#5a2a2a`   | danger border        | Leave Room / Exit Game border                                       |
| `#cf7070`   | danger text          | Leave Room / Exit Game text                                         |
| `#2a1a1a`   | burn warning bg      | Penalty warning box bg                                              |
| `#886060`   | burn warning text    | Penalty warning text                                                |

### Typography

```
font-family: 'Inter', system-ui, sans-serif
```

Key text sizes from mockups:

| Element          | Size | Color  | Weight | Notes                           |
| ---------------- | ---- | ------ | ------ | ------------------------------- |
| Top bar labels   | 12px | `#aaa` | 500    | —                               |
| Opponent name    | 12px | `#ccc` | 500    | —                               |
| Opponent meta    | 11px | `#555` | —      | —                               |
| Slot labels      | 10px | `#555` | 500    | —                               |
| Hand label       | 10px | `#555` | 500    | uppercase, letterSpacing 0.07em |
| Pile label       | 10px | `#444` | —      | —                               |
| Pile sub         | 10px | `#333` | —      | —                               |
| Hint text        | 11px | `#555` | —      | centered                        |
| Modal title      | 15px | `#eee` | 600    | —                               |
| Modal desc       | 12px | `#555` | —      | —                               |
| Modal row labels | 11px | `#444` | 500    | uppercase, letterSpacing 0.05em |
| Count badge      | 10px | `#666` | 600    | —                               |

### Sizing & Spacing

| Element              | Size                     | Border Radius |
| -------------------- | ------------------------ | ------------- |
| Hand card            | 58×80px                  | 8px           |
| Mini card (opponent) | 20×28px                  | 4px           |
| Peek card (modal)    | 56×78px                  | 8px           |
| Burn preview card    | 52×72px                  | 8px           |
| Eye badge            | 14×14px circle           | 50%           |
| Timer SVG ring       | 36×36px                  | —             |
| Avatar               | 28×28px circle           | 50%           |
| Count badge          | —                        | 10px          |
| Modal sheet          | full-width − 24px margin | 14px          |
| Modal drag handle    | 36×3px                   | 2px           |
| Slot choice button   | flex 1 × 44px            | 8px           |

---

## Theme Configuration (`theme/index.ts`)

When updating the theme for the reskin:

```tsx
import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  colors: {
    base: { bg: '#0f0f14', bgAlt: '#0f0f16' },
    surface: {
      primary: '#13131a',
      secondary: '#1c1c26',
      modal: '#1c1c28',
      tertiary: '#16162a',
      tableFelt: '#13191a',
      tableCenter: '#0d0d12',
    },
    border: { default: '#2a2a3a', felt: '#1a2a22' },
    gold: { default: '#c9a227', bg: '#1f1a0a', dim: '#c9a22740' },
    purple: { default: '#7a7aee' },
    card: { red: '#c0392b', back: '#2a2a4a', backBorder: '#3a3a5a', selected: '#c9a227' },
    timer: { green: '#4ecb4e', amber: '#c9a227', red: '#cf5e5e' },
    burn: { red: '#cf5e5e', redDim: '#cf5e5e40', bg: '#2a1a1a' },
    swap: { blue: '#5eb8cf', blueDim: '#5eb8cf40', bg: '#0a1a1f' },
    btn: { green: '#4a8a5a', greenHover: '#3a7a4a', secondary: '#1c1c2e' },
    danger: { border: '#5a2a2a', text: '#cf7070' },
  },
  fonts: {
    heading: `'Inter', system-ui, sans-serif`,
    body: `'Inter', system-ui, sans-serif`,
  },
  styles: {
    global: {
      body: { bg: '#0f0f14', color: '#eee' },
    },
  },
});

export default theme;
```

---

## Card Components

### Face-Down Hand Card (58×80px)

```tsx
// Default unknown
<Box
  w="58px" h="80px" borderRadius="8px"
  bg="#2a2a4a" border="1px solid #3a3a5a"
  display="flex" alignItems="center" justifyContent="center"
  cursor="pointer" position="relative"
  transition="border-color 0.15s, transform 0.1s"
  _hover={{ borderColor: '#5a5a8a', transform: 'translateY(-2px)' }}
/>

// Known card — gold border + eye badge
<Box border="1px solid #c9a227" ...>
  <EyeBadge />
</Box>

// Burn-selected — red border + lift
<Box border="1px solid #cf5e5e" boxShadow="0 0 0 1px #cf5e5e40" transform="translateY(-4px)" ... />

// Swap-selected — blue border + lift
<Box border="1px solid #5eb8cf" boxShadow="0 0 0 1px #5eb8cf40" transform="translateY(-4px)" ... />

// Swap target (valid destination, gold ring)
<Box border="1px solid #c9a227" boxShadow="0 0 0 1px #c9a22740" ... />
```

### Eye Badge

Absolute positioned top-right on known cards:

```tsx
<Box
  position="absolute"
  top="3px"
  right="3px"
  w="14px"
  h="14px"
  bg="#c9a227"
  borderRadius="50%"
  display="flex"
  alignItems="center"
  justifyContent="center"
>
  <svg viewBox="0 0 10 7" fill="none" width="8" height="8">
    <ellipse cx="5" cy="3.5" rx="4" ry="2.5" stroke="white" strokeWidth="1" />
    <circle cx="5" cy="3.5" r="1.2" fill="white" />
  </svg>
</Box>
```

### Face-Up Card

```tsx
<Box
  w="58px" h="80px" borderRadius="8px"
  bg="white" border="1px solid #ddd"
  display="flex" flexDirection="column"
  alignItems="center" justifyContent="center"
  cursor="pointer" position="relative"
  fontWeight="700" fontSize="20px"
  color={isRed ? '#c0392b' : '#333'}
  transition="transform 0.1s"
  _hover={{ transform: 'translateY(-2px)' }}
>
  <Box position="absolute" top="4px" left="5px" fontSize="10px" fontWeight="700" lineHeight="1.1">
    {rank}<br/>{suit}
  </Box>
  <Box>{suitSymbol}</Box>
  <Box position="absolute" bottom="4px" right="5px" fontSize="10px" fontWeight="700" transform="rotate(180deg)">
    {rank}<br/>{suit}
  </Box>
</Box>

// Discard selected — gold ring
<Box border="1px solid #c9a227" boxShadow="0 0 0 2px #c9a22740" ... />
```

### Slot Label

Always rendered below each card:

```tsx
<VStack spacing="4px" align="center">
  <CardComponent />
  <Text fontSize="10px" color="#555" fontWeight="500">
    {slot}
  </Text>
</VStack>
```

### Mini Card (Opponent Hand)

```tsx
<Box w="20px" h="28px" borderRadius="4px" bg="#2a2a4a" border="0.5px solid #3a3a5a" />
```

---

## Game Board Layout

Three vertical zones, no action buttons on the main screen — actions triggered by tapping piles and hand cards:

```
┌──────────────────────────────┐
│  Top Bar                     │  bg #13131a, border-bottom 0.5px #222
│  Round: 1          [CHECK]   │
├──────────────────────────────┤
│  Opponent Zone               │  bg #13131a, px 14px py 10px
│  [avatar] Name  ████ [4]     │
├──────────────────────────────┤
│  Table Center  (flex: 1)     │  bg #0d0d12
│  ┌────────────────────────┐  │
│  │  Table Surface         │  │  bg #13191a, radius 14px
│  │  [timer row]           │  │  border 0.5px #1a2a22, p 14px
│  │  [draw pile] ⇄ [discard│  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│  Player Zone                 │  bg #13131a, px 14px, pb 16px
│  your hand                   │
│  [A] [B] [C] [D]             │
│  tap draw pile · tap discard…│
└──────────────────────────────┘
```

### Top Bar

```tsx
<Flex
  align="center"
  justify="space-between"
  px="14px"
  pt="10px"
  pb="8px"
  bg="#13131a"
  borderBottom="0.5px solid #222"
>
  <Text fontSize="12px" color="#aaa" fontWeight="500">
    Round: {round}
  </Text>
  <CheckButton />
</Flex>
```

### CHECK Button (Top Bar)

Gold, compact:

```tsx
<Button
  px="12px"
  py="4px"
  h="auto"
  borderRadius="6px"
  bg="#c9a227"
  color="#1a1200"
  fontSize="12px"
  fontWeight="600"
  border="none"
  isDisabled={!canCheck}
  _disabled={{ opacity: 0.4, cursor: 'not-allowed' }}
>
  CHECK
</Button>
```

### Opponent Row

```tsx
<Box px="14px" py="10px" bg="#13131a">
  <Flex
    align="center"
    gap="8px"
    bg="#1c1c26"
    borderRadius="10px"
    px="10px"
    py="8px"
    border="0.5px solid #2a2a3a"
  >
    <Box
      w="28px"
      h="28px"
      borderRadius="50%"
      bg="#3a3a5a"
      flexShrink={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontSize="11px"
      color="#aaa"
      fontWeight="500"
    >
      {initials}
    </Box>
    <Box>
      <Text fontSize="12px" color="#ccc" fontWeight="500">
        {name}
        {isBot && (
          <Box
            as="span"
            ml="4px"
            fontSize="10px"
            color="#555"
            bg="#222"
            px="5px"
            py="1px"
            borderRadius="4px"
          >
            BOT
          </Box>
        )}
      </Text>
      <Text fontSize="11px" color="#555">
        Score: {score}
      </Text>
    </Box>
    <Flex gap="4px" ml="auto" align="center">
      {Array(cardCount)
        .fill(null)
        .map((_, i) => (
          <Box
            key={i}
            w="20px"
            h="28px"
            borderRadius="4px"
            bg="#2a2a4a"
            border="0.5px solid #3a3a5a"
          />
        ))}
    </Flex>
    <Box
      bg="#2a2a3a"
      color="#666"
      fontSize="10px"
      px="6px"
      py="2px"
      borderRadius="10px"
      fontWeight="600"
    >
      {cardCount}
    </Box>
  </Flex>
</Box>
```

### Table Center

```tsx
<Box flex={1} bg="#0d0d12" display="flex" flexDirection="column" justifyContent="center" p="14px">
  <Box
    bg="#13191a"
    borderRadius="14px"
    border="0.5px solid #1a2a22"
    p="14px"
    display="flex"
    flexDirection="column"
    gap="12px"
  >
    <TimerRow />
    <PileArea />
  </Box>
</Box>
```

### Timer Row

SVG ring (r=14, circumference=87.96) with color transitions:

| Time remaining | Color                   |
| -------------- | ----------------------- |
| >60%           | `#4ecb4e` (green)       |
| 30–60%         | `#c9a227` (amber)       |
| <30%           | `#cf5e5e` (red) + pulse |

```tsx
<Flex align="center" gap="10px">
  <svg width="36" height="36" viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="14" fill="none" stroke="#1a2a1a" strokeWidth="2.5" />
    <circle
      cx="18"
      cy="18"
      r="14"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeDasharray="87.96"
      strokeDashoffset={87.96 * (1 - pct)}
      strokeLinecap="round"
      transform="rotate(-90 18 18)"
    />
    <text x="18" y="22" textAnchor="middle" fontSize="10" fontWeight="600" fill={color}>
      {seconds}
    </text>
  </svg>
  <Box flex={1}>
    <Text fontSize="11px" color={color} mb="4px">
      {statusLabel} · {seconds}s
    </Text>
    <Box h="5px" bg="#1a2a1a" borderRadius="3px" overflow="hidden">
      <Box
        h="100%"
        bg={color}
        w={`${pct * 100}%`}
        borderRadius="3px"
        transition="width 0.5s, background 0.5s"
      />
    </Box>
  </Box>
</Flex>
```

### Pile Area

```tsx
<Flex align="center" justifyContent="center" gap="28px">
  <VStack spacing="5px">
    <DrawCard isDisabled={discardSelected} opacity={discardSelected ? 0.4 : 1} onClick={onDraw} />
    <Text fontSize="10px" color={discardSelected ? '#333' : '#444'}>
      draw pile
    </Text>
    <Text fontSize="10px" color="#333">
      tap to draw
    </Text>
  </VStack>

  <Text color="#2a2a3a" fontSize="20px">
    ⇄
  </Text>

  <VStack spacing="5px">
    <DiscardTopCard isSelected={discardSelected} onClick={onTakeDiscard} />
    <Text fontSize="10px" color={discardSelected ? '#c9a227' : '#444'}>
      {discardSelected ? 'selected' : 'discard'}
    </Text>
    <Text fontSize="10px" color="#333">
      tap to take
    </Text>
  </VStack>
</Flex>
```

### Player Zone

```tsx
<Box px="14px" pt="10px" pb="16px" bg="#13131a">
  <Text fontSize="10px" color={discardSelected ? '#c9a227' : '#555'}
    textAlign="center" textTransform="uppercase"
    letterSpacing="0.07em" fontWeight="500" mb="8px"
  >
    {discardSelected ? 'pick a slot to replace' : 'your hand'}
  </Text>
  <Flex gap="8px" justifyContent="center">
    {cards.map(card => (
      <VStack key={card.slot} spacing="4px">
        <HandCard card={card} ... />
        <Text fontSize="10px"
          color={burnSelected === card.slot ? '#cf5e5e' : '#555'}
          fontWeight="500"
        >
          {card.slot}
        </Text>
      </VStack>
    ))}
  </Flex>
  <Text fontSize="11px" color={discardSelected ? '#c9a22799' : '#555'} textAlign="center" mt="6px">
    {discardSelected
      ? 'tap a slot to place the discard card · tap discard again to cancel'
      : 'tap draw pile · tap discard then hand · tap hand card to burn'}
  </Text>
</Box>
```

---

## Modal Pattern (Bottom Sheet)

All in-game action modals use a **bottom-sheet** style — never centered. The overlay aligns content to the bottom.

```tsx
<Modal
  isOpen={isOpen}
  onClose={onClose}
  closeOnOverlayClick={false}
  closeOnEsc={false}
  motionPreset="slideInBottom"
>
  <ModalOverlay bg="rgba(0,0,0,0.65)" />
  <ModalContent
    bg="#1c1c28"
    borderRadius="14px"
    border="0.5px solid #2a2a3a"
    p="16px"
    mx="12px"
    mb="12px"
    mt="auto"
    position="fixed"
    bottom="12px"
    left="12px"
    right="12px"
    maxW="unset"
  >
    {/* Drag handle */}
    <Box w="36px" h="3px" bg="#333" borderRadius="2px" mx="auto" mb="14px" />

    {/* Header */}
    <Flex align="center" gap="8px" mb="4px">
      <Text fontSize="16px">{icon}</Text>
      <Text fontSize="15px" fontWeight="600" color="#eee">
        {title}
      </Text>
    </Flex>
    <Text fontSize="12px" color="#555" mb="14px">
      {description}
    </Text>

    {/* Body */}
    {children}

    {/* Action buttons */}
    <Flex gap="8px" mt="2px">
      <Button
        flex={1}
        py="10px"
        borderRadius="8px"
        bg="#1c1c2e"
        color="#666"
        fontSize="13px"
        fontWeight="600"
      >
        {cancelLabel}
      </Button>
      <Button
        flex={1}
        py="10px"
        borderRadius="8px"
        bg={confirmBg}
        color={confirmColor}
        fontSize="13px"
        fontWeight="600"
      >
        {confirmLabel}
      </Button>
    </Flex>
  </ModalContent>
</Modal>
```

### Confirm Button Colors by Modal

| Modal          | `bg`      | `color`   |
| -------------- | --------- | --------- |
| Burn confirm   | `#cf5e5e` | `#fff`    |
| Red Jack swap  | `#c9a227` | `#1a1200` |
| Red Queen peek | `#c9a227` | `#1a1200` |
| Red King keep  | `#c9a227` | `#1a1200` |

### Slot Choice Buttons (inside modals)

```tsx
// Default unselected
<Box flex={1} h="44px" borderRadius="8px"
  bg="#16162a" border="1px solid #2a2a4a"
  display="flex" alignItems="center" justifyContent="center"
  fontSize="14px" fontWeight="600" color="#777" cursor="pointer"
  transition="border-color 0.15s"
/>

// Gold selected (your card)
<Box border="1px solid #c9a227" color="#c9a227" bg="#1f1a0a" ... />

// Blue selected (their slot)
<Box border="1px solid #5eb8cf" color="#5eb8cf" bg="#0a1a1f" ... />
```

### Row Labels (inside modals)

```tsx
<Text
  fontSize="11px"
  color="#444"
  fontWeight="500"
  textTransform="uppercase"
  letterSpacing="0.05em"
  mb="6px"
>
  {label}
</Text>
```

### Burn Confirm Modal

Shows hand card vs top discard with penalty warning:

```tsx
{
  /* Card preview */
}
<Flex align="center" justifyContent="center" gap="14px" my="8px" mb="14px">
  <VStack spacing="4px">
    <Text fontSize="10px" color="#555" textAlign="center">
      your card {slot}
    </Text>
    <Box
      w="52px"
      h="72px"
      borderRadius="8px"
      bg="#2a2a4a"
      border="1px solid #cf5e5e"
      boxShadow="0 0 0 1px #cf5e5e30"
      display="flex"
      alignItems="center"
      justifyContent="center"
    />
  </VStack>
  <Text fontSize="11px" color="#444" fontWeight="600">
    vs
  </Text>
  <VStack spacing="4px">
    <Text fontSize="10px" color="#555" textAlign="center">
      top discard
    </Text>
    <DiscardPreviewCard card={topDiscard} />
  </VStack>
</Flex>;

{
  /* Match status */
}
<Text
  fontSize="11px"
  fontWeight="600"
  textAlign="center"
  mb="10px"
  color={isMatch ? '#5ecf5e' : '#cf5e5e'}
>
  {isMatch ? '✓ Ranks match — safe to burn' : 'card is face-down — result unknown until burned'}
</Text>;

{
  /* Penalty warning */
}
<Box bg="#2a1a1a" borderRadius="8px" px="10px" py="8px" fontSize="11px" color="#886060" mb="12px">
  If ranks don't match, you'll receive a penalty card (slot E added face-down).
</Box>;
```

### Red Jack Modal

Header: red suit icon (`♥` or `♦` in `color: #c0392b`) + "Red Jack — Blind Swap"

Three row-label sections with a `↕` connector between your slot and their slot:

```tsx
<Text fontSize="18px" color="#333" textAlign="center" my="6px">
  ↕
</Text>
```

Opponent selector (pill style):

```tsx
<Box
  display="inline-flex"
  alignItems="center"
  gap="6px"
  px="12px"
  py="5px"
  borderRadius="20px"
  border={selected ? '1px solid #5eb8cf' : '1px solid #2a2a4a'}
  bg={selected ? '#0a1a1f' : '#16162a'}
  color={selected ? '#5eb8cf' : '#777'}
  fontSize="12px"
  cursor="pointer"
>
  <Box w="8px" h="8px" borderRadius="50%" bg="currentColor" />
  {name}
</Box>
```

Confirm: `"Swap"` (gold). Cancel: `"Skip"`.

### Red Queen Modal

Shows all slots as peek cards (56×78px). Already-known slots display face-up with a gold `"peeked"` badge:

```tsx
// Peeked badge
<Box
  position="absolute"
  top="-6px"
  right="-6px"
  bg="#c9a227"
  color="#1a1200"
  fontSize="9px"
  fontWeight="700"
  px="5px"
  py="2px"
  borderRadius="8px"
>
  peeked
</Box>
```

Unknown selected slot: `border: 2px solid #c9a227; boxShadow: 0 0 0 1px #c9a22730`

Label under selected unknown slot: `"B — peek this?"` in `color: #c9a227`

Confirm button label names the slot explicitly: `"Peek slot B"`. Cancel: `"Skip"`.

Info box (above buttons):

```tsx
<Box
  bg="#1a1a0a"
  border="1px solid #2a2a1a"
  borderRadius="8px"
  px="10px"
  py="8px"
  fontSize="11px"
  color="#666"
  mb="14px"
>
  Only you will see the card. It stays in its slot after peeking — the eye badge marks it as known.
</Box>
```

### Red King Modal

Follow spec section 4 (reskin MD):

- Step indicator (Step 1 / Step 2)
- Gold ring on the selected drawn card
- Disable confirm until both selections are made; show helper `"Select a card and a slot to continue."`
- All three option buttons (Return Both / Keep 1 / Keep Both) use **neutral outline** — no yellow highlight bias

---

## Landing Page

```tsx
// Full-screen dark bg, logo centered, form anchored bottom
<Flex direction="column" h="100dvh" bg="#0f0f16" overflow="hidden">
  {/* Logo — vertically centered in remaining space */}
  <Flex flex={1} direction="column" align="center" justify="center" pt="48px">
    <Text fontSize="9px" letterSpacing="0.2em" color="#8a7a5a"
      textTransform="uppercase" fontWeight="600" mb="-2px"
    >
      The Card Game
    </Text>
    <Box
      fontSize="44px" fontWeight="900" color="#d4351c"
      fontFamily="Georgia, serif" letterSpacing="0.04em"
      textShadow="0 2px 0 #8a1a0a, 0 3px 8px rgba(0,0,0,0.6)"
      border="3px solid #c9a227" borderRadius="6px"
      px="18px" pb="4px" pt="2px" lineHeight={1}
      bg="linear-gradient(180deg, #2a1a00 0%, #1a1000 100%)"
    >
      CHECK
    </Box>
    {/* Glow pulse beneath logo */}
    <Box w="120px" h="20px" mt="-4px"
      bg="radial-gradient(ellipse, #c9a22740 0%, transparent 70%)"
    />
  </Flex>

  {/* Connection status */}
  <Flex align="center" gap="6px" justify="center" fontSize="12px" color="#888" mb="16px">
    <Box w="8px" h="8px" borderRadius="50%" bg="#4ecb4e" />
    Connected
  </Flex>

  {/* Form */}
  <VStack px="20px" pb="28px" spacing="10px">
    <Input placeholder="Enter your username" ... />
    <Button w="100%" bg="#4a8a5a" color="#e8f5ec" fontWeight="600">Continue</Button>
    <Text fontSize="13px" color="#5a5a7a" cursor="pointer">How to Play</Text>
  </VStack>
</Flex>
```

---

## Pre-Lobby (Room Selection)

Username displayed in purple with inline `(change)` link:

```tsx
<Text fontSize="14px" color="#888" textAlign="center">
  Welcome,{' '}
  <Text as="span" color="#7a7aee" fontWeight="600">
    {username}
  </Text>{' '}
  <Text as="span" fontSize="13px" color="#4a4a6a" cursor="pointer">
    (change)
  </Text>
</Text>
```

### Room Code Input

Monospace uppercase with gold typed text — signals special code entry:

```tsx
<Input
  textTransform="uppercase"
  letterSpacing="0.18em"
  textAlign="center"
  fontSize="15px"
  fontWeight="600"
  color="#c9a227"
  bg="#1a1a28"
  border="1.5px solid #3a3a5a"
  borderRadius="10px"
  _focus={{ borderColor: '#6a6aaa' }}
  _placeholder={{ letterSpacing: '0.12em', color: '#3a3a4a', textTransform: 'uppercase' }}
  placeholder="ENTER ROOM CODE"
/>
```

Join Room button stays muted until the input has characters. OR divider:

```tsx
<Flex align="center" gap="8px">
  <Box flex={1} h="0.5px" bg="#222" />
  <Text fontSize="11px" color="#444">
    OR
  </Text>
  <Box flex={1} h="0.5px" bg="#222" />
</Flex>
```

---

## Room Lobby

### Room Code Block

Large purple display, prominent at top:

```tsx
<Box textAlign="center">
  <Text fontSize="10px" color="#444" letterSpacing="0.12em" textTransform="uppercase" mb="6px">
    Room Code
  </Text>
  <Flex align="center" justifyContent="center" gap="8px">
    <Text fontSize="28px" fontWeight="800" color="#7a7aee" letterSpacing="0.18em">
      {roomCode}
    </Text>
    <IconButton
      aria-label="Copy"
      size="sm"
      bg="#1c1c2e"
      border="0.5px solid #2a2a3a"
      color="#666"
      borderRadius="7px"
    />
    <IconButton
      aria-label="Share"
      size="sm"
      bg="#1c1c2e"
      border="0.5px solid #2a2a3a"
      color="#666"
      borderRadius="7px"
    />
  </Flex>
</Box>
```

### Player List Dot System

| State        | Color     | Hex       |
| ------------ | --------- | --------- |
| Human online | green     | `#4ecb4e` |
| Bot          | purple    | `#7a7aee` |
| Empty slot   | dark gray | `#2a2a3a` |

Badges:

| Badge  | bg        | color     | border                |
| ------ | --------- | --------- | --------------------- |
| HOST   | `#3a2a00` | `#c9a227` | `1px solid #c9a22760` |
| YOU    | `#1a1a3a` | `#7a7aee` | `1px solid #3a3a7a`   |
| EASY   | `#1a3a2a` | `#5ecf5e` | `1px solid #2a5a3a`   |
| EXPERT | `#3a1a1a` | `#cf5e5e` | `1px solid #5a2a2a`   |

Kick `✕`: `color: #3a2a2a` at rest → `color: #cf5e5e` on hover. Never shown on host's own row or the YOU row.

### Score Slider

Always show min/max labels:

```tsx
<VStack spacing="6px">
  <Flex justify="space-between" w="100%" fontSize="12px">
    <Text color="#555">Game ends at:</Text>
    <Text color="#c9a227" fontWeight="600">{score} points</Text>
  </Flex>
  <Slider ... />
  <Flex justify="space-between" w="100%" fontSize="10px" color="#333">
    <Text>30</Text><Text>100</Text>
  </Flex>
</VStack>
```

### Bot Section

Difficulty buttons grouped with Add Bot:

```tsx
<VStack spacing="8px" align="stretch">
  <Text fontSize="11px" color="#555">
    Add a bot opponent:
  </Text>
  <HStack gap="6px">
    <Button
      px="12px"
      py="5px"
      borderRadius="6px"
      fontSize="12px"
      fontWeight="600"
      h="auto"
      bg={diff === 'easy' ? '#1a3a2a' : '#1c1c28'}
      border={diff === 'easy' ? '0.5px solid #2a5a3a' : '0.5px solid #2a2a3a'}
      color={diff === 'easy' ? '#5ecf5e' : '#555'}
      onClick={() => setDiff('easy')}
    >
      Easy
    </Button>
    <Button
      bg={diff === 'expert' ? '#3a1a1a' : '#1c1c28'}
      border={diff === 'expert' ? '0.5px solid #5a2a2a' : '0.5px solid #2a2a3a'}
      color={diff === 'expert' ? '#cf5e5e' : '#555'}
      onClick={() => setDiff('expert')}
    >
      Expert
    </Button>
    <Button
      bg="#1c1c28"
      border="0.5px solid #2a2a3a"
      color="#666"
      fontSize="12px"
      h="auto"
      px="12px"
      py="5px"
    >
      + Add Bot
    </Button>
  </HStack>
</VStack>
```

Start Game: visually disabled until ≥2 players/bots.

Leave Room: `bg="transparent" border="1px solid #5a2a2a" color="#cf7070"`.

---

## In-Game Menu

```tsx
<Box bg="#1c1c28" borderRadius="14px" border="0.5px solid #2a2a3a" overflow="hidden">
  <Flex align="center" justify="space-between" px="16px" py="14px" borderBottom="0.5px solid #222">
    <Text fontSize="16px" fontWeight="600" color="#eee">
      Menu
    </Text>
    <CloseButton color="#555" />
  </Flex>

  {/* Standard items */}
  <MenuItem icon="ⓘ" label="How to Play" />
  <MenuItem icon="⏸" label="Pause Game" />

  {/* Players section */}
  <Text
    fontSize="10px"
    color="#444"
    px="16px"
    pt="10px"
    pb="4px"
    textTransform="uppercase"
    letterSpacing="0.1em"
    fontWeight="600"
  >
    Players
  </Text>
  {bots.map((bot) => (
    <BotMenuRow key={bot.id} name={bot.name} onKick={onKick} />
  ))}

  {/* Sound toggle — default ON (green) */}
  <Flex
    align="center"
    justify="space-between"
    px="16px"
    py="12px"
    borderBottom="0.5px solid #1a1a24"
  >
    <Text fontSize="14px" color="#aaa">
      Sound
    </Text>
    <SoundToggle defaultOn />
  </Flex>

  {/* Exit Game — full danger treatment */}
  <Flex align="center" gap="10px" px="16px" py="13px" cursor="pointer" _hover={{ bg: '#22222e' }}>
    <Text fontSize="15px" color="#7a3a3a">
      ⏻
    </Text>
    <Text fontSize="14px" color="#cf7070">
      Exit Game
    </Text>
  </Flex>
</Box>
```

Sound toggle on state: `bg: #3a6a4a; border-color: #4a8a5a; knob color: #5ecf5e; knob left: 18px`.

---

## Button Reference

| Type            | bg          | color     | border              | borderRadius |
| --------------- | ----------- | --------- | ------------------- | ------------ |
| Primary green   | `#4a8a5a`   | `#e8f5ec` | —                   | 10px         |
| Gold primary    | `#c9a227`   | `#1a1200` | —                   | 10px         |
| Secondary       | `#1c1c2e`   | `#888`    | `1px solid #2a2a3a` | 10px         |
| Danger/Leave    | transparent | `#cf7070` | `1px solid #5a2a2a` | 10px         |
| CHECK (top bar) | `#c9a227`   | `#1a1200` | —                   | 6px          |

---

## Toast / Notification Conventions

Use `GameNotification` (inline banner) for most game events. Reserve toasts for errors and the Red Jack swap notification only.

| Event                 | Component                        | Notes                                        |
| --------------------- | -------------------------------- | -------------------------------------------- |
| Check called          | `GameNotification` sticky banner | High contrast red, full width, top of screen |
| Red Jack swap         | Toast `status: info`             | Top position                                 |
| Burn failed (penalty) | `GameNotification` inline        | Above hand                                   |
| Error / validation    | Toast `status: error`            | Top position                                 |

---

## Animation Guidelines

| Interaction                | Property                              | Duration         |
| -------------------------- | ------------------------------------- | ---------------- |
| Card hover lift            | `translateY(-2px)`                    | 0.1s             |
| Burn/swap selected         | `translateY(-4px)`                    | 0.15s            |
| Timer bar                  | `width + background`                  | 0.5s             |
| Modal entry                | `slideInBottom` (Chakra motionPreset) | default          |
| Card flip (peek/round end) | `rotateY(180deg)` + `preserve-3d`     | 0.6s ease-in-out |
| Timer <30% pulse           | CSS `@keyframes` opacity oscillation  | 1s loop          |

Always use `transform`/`opacity` — avoid layout-shifting animations.

---

## Responsive Breakpoints

Mobile-first. The mockup frames are 300–320px (primary target).

| Breakpoint | Min Width | Target                        |
| ---------- | --------- | ----------------------------- |
| `base`     | 0px       | Mobile phone — primary target |
| `sm`       | 480px     | Large phones                  |
| `md`       | 768px     | Tablets                       |
| `lg`       | 992px     | Tablet/small desktop          |
| `xl`       | 1280px    | Desktop                       |

Key responsive decisions:

- Cards: 58×80px on mobile, scale up at `md`/`lg`
- Modal sheets: full-width minus 24px margin on mobile; max-width 420px on desktop
- Table center: `flex: 1` fill on mobile, capped on desktop
- Opponents: single row on mobile, wrap/grid on desktop

---

## Accessibility

- All interactive elements keyboard accessible
- Slot labels: `aria-label="Slot A — known card"` etc.
- Color never the only indicator — known cards have gold border **and** eye icon; burn selection has red border **and** red slot label
- Sufficient contrast on gold text over dark backgrounds (AA)
- Modals trap focus (Chakra handles automatically)
- `status` on toasts for screen readers

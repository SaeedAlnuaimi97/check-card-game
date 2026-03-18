import { FC, memo } from 'react';
import { Box, Text } from '@chakra-ui/react';
import type { Card as CardType } from '../../types/card.types';

// ============================================================
// Types
// ============================================================

export interface CardProps {
  card: CardType;
  isSelected?: boolean;
  isClickable?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================
// Dimensions per size
// ============================================================

const SIZES = {
  sm: { w: '52px', h: '74px', corner: '8px', pip: '12px', bigPip: '22px', face: '18px' },
  md: { w: '80px', h: '112px', corner: '10px', pip: '16px', bigPip: '30px', face: '26px' },
  lg: { w: '100px', h: '140px', corner: '12px', pip: '18px', bigPip: '36px', face: '32px' },
};

// ============================================================
// Pip layout positions (classic playing card arrangements)
// Each position is [x%, y%] from center of the pip area.
// x: 0=left col, 50=center, 100=right col
// y: positions are distributed vertically
// ============================================================

type PipPosition = [number, number];

const PIP_LAYOUTS: Record<string, PipPosition[]> = {
  A: [[50, 50]],
  '2': [
    [50, 15],
    [50, 85],
  ],
  '3': [
    [50, 15],
    [50, 50],
    [50, 85],
  ],
  '4': [
    [25, 15],
    [75, 15],
    [25, 85],
    [75, 85],
  ],
  '5': [
    [25, 15],
    [75, 15],
    [50, 50],
    [25, 85],
    [75, 85],
  ],
  '6': [
    [25, 15],
    [75, 15],
    [25, 50],
    [75, 50],
    [25, 85],
    [75, 85],
  ],
  '7': [
    [25, 15],
    [75, 15],
    [50, 33],
    [25, 50],
    [75, 50],
    [25, 85],
    [75, 85],
  ],
  '8': [
    [25, 15],
    [75, 15],
    [50, 33],
    [25, 50],
    [75, 50],
    [50, 67],
    [25, 85],
    [75, 85],
  ],
  '9': [
    [25, 12],
    [75, 12],
    [25, 37],
    [75, 37],
    [50, 50],
    [25, 63],
    [75, 63],
    [25, 88],
    [75, 88],
  ],
  '10': [
    [25, 12],
    [75, 12],
    [50, 25],
    [25, 37],
    [75, 37],
    [25, 63],
    [75, 63],
    [50, 75],
    [25, 88],
    [75, 88],
  ],
};

// ============================================================
// Pip area (center of card with suit symbols arranged)
// ============================================================

interface PipAreaProps {
  suit: string;
  rank: string;
  color: string;
  pipSize: string;
  bigPipSize: string;
  faceSize: string;
}

const PipArea: FC<PipAreaProps> = ({ suit, rank, color, pipSize, bigPipSize, faceSize }) => {
  // Face cards: J, Q, K — show a large letter
  if (rank === 'J' || rank === 'Q' || rank === 'K') {
    return (
      <Box
        position="relative"
        w="100%"
        flex={1}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <Text fontSize={faceSize} fontWeight="bold" color={color} lineHeight={1}>
          {rank === 'J' ? '\u265E' : rank === 'Q' ? '\u265B' : '\u265A'}
        </Text>
        <Text fontSize={pipSize} color={color} lineHeight={1} mt="2px">
          {suit}
        </Text>
      </Box>
    );
  }

  // Ace — single large pip
  if (rank === 'A') {
    return (
      <Box w="100%" flex={1} display="flex" alignItems="center" justifyContent="center">
        <Text fontSize={bigPipSize} color={color} lineHeight={1}>
          {suit}
        </Text>
      </Box>
    );
  }

  // Number cards — arranged pips
  const positions = PIP_LAYOUTS[rank] ?? [];

  return (
    <Box position="relative" w="100%" flex={1}>
      {positions.map((pos, i) => (
        <Text
          key={i}
          position="absolute"
          left={`${pos[0]}%`}
          top={`${pos[1]}%`}
          transform="translate(-50%, -50%)"
          fontSize={pipSize}
          color={color}
          lineHeight={1}
        >
          {suit}
        </Text>
      ))}
    </Box>
  );
};

// ============================================================
// Card Component
// ============================================================

export const Card: FC<CardProps> = memo(
  ({ card, isSelected = false, isClickable = false, onClick, size = 'md' }) => {
    const s = SIZES[size];
    const color = card.isRed ? 'card.red' : 'card.black';

    return (
      <Box
        w={s.w}
        h={s.h}
        borderRadius="md"
        border="2px solid"
        borderColor={isSelected ? 'card.selected' : 'gray.500'}
        bg="white"
        cursor={isClickable || onClick ? 'pointer' : 'default'}
        onClick={onClick}
        transition="all 0.2s ease-in-out"
        transform={isSelected ? 'translateY(-12px)' : 'none'}
        shadow={isSelected ? '0 0 12px rgba(215, 172, 97, 0.5)' : 'sm'}
        _hover={
          isClickable || onClick
            ? { transform: isSelected ? 'translateY(-14px)' : 'translateY(-4px)', shadow: 'lg' }
            : {}
        }
        display="flex"
        flexDirection="column"
        position="relative"
        overflow="hidden"
        userSelect="none"
        aria-label={`${card.rank} of ${card.suit}`}
      >
        {/* Top-left corner */}
        <Box
          position="absolute"
          top="2px"
          left="3px"
          display="flex"
          flexDirection="column"
          alignItems="center"
          lineHeight={1}
        >
          <Text fontSize={s.corner} fontWeight="bold" color={color} lineHeight={1}>
            {card.rank}
          </Text>
          <Text fontSize={s.corner} color={color} lineHeight={1} mt="-1px">
            {card.suit}
          </Text>
        </Box>

        {/* Bottom-right corner (rotated 180) */}
        <Box
          position="absolute"
          bottom="2px"
          right="3px"
          display="flex"
          flexDirection="column"
          alignItems="center"
          lineHeight={1}
          transform="rotate(180deg)"
        >
          <Text fontSize={s.corner} fontWeight="bold" color={color} lineHeight={1}>
            {card.rank}
          </Text>
          <Text fontSize={s.corner} color={color} lineHeight={1} mt="-1px">
            {card.suit}
          </Text>
        </Box>

        {/* Center pip area */}
        <Box
          display="flex"
          flex={1}
          mx={size === 'sm' ? '10px' : '14px'}
          my={size === 'sm' ? '14px' : '18px'}
        >
          <PipArea
            suit={card.suit}
            rank={card.rank}
            color={color}
            pipSize={s.pip}
            bigPipSize={s.bigPip}
            faceSize={s.face}
          />
        </Box>
      </Box>
    );
  },
);

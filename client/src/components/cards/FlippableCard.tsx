import { FC, memo, useEffect, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { Card } from './Card';
import { CardBack } from './CardBack';
import type { Card as CardType } from '../../types/card.types';

// ============================================================
// Types
// ============================================================

export interface FlippableCardProps {
  /** The face-up card to show. When null, shows card back. */
  card: CardType | null;
  /** Whether the card should be flipped face-up */
  isFaceUp: boolean;
  isSelected?: boolean;
  isClickable?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

// ============================================================
// Dimensions per size — defined at module level, not inside component
// ============================================================

const SIZES = {
  sm: { w: '52px', h: '74px' },
  md: { w: '80px', h: '112px' },
  lg: { w: '100px', h: '140px' },
};

// ============================================================
// FlippableCard — CSS 3D card flip between CardBack and Card
// ============================================================

export const FlippableCard: FC<FlippableCardProps> = memo(
  ({ card, isFaceUp, isSelected = false, isClickable = false, onClick, size = 'md' }) => {
    // Track the last known card so the face stays visible during flip-back animation
    const [displayCard, setDisplayCard] = useState<CardType | null>(card);

    useEffect(() => {
      if (card) {
        setDisplayCard(card);
      }
    }, [card]);

    const s = SIZES[size];

    return (
      <Box
        w={s.w}
        h={s.h}
        position="relative"
        style={{ perspective: '600px' }}
        cursor={isClickable || onClick ? 'pointer' : 'default'}
        onClick={onClick}
      >
        <Box
          position="relative"
          w="100%"
          h="100%"
          transition="transform 0.5s ease-in-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front face (card back) */}
          <Box
            position="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <CardBack size={size} isSelected={isSelected} isClickable={false} />
          </Box>

          {/* Back face (card front — rotated 180deg so it shows when flipped) */}
          <Box
            position="absolute"
            top={0}
            left={0}
            w="100%"
            h="100%"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            {displayCard && (
              <Card card={displayCard} size={size} isSelected={isSelected} isClickable={false} />
            )}
          </Box>
        </Box>
      </Box>
    );
  },
);

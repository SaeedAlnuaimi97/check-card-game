import { FC, memo } from 'react';
import { Box } from '@chakra-ui/react';

// ============================================================
// Types
// ============================================================

export interface CardBackProps {
  isSelected?: boolean;
  isClickable?: boolean;
  isKnown?: boolean; // kept for API compatibility; no longer renders border/badge
  isBlindRound?: boolean; // Blind Rounds mode — darker bg + crossed-out eye icon
  onClick?: () => void;
  size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg';
}

// ============================================================
// Dimensions per size
// ============================================================

const SIZES = {
  '2xs': { w: '20px', h: '28px', diamond: '4px' },
  xs: { w: '36px', h: '50px', diamond: '6px' },
  sm: { w: '52px', h: '74px', diamond: '8px' },
  md: { w: '80px', h: '112px', diamond: '12px' },
  lg: { w: '100px', h: '140px', diamond: '14px' },
};

// ============================================================
// CardBack Component — Diamond grid geometric pattern
// ============================================================

export const CardBack: FC<CardBackProps> = memo(
  ({
    isSelected = false,
    isClickable = false,
    isKnown: _isKnown = false, // kept for API compatibility, no longer renders
    isBlindRound = false,
    onClick,
    size = 'md',
  }) => {
    const s = SIZES[size];
    const d = s.diamond; // diamond cell size
    const isCompact = size === '2xs' || size === 'xs';

    // CSS diamond grid via repeating linear gradients
    // Creates a repeating diamond/rhombus pattern
    const diamondPattern = [
      `linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%)`,
      `linear-gradient(-45deg, rgba(255,255,255,0.08) 25%, transparent 25%)`,
      `linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.08) 75%)`,
      `linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.08) 75%)`,
    ].join(', ');

    // Border color priority: selected > default
    const borderColor = isSelected ? '#c9a227' : undefined;

    return (
      <Box
        w={s.w}
        h={s.h}
        borderRadius={isCompact ? 'sm' : 'md'}
        border={isCompact ? '1px solid' : '2px solid'}
        borderColor={
          borderColor ?? (isSelected ? 'card.selected' : isBlindRound ? '#2a2a5a' : 'gray.500')
        }
        bg={isBlindRound ? '#1a1a3a' : 'card.back'}
        cursor={isClickable || onClick ? 'pointer' : 'default'}
        onClick={onClick}
        transition="all 0.2s ease-in-out"
        transform={isSelected ? 'translateY(-12px)' : 'none'}
        shadow={isSelected ? '0 0 12px rgba(215, 172, 97, 0.5)' : isCompact ? 'none' : 'sm'}
        _hover={
          isClickable || onClick
            ? { transform: isSelected ? 'translateY(-14px)' : 'translateY(-4px)', shadow: 'lg' }
            : {}
        }
        display="flex"
        alignItems="center"
        justifyContent="center"
        position="relative"
        overflow="hidden"
        userSelect="none"
      >
        {/* Inner decorative frame — hidden at compact sizes and blind rounds */}
        {!isCompact && !isBlindRound && (
          <Box
            position="absolute"
            inset="3px"
            borderRadius="sm"
            border="1.5px solid"
            borderColor="brand.400"
            opacity={0.25}
          />
        )}

        {isBlindRound ? (
          /* Blind round: crossed-out eye icon instead of diamond grid */
          <svg
            width={isCompact ? '14' : '24'}
            height={isCompact ? '10' : '16'}
            viewBox="0 0 24 16"
            fill="none"
            style={{ opacity: 0.15, zIndex: 1 }}
          >
            {/* Eye shape */}
            <path
              d="M1 8C1 8 5 1 12 1C19 1 23 8 23 8C23 8 19 15 12 15C5 15 1 8 1 8Z"
              stroke="white"
              strokeWidth="1.5"
              fill="none"
            />
            {/* Pupil */}
            <circle cx="12" cy="8" r="3" stroke="white" strokeWidth="1.5" fill="none" />
            {/* Diagonal strike-through */}
            <line
              x1="4"
              y1="14"
              x2="20"
              y2="2"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <>
            {/* Diamond grid pattern fill */}
            <Box
              position="absolute"
              inset={isCompact ? '2px' : '6px'}
              borderRadius="sm"
              backgroundImage={diamondPattern}
              backgroundSize={`${d} ${d}`}
              backgroundPosition={`0 0, 0 ${parseInt(d) / 2}px, ${parseInt(d) / 2}px -${parseInt(d) / 2}px, ${parseInt(d) / 2}px 0`}
            />

            {/* Center diamond accent — hidden at compact sizes */}
            {!isCompact && (
              <Box
                w={`${parseInt(d) + 4}px`}
                h={`${parseInt(d) + 4}px`}
                transform="rotate(45deg)"
                border="1.5px solid"
                borderColor="brand.300"
                opacity={0.35}
                zIndex={1}
                bg="brand.600"
              />
            )}
          </>
        )}
      </Box>
    );
  },
);

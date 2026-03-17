import { FC } from 'react';
import { Box } from '@chakra-ui/react';

// ============================================================
// Types
// ============================================================

export interface CardBackProps {
  isSelected?: boolean;
  isClickable?: boolean;
  isKnown?: boolean; // RS-007: gold border + eye badge for peeked cards
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

export const CardBack: FC<CardBackProps> = ({
  isSelected = false,
  isClickable = false,
  isKnown = false,
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

  // Border color priority: selected > known > default
  const borderColor = isSelected ? '#c9a227' : isKnown ? '#c9a227' : undefined;

  return (
    <Box
      w={s.w}
      h={s.h}
      borderRadius={isCompact ? 'sm' : 'md'}
      border={isCompact ? '1px solid' : '2px solid'}
      borderColor={borderColor ?? (isSelected ? 'card.selected' : 'gray.500')}
      boxShadow={isKnown && !isSelected ? '0 0 0 1px #c9a22740' : undefined}
      bg="card.back"
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
      {/* Inner decorative frame — hidden at compact sizes */}
      {!isCompact && (
        <Box
          position="absolute"
          inset="3px"
          borderRadius="sm"
          border="1.5px solid"
          borderColor="brand.400"
          opacity={0.25}
        />
      )}

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

      {/* RS-007: Eye badge for known (peeked) cards */}
      {isKnown && !isCompact && (
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
          zIndex={2}
        >
          <svg viewBox="0 0 10 7" fill="none" width="8" height="8">
            <ellipse cx="5" cy="3.5" rx="4" ry="2.5" stroke="white" strokeWidth="1" />
            <circle cx="5" cy="3.5" r="1.2" fill="white" />
          </svg>
        </Box>
      )}
    </Box>
  );
};

import { useState, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Text, VStack, useToast } from '@chakra-ui/react';
import { useSocket } from '../context/SocketContext';
import type { GameMode } from '../types/game.types';

// ============================================================
// Mode Definitions
// ============================================================

interface ModeInfo {
  id: GameMode;
  title: string;
  subtitle: string;
  description: string;
  image: string;
}

const MODES: ModeInfo[] = [
  {
    id: 'classic',
    title: 'CLASSIC',
    subtitle: 'The original experience',
    description: '4 cards, multi-round, 2-10 players',
    image: '/mode_classic.png',
  },
  {
    id: 'suddenDeath',
    title: 'SUDDEN DEATH',
    subtitle: 'One round. No second chances.',
    description: '6 cards, instant check, 2-6 players',
    image: '/mode_sudden_death.png',
  },
  {
    id: 'bountyHunt',
    title: 'BOUNTY HUNT',
    subtitle: 'Hunt the bounty. Burn for bonus.',
    description: 'Bounty rank each round, 2-10 players',
    image: '/mode_bounty_hunter.png',
  },
  {
    id: 'blindRounds',
    title: 'BLIND ROUNDS',
    subtitle: 'Every 3rd round, you go in blind.',
    description: 'No peek, hidden opponents, 2-10 players',
    image: '/mode_blind_rounds.png',
  },
];

// ============================================================
// Mode Card Component
// ============================================================

interface ModeCardProps {
  mode: ModeInfo;
  isCreating: boolean;
  onClick: () => void;
}

const ModeCard: FC<ModeCardProps> = ({ mode, isCreating, onClick }) => (
  <Box
    as="button"
    w="100%"
    h="120px"
    position="relative"
    borderRadius="12px"
    overflow="hidden"
    cursor={isCreating ? 'not-allowed' : 'pointer'}
    opacity={isCreating ? 0.6 : 1}
    border="1px solid #2a2a3a"
    bg="#13131a"
    onClick={onClick}
    transition="transform 0.15s, border-color 0.15s"
    _hover={{ transform: 'translateY(-2px)', borderColor: '#4a4a5a' }}
    _active={{ transform: 'scale(0.98)' }}
    textAlign="left"
    display="block"
  >
    {/* Background image */}
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bgImage={`url(${mode.image})`}
      bgSize="cover"
      bgPosition="center"
    />
    {/* Dark gradient overlay — opaque on left, transparent on right */}
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="linear-gradient(to right, rgba(15,15,20,0.92) 0%, rgba(15,15,20,0.75) 50%, rgba(15,15,20,0.3) 100%)"
    />
    {/* Text content */}
    <Box
      position="relative"
      zIndex={1}
      h="100%"
      display="flex"
      flexDirection="column"
      justifyContent="center"
      px="20px"
      maxW="65%"
    >
      <Text
        fontSize="16px"
        fontWeight="800"
        color="#eee"
        letterSpacing="0.06em"
        lineHeight="1.2"
        mb="4px"
      >
        {mode.title}
      </Text>
      <Text fontSize="12px" color="#aaa" fontWeight="500" lineHeight="1.3" mb="2px">
        {mode.subtitle}
      </Text>
      <Text fontSize="11px" color="#555" lineHeight="1.3">
        {mode.description}
      </Text>
    </Box>
  </Box>
);

// ============================================================
// Mode Picker Page
// ============================================================

export const ModePicker: FC = () => {
  const [isCreating, setIsCreating] = useState(false);
  const { createRoom } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();

  // Retrieve stored username
  const username = localStorage.getItem('username') || '';

  const handleSelectMode = async (mode: GameMode) => {
    if (isCreating || !username) return;

    setIsCreating(true);
    const result = await createRoom(username, mode);
    setIsCreating(false);

    if (result.success && result.roomCode) {
      navigate(`/lobby/${result.roomCode}`);
    } else {
      toast({
        title: 'Failed to create room',
        description: result.error,
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    }
  };

  return (
    <Box
      h="100dvh"
      display="flex"
      flexDirection="column"
      bg="#0f0f16"
      color="white"
      overflow="hidden"
    >
      {/* Header */}
      <Box px="20px" pt="20px" pb="8px">
        <Box
          as="button"
          fontSize="13px"
          color="#5a5a7a"
          bg="transparent"
          border="none"
          cursor="pointer"
          mb="16px"
          _hover={{ color: '#8a8aaa' }}
          onClick={() => navigate('/')}
        >
          &larr; Back
        </Box>
        <Text fontSize="18px" fontWeight="700" color="#eee" mb="4px">
          Choose Game Mode
        </Text>
        <Text fontSize="12px" color="#555">
          Select a mode to create your room
        </Text>
      </Box>

      {/* Mode cards */}
      <Box flex={1} overflow="auto" px="20px" py="12px">
        <VStack spacing="12px" maxW="480px" mx="auto" w="100%" pb="20px">
          {MODES.map((mode) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              isCreating={isCreating}
              onClick={() => handleSelectMode(mode.id)}
            />
          ))}
        </VStack>
      </Box>
    </Box>
  );
};

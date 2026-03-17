import { useState, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { useSocket } from '../context/SocketContext';
import { Card } from '../components/cards/Card';
import type { Card as CardType } from '../types/card.types';

// ============================================================
// How to Play — face card data
// ============================================================

const FACE_CARDS: Array<{ rank: 'J' | 'Q' | 'K'; effect: string }> = [
  { rank: 'J', effect: "Blind-swap one of your cards with any opponent's." },
  { rank: 'Q', effect: 'Peek at one of your own face-down cards.' },
  { rank: 'K', effect: 'Draw 2 extra cards; keep 0, 1, or 2 (swap into hand).' },
];

const SUITS: Array<{ suit: CardType['suit']; isRed: boolean }> = [
  { suit: '♥', isRed: true },
  { suit: '♦', isRed: true },
  { suit: '♠', isRed: false },
  { suit: '♣', isRed: false },
];

// ============================================================
// Logo component — uses logo.png image
// ============================================================

const CheckLogo: FC = () => (
  <Box
    display="flex"
    flexDirection="column"
    alignItems="center"
    gap={0}
    flex={1}
    justifyContent="center"
    pt="48px"
    pb="20px"
  >
    <Box
      as="img"
      src="/logo.png"
      alt="Check"
      h="200px"
      maxW="80vw"
      userSelect="none"
      draggable="false"
    />
    {/* Gold glow under logo */}
    <Box
      w="120px"
      h="20px"
      mt="4px"
      bg="radial-gradient(ellipse, #c9a22740 0%, transparent 70%)"
      sx={{
        '@keyframes logoPulse': {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 1 },
        },
        animation: 'logoPulse 3s ease-in-out infinite',
      }}
    />
  </Box>
);

export const HomePage: FC = () => {
  const [username, setUsername] = useState('');
  const [usernameConfirmed, setUsernameConfirmed] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const { isConnected, createRoom, joinRoom } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();
  const {
    isOpen: isHowToPlayOpen,
    onOpen: onHowToPlayOpen,
    onClose: onHowToPlayClose,
  } = useDisclosure();

  const handleConfirmUsername = () => {
    if (!username.trim()) {
      toast({ title: 'Enter a username', status: 'warning', duration: 2000, position: 'top' });
      return;
    }
    setUsernameConfirmed(true);
  };

  const handleChangeClick = () => {
    setUsernameConfirmed(false);
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    const result = await createRoom(username.trim());
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

  const handleJoinRoom = async () => {
    const trimmedCode = roomCode.trim().toUpperCase();
    if (!trimmedCode) {
      toast({ title: 'Enter a room code', status: 'warning', duration: 2000, position: 'top' });
      return;
    }

    setIsJoining(true);
    const result = await joinRoom(trimmedCode, username.trim());
    setIsJoining(false);

    if (result.success) {
      navigate(`/lobby/${trimmedCode}`);
    } else {
      toast({
        title: 'Failed to join room',
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
      {/* Logo — flex:1, vertically centered */}
      <CheckLogo />

      {/* Connection status row */}
      <Box display="flex" flexDirection="column" alignItems="center" gap="4px" mb="20px">
        <HStack spacing="6px" justify="center">
          <Box
            w="8px"
            h="8px"
            borderRadius="full"
            bg={isConnected ? '#4ecb4e' : '#cf5e5e'}
            flexShrink={0}
          />
          <Text fontSize="12px" color="#888">
            {isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </HStack>

        {/* Welcome row — shown after username confirmed */}
        {usernameConfirmed && (
          <HStack spacing="4px" justify="center">
            <Text fontSize="14px" color="#888">
              Welcome,{' '}
              <Box as="span" color="#7a7aee" fontWeight="600">
                {username.trim()}
              </Box>
            </Text>
            <Box
              as="span"
              fontSize="13px"
              color="#4a4a6a"
              cursor="pointer"
              onClick={handleChangeClick}
              _hover={{ color: '#7a7aaa' }}
            >
              (change)
            </Box>
          </HStack>
        )}
      </Box>

      {/* Form area — pinned to bottom */}
      <Box
        px="20px"
        pb="28px"
        display="flex"
        flexDirection="column"
        gap="10px"
        maxW="480px"
        mx="auto"
        w="100%"
      >
        {!usernameConfirmed ? (
          /* Step 1: Username entry */
          <>
            <Input
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={10}
              bg="#1a1a28"
              border="1.5px solid #3a3a5a"
              borderRadius="10px"
              color="#eee"
              fontSize="14px"
              px="14px"
              py="13px"
              h="auto"
              _placeholder={{ color: '#444' }}
              _hover={{ borderColor: '#3a3a5a' }}
              _focus={{ borderColor: '#6a6aaa', boxShadow: 'none', outline: 'none' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmUsername();
              }}
              autoFocus
            />
            <Box
              as="button"
              w="100%"
              px="0"
              py="13px"
              borderRadius="10px"
              bg={!isConnected || !username.trim() ? '#2a5a3a' : '#4a8a5a'}
              color="#e8f5ec"
              fontSize="15px"
              fontWeight="600"
              border="none"
              cursor={!isConnected || !username.trim() ? 'not-allowed' : 'pointer'}
              opacity={!isConnected || !username.trim() ? 0.6 : 1}
              _hover={{}}
              onClick={handleConfirmUsername}
              sx={{
                '&:hover:not([disabled])': { background: '#3a7a4a' },
              }}
            >
              Continue
            </Box>
            <Box
              as="button"
              textAlign="center"
              fontSize="13px"
              color="#5a5a7a"
              cursor="pointer"
              bg="transparent"
              border="none"
              pb="8px"
              onClick={onHowToPlayOpen}
              _hover={{ color: '#8a8aaa' }}
            >
              How to Play
            </Box>
          </>
        ) : (
          /* Step 2: Create or Join */
          <>
            {/* Create Room — btn-primary green */}
            <Box
              as="button"
              w="100%"
              py="13px"
              borderRadius="10px"
              bg={!isConnected || isCreating ? '#2a5a3a' : '#4a8a5a'}
              color="#e8f5ec"
              fontSize="15px"
              fontWeight="600"
              border="none"
              cursor={!isConnected || isCreating ? 'not-allowed' : 'pointer'}
              opacity={!isConnected || isCreating ? 0.7 : 1}
              onClick={handleCreateRoom}
              sx={{
                '&:hover:not([disabled])': { background: '#3a7a4a' },
              }}
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </Box>

            {/* OR Divider */}
            <HStack spacing="8px">
              <Box flex={1} h="0.5px" bg="#222" />
              <Text fontSize="11px" color="#444">
                OR
              </Text>
              <Box flex={1} h="0.5px" bg="#222" />
            </HStack>

            {/* Room code input */}
            <Input
              placeholder="ENTER ROOM CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              bg="#1a1a28"
              border="1.5px solid #3a3a5a"
              borderRadius="10px"
              color={roomCode ? '#c9a227' : '#eee'}
              fontSize="15px"
              fontWeight="600"
              px="14px"
              py="13px"
              h="auto"
              textTransform="uppercase"
              letterSpacing="0.18em"
              textAlign="center"
              _placeholder={{
                color: '#3a3a4a',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
              _hover={{ borderColor: '#3a3a5a' }}
              _focus={{ borderColor: '#6a6aaa', boxShadow: 'none', outline: 'none' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinRoom();
              }}
            />

            {/* Join Room — btn-secondary */}
            <Box
              as="button"
              w="100%"
              py="12px"
              borderRadius="10px"
              bg="#1c1c2e"
              border="1px solid #2a2a3a"
              color="#888"
              fontSize="14px"
              cursor={!isConnected || !roomCode.trim() || isJoining ? 'not-allowed' : 'pointer'}
              opacity={!isConnected || !roomCode.trim() || isJoining ? 0.6 : 1}
              onClick={handleJoinRoom}
            >
              {isJoining ? 'Joining...' : 'Join Room'}
            </Box>

            <Box
              as="button"
              textAlign="center"
              fontSize="13px"
              color="#5a5a7a"
              cursor="pointer"
              bg="transparent"
              border="none"
              pb="8px"
              onClick={onHowToPlayOpen}
              _hover={{ color: '#8a8aaa' }}
            >
              How to Play
            </Box>
          </>
        )}
      </Box>

      {/* How to Play Modal */}
      <Modal
        isOpen={isHowToPlayOpen}
        onClose={onHowToPlayClose}
        size="xl"
        scrollBehavior="inside"
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="#1c1c28" color="white" mx={4} border="0.5px solid #2a2a3a">
          <ModalHeader borderBottom="1px solid #2a2a3a" fontSize="lg">
            How to Play — Check - The Card Game
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} fontSize="sm">
            <VStack align="stretch" spacing={4}>
              {/* Goal + Setup */}
              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={1}>
                  Goal
                </Text>
                <Text color="gray.300">
                  Lowest hand total wins each round. First player to reach score target points loses
                  the game.
                </Text>
              </Box>

              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={1}>
                  Setup
                </Text>
                <Text color="gray.300">
                  Each player gets 4 face-down cards (A–D). You briefly peek at 2 of them — memorize
                  them!
                </Text>
              </Box>

              {/* Card Values */}
              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={2}>
                  Card Values
                </Text>
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th color="gray.400" borderColor="#2a2a3a">
                        Card
                      </Th>
                      <Th color="gray.400" borderColor="#2a2a3a" isNumeric>
                        Points
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {[
                      ['Red 10 (♥ ♦)', '0'],
                      ['Ace', '1'],
                      ['2 – 9', 'Face value'],
                      ['10, J, Q, K (black)', '10'],
                      ['J, Q, K (red)', '10 + special effect'],
                    ].map(([card, pts]) => (
                      <Tr key={card}>
                        <Td color="gray.300" borderColor="#2a2a3a">
                          {card}
                        </Td>
                        <Td color="#c9a227" borderColor="#2a2a3a" isNumeric>
                          {pts}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              {/* Your Turn */}
              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={2}>
                  On Your Turn — pick one:
                </Text>
                <VStack align="stretch" spacing={1}>
                  {[
                    [
                      'Draw from deck',
                      'Swap it with a hand card, or discard it. Discarding a red J/Q/K triggers its special effect.',
                    ],
                    ['Take from discard', 'Hold 2 sec to take — must swap with a hand card.'],
                    [
                      'Burn a card',
                      'Play a hand card matching the top discard. Match = card removed. Miss = penalty card added.',
                    ],
                  ].map(([title, desc]) => (
                    <Box key={title} bg="#1a1a28" px={3} py={2} borderRadius="md">
                      <Text fontWeight="semibold" color="white" display="inline">
                        {title} —{' '}
                      </Text>
                      <Text color="gray.300" display="inline">
                        {desc}
                      </Text>
                    </Box>
                  ))}
                </VStack>
              </Box>

              {/* Special Effects */}
              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={2}>
                  Red Face Card Effects
                </Text>
                <VStack align="stretch" spacing={2}>
                  {FACE_CARDS.map(({ rank, effect }) => (
                    <Box key={rank} bg="#1a1a28" px={3} py={2} borderRadius="md">
                      <HStack spacing={2} align="center" flexWrap="wrap">
                        {SUITS.map(({ suit, isRed }) => {
                          const cardObj: CardType = {
                            id: `how-to-play-${rank}-${suit}`,
                            suit,
                            rank,
                            value: 10,
                            isRed,
                          };
                          return (
                            <Box key={suit} opacity={isRed ? 1 : 0.35} flexShrink={0}>
                              <Card card={cardObj} size="sm" />
                            </Box>
                          );
                        })}
                        <Text color="gray.300" fontSize="xs" flex={1} minW="100px">
                          {effect}
                        </Text>
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              </Box>

              {/* Check + Scoring */}
              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={1}>
                  Calling CHECK
                </Text>
                <Text color="gray.300">
                  Before your turn, call CHECK if you think you have the lowest hand. Everyone else
                  gets one final turn. If you're wrong, your score doubles that round.
                </Text>
              </Box>

              <Box>
                <Text fontWeight="bold" color="#7a7aee" mb={1}>
                  Scoring
                </Text>
                <Text color="gray.300">
                  Round winner scores 0. Others add their hand total. Hit 100+ and you lose.
                </Text>
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

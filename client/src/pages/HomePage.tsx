import { useState, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  HStack,
  Image,
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
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="#406093"
      color="white"
      p={4}
    >
      <VStack spacing={8} w={{ base: '100%', sm: '400px' }}>
        {/* Logo */}
        <Image
          src="/logo.png"
          alt="Check Card Game Logo"
          w={{ base: '220px', sm: '280px', md: '320px' }}
          objectFit="contain"
          filter="drop-shadow(0 0 24px rgba(99, 179, 237, 0.3))"
        />

        {/* Connection status */}
        <HStack spacing={2}>
          <Box w={2} h={2} borderRadius="full" bg={isConnected ? 'green.400' : 'red.400'} />
          <Text fontSize="sm" color="gray.500">
            {isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </HStack>

        {!usernameConfirmed ? (
          /* Step 1: Username entry */
          <VStack spacing={4} w="100%">
            <Input
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              size="lg"
              bg="#2e4a73"
              border="1px solid"
              borderColor="gray.600"
              _hover={{ borderColor: 'gray.500' }}
              _focus={{
                borderColor: 'brand.400',
                boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmUsername();
              }}
              autoFocus
            />
            <Button
              colorScheme="green"
              size="lg"
              w="100%"
              onClick={handleConfirmUsername}
              isDisabled={!isConnected || !username.trim()}
            >
              Continue
            </Button>
          </VStack>
        ) : (
          /* Step 2: Create or Join */
          <VStack spacing={6} w="100%">
            {/* Greeting */}
            <HStack spacing={2}>
              <Text fontSize="md" color="gray.400">
                Welcome,
              </Text>
              <Text fontSize="md" fontWeight="bold" color="brand.300">
                {username.trim()}
              </Text>
              <Button
                variant="link"
                size="sm"
                color="gray.500"
                onClick={handleChangeClick}
                _hover={{ color: 'gray.300' }}
              >
                (change)
              </Button>
            </HStack>

            {/* Create Room */}
            <Button
              colorScheme="green"
              size="lg"
              w="100%"
              onClick={handleCreateRoom}
              isLoading={isCreating}
              isDisabled={!isConnected}
            >
              Create Room
            </Button>

            {/* Divider */}
            <HStack w="100%" spacing={4}>
              <Box flex={1} h="1px" bg="gray.600" />
              <Text fontSize="sm" color="gray.500">
                OR
              </Text>
              <Box flex={1} h="1px" bg="gray.600" />
            </HStack>

            {/* Join Room */}
            <VStack spacing={4} w="100%">
              <Input
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                size="lg"
                bg="#2e4a73"
                border="1px solid"
                borderColor="gray.600"
                textTransform="uppercase"
                letterSpacing="wider"
                textAlign="center"
                fontWeight="bold"
                _hover={{ borderColor: 'gray.500' }}
                _focus={{
                  borderColor: 'brand.400',
                  boxShadow: '0 0 0 1px var(--chakra-colors-brand-400)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinRoom();
                }}
                autoFocus
              />
              <Button
                colorScheme="blue"
                size="lg"
                w="100%"
                onClick={handleJoinRoom}
                isLoading={isJoining}
                isDisabled={!isConnected || !roomCode.trim()}
              >
                Join Room
              </Button>
            </VStack>
          </VStack>
        )}

        {/* How to Play button */}
        <Button
          variant="ghost"
          color="gray.500"
          size="sm"
          onClick={onHowToPlayOpen}
          _hover={{ color: 'gray.200' }}
        >
          How to Play
        </Button>
      </VStack>

      {/* How to Play Modal */}
      <Modal
        isOpen={isHowToPlayOpen}
        onClose={onHowToPlayClose}
        size="xl"
        scrollBehavior="inside"
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="#2e4a73" color="white" mx={4}>
          <ModalHeader borderBottom="1px solid" borderColor="gray.700" fontSize="lg">
            How to Play — Check Card Game
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} fontSize="sm">
            <VStack align="stretch" spacing={4}>
              {/* Goal + Setup */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Goal
                </Text>
                <Text color="gray.300">
                  Lowest hand total wins each round. First player to reach 100+ points loses the
                  game.
                </Text>
              </Box>

              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Setup
                </Text>
                <Text color="gray.300">
                  Each player gets 4 face-down cards (A–D). You briefly peek at 2 of them — memorize
                  them!
                </Text>
              </Box>

              {/* Card Values */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={2}>
                  Card Values
                </Text>
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th color="gray.400" borderColor="gray.600">
                        Card
                      </Th>
                      <Th color="gray.400" borderColor="gray.600" isNumeric>
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
                        <Td color="gray.300" borderColor="gray.700">
                          {card}
                        </Td>
                        <Td color="yellow.300" borderColor="gray.700" isNumeric>
                          {pts}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              {/* Your Turn */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={2}>
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
                    <Box key={title} bg="gray.700" px={3} py={2} borderRadius="md">
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
                <Text fontWeight="bold" color="brand.300" mb={2}>
                  Red Face Card Effects
                </Text>
                <VStack align="stretch" spacing={2}>
                  {FACE_CARDS.map(({ rank, effect }) => (
                    <Box key={rank} bg="gray.700" px={3} py={2} borderRadius="md">
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
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Calling CHECK
                </Text>
                <Text color="gray.300">
                  Before your turn, call CHECK if you think you have the lowest hand. Everyone else
                  gets one final turn. If you're wrong, your score doubles that round.
                </Text>
              </Box>

              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
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

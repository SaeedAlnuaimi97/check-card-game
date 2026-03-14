import { useState, useEffect, FC } from 'react';
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

export const HomePage: FC = () => {
  const [username, setUsername] = useState('');
  const [usernameConfirmed, setUsernameConfirmed] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const { isConnected, createRoom, joinRoom, storedUsername } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();
  const {
    isOpen: isHowToPlayOpen,
    onOpen: onHowToPlayOpen,
    onClose: onHowToPlayClose,
  } = useDisclosure();

  // When the socket returns a stored username for a returning guest, pre-fill and skip to step 2
  useEffect(() => {
    if (storedUsername && !usernameConfirmed) {
      setUsername(storedUsername);
      setUsernameConfirmed(true);
    }
  }, [storedUsername, usernameConfirmed]);

  const handleConfirmUsername = () => {
    if (!username.trim()) {
      toast({ title: 'Enter a username', status: 'warning', duration: 2000, position: 'top' });
      return;
    }
    setUsernameConfirmed(true);
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    const result = await createRoom(username.trim());
    setIsCreating(false);

    if (result.success) {
      navigate('/room');
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
      navigate('/room');
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
      bg="gray.900"
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
              bg="gray.800"
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
                onClick={() => setUsernameConfirmed(false)}
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
                bg="gray.800"
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

        {/* Leaderboard link (F-240) */}
        <Button
          variant="ghost"
          color="gray.400"
          size="sm"
          onClick={() => navigate('/leaderboard')}
          _hover={{ color: 'gray.200' }}
        >
          View Leaderboard
        </Button>

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
        <ModalContent bg="gray.800" color="white" mx={4}>
          <ModalHeader borderBottom="1px solid" borderColor="gray.700" fontSize="lg">
            How to Play — Check Card Game
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6} fontSize="sm">
            <VStack align="stretch" spacing={5}>
              {/* Goal */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Goal
                </Text>
                <Text color="gray.300">
                  Have the lowest total card value in your hand when a round ends. Avoid reaching
                  100 points across rounds — the first player to hit 100+ loses.
                </Text>
              </Box>

              {/* Setup */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Setup
                </Text>
                <Text color="gray.300">
                  4–6 players. Each player is dealt 4 face-down cards (slots A, B, C, D). At the
                  start you briefly see 2 of your 4 cards — memorize them! All cards then flip
                  face-down and you must remember what you have.
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
                      ['Red 10 (♥ ♦)', '0 — best card!'],
                      ['Ace', '1'],
                      ['2 – 9', 'Face value'],
                      ['Black 10 (♠ ♣)', '10'],
                      ['Jack, Queen, King', '10'],
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

              {/* Turn Actions */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={2}>
                  On Your Turn
                </Text>
                <VStack align="stretch" spacing={2}>
                  <Box bg="gray.700" p={3} borderRadius="md">
                    <Text fontWeight="semibold" color="white" mb={1}>
                      1. Draw from Deck
                    </Text>
                    <Text color="gray.300">
                      Draw a face-down card privately. Then either discard it (keep your hand) or
                      swap it with one of your hand cards. If you discard a red J/Q/K you just drew,
                      its special effect activates.
                    </Text>
                  </Box>
                  <Box bg="gray.700" p={3} borderRadius="md">
                    <Text fontWeight="semibold" color="white" mb={1}>
                      2. Take from Discard
                    </Text>
                    <Text color="gray.300">
                      Hold the discard pile card for 2 seconds to take it. You must then swap it
                      with one of your hand cards. No special effects.
                    </Text>
                  </Box>
                  <Box bg="gray.700" p={3} borderRadius="md">
                    <Text fontWeight="semibold" color="white" mb={1}>
                      3. Burn a Card
                    </Text>
                    <Text color="gray.300">
                      Select a hand card whose rank matches the top discard card. On success, the
                      card is removed from your hand. On failure, you keep your card and draw a
                      penalty card face-down.
                    </Text>
                  </Box>
                </VStack>
              </Box>

              {/* Special Effects */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={2}>
                  Special Effects (Red Face Cards)
                </Text>
                <Text color="gray.400" fontSize="xs" mb={2}>
                  Only triggers when you DRAW and then DISCARD a red J/Q/K from the deck.
                </Text>
                <VStack align="stretch" spacing={2}>
                  {[
                    [
                      'Red Jack ♥♦',
                      'Blind-swap one of your cards with any opponent card. Optional — you can skip.',
                    ],
                    ['Red Queen ♥♦', 'Peek at one of your own face-down cards privately.'],
                    [
                      'Red King ♥♦',
                      'Draw 2 extra cards privately. Choose to return both, keep 1, or keep 2 (replace hand cards).',
                    ],
                  ].map(([title, desc]) => (
                    <Box key={title} bg="gray.700" p={3} borderRadius="md">
                      <Text fontWeight="semibold" color="red.300" mb={1}>
                        {title}
                      </Text>
                      <Text color="gray.300">{desc}</Text>
                    </Box>
                  ))}
                </VStack>
              </Box>

              {/* Check */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Calling CHECK
                </Text>
                <Text color="gray.300">
                  At the start of your turn (before acting), you can call CHECK if you think you
                  have the lowest hand. You still take your normal turn. Every other player gets one
                  final turn, then the round ends. If you called CHECK but don&apos;t have the
                  lowest hand, your score is doubled for that round!
                </Text>
              </Box>

              {/* Scoring */}
              <Box>
                <Text fontWeight="bold" color="brand.300" mb={1}>
                  Scoring
                </Text>
                <Text color="gray.300">
                  Round winner (lowest sum) scores 0. All others add their hand sum to their total.
                  The game ends when any player hits 100+ — that player loses, and the one with the
                  lowest total wins.
                </Text>
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

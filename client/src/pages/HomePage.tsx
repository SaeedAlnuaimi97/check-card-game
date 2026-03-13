import { useState, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, HStack, Image, Input, Text, useToast, VStack } from '@chakra-ui/react';
import { useSocket } from '../context/SocketContext';

export const HomePage: FC = () => {
  const [username, setUsername] = useState('');
  const [usernameConfirmed, setUsernameConfirmed] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const { isConnected, createRoom, joinRoom } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();

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
      </VStack>
    </Box>
  );
};

import { useState, FC } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Input, Text, useToast, VStack, Heading, HStack } from '@chakra-ui/react';
import { useSocket } from '../context/SocketContext';

export const LobbyJoin: FC = () => {
  const { code } = useParams<{ code: string }>();
  const [username, setUsername] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const { isConnected, joinRoom } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();

  const roomCode = (code ?? '').toUpperCase();

  const handleJoin = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      toast({ title: 'Enter a username', status: 'warning', duration: 2000, position: 'top' });
      return;
    }

    setIsJoining(true);
    const result = await joinRoom(roomCode, trimmedUsername);
    setIsJoining(false);

    if (result.success) {
      navigate('/room');
    } else {
      let title = 'Failed to join room';
      let description = result.error;

      if (result.error === 'Room not found') {
        title = 'Room not found';
        description = `No room with code ${roomCode} exists.`;
      } else if (result.error === 'Game already started') {
        title = 'Game already started';
        description = 'This game is already in progress.';
      } else if (result.error === 'Room is full') {
        title = 'Room is full';
        description = 'This room has reached the maximum number of players.';
      }

      toast({
        title,
        description,
        status: 'error',
        duration: 4000,
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
        <VStack spacing={2}>
          <Heading size="lg">Join Room</Heading>
          <HStack spacing={2}>
            <Text fontSize="sm" color="gray.400">
              Room code:
            </Text>
            <Text
              fontSize="sm"
              fontWeight="bold"
              color="brand.300"
              letterSpacing="wider"
              fontFamily="mono"
            >
              {roomCode}
            </Text>
          </HStack>
        </VStack>

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
              if (e.key === 'Enter') handleJoin();
            }}
            autoFocus
          />

          <Button
            colorScheme="blue"
            size="lg"
            w="100%"
            onClick={handleJoin}
            isLoading={isJoining}
            isDisabled={!isConnected || !username.trim()}
          >
            Join Room
          </Button>

          <Button
            variant="ghost"
            color="gray.500"
            size="sm"
            onClick={() => navigate('/')}
            _hover={{ color: 'gray.300' }}
          >
            Back to Home
          </Button>
        </VStack>
      </VStack>
    </Box>
  );
};

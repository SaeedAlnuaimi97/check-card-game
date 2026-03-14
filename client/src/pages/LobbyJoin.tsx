import { useState, useRef, FC } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Input,
  Text,
  useToast,
  VStack,
  Heading,
  HStack,
} from '@chakra-ui/react';
import { useSocket } from '../context/SocketContext';

export const LobbyJoin: FC = () => {
  const { code } = useParams<{ code: string }>();
  const [username, setUsername] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const { isConnected, joinRoom, storedUsername, deleteGuestProfile } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();

  const roomCode = (code ?? '').toUpperCase();

  // Effective username: stored (returning user) or typed
  const effectiveUsername = storedUsername ?? username;

  const handleJoin = async () => {
    const trimmedUsername = effectiveUsername.trim();
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

  const handleConfirmLogout = async () => {
    setIsDeleting(true);
    await deleteGuestProfile();
    setIsDeleting(false);
    setShowLogoutDialog(false);
    setUsername('');
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
          {storedUsername ? (
            /* Returning user — show welcome back + change option */
            <VStack spacing={1} align="start" w="100%">
              <HStack spacing={2}>
                <Text fontSize="sm" color="gray.400">
                  Welcome back,
                </Text>
                <Text fontSize="sm" fontWeight="bold" color="brand.300">
                  {storedUsername}
                </Text>
                <Button
                  variant="link"
                  size="sm"
                  color="gray.500"
                  onClick={() => setShowLogoutDialog(true)}
                  _hover={{ color: 'gray.300' }}
                >
                  (change)
                </Button>
              </HStack>
            </VStack>
          ) : (
            /* New user — username input */
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
          )}

          <Button
            colorScheme="blue"
            size="lg"
            w="100%"
            onClick={handleJoin}
            isLoading={isJoining}
            isDisabled={!isConnected || !effectiveUsername.trim()}
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

      {/* Logout confirmation dialog */}
      <AlertDialog
        isOpen={showLogoutDialog}
        leastDestructiveRef={cancelRef}
        onClose={() => setShowLogoutDialog(false)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent bg="gray.800" color="white">
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Change username
            </AlertDialogHeader>
            <AlertDialogBody>
              Logging out will delete all your scoreboard data for{' '}
              <Text as="span" fontWeight="bold" color="brand.300">
                {storedUsername}
              </Text>
              .
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} variant="ghost" onClick={() => setShowLogoutDialog(false)}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleConfirmLogout} isLoading={isDeleting}>
                Confirm
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

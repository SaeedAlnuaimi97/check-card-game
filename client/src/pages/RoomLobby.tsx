import { FC, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Text,
  useClipboard,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { CopyOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useSocket } from '../context/SocketContext';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

export const RoomLobby: FC = () => {
  const { playerId, roomData, leaveRoom, startGame } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();
  const { onCopy, hasCopied } = useClipboard(roomData?.roomCode ?? '');

  // Redirect to home if not in a room
  useEffect(() => {
    if (!roomData) {
      navigate('/');
    }
  }, [roomData, navigate]);

  if (!roomData || !playerId) return null;

  const isHost = roomData.host === playerId;
  const canStart = isHost && roomData.players.length >= MIN_PLAYERS;
  const playerSlots = Array.from({ length: MAX_PLAYERS }, (_, i) => roomData.players[i] ?? null);

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const handleStart = async () => {
    const result = await startGame();
    if (!result.success) {
      toast({
        title: 'Cannot start game',
        description: result.error,
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    }
    // On success, the server will emit gameStarted and we'll navigate to game board
  };

  const handleCopy = () => {
    onCopy();
    toast({
      title: 'Room code copied!',
      status: 'success',
      duration: 1500,
      position: 'top',
    });
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/lobby/${roomData.roomCode}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        toast({
          title: 'Invite link copied!',
          description: shareUrl,
          status: 'success',
          duration: 2500,
          position: 'top',
        });
      })
      .catch(() => {
        toast({
          title: 'Could not copy link',
          status: 'error',
          duration: 2000,
          position: 'top',
        });
      });
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
      <VStack spacing={8} w={{ base: '100%', sm: '450px' }}>
        {/* Header */}
        <VStack spacing={2}>
          <Heading size="lg">Room Lobby</Heading>
          <Text fontSize="sm" color="gray.400">
            Waiting for players...
          </Text>
        </VStack>

        {/* Room Code */}
        <VStack spacing={2}>
          <Text fontSize="sm" color="gray.500" textTransform="uppercase" letterSpacing="wider">
            Room Code
          </Text>
          <HStack spacing={3}>
            <Heading size="2xl" letterSpacing="0.3em" fontFamily="mono" color="brand.300">
              {roomData.roomCode}
            </Heading>
            <IconButton
              aria-label={hasCopied ? 'Copied' : 'Copy room code'}
              size="sm"
              variant="outline"
              colorScheme="gray"
              icon={<CopyOutlined />}
              onClick={handleCopy}
            />
            <IconButton
              aria-label="Copy invite link"
              size="sm"
              variant="outline"
              colorScheme="blue"
              icon={<ShareAltOutlined />}
              onClick={handleShare}
            />
          </HStack>
        </VStack>

        {/* Player List */}
        <VStack spacing={3} w="100%">
          <HStack justify="space-between" w="100%">
            <Text fontSize="sm" color="gray.500" fontWeight="bold">
              Players
            </Text>
            <Text fontSize="sm" color="gray.500">
              {roomData.players.length} / {MAX_PLAYERS}
            </Text>
          </HStack>

          {playerSlots.map((player, index) => (
            <Box
              key={index}
              w="100%"
              p={3}
              bg={player ? 'gray.800' : 'gray.850'}
              borderRadius="md"
              border="1px solid"
              borderColor={player ? 'gray.600' : 'gray.700'}
              opacity={player ? 1 : 0.4}
            >
              <HStack justify="space-between">
                <HStack spacing={3}>
                  <Box w={3} h={3} borderRadius="full" bg={player ? 'green.400' : 'gray.600'} />
                  <Text
                    fontWeight={player ? 'medium' : 'normal'}
                    color={player ? 'white' : 'gray.600'}
                  >
                    {player ? player.username : 'Empty slot'}
                  </Text>
                </HStack>

                <HStack spacing={2}>
                  {player && player.id === roomData.host && (
                    <Badge colorScheme="yellow" fontSize="xs">
                      Host
                    </Badge>
                  )}
                  {player && player.id === playerId && (
                    <Badge colorScheme="blue" fontSize="xs">
                      You
                    </Badge>
                  )}
                </HStack>
              </HStack>
            </Box>
          ))}
        </VStack>

        {/* Actions */}
        <VStack spacing={3} w="100%">
          {isHost && (
            <Button
              colorScheme="green"
              size="lg"
              w="100%"
              onClick={handleStart}
              isDisabled={!canStart}
            >
              {canStart
                ? 'Start Game'
                : `Need ${MIN_PLAYERS - roomData.players.length} more player${MIN_PLAYERS - roomData.players.length !== 1 ? 's' : ''}`}
            </Button>
          )}

          {!isHost && (
            <Text fontSize="sm" color="gray.500" textAlign="center">
              Waiting for host to start the game...
            </Text>
          )}

          <Button variant="outline" colorScheme="red" size="md" w="100%" onClick={handleLeave}>
            Leave Room
          </Button>
        </VStack>
      </VStack>
    </Box>
  );
};

import { FC, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
  useClipboard,
  useToast,
  VStack,
} from '@chakra-ui/react';
import {
  CopyOutlined,
  ShareAltOutlined,
  CloseOutlined,
  RobotOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useSocket } from '../context/SocketContext';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

export const RoomLobby: FC = () => {
  const { code } = useParams<{ code: string }>();
  const {
    playerId,
    roomData,
    joinRoom,
    leaveRoom,
    startGame,
    kickPlayer,
    addBot,
    removeBot,
    toggleReady,
  } = useSocket();
  const navigate = useNavigate();
  const toast = useToast();
  const { onCopy, hasCopied } = useClipboard(roomData?.roomCode ?? code ?? '');
  const [targetScore, setTargetScore] = useState(70);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'expert'>('easy');

  // Join-by-link state — shown when user arrives via shared link without being in a room
  const [username, setUsername] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const roomCode = (code ?? '').toUpperCase();

  // Redirect to home if no room code in URL
  useEffect(() => {
    if (!roomCode) {
      navigate('/');
    }
  }, [roomCode, navigate]);

  if (!roomCode) return null;

  // ----------------------------------------------------------
  // Join-by-link: user arrived via shared URL without being in a room
  // ----------------------------------------------------------
  const isInRoom = roomData && playerId;

  const handleJoin = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      toast({ title: 'Enter a username', status: 'warning', duration: 2000, position: 'top' });
      return;
    }

    setIsJoining(true);
    const result = await joinRoom(roomCode, trimmedUsername);
    setIsJoining(false);

    if (!result.success) {
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
    // On success, roomData will be set via SocketContext and we'll show the lobby
  };

  // ----------------------------------------------------------
  // Join-by-link view
  // ----------------------------------------------------------
  if (!isInRoom) {
    return (
      <Box
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="table.felt"
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
              maxLength={10}
              size="lg"
              bg="table.border"
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
              colorScheme="purple"
              size="lg"
              w="100%"
              onClick={handleJoin}
              isLoading={isJoining}
              isDisabled={!username.trim()}
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
  }

  // ----------------------------------------------------------
  // Normal lobby view (user is already in the room)
  // ----------------------------------------------------------
  const isHost = roomData.host === playerId;
  const allPlayersReady = roomData.players.every(
    (p) => p.isBot || p.id === roomData.host || p.isReady,
  );
  const canStart = isHost && roomData.players.length >= MIN_PLAYERS && allPlayersReady;
  const playerSlots = Array.from({ length: MAX_PLAYERS }, (_, i) => roomData.players[i] ?? null);

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const handleStart = async () => {
    const result = await startGame(targetScore);
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

  const handleKick = async (targetPlayerId: string, targetUsername: string) => {
    const result = await kickPlayer(targetPlayerId);
    if (!result.success) {
      toast({
        title: 'Cannot kick player',
        description: result.error,
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    } else {
      toast({
        title: `${targetUsername} was removed`,
        status: 'info',
        duration: 2000,
        position: 'top',
      });
    }
  };

  const handleAddBot = async () => {
    const result = await addBot(botDifficulty);
    if (!result.success) {
      toast({
        title: 'Cannot add bot',
        description: result.error,
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    }
  };

  const handleRemoveBot = async (botPlayerId: string, botUsername: string) => {
    const result = await removeBot(botPlayerId);
    if (!result.success) {
      toast({
        title: 'Cannot remove bot',
        description: result.error,
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    } else {
      toast({
        title: `${botUsername} removed`,
        status: 'info',
        duration: 2000,
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
      bg="table.felt"
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
              colorScheme="purple"
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
              bg={player ? 'surface.tonal10' : 'surface.tonal0'}
              borderRadius="md"
              border="1px solid"
              borderColor={
                player ? (player.isBot ? 'purple.700' : 'surface.tonal30') : 'surface.tonal20'
              }
              opacity={player ? 1 : 0.4}
            >
              <HStack justify="space-between">
                <HStack spacing={3}>
                  <Box
                    w={3}
                    h={3}
                    borderRadius="full"
                    bg={
                      player
                        ? player.isBot
                          ? 'purple.400'
                          : player.isReady || player.id === roomData.host
                            ? 'success.a10'
                            : 'warning.a10'
                        : 'surface.tonal30'
                    }
                  />
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
                  {player && player.isBot && (
                    <Badge colorScheme="purple" fontSize="xs">
                      {player.botDifficulty ?? 'bot'}
                    </Badge>
                  )}
                  {player && !player.isBot && player.id !== roomData.host && (
                    <Badge
                      colorScheme={player.isReady ? 'green' : 'gray'}
                      fontSize="xs"
                      variant={player.isReady ? 'solid' : 'outline'}
                    >
                      {player.isReady ? 'Ready' : 'Not Ready'}
                    </Badge>
                  )}
                  {player && player.id === playerId && (
                    <Badge colorScheme="purple" fontSize="xs">
                      You
                    </Badge>
                  )}
                  {/* Remove bot button: only visible to host for bot slots */}
                  {isHost && player?.isBot && (
                    <IconButton
                      aria-label={`Remove ${player.username}`}
                      size="xs"
                      variant="ghost"
                      colorScheme="purple"
                      icon={<CloseOutlined />}
                      onClick={() => handleRemoveBot(player.id, player.username)}
                    />
                  )}
                  {/* Kick button: only visible to host for non-bot, non-self players */}
                  {isHost && player && !player.isBot && player.id !== playerId && (
                    <IconButton
                      aria-label={`Kick ${player.username}`}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      icon={<CloseOutlined />}
                      onClick={() => handleKick(player.id, player.username)}
                    />
                  )}
                </HStack>
              </HStack>
            </Box>
          ))}
        </VStack>

        {/* Actions */}
        <VStack spacing={3} w="100%">
          {isHost && (
            <>
              {/* Add Bot (F-300/F-301) */}
              {roomData.players.length < MAX_PLAYERS && (
                <VStack spacing={1} w="100%" align="flex-start">
                  <Text fontSize="sm" color="gray.400" fontWeight="medium">
                    Add a bot opponent:
                  </Text>
                  <HStack w="100%">
                    <HStack spacing={1}>
                      <Button
                        size="sm"
                        variant={botDifficulty === 'easy' ? 'solid' : 'outline'}
                        colorScheme={botDifficulty === 'easy' ? 'green' : 'gray'}
                        onClick={() => setBotDifficulty('easy')}
                      >
                        Easy
                      </Button>
                      <Button
                        size="sm"
                        variant={botDifficulty === 'expert' ? 'solid' : 'outline'}
                        colorScheme={botDifficulty === 'expert' ? 'orange' : 'gray'}
                        onClick={() => setBotDifficulty('expert')}
                      >
                        Expert
                      </Button>
                    </HStack>
                    <Button
                      size="sm"
                      colorScheme="purple"
                      leftIcon={<RobotOutlined />}
                      onClick={handleAddBot}
                    >
                      Add Bot
                    </Button>
                  </HStack>
                </VStack>
              )}

              {/* Target Score (F-310) */}
              <VStack spacing={1} w="100%" align="flex-start">
                <HStack w="100%" justify="space-between">
                  <Text fontSize="sm" color="gray.400" fontWeight="medium">
                    Game ends at:
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="sm" fontWeight="bold" color="white">
                      {targetScore}
                    </Text>
                    <Text fontSize="sm" color="gray.400">
                      points
                    </Text>
                    {targetScore !== 70 && (
                      <Text fontSize="xs" color="warning.a10">
                        (default: 70)
                      </Text>
                    )}
                  </HStack>
                </HStack>
                <Slider
                  min={50}
                  max={150}
                  step={5}
                  value={targetScore}
                  onChange={(val) => setTargetScore(val)}
                  colorScheme="green"
                >
                  <SliderTrack bg="surface.tonal20">
                    <SliderFilledTrack />
                  </SliderTrack>
                  <SliderThumb boxSize={5} />
                </Slider>
              </VStack>

              <Button
                colorScheme="green"
                size="lg"
                w="100%"
                onClick={handleStart}
                isDisabled={!canStart}
              >
                {roomData.players.length < MIN_PLAYERS
                  ? `Need ${MIN_PLAYERS - roomData.players.length} more player${MIN_PLAYERS - roomData.players.length !== 1 ? 's' : ''}`
                  : !allPlayersReady
                    ? 'Waiting for players to ready up...'
                    : 'Start Game'}
              </Button>
            </>
          )}

          {!isHost && (
            <>
              <Button
                colorScheme={
                  roomData.players.find((p) => p.id === playerId)?.isReady ? 'green' : 'yellow'
                }
                size="lg"
                w="100%"
                leftIcon={
                  roomData.players.find((p) => p.id === playerId)?.isReady ? (
                    <CheckOutlined />
                  ) : undefined
                }
                onClick={async () => {
                  const result = await toggleReady();
                  if (!result.success) {
                    toast({
                      title: 'Error',
                      description: result.error,
                      status: 'error',
                      duration: 2000,
                      position: 'top',
                    });
                  }
                }}
              >
                {roomData.players.find((p) => p.id === playerId)?.isReady ? 'Ready!' : 'Ready Up'}
              </Button>
              <Text fontSize="sm" color="gray.500" textAlign="center">
                Waiting for host to start the game...
              </Text>
            </>
          )}

          <Button variant="outline" colorScheme="red" size="md" w="100%" onClick={handleLeave}>
            Leave Room
          </Button>
        </VStack>
      </VStack>
    </Box>
  );
};

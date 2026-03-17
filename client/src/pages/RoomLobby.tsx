import { FC, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  HStack,
  Input,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Spinner,
  Text,
  useClipboard,
  useToast,
  VStack,
} from '@chakra-ui/react';
import { CheckOutlined } from '@ant-design/icons';
import { useSocket } from '../context/SocketContext';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

// ────────────────────────────────────────────────────────────
// Shared badge component matching the mockup exactly
// ────────────────────────────────────────────────────────────
interface PlayerBadgeProps {
  type: 'host' | 'you' | 'easy' | 'expert' | 'ready' | 'notReady';
}
const PlayerBadge: FC<PlayerBadgeProps> = ({ type }) => {
  const styles: Record<string, { bg: string; color: string; border: string; label: string }> = {
    host: { bg: '#3a2a00', color: '#c9a227', border: '1px solid #c9a22760', label: 'HOST' },
    you: { bg: '#1a1a3a', color: '#7a7aee', border: '1px solid #3a3a7a', label: 'YOU' },
    easy: { bg: '#1a3a2a', color: '#5ecf5e', border: '1px solid #2a5a3a', label: 'EASY' },
    expert: { bg: '#3a1a1a', color: '#cf5e5e', border: '1px solid #5a2a2a', label: 'EXPERT' },
    ready: { bg: '#1a3a2a', color: '#5ecf5e', border: '1px solid #2a5a3a', label: 'READY' },
    notReady: { bg: '#1a1a28', color: '#555', border: '1px solid #2a2a3a', label: 'NOT READY' },
  };
  const s = styles[type];
  return (
    <Box
      as="span"
      fontSize="10px"
      fontWeight="700"
      px="7px"
      py="2px"
      borderRadius="4px"
      bg={s.bg}
      color={s.color}
      border={s.border}
      letterSpacing="0.04em"
      flexShrink={0}
    >
      {s.label}
    </Box>
  );
};

export const RoomLobby: FC = () => {
  const { code } = useParams<{ code: string }>();
  const {
    isConnected,
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

  // ----------------------------------------------------------
  // Grace-period reconnect spinner
  // Show a spinner instead of the join form when the player has stored
  // credentials for this room, so the auto-rejoin from SocketContext has a
  // chance to fire before we decide they are a new joiner.
  // ----------------------------------------------------------
  const hasStoredSession =
    !!localStorage.getItem('playerId') &&
    localStorage.getItem('roomCode')?.toUpperCase() === roomCode;

  // isAwaitingRejoin: true until socket connects and the rejoin callback has
  // had time to settle (roomData will be populated on success).
  const [isAwaitingRejoin, setIsAwaitingRejoin] = useState(hasStoredSession && !isConnected);
  const rejoinSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasStoredSession) return;
    if (isConnected) {
      // Socket just connected — wait a short moment for the rejoinRoom callback
      // to fire and set roomData before we decide to show the join form.
      rejoinSettleTimer.current = setTimeout(() => setIsAwaitingRejoin(false), 2000);
    }
    return () => {
      if (rejoinSettleTimer.current) clearTimeout(rejoinSettleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Once roomData arrives (rejoin succeeded), clear the waiting state immediately.
  useEffect(() => {
    if (roomData) setIsAwaitingRejoin(false);
  }, [roomData]);

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
  };

  // ----------------------------------------------------------
  // Join-by-link view
  // ----------------------------------------------------------

  // Show spinner while waiting for the grace-period auto-rejoin to settle
  if (!isInRoom && isAwaitingRejoin) {
    return (
      <Box
        minH="100dvh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="#0f0f16"
        color="white"
      >
        <VStack spacing={4}>
          <Spinner size="xl" color="brand.400" thickness="4px" />
          <Text fontSize="lg" color="gray.400">
            Reconnecting...
          </Text>
        </VStack>
      </Box>
    );
  }

  if (!isInRoom) {
    return (
      <Box
        h="100dvh"
        display="flex"
        flexDirection="column"
        bg="#0f0f16"
        color="white"
        overflow="hidden"
      >
        {/* Logo area */}
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          flex={1}
          justifyContent="center"
          pt="48px"
          pb="20px"
          gap={0}
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
          <Box
            w="200px"
            h="20px"
            mt="4px"
            bg="radial-gradient(ellipse, #c9a22740 0%, transparent 70%)"
          />
        </Box>

        {/* Connection / room code */}
        <Box display="flex" flexDirection="column" alignItems="center" gap="4px" mb="20px">
          <HStack spacing="6px" justify="center">
            <Box w="8px" h="8px" borderRadius="full" bg="#4ecb4e" flexShrink={0} />
            <Text fontSize="12px" color="#888">
              Room:{' '}
              <Box as="span" color="#7a7aee" fontWeight="700" letterSpacing="0.15em">
                {roomCode}
              </Box>
            </Text>
          </HStack>
        </Box>

        {/* Form */}
        <Box px="20px" pb="28px" display="flex" flexDirection="column" gap="10px">
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
            _focus={{ borderColor: '#6a6aaa', boxShadow: 'none' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoin();
            }}
            autoFocus
          />
          <Box
            as="button"
            w="100%"
            py="13px"
            borderRadius="10px"
            bg={!username.trim() || isJoining ? '#2a5a3a' : '#4a8a5a'}
            color="#e8f5ec"
            fontSize="15px"
            fontWeight="600"
            border="none"
            cursor={!username.trim() || isJoining ? 'not-allowed' : 'pointer'}
            opacity={!username.trim() || isJoining ? 0.6 : 1}
            onClick={handleJoin}
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
            onClick={() => navigate('/')}
          >
            Back to Home
          </Box>
        </Box>
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
  };

  const handleCopy = () => {
    onCopy();
    toast({ title: 'Room code copied!', status: 'success', duration: 1500, position: 'top' });
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
        toast({ title: 'Could not copy link', status: 'error', duration: 2000, position: 'top' });
      });
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
      toast({ title: `${botUsername} removed`, status: 'info', duration: 2000, position: 'top' });
    }
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

  return (
    <Box minH="100dvh" bg="#0f0f16" color="white" display="flex" justifyContent="center" p={4}>
      <Box w={{ base: '100%', sm: '360px' }}>
        <VStack spacing={0} align="stretch" gap="14px" pt="18px" pb="24px">
          {/* Title */}
          <Box textAlign="center">
            <Text fontSize="18px" fontWeight="700" color="#eee">
              Room Lobby
            </Text>
            <Text fontSize="12px" color="#555" mt="2px">
              Waiting for players…
            </Text>
          </Box>

          {/* Room Code */}
          <Box textAlign="center">
            <Text
              fontSize="10px"
              color="#444"
              letterSpacing="0.12em"
              textTransform="uppercase"
              mb="6px"
            >
              Room Code
            </Text>
            <HStack justify="center" spacing="8px">
              <Text fontSize="28px" fontWeight="800" color="#7a7aee" letterSpacing="0.18em">
                {roomData.roomCode}
              </Text>
              {/* Copy button */}
              <Box
                as="button"
                w="32px"
                h="32px"
                borderRadius="7px"
                bg="#1c1c2e"
                border="0.5px solid #2a2a3a"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                color={hasCopied ? '#5ecf5e' : '#666'}
                fontSize="13px"
                onClick={handleCopy}
                _hover={{ color: '#aaa' }}
                title={hasCopied ? 'Copied!' : 'Copy room code'}
              >
                {hasCopied ? '✓' : '⧉'}
              </Box>
              {/* Share button */}
              <Box
                as="button"
                w="32px"
                h="32px"
                borderRadius="7px"
                bg="#1c1c2e"
                border="0.5px solid #2a2a3a"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                color="#666"
                fontSize="13px"
                onClick={handleShare}
                _hover={{ color: '#aaa' }}
                title="Copy invite link"
              >
                ↗
              </Box>
            </HStack>
          </Box>

          {/* Player List */}
          <Box>
            <HStack justify="space-between" mb="8px">
              <Text fontSize="12px" color="#888" fontWeight="600">
                Players
              </Text>
              <Text fontSize="12px" color="#555">
                {roomData.players.length} / {MAX_PLAYERS}
              </Text>
            </HStack>
            <VStack spacing={0} gap="6px">
              {playerSlots.map((player, index) => (
                <Box
                  key={index}
                  w="100%"
                  px="10px"
                  py="9px"
                  borderRadius="8px"
                  bg="#1c1c28"
                  border="0.5px solid"
                  borderColor={
                    player ? (player.id === playerId ? '#3a3a6a' : '#2a2a3a') : '#2a2a3a'
                  }
                  opacity={player ? 1 : 0.5}
                  display="flex"
                  alignItems="center"
                  gap="8px"
                >
                  {/* Status dot */}
                  <Box
                    w="8px"
                    h="8px"
                    borderRadius="full"
                    flexShrink={0}
                    bg={player ? (player.isBot ? '#7a7aee' : '#4ecb4e') : '#2a2a3a'}
                  />
                  {/* Name */}
                  <Text
                    fontSize="13px"
                    color={player ? '#ccc' : '#333'}
                    fontStyle={player ? 'normal' : 'italic'}
                    flex={1}
                    noOfLines={1}
                  >
                    {player ? player.username : 'Empty slot'}
                  </Text>
                  {/* Badges */}
                  <HStack spacing="4px" flexShrink={0}>
                    {player && player.id === roomData.host && <PlayerBadge type="host" />}
                    {player && player.isBot && (
                      <PlayerBadge type={player.botDifficulty === 'expert' ? 'expert' : 'easy'} />
                    )}
                    {player && !player.isBot && player.id !== roomData.host && (
                      <PlayerBadge type={player.isReady ? 'ready' : 'notReady'} />
                    )}
                    {player && player.id === playerId && <PlayerBadge type="you" />}
                    {/* Kick/Remove — plain ✕ text */}
                    {isHost && player?.isBot && (
                      <Box
                        as="span"
                        fontSize="14px"
                        color="#3a2a2a"
                        cursor="pointer"
                        px="2px"
                        flexShrink={0}
                        onClick={() => handleRemoveBot(player.id, player.username)}
                        _hover={{ color: '#cf5e5e' }}
                      >
                        ✕
                      </Box>
                    )}
                    {isHost && player && !player.isBot && player.id !== playerId && (
                      <Box
                        as="span"
                        fontSize="14px"
                        color="#3a2a2a"
                        cursor="pointer"
                        px="2px"
                        flexShrink={0}
                        onClick={() => handleKick(player.id, player.username)}
                        _hover={{ color: '#cf5e5e' }}
                      >
                        ✕
                      </Box>
                    )}
                  </HStack>
                </Box>
              ))}
            </VStack>
          </Box>

          {/* Host-only controls */}
          {isHost && (
            <>
              {/* Add Bot section */}
              {roomData.players.length < MAX_PLAYERS && (
                <Box display="flex" flexDirection="column" gap="8px">
                  <Text fontSize="11px" color="#555">
                    Add a bot opponent:
                  </Text>
                  <HStack spacing="6px">
                    {/* Difficulty buttons */}
                    <Box
                      as="button"
                      px="12px"
                      py="5px"
                      borderRadius="6px"
                      border="0.5px solid"
                      borderColor={botDifficulty === 'easy' ? '#2a5a3a' : '#2a2a3a'}
                      bg={botDifficulty === 'easy' ? '#1a3a2a' : '#1c1c28'}
                      color={botDifficulty === 'easy' ? '#5ecf5e' : '#555'}
                      fontSize="12px"
                      fontWeight="600"
                      cursor="pointer"
                      onClick={() => setBotDifficulty('easy')}
                    >
                      Easy
                    </Box>
                    <Box
                      as="button"
                      px="12px"
                      py="5px"
                      borderRadius="6px"
                      border="0.5px solid"
                      borderColor={botDifficulty === 'expert' ? '#5a2a2a' : '#2a2a3a'}
                      bg={botDifficulty === 'expert' ? '#3a1a1a' : '#1c1c28'}
                      color={botDifficulty === 'expert' ? '#cf5e5e' : '#555'}
                      fontSize="12px"
                      fontWeight="600"
                      cursor="pointer"
                      onClick={() => setBotDifficulty('expert')}
                    >
                      Expert
                    </Box>
                    {/* Add Bot button */}
                    <Box
                      as="button"
                      px="12px"
                      py="5px"
                      borderRadius="6px"
                      bg="#1c1c28"
                      border="0.5px solid #2a2a3a"
                      color="#666"
                      fontSize="12px"
                      cursor="pointer"
                      display="flex"
                      alignItems="center"
                      gap="5px"
                      onClick={handleAddBot}
                      _hover={{ color: '#aaa' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                        <rect
                          x="2"
                          y="5"
                          width="10"
                          height="7"
                          rx="2"
                          stroke="#666"
                          strokeWidth="1.2"
                        />
                        <circle cx="7" cy="4" r="2" stroke="#666" strokeWidth="1.2" />
                        <path d="M5 8h4" stroke="#666" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      Add Bot
                    </Box>
                  </HStack>
                </Box>
              )}

              {/* Target Score slider */}
              <Box display="flex" flexDirection="column" gap="6px">
                <HStack justify="space-between">
                  <Text fontSize="12px" color="#555">
                    Game ends at:
                  </Text>
                  <Text fontSize="12px" color="#c9a227" fontWeight="600">
                    {targetScore} points
                  </Text>
                </HStack>
                <HStack spacing="8px" align="center">
                  <Text fontSize="10px" color="#333" minW="20px" textAlign="right">
                    50
                  </Text>
                  <Box flex={1}>
                    <Slider
                      min={50}
                      max={150}
                      step={5}
                      value={targetScore}
                      onChange={(val) => setTargetScore(val)}
                      colorScheme="green"
                    >
                      <SliderTrack bg="#1a1a28" h="4px" borderRadius="2px">
                        <SliderFilledTrack bg="#4a8a5a" />
                      </SliderTrack>
                      <SliderThumb boxSize={4} bg="#eee" border="2px solid #4a8a5a" />
                    </Slider>
                  </Box>
                  <Text fontSize="10px" color="#333" minW="24px">
                    150
                  </Text>
                </HStack>
              </Box>

              {/* Start Game */}
              <Box
                as="button"
                w="100%"
                py="13px"
                borderRadius="10px"
                bg={canStart ? '#4a8a5a' : '#2a5a3a'}
                color="#e8f5ec"
                fontSize="15px"
                fontWeight="600"
                border="none"
                cursor={canStart ? 'pointer' : 'not-allowed'}
                opacity={canStart ? 1 : 0.6}
                onClick={handleStart}
                sx={{ '&:hover:not([disabled])': { background: canStart ? '#3a7a4a' : '#2a5a3a' } }}
              >
                {roomData.players.length < MIN_PLAYERS
                  ? `Need ${MIN_PLAYERS - roomData.players.length} more player${MIN_PLAYERS - roomData.players.length !== 1 ? 's' : ''}`
                  : !allPlayersReady
                    ? 'Waiting for players to ready up...'
                    : 'Start Game'}
              </Box>
            </>
          )}

          {/* Non-host: Ready button */}
          {!isHost && (
            <>
              <Box
                as="button"
                w="100%"
                py="13px"
                borderRadius="10px"
                bg={
                  roomData.players.find((p) => p.id === playerId)?.isReady ? '#1a3a2a' : '#4a8a5a'
                }
                color="#e8f5ec"
                fontSize="15px"
                fontWeight="600"
                border={
                  roomData.players.find((p) => p.id === playerId)?.isReady
                    ? '1px solid #2a5a3a'
                    : 'none'
                }
                cursor="pointer"
                display="flex"
                alignItems="center"
                justifyContent="center"
                gap="8px"
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
                {roomData.players.find((p) => p.id === playerId)?.isReady && <CheckOutlined />}
                {roomData.players.find((p) => p.id === playerId)?.isReady ? 'Ready!' : 'Ready Up'}
              </Box>
              <Text fontSize="12px" color="#555" textAlign="center">
                Waiting for host to start the game...
              </Text>
            </>
          )}

          {/* Leave Room — btn-danger */}
          <Box
            as="button"
            w="100%"
            py="12px"
            borderRadius="10px"
            bg="transparent"
            border="1px solid #5a2a2a"
            color="#cf7070"
            fontSize="14px"
            cursor="pointer"
            onClick={handleLeave}
            _hover={{ bg: 'rgba(90,42,42,0.2)' }}
          >
            Leave Room
          </Box>
        </VStack>
      </Box>
    </Box>
  );
};

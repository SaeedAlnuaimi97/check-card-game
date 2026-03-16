import { useEffect, useRef, FC } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Spinner, Text, VStack } from '@chakra-ui/react';
import { useSocket } from '../context/SocketContext';

/**
 * GameRejoin — handles /game/:roomCode URLs.
 *
 * When a player navigates to /game/ROOMCODE (e.g. after closing their browser
 * and reopening, or sharing a link), this component attempts to rejoin the room
 * via SocketContext's `rejoinWithCode` method.
 *
 * - If the player has stored credentials (playerId in localStorage), it
 *   delegates to rejoinWithCode which emits rejoinRoom and updates all context
 *   state + navigates on success.
 * - If no stored identity, rejoinWithCode redirects to /lobby/:code to join as
 *   a new player.
 * - If SocketContext already restored state (e.g. via its own connect handler),
 *   the watcher effect navigates immediately without a duplicate rejoin.
 */
export const GameRejoin: FC = () => {
  const { roomCode: urlRoomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { gameState, roomData, rejoinWithCode } = useSocket();
  const hasAttempted = useRef(false);

  const code = (urlRoomCode ?? '').toUpperCase();

  // If SocketContext already restored the game state (e.g. from its own
  // connect handler), navigate immediately without a duplicate rejoin.
  useEffect(() => {
    if (gameState) {
      navigate('/game', { replace: true });
    } else if (roomData?.status === 'lobby') {
      navigate(`/lobby/${roomData.roomCode}`, { replace: true });
    }
  }, [gameState, roomData, navigate]);

  // On mount: delegate to rejoinWithCode
  useEffect(() => {
    if (hasAttempted.current) return;
    if (!code) {
      navigate('/', { replace: true });
      return;
    }

    hasAttempted.current = true;
    rejoinWithCode(code);
  }, [code, navigate, rejoinWithCode]);

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="#406093"
      color="white"
    >
      <VStack spacing={4}>
        <Spinner size="xl" color="brand.400" thickness="4px" />
        <Text fontSize="lg" color="gray.400">
          Rejoining game...
        </Text>
      </VStack>
    </Box>
  );
};

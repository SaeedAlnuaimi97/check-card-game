import { useEffect, useState, useCallback, FC } from 'react';
import {
  Box,
  Button,
  Divider,
  Flex,
  Grid,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  HStack,
  Badge,
  Heading,
  Progress,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { DEBUG_MODE } from '../context/SocketContext';
import socket from '../services/socket';
import { Card } from '../components/cards/Card';
import { CardBack } from '../components/cards/CardBack';
import type { Card as CardType } from '../types/card.types';
import type { ClientHandSlot, ClientPlayerState } from '../types/player.types';
import type { PeekedCard, PlayerRoundResult } from '../types/game.types';

// ============================================================
// Constants
// ============================================================

const PEEK_DURATION_MS = 8000;
const PEEK_TICK_MS = 100;

// ============================================================
// Opponent Display
// ============================================================

interface OpponentProps {
  player: ClientPlayerState;
  isCurrentTurn: boolean;
  debugRevealed?: Record<string, CardType>;
}

const OpponentRow: FC<OpponentProps> = ({ player, isCurrentTurn, debugRevealed }) => {
  return (
    <VStack
      spacing={1}
      p={2}
      borderRadius="md"
      bg={isCurrentTurn ? 'whiteAlpha.200' : 'whiteAlpha.50'}
      border="1px solid"
      borderColor={isCurrentTurn ? 'yellow.400' : 'whiteAlpha.100'}
      minW={{ base: '100px', md: '140px' }}
    >
      <HStack spacing={1}>
        <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="bold" noOfLines={1}>
          {player.username}
        </Text>
        {isCurrentTurn && (
          <Badge colorScheme="yellow" fontSize="2xs">
            Turn
          </Badge>
        )}
      </HStack>
      <HStack spacing={1}>
        {player.hand.map((h: ClientHandSlot) => {
          const key = `${player.playerId}:${h.slot}`;
          const revealedCard = debugRevealed?.[key];
          return (
            <Box key={h.slot}>
              {revealedCard ? (
                <Box
                  w={{ base: '40px', md: '52px' }}
                  h={{ base: '56px', md: '74px' }}
                  borderRadius="sm"
                  border="1px solid"
                  borderColor="purple.400"
                  bg="white"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  fontSize={{ base: '2xs', md: 'xs' }}
                >
                  <Text
                    color={revealedCard.isRed ? 'red.500' : 'gray.800'}
                    fontWeight="bold"
                    lineHeight={1}
                  >
                    {revealedCard.rank}
                  </Text>
                  <Text color={revealedCard.isRed ? 'red.500' : 'gray.800'} lineHeight={1}>
                    {revealedCard.suit}
                  </Text>
                </Box>
              ) : (
                <Box
                  w={{ base: '20px', md: '28px' }}
                  h={{ base: '28px', md: '39px' }}
                  borderRadius="sm"
                  bg="card.back"
                  border="1px solid"
                  borderColor="gray.600"
                  opacity={h.card === null ? 0.3 : 1}
                />
              )}
            </Box>
          );
        })}
      </HStack>
      <Text fontSize="2xs" color="gray.400">
        Score: {player.totalScore}
      </Text>
    </VStack>
  );
};

// ============================================================
// Main GameBoard Component (F-031, F-094)
// ============================================================

export const GameBoard: FC = () => {
  const navigate = useNavigate();
  const {
    gameState,
    peekedCards,
    playerId,
    roomData,
    isMyTurn,
    turnData,
    drawnCard,
    drawnFromDiscard,
    pendingEffect,
    lastBurnResult,
    checkCalledData,
    roundEndData,
    gameEndData,
    endPeek,
    callCheck,
    performAction,
    discardChoice,
    redJackSwap,
    redQueenPeek,
    redKingChoice,
    leaveRoom,
    debugPeek,
    clearRoundEndData,
    clearGameEndData,
  } = useSocket();
  const toast = useToast();

  // Peek animation state
  const [isPeeking, setIsPeeking] = useState(true);
  const [peekProgress, setPeekProgress] = useState(100);

  // Reset peeking state when a new round starts (component is not remounted)
  useEffect(() => {
    if (peekedCards && peekedCards.length > 0 && gameState?.phase === 'peeking') {
      setIsPeeking(true);
      setPeekProgress(100);
    }
  }, [peekedCards, gameState?.phase]);

  // Debug: track revealed cards by key `${playerId}:${slot}`
  const [debugRevealed, setDebugRevealed] = useState<Record<string, CardType>>({});

  const [debugRevealAll, setDebugRevealAll] = useState(false);

  const toggleDebugRevealAll = useCallback(async () => {
    if (!DEBUG_MODE || !gameState) return;
    if (debugRevealAll) {
      // Toggle OFF — clear all revealed cards
      setDebugRevealed({});
      setDebugRevealAll(false);
      return;
    }
    // Toggle ON — peek at every card for every player
    const results: Record<string, CardType> = {};
    const promises: Promise<void>[] = [];
    for (const player of gameState.players) {
      for (const h of player.hand) {
        const key = `${player.playerId}:${h.slot}`;
        promises.push(
          debugPeek(player.playerId, h.slot).then((res) => {
            if (res.success && res.card) {
              results[key] = res.card;
            }
          }),
        );
      }
    }
    await Promise.all(promises);
    setDebugRevealed(results);
    setDebugRevealAll(true);
  }, [gameState, debugRevealAll, debugPeek]);

  // Redirect if no game state
  useEffect(() => {
    if (!gameState || !roomData) {
      navigate('/');
    }
  }, [gameState, roomData, navigate]);

  // Listen for player-left notifications
  useEffect(() => {
    const handler = (data: { username: string; gameEnded: boolean }) => {
      toast({
        title: data.gameEnded
          ? `${data.username} left — game ended`
          : `${data.username} left the game`,
        status: data.gameEnded ? 'error' : 'warning',
        duration: 3000,
        position: 'top',
      });
    };
    socket.on('playerLeftGame', handler);
    return () => {
      socket.off('playerLeftGame', handler);
    };
  }, [toast]);

  // Burn result toast notification (F-044 to F-048)
  useEffect(() => {
    if (!lastBurnResult) return;
    const burnerName =
      lastBurnResult.playerId === playerId
        ? 'You'
        : (gameState?.players.find((p) => p.playerId === lastBurnResult.playerId)?.username ??
          'Someone');
    if (lastBurnResult.burnSuccess) {
      const c = lastBurnResult.burnedCard;
      toast({
        title: `${burnerName === 'You' ? 'Burn success!' : `${burnerName} burned a card!`}`,
        description: c ? `${c.rank}${c.suit} removed from slot ${lastBurnResult.slot}` : undefined,
        status: 'success',
        duration: 2500,
        position: 'top',
      });
    } else {
      toast({
        title: `${burnerName === 'You' ? 'Burn failed!' : `${burnerName} failed to burn`}`,
        description: lastBurnResult.penaltySlot
          ? `Penalty card added to slot ${lastBurnResult.penaltySlot}`
          : 'Rank did not match',
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    }
  }, [lastBurnResult, playerId, gameState?.players, toast]);

  // Check called toast notification (F-062)
  useEffect(() => {
    if (!checkCalledData) return;
    const callerName = checkCalledData.playerId === playerId ? 'You' : checkCalledData.username;
    toast({
      title: `${callerName} called CHECK!`,
      description: 'Final round — one more turn each.',
      status: 'warning',
      duration: 4000,
      isClosable: true,
      position: 'top',
    });
  }, [checkCalledData, playerId, toast]);

  // Handle calling check
  const handleCallCheck = useCallback(async () => {
    const result = await callCheck();
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [callCheck, toast]);

  // Handle returning to lobby after game end
  const handleReturnToLobby = useCallback(() => {
    clearGameEndData();
    clearRoundEndData();
    leaveRoom();
    navigate('/');
  }, [clearGameEndData, clearRoundEndData, leaveRoom, navigate]);

  // Peek countdown — when timer expires, call endPeek to transition to playing (F-031, F-033)
  useEffect(() => {
    if (!isPeeking || !peekedCards || peekedCards.length === 0) return;

    const startTime = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, PEEK_DURATION_MS - elapsed);
      const progress = (remaining / PEEK_DURATION_MS) * 100;
      setPeekProgress(progress);

      if (remaining <= 0) {
        clearInterval(timer);
        setIsPeeking(false);
        setPeekProgress(0);
        // Notify server to transition from peeking to playing
        endPeek();
      }
    }, PEEK_TICK_MS);

    return () => clearInterval(timer);
  }, [isPeeking, peekedCards, endPeek]);

  // Helper: is this slot being peeked?
  const isPeekedSlot = useCallback(
    (slot: string): boolean => {
      if (!isPeeking || !peekedCards) return false;
      return peekedCards.some((pc: PeekedCard) => pc.slot === slot);
    },
    [isPeeking, peekedCards],
  );

  // Helper: get peeked card data for a slot
  const getPeekedCardForSlot = useCallback(
    (slot: string): CardType | null => {
      if (!isPeeking || !peekedCards) return null;
      const peeked = peekedCards.find((pc: PeekedCard) => pc.slot === slot);
      return peeked?.card ?? null;
    },
    [isPeeking, peekedCards],
  );

  // ----------------------------------------------------------
  // Action handlers — click draw pile / discard pile / hand card
  // ----------------------------------------------------------

  const canAct = isMyTurn && gameState?.phase === 'playing';
  /** True when we have a drawn card pending discard choice */
  const hasDrawnCard = drawnCard !== null;

  const handleDrawDeck = useCallback(async () => {
    if (!canAct || hasDrawnCard || !turnData?.availableActions.includes('drawDeck')) return;
    const result = await performAction('drawDeck');
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [canAct, hasDrawnCard, turnData, performAction, toast]);

  const handleTakeDiscard = useCallback(async () => {
    if (!canAct || hasDrawnCard || !turnData?.availableActions.includes('takeDiscard')) return;
    const result = await performAction('takeDiscard');
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [canAct, hasDrawnCard, turnData, performAction, toast]);

  const handleBurnCard = useCallback(
    async (slot: string) => {
      if (!canAct || hasDrawnCard || !turnData?.availableActions.includes('burn')) return;
      const result = await performAction('burn', slot);
      if (!result.success && result.error) {
        toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
      }
    },
    [canAct, hasDrawnCard, turnData, performAction, toast],
  );

  /** After drawing from deck: click a hand card to swap, or click discard to discard drawn card */
  const handleDiscardChoice = useCallback(
    async (slot: string | null) => {
      if (!canAct || !hasDrawnCard) return;
      const result = await discardChoice(slot);
      if (!result.success && result.error) {
        toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
      } else if (result.success) {
        toast({
          title: slot !== null ? `Swapped card into slot ${slot}` : 'Drawn card discarded',
          status: 'info',
          duration: 1500,
          position: 'top',
        });
      }
    },
    [canAct, hasDrawnCard, discardChoice, toast],
  );

  const handleExitGame = useCallback(() => {
    leaveRoom();
    navigate('/');
  }, [leaveRoom, navigate]);

  // ----------------------------------------------------------
  // Special Effect modal state
  // ----------------------------------------------------------

  // Red Jack state
  const [jackMySlot, setJackMySlot] = useState<string | null>(null);
  const [jackTargetPlayer, setJackTargetPlayer] = useState<string | null>(null);
  const [jackTargetSlot, setJackTargetSlot] = useState<string | null>(null);
  const [jackLoading, setJackLoading] = useState(false);

  // Red Queen state
  const [queenPeekedCard, setQueenPeekedCard] = useState<CardType | null>(null);
  const [queenLoading, setQueenLoading] = useState(false);
  const [queenPeekTimer, setQueenPeekTimer] = useState(false);

  // Red King state
  const [kingKeepIndex, setKingKeepIndex] = useState<0 | 1 | null>(null);
  const [kingReplaceSlot, setKingReplaceSlot] = useState<string | null>(null);
  const [kingReplaceSlots, setKingReplaceSlots] = useState<[string | null, string | null]>([
    null,
    null,
  ]);
  const [kingMode, setKingMode] = useState<'returnBoth' | 'keepOne' | 'keepBoth' | null>(null);
  const [kingLoading, setKingLoading] = useState(false);

  // Reset special effect state when pendingEffect changes
  // (but preserve queen peek display while timer is running)
  useEffect(() => {
    if (!pendingEffect) {
      setJackMySlot(null);
      setJackTargetPlayer(null);
      setJackTargetSlot(null);
      setJackLoading(false);
      // Don't clear queen peek state here — the peek timer handles it
      setQueenLoading(false);
      setKingKeepIndex(null);
      setKingReplaceSlot(null);
      setKingReplaceSlots([null, null]);
      setKingMode(null);
      setKingLoading(false);
    }
  }, [pendingEffect]);

  // Red Jack: submit swap or skip
  const handleJackSubmit = useCallback(
    async (skip: boolean) => {
      setJackLoading(true);
      const result = await redJackSwap(
        skip,
        jackMySlot ?? undefined,
        jackTargetPlayer ?? undefined,
        jackTargetSlot ?? undefined,
      );
      setJackLoading(false);
      if (!result.success && result.error) {
        toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
      }
    },
    [redJackSwap, jackMySlot, jackTargetPlayer, jackTargetSlot, toast],
  );

  // Red Queen: peek at a slot
  const handleQueenPeek = useCallback(
    async (slot: string) => {
      setQueenLoading(true);
      const result = await redQueenPeek(slot);
      setQueenLoading(false);
      if (result.success && result.card) {
        setQueenPeekedCard(result.card);
        setQueenPeekTimer(true);
        // Auto-close after 3 seconds
        setTimeout(() => {
          setQueenPeekTimer(false);
          setQueenPeekedCard(null);
        }, 3000);
      } else if (result.error) {
        toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
      }
    },
    [redQueenPeek, toast],
  );

  // Red King: submit choice
  const handleKingSubmit = useCallback(async () => {
    if (!kingMode) return;
    setKingLoading(true);

    let result: { success: boolean; error?: string };

    if (kingMode === 'returnBoth') {
      result = await redKingChoice({ type: 'returnBoth' });
    } else if (kingMode === 'keepOne') {
      if (kingKeepIndex === null || !kingReplaceSlot) {
        setKingLoading(false);
        toast({
          title: 'Select a card to keep and a slot to replace',
          status: 'warning',
          duration: 2000,
          position: 'top',
        });
        return;
      }
      result = await redKingChoice({
        type: 'keepOne',
        keepIndex: kingKeepIndex,
        replaceSlot: kingReplaceSlot,
      });
    } else {
      // keepBoth
      if (!kingReplaceSlots[0] || !kingReplaceSlots[1]) {
        setKingLoading(false);
        toast({
          title: 'Select 2 slots to replace',
          status: 'warning',
          duration: 2000,
          position: 'top',
        });
        return;
      }
      result = await redKingChoice({
        type: 'keepBoth',
        replaceSlots: [kingReplaceSlots[0], kingReplaceSlots[1]],
      });
    }

    setKingLoading(false);
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [kingMode, kingKeepIndex, kingReplaceSlot, kingReplaceSlots, redKingChoice, toast]);

  if (!gameState || !playerId) {
    return null;
  }

  // Find current player and opponents
  const myPlayer = gameState.players.find((p) => p.playerId === playerId);
  const opponents = gameState.players.filter((p) => p.playerId !== playerId);
  const topDiscard =
    gameState.discardPile.length > 0
      ? gameState.discardPile[gameState.discardPile.length - 1]
      : null;

  if (!myPlayer) {
    return null;
  }

  return (
    <Box
      h="100dvh"
      bg="gray.900"
      display="flex"
      flexDirection="column"
      position="relative"
      overflow="hidden"
    >
      {/* Peek overlay / countdown */}
      {isPeeking && peekedCards && peekedCards.length > 0 && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={10}
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="blackAlpha.700"
        >
          <VStack
            spacing={2}
            bg="gray.800"
            px={6}
            py={4}
            borderRadius="lg"
            border="1px solid"
            borderColor="yellow.400"
            shadow="dark-lg"
          >
            <Text fontSize="md" color="yellow.300" fontWeight="bold">
              Memorize your cards!
            </Text>
            <Progress
              value={peekProgress}
              size="sm"
              colorScheme="yellow"
              w="200px"
              borderRadius="full"
              bg="gray.700"
            />
            <Text fontSize="xs" color="gray.400">
              {Math.ceil((peekProgress / 100) * (PEEK_DURATION_MS / 1000))}s remaining
            </Text>
          </VStack>
        </Box>
      )}

      {/* Score / Round info */}
      <Flex
        px={4}
        py={2}
        bg="gray.800"
        borderBottom="1px solid"
        borderColor="gray.700"
        justify="space-between"
        align="center"
        flexShrink={0}
      >
        <HStack spacing={3}>
          {DEBUG_MODE && (
            <Box
              as="button"
              w="28px"
              h="28px"
              borderRadius="md"
              bg={debugRevealAll ? 'purple.500' : 'gray.600'}
              display="flex"
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              onClick={toggleDebugRevealAll}
              _hover={{ bg: debugRevealAll ? 'purple.400' : 'gray.500' }}
              title={debugRevealAll ? 'Hide all cards' : 'Reveal all cards (debug)'}
            >
              <Text fontSize="14px" lineHeight={1}>
                {'\u{1F441}'}
              </Text>
            </Box>
          )}
          <Text fontSize="sm" color="gray.400">
            Room:{' '}
            <Text as="span" color="gray.100" fontWeight="bold">
              {roomData?.roomCode}
            </Text>
          </Text>
          <Text fontSize="sm" color="gray.400">
            Round:{' '}
            <Text as="span" color="gray.100" fontWeight="bold">
              {gameState.roundNumber}
            </Text>
          </Text>
        </HStack>
        <HStack spacing={2}>
          <Text fontSize="sm" color="gray.400">
            Phase:{' '}
            <Text as="span" color="gray.100" fontWeight="bold">
              {gameState.phase}
            </Text>
          </Text>
          {/* Check called banner */}
          {checkCalledData && (
            <Badge colorScheme="red" fontSize="xs" px={2} py={1}>
              CHECK ({checkCalledData.playerId === playerId ? 'You' : checkCalledData.username})
            </Badge>
          )}
          <IconButton
            aria-label="Exit game"
            size="xs"
            variant="ghost"
            color="gray.400"
            _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
            onClick={handleExitGame}
            icon={
              <Text fontSize="md" lineHeight={1}>
                {'\u{1F6AA}'}
              </Text>
            }
          />
        </HStack>
      </Flex>

      {/* Main game area */}
      <Grid
        flex={1}
        templateRows="auto 1fr auto"
        p={{ base: 2, md: 4 }}
        gap={{ base: 2, md: 3 }}
        maxW="900px"
        mx="auto"
        w="100%"
        overflow="hidden"
      >
        {/* Top: Opponents */}
        <Flex wrap="wrap" justify="center" gap={{ base: 2, md: 3 }}>
          {opponents.map((opp) => (
            <OpponentRow
              key={opp.playerId}
              player={opp}
              isCurrentTurn={
                gameState.players[gameState.currentTurnIndex]?.playerId === opp.playerId
              }
              debugRevealed={debugRevealed}
            />
          ))}
        </Flex>

        {/* Center: Draw pile and Discard pile */}
        <Flex justify="center" align="center" gap={{ base: 6, md: 10 }}>
          {/* Draw Pile */}
          <Tooltip
            label={
              canAct && !hasDrawnCard && turnData?.availableActions.includes('drawDeck')
                ? 'Draw from deck'
                : hasDrawnCard
                  ? 'Card already drawn'
                  : !canAct
                    ? 'Not your turn'
                    : ''
            }
            isDisabled={!canAct && gameState.phase !== 'playing'}
          >
            <VStack spacing={2}>
              <CardBack
                size="lg"
                isClickable={
                  canAct &&
                  !hasDrawnCard &&
                  (turnData?.availableActions.includes('drawDeck') ?? false)
                }
                onClick={handleDrawDeck}
              />
              <Text fontSize="xs" color="gray.400">
                Deck ({gameState.deckCount})
              </Text>
            </VStack>
          </Tooltip>

          {/* Drawn Card (floating between deck and discard) */}
          {hasDrawnCard && drawnCard && (
            <Tooltip
              label={
                drawnFromDiscard
                  ? 'Click a hand card to swap (must swap)'
                  : 'Click a hand card to swap, or click discard to keep hand'
              }
            >
              <VStack spacing={2}>
                <Box
                  borderRadius="md"
                  border="2px solid"
                  borderColor="yellow.400"
                  shadow="0 0 16px rgba(255, 214, 0, 0.4)"
                  animation="pulse 1.5s ease-in-out infinite"
                >
                  <Card card={drawnCard} size="lg" />
                </Box>
                <Text fontSize="xs" color="yellow.300" fontWeight="bold">
                  {drawnFromDiscard ? 'From Discard' : 'Drawn'}
                </Text>
              </VStack>
            </Tooltip>
          )}

          {/* Discard Pile */}
          <Tooltip
            label={
              hasDrawnCard && drawnFromDiscard
                ? 'Must swap with a hand card'
                : hasDrawnCard
                  ? 'Discard drawn card'
                  : topDiscard?.isBurned
                    ? 'Burned card — cannot pick up'
                    : canAct && turnData?.availableActions.includes('takeDiscard')
                      ? 'Take from discard'
                      : !canAct
                        ? 'Not your turn'
                        : ''
            }
            isDisabled={!canAct && gameState.phase !== 'playing'}
          >
            <VStack spacing={2}>
              {topDiscard ? (
                <Box position="relative">
                  <Card
                    card={topDiscard}
                    size="lg"
                    isClickable={
                      hasDrawnCard
                        ? !drawnFromDiscard
                        : canAct &&
                          !topDiscard.isBurned &&
                          (turnData?.availableActions.includes('takeDiscard') ?? false)
                    }
                    onClick={
                      hasDrawnCard && !drawnFromDiscard
                        ? () => handleDiscardChoice(null)
                        : !hasDrawnCard && !topDiscard.isBurned
                          ? handleTakeDiscard
                          : undefined
                    }
                  />
                  {topDiscard.isBurned && (
                    <Box
                      position="absolute"
                      top="-6px"
                      right="-6px"
                      bg="orange.500"
                      borderRadius="full"
                      w="24px"
                      h="24px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      shadow="md"
                      border="2px solid"
                      borderColor="orange.300"
                    >
                      <Text fontSize="12px" lineHeight={1}>
                        {'\uD83D\uDD25'}
                      </Text>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box
                  w="100px"
                  h="140px"
                  borderRadius="md"
                  border="2px dashed"
                  borderColor={hasDrawnCard && !drawnFromDiscard ? 'yellow.400' : 'gray.600'}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  cursor={hasDrawnCard && !drawnFromDiscard ? 'pointer' : 'default'}
                  onClick={
                    hasDrawnCard && !drawnFromDiscard ? () => handleDiscardChoice(null) : undefined
                  }
                  _hover={
                    hasDrawnCard && !drawnFromDiscard
                      ? { borderColor: 'yellow.300', shadow: 'lg' }
                      : {}
                  }
                >
                  <Text
                    fontSize="xs"
                    color={hasDrawnCard && !drawnFromDiscard ? 'yellow.300' : 'gray.500'}
                  >
                    {hasDrawnCard && !drawnFromDiscard ? 'Discard here' : 'Empty'}
                  </Text>
                </Box>
              )}
              <Text fontSize="xs" color="gray.400">
                Discard
              </Text>
            </VStack>
          </Tooltip>
        </Flex>

        {/* Bottom: Player's hand + actions */}
        <VStack spacing={2}>
          {/* Turn indicator + Check button */}
          {gameState.phase === 'peeking' ? (
            <Text fontSize="sm" color="yellow.300" fontWeight="bold">
              Memorizing...
            </Text>
          ) : gameState.phase === 'roundEnd' || gameState.phase === 'gameEnd' ? (
            <Text fontSize="sm" color="orange.300" fontWeight="bold">
              Round Over
            </Text>
          ) : hasDrawnCard && drawnFromDiscard ? (
            <Text fontSize="sm" color="yellow.300" fontWeight="bold">
              Click a hand card to swap (must swap)
            </Text>
          ) : hasDrawnCard ? (
            <Text fontSize="sm" color="yellow.300" fontWeight="bold">
              Click a hand card to swap, or click discard to keep hand
            </Text>
          ) : gameState.players[gameState.currentTurnIndex]?.playerId === playerId ? (
            <HStack spacing={3}>
              <Heading size="sm" color="yellow.300">
                Your Turn
              </Heading>
              {turnData?.canCheck && !hasDrawnCard && !pendingEffect && (
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="solid"
                  fontWeight="bold"
                  onClick={handleCallCheck}
                >
                  CHECK
                </Button>
              )}
            </HStack>
          ) : (
            <Text fontSize="sm" color="gray.500">
              {gameState.players[gameState.currentTurnIndex]?.username}&apos;s turn
            </Text>
          )}

          {/* Hand */}
          <HStack spacing={{ base: 2, md: 3 }} justify="center">
            {myPlayer.hand.map((h: ClientHandSlot) => {
              const peekedCard = getPeekedCardForSlot(h.slot);
              const showFaceUp = isPeekedSlot(h.slot) && peekedCard !== null;
              const debugKey = `${playerId}:${h.slot}`;
              const debugCard = debugRevealed[debugKey];
              const visibleCard = showFaceUp ? peekedCard : (debugCard ?? h.card);
              const burnAvailable =
                canAct && !hasDrawnCard && (turnData?.availableActions.includes('burn') ?? false);
              /** When a drawn card is pending, clicking a hand card swaps it */
              const swapAvailable = canAct && hasDrawnCard;

              const isClickable = burnAvailable || swapAvailable;
              const tooltipLabel = swapAvailable
                ? 'Swap with drawn card'
                : burnAvailable
                  ? 'Burn this card'
                  : '';

              const handleClick = () => {
                if (swapAvailable) {
                  handleDiscardChoice(h.slot);
                } else if (burnAvailable) {
                  handleBurnCard(h.slot);
                }
              };

              return (
                <Tooltip key={h.slot} label={tooltipLabel} isDisabled={!isClickable}>
                  <VStack spacing={1} position="relative">
                    {visibleCard ? (
                      <Card
                        card={visibleCard}
                        isSelected={isPeekedSlot(h.slot)}
                        isClickable={isClickable}
                        onClick={handleClick}
                      />
                    ) : (
                      <CardBack
                        isSelected={isPeekedSlot(h.slot)}
                        isClickable={isClickable}
                        onClick={handleClick}
                      />
                    )}
                    <Badge colorScheme={isPeekedSlot(h.slot) ? 'yellow' : 'gray'} fontSize="xs">
                      {h.slot}
                    </Badge>
                  </VStack>
                </Tooltip>
              );
            })}
          </HStack>

          {/* Player info */}
          <Text fontSize="xs" color="gray.500">
            {myPlayer.username} | Score: {myPlayer.totalScore}
          </Text>
        </VStack>
      </Grid>

      {/* ============================================================ */}
      {/* Red Jack Modal (F-049) — Blind swap with opponent             */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingEffect?.effect === 'redJack'}
        onClose={() => {}}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
        size={{ base: 'sm', md: 'md' }}
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>
            <HStack>
              <Text>{'\u2666'}</Text>
              <Text>Red Jack — Blind Swap</Text>
            </HStack>
            <Text fontSize="xs" color="gray.400" fontWeight="normal" mt={1}>
              Swap one of your cards with an opponent&apos;s card (neither is revealed)
            </Text>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Your slots */}
              <Box>
                <Text fontSize="sm" fontWeight="bold" mb={2}>
                  Your card:
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  {myPlayer.hand.map((h) => (
                    <Button
                      key={h.slot}
                      size="sm"
                      variant={jackMySlot === h.slot ? 'solid' : 'outline'}
                      colorScheme={jackMySlot === h.slot ? 'yellow' : 'gray'}
                      onClick={() => setJackMySlot(h.slot)}
                    >
                      {h.slot}
                    </Button>
                  ))}
                </HStack>
              </Box>

              {/* Opponent selection */}
              <Box>
                <Text fontSize="sm" fontWeight="bold" mb={2}>
                  Target opponent:
                </Text>
                <HStack spacing={2} flexWrap="wrap">
                  {opponents.map((opp) => (
                    <Button
                      key={opp.playerId}
                      size="sm"
                      variant={jackTargetPlayer === opp.playerId ? 'solid' : 'outline'}
                      colorScheme={jackTargetPlayer === opp.playerId ? 'blue' : 'gray'}
                      onClick={() => {
                        setJackTargetPlayer(opp.playerId);
                        setJackTargetSlot(null);
                      }}
                    >
                      {opp.username}
                    </Button>
                  ))}
                </HStack>
              </Box>

              {/* Target slot */}
              {jackTargetPlayer && (
                <Box>
                  <Text fontSize="sm" fontWeight="bold" mb={2}>
                    Target slot:
                  </Text>
                  <HStack spacing={2} flexWrap="wrap">
                    {opponents
                      .find((o) => o.playerId === jackTargetPlayer)
                      ?.hand.map((h) => (
                        <Button
                          key={h.slot}
                          size="sm"
                          variant={jackTargetSlot === h.slot ? 'solid' : 'outline'}
                          colorScheme={jackTargetSlot === h.slot ? 'blue' : 'gray'}
                          onClick={() => setJackTargetSlot(h.slot)}
                        >
                          {h.slot}
                        </Button>
                      ))}
                  </HStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button
              variant="outline"
              colorScheme="red"
              onClick={() => handleJackSubmit(true)}
              isLoading={jackLoading}
            >
              Skip
            </Button>
            <Button
              colorScheme="green"
              onClick={() => handleJackSubmit(false)}
              isLoading={jackLoading}
              isDisabled={!jackMySlot || !jackTargetPlayer || !jackTargetSlot}
            >
              Swap
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ============================================================ */}
      {/* Red Queen Modal (F-050) — Peek at own card                    */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingEffect?.effect === 'redQueen' || queenPeekTimer}
        onClose={() => {}}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
        size={{ base: 'sm', md: 'md' }}
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>
            <HStack>
              <Text>{'\u2665'}</Text>
              <Text>Red Queen — Peek</Text>
            </HStack>
            <Text fontSize="xs" color="gray.400" fontWeight="normal" mt={1}>
              Peek at one of your own face-down cards
            </Text>
          </ModalHeader>
          <ModalBody>
            {queenPeekedCard ? (
              <VStack spacing={3}>
                <Text fontSize="sm" color="yellow.300" fontWeight="bold">
                  Memorize this card! ({queenPeekTimer ? '3s' : '...'})
                </Text>
                <Box
                  mx="auto"
                  border="2px solid"
                  borderColor="yellow.400"
                  borderRadius="md"
                  shadow="0 0 16px rgba(255, 214, 0, 0.4)"
                >
                  <Card card={queenPeekedCard} size="lg" />
                </Box>
              </VStack>
            ) : (
              <VStack spacing={3}>
                <Text fontSize="sm" mb={2}>
                  Select a slot to peek at:
                </Text>
                <HStack spacing={2} flexWrap="wrap" justify="center">
                  {myPlayer.hand.map((h) => (
                    <Button
                      key={h.slot}
                      size="md"
                      variant="outline"
                      colorScheme="purple"
                      onClick={() => handleQueenPeek(h.slot)}
                      isLoading={queenLoading}
                    >
                      {h.slot}
                    </Button>
                  ))}
                </HStack>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter />
        </ModalContent>
      </Modal>

      {/* ============================================================ */}
      {/* Red King Modal (F-051 to F-053) — Draw 2, choose action       */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingEffect?.effect === 'redKing'}
        onClose={() => {}}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
        size={{ base: 'sm', md: 'lg' }}
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>
            <HStack>
              <Text>{'\u2666'}</Text>
              <Text>Red King — Draw 2</Text>
            </HStack>
            <Text fontSize="xs" color="gray.400" fontWeight="normal" mt={1}>
              You drew 2 cards. Choose what to do with them.
            </Text>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Show the 2 drawn cards */}
              {pendingEffect?.redKingCards && (
                <HStack spacing={4} justify="center">
                  {pendingEffect.redKingCards.map((c, i) => (
                    <VStack key={i} spacing={1}>
                      <Box
                        border="2px solid"
                        borderColor={
                          kingMode === 'keepOne' && kingKeepIndex === i ? 'yellow.400' : 'gray.500'
                        }
                        borderRadius="md"
                        cursor={kingMode === 'keepOne' ? 'pointer' : 'default'}
                        onClick={() => {
                          if (kingMode === 'keepOne') setKingKeepIndex(i as 0 | 1);
                        }}
                        shadow={
                          kingMode === 'keepOne' && kingKeepIndex === i
                            ? '0 0 12px rgba(255, 214, 0, 0.4)'
                            : 'none'
                        }
                      >
                        <Card card={c} size="md" />
                      </Box>
                      <Badge
                        colorScheme={
                          kingMode === 'keepOne' && kingKeepIndex === i ? 'yellow' : 'gray'
                        }
                        fontSize="xs"
                      >
                        Card {i + 1}
                      </Badge>
                    </VStack>
                  ))}
                </HStack>
              )}

              {/* Mode selection */}
              <HStack spacing={2} justify="center" flexWrap="wrap">
                <Button
                  size="sm"
                  variant={kingMode === 'returnBoth' ? 'solid' : 'outline'}
                  colorScheme={kingMode === 'returnBoth' ? 'red' : 'gray'}
                  onClick={() => {
                    setKingMode('returnBoth');
                    setKingKeepIndex(null);
                    setKingReplaceSlot(null);
                    setKingReplaceSlots([null, null]);
                  }}
                >
                  Return Both
                </Button>
                <Button
                  size="sm"
                  variant={kingMode === 'keepOne' ? 'solid' : 'outline'}
                  colorScheme={kingMode === 'keepOne' ? 'yellow' : 'gray'}
                  onClick={() => {
                    setKingMode('keepOne');
                    setKingKeepIndex(null);
                    setKingReplaceSlot(null);
                    setKingReplaceSlots([null, null]);
                  }}
                >
                  Keep 1
                </Button>
                <Button
                  size="sm"
                  variant={kingMode === 'keepBoth' ? 'solid' : 'outline'}
                  colorScheme={kingMode === 'keepBoth' ? 'green' : 'gray'}
                  onClick={() => {
                    setKingMode('keepBoth');
                    setKingKeepIndex(null);
                    setKingReplaceSlot(null);
                    setKingReplaceSlots([null, null]);
                  }}
                >
                  Keep Both
                </Button>
              </HStack>

              {/* Keep One: select which drawn card + which hand slot */}
              {kingMode === 'keepOne' && (
                <VStack spacing={3} align="stretch">
                  <Text fontSize="sm" color="gray.300">
                    Click a drawn card above to select it, then pick a hand slot to replace:
                  </Text>
                  <HStack spacing={2} flexWrap="wrap">
                    {myPlayer.hand.map((h) => (
                      <Button
                        key={h.slot}
                        size="sm"
                        variant={kingReplaceSlot === h.slot ? 'solid' : 'outline'}
                        colorScheme={kingReplaceSlot === h.slot ? 'yellow' : 'gray'}
                        onClick={() => setKingReplaceSlot(h.slot)}
                      >
                        {h.slot}
                      </Button>
                    ))}
                  </HStack>
                </VStack>
              )}

              {/* Keep Both: select 2 hand slots */}
              {kingMode === 'keepBoth' && (
                <VStack spacing={3} align="stretch">
                  <Text fontSize="sm" color="gray.300">
                    Select 2 hand slots to replace (Card 1 goes to first, Card 2 to second):
                  </Text>
                  <HStack spacing={2} flexWrap="wrap">
                    {myPlayer.hand.map((h) => {
                      const isFirst = kingReplaceSlots[0] === h.slot;
                      const isSecond = kingReplaceSlots[1] === h.slot;
                      const isSelected = isFirst || isSecond;
                      return (
                        <Button
                          key={h.slot}
                          size="sm"
                          variant={isSelected ? 'solid' : 'outline'}
                          colorScheme={isFirst ? 'green' : isSecond ? 'blue' : 'gray'}
                          onClick={() => {
                            if (isFirst) {
                              setKingReplaceSlots([null, kingReplaceSlots[1]]);
                            } else if (isSecond) {
                              setKingReplaceSlots([kingReplaceSlots[0], null]);
                            } else if (!kingReplaceSlots[0]) {
                              setKingReplaceSlots([h.slot, kingReplaceSlots[1]]);
                            } else if (!kingReplaceSlots[1]) {
                              setKingReplaceSlots([kingReplaceSlots[0], h.slot]);
                            }
                          }}
                        >
                          {h.slot}
                          {isFirst ? ' (1)' : isSecond ? ' (2)' : ''}
                        </Button>
                      );
                    })}
                  </HStack>
                </VStack>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="green"
              onClick={handleKingSubmit}
              isLoading={kingLoading}
              isDisabled={
                !kingMode ||
                (kingMode === 'keepOne' && (kingKeepIndex === null || !kingReplaceSlot)) ||
                (kingMode === 'keepBoth' && (!kingReplaceSlots[0] || !kingReplaceSlots[1]))
              }
            >
              Confirm
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ============================================================ */}
      {/* Round End Modal (F-070) — Show all hands and scores           */}
      {/* ============================================================ */}
      <Modal
        isOpen={roundEndData !== null && gameEndData === null}
        onClose={() => {}}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
        size={{ base: 'md', md: 'lg' }}
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="gray.800" color="white" maxH="90vh" overflow="auto">
          <ModalHeader textAlign="center">
            <Heading size="md" color="orange.300">
              Round {roundEndData?.roundNumber} Complete
            </Heading>
            <Text fontSize="sm" color="gray.400" fontWeight="normal" mt={1}>
              {roundEndData?.checkCalledBy === playerId
                ? 'You'
                : (gameState?.players.find((p) => p.playerId === roundEndData?.checkCalledBy)
                    ?.username ?? 'Someone')}{' '}
              called check
            </Text>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* All hands revealed */}
              {roundEndData?.allHands.map((hand: PlayerRoundResult) => {
                const isWinner = roundEndData.roundWinners.includes(hand.playerId);
                const isMe = hand.playerId === playerId;
                return (
                  <Box
                    key={hand.playerId}
                    p={3}
                    borderRadius="md"
                    border="2px solid"
                    borderColor={isWinner ? 'green.400' : 'gray.600'}
                    bg={isWinner ? 'whiteAlpha.100' : 'transparent'}
                  >
                    <Flex justify="space-between" align="center" mb={2}>
                      <HStack spacing={2}>
                        <Text fontWeight="bold" fontSize="sm">
                          {hand.username}
                          {isMe ? ' (You)' : ''}
                        </Text>
                        {isWinner && (
                          <Badge colorScheme="green" fontSize="2xs">
                            Winner
                          </Badge>
                        )}
                      </HStack>
                      <Text
                        fontWeight="bold"
                        fontSize="sm"
                        color={isWinner ? 'green.300' : 'red.300'}
                      >
                        {hand.handSum} pts
                      </Text>
                    </Flex>
                    <HStack spacing={2} flexWrap="wrap">
                      {hand.cards.map((c, i) => (
                        <VStack key={i} spacing={0}>
                          <Box
                            w={{ base: '40px', md: '52px' }}
                            h={{ base: '56px', md: '74px' }}
                            borderRadius="sm"
                            border="1px solid"
                            borderColor={isWinner ? 'green.400' : 'gray.500'}
                            bg="white"
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            fontSize={{ base: '2xs', md: 'xs' }}
                          >
                            <Text
                              color={c.isRed ? 'red.500' : 'gray.800'}
                              fontWeight="bold"
                              lineHeight={1}
                            >
                              {c.rank}
                            </Text>
                            <Text color={c.isRed ? 'red.500' : 'gray.800'} lineHeight={1}>
                              {c.suit}
                            </Text>
                          </Box>
                          <Text fontSize="2xs" color="gray.500">
                            {hand.slots[i]}
                          </Text>
                        </VStack>
                      ))}
                    </HStack>
                  </Box>
                );
              })}

              {/* Cumulative scores */}
              <Divider borderColor="gray.600" />
              <Box>
                <Text fontWeight="bold" fontSize="sm" mb={2} color="gray.300">
                  Cumulative Scores
                </Text>
                <Table size="sm" variant="simple">
                  <Thead>
                    <Tr>
                      <Th color="gray.400">Player</Th>
                      <Th color="gray.400" isNumeric>
                        Total
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {gameState?.players
                      .slice()
                      .sort(
                        (a, b) =>
                          (roundEndData?.updatedScores[a.playerId] ?? 0) -
                          (roundEndData?.updatedScores[b.playerId] ?? 0),
                      )
                      .map((p) => (
                        <Tr key={p.playerId}>
                          <Td color="gray.100" fontSize="sm">
                            {p.username}
                            {p.playerId === playerId ? ' (You)' : ''}
                          </Td>
                          <Td
                            isNumeric
                            fontWeight="bold"
                            color={
                              (roundEndData?.updatedScores[p.playerId] ?? 0) >= 100
                                ? 'red.400'
                                : 'gray.100'
                            }
                          >
                            {roundEndData?.updatedScores[p.playerId] ?? 0}
                          </Td>
                        </Tr>
                      ))}
                  </Tbody>
                </Table>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="center">
            <Text fontSize="xs" color="gray.500">
              {roundEndData?.nextRoundStarting ? 'Next round starting soon...' : 'Game over!'}
            </Text>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ============================================================ */}
      {/* Game End Modal (F-075) — Final scores, winner, loser          */}
      {/* ============================================================ */}
      <Modal
        isOpen={gameEndData !== null}
        onClose={() => {}}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
        size={{ base: 'md', md: 'lg' }}
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="gray.800" color="white" maxH="90vh" overflow="auto">
          <ModalHeader textAlign="center">
            <Heading size="lg" color="yellow.300" mb={2}>
              Game Over
            </Heading>
            <VStack spacing={1}>
              <Text fontSize="md" color="green.300">
                Winner: {gameEndData?.winner.username}
                {gameEndData?.winner.playerId === playerId ? ' (You!)' : ''} —{' '}
                {gameEndData?.winner.score} pts
              </Text>
              <Text fontSize="md" color="red.300">
                Loser: {gameEndData?.loser.username}
                {gameEndData?.loser.playerId === playerId ? ' (You)' : ''} —{' '}
                {gameEndData?.loser.score} pts
              </Text>
            </VStack>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Final scores table */}
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th color="gray.400">Player</Th>
                    <Th color="gray.400" isNumeric>
                      Final Score
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {Object.entries(gameEndData?.finalScores ?? {})
                    .sort(([, a], [, b]) => a - b)
                    .map(([pid, score]) => {
                      const playerName =
                        gameState?.players.find((p) => p.playerId === pid)?.username ?? pid;
                      const isWinner = pid === gameEndData?.winner.playerId;
                      const isLoser = pid === gameEndData?.loser.playerId;
                      return (
                        <Tr key={pid}>
                          <Td fontSize="sm">
                            <HStack spacing={2}>
                              <Text color="gray.100">
                                {playerName}
                                {pid === playerId ? ' (You)' : ''}
                              </Text>
                              {isWinner && (
                                <Badge colorScheme="green" fontSize="2xs">
                                  Winner
                                </Badge>
                              )}
                              {isLoser && (
                                <Badge colorScheme="red" fontSize="2xs">
                                  Loser
                                </Badge>
                              )}
                            </HStack>
                          </Td>
                          <Td
                            isNumeric
                            fontWeight="bold"
                            color={isWinner ? 'green.300' : isLoser ? 'red.300' : 'gray.100'}
                          >
                            {score}
                          </Td>
                        </Tr>
                      );
                    })}
                </Tbody>
              </Table>

              {/* Last round hands */}
              {gameEndData?.allHands && gameEndData.allHands.length > 0 && (
                <Box>
                  <Text fontWeight="bold" fontSize="sm" mb={2} color="gray.300">
                    Final Hands
                  </Text>
                  {gameEndData.allHands.map((hand: PlayerRoundResult) => (
                    <Box key={hand.playerId} mb={2}>
                      <Flex justify="space-between" align="center" mb={1}>
                        <Text fontSize="xs" fontWeight="bold" color="gray.300">
                          {hand.username} — {hand.handSum} pts
                        </Text>
                      </Flex>
                      <HStack spacing={1} flexWrap="wrap">
                        {hand.cards.map((c, i) => (
                          <Box
                            key={i}
                            w={{ base: '36px', md: '44px' }}
                            h={{ base: '50px', md: '62px' }}
                            borderRadius="sm"
                            border="1px solid"
                            borderColor="gray.500"
                            bg="white"
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="2xs"
                          >
                            <Text
                              color={c.isRed ? 'red.500' : 'gray.800'}
                              fontWeight="bold"
                              lineHeight={1}
                            >
                              {c.rank}
                            </Text>
                            <Text color={c.isRed ? 'red.500' : 'gray.800'} lineHeight={1}>
                              {c.suit}
                            </Text>
                          </Box>
                        ))}
                      </HStack>
                    </Box>
                  ))}
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter justifyContent="center">
            <Button colorScheme="blue" size="md" onClick={handleReturnToLobby}>
              Return to Home
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

import { useEffect, useState, useCallback, FC } from 'react';
import {
  Box,
  Flex,
  Grid,
  Text,
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
import { Card } from '../components/cards/Card';
import { CardBack } from '../components/cards/CardBack';
import type { Card as CardType } from '../types/card.types';
import type { ClientHandSlot, ClientPlayerState } from '../types/player.types';
import type { PeekedCard } from '../types/game.types';

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
                  opacity={h.card === undefined ? 0.3 : 1}
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
    endPeek,
    performAction,
    discardChoice,
    debugPeek,
  } = useSocket();
  const toast = useToast();

  // Peek animation state
  const [isPeeking, setIsPeeking] = useState(true);
  const [peekProgress, setPeekProgress] = useState(100);

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
    <Box minH="100vh" bg="gray.900" display="flex" flexDirection="column" position="relative">
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
        <Text fontSize="sm" color="gray.400">
          Phase:{' '}
          <Text as="span" color="gray.100" fontWeight="bold">
            {gameState.phase}
          </Text>
        </Text>
      </Flex>

      {/* Main game area */}
      <Grid
        flex={1}
        templateRows="auto 1fr auto"
        p={{ base: 2, md: 4 }}
        gap={{ base: 3, md: 4 }}
        maxW="900px"
        mx="auto"
        w="100%"
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
                size="md"
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
                  <Card card={drawnCard} size="md" />
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
                <Card
                  card={topDiscard}
                  isClickable={
                    hasDrawnCard
                      ? !drawnFromDiscard
                      : canAct && (turnData?.availableActions.includes('takeDiscard') ?? false)
                  }
                  onClick={
                    hasDrawnCard && !drawnFromDiscard
                      ? () => handleDiscardChoice(null)
                      : !hasDrawnCard
                        ? handleTakeDiscard
                        : undefined
                  }
                />
              ) : (
                <Box
                  w="80px"
                  h="112px"
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
        <VStack spacing={3}>
          {/* Turn indicator */}
          {gameState.phase === 'peeking' ? (
            <Text fontSize="sm" color="yellow.300" fontWeight="bold">
              Memorizing...
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
            <Heading size="sm" color="yellow.300">
              Your Turn
            </Heading>
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
    </Box>
  );
};

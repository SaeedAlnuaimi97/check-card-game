import { useEffect, useState, useCallback, useRef, FC } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Box,
  Button,
  Divider,
  Flex,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
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
  useBreakpointValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import {
  MenuOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  LogoutOutlined,
  EyeOutlined,
  FireOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { DEBUG_MODE } from '../context/SocketContext';
import socket from '../services/socket';
import { Card } from '../components/cards/Card';
import { CardBack } from '../components/cards/CardBack';
import { FlippableCard } from '../components/cards/FlippableCard';
import {
  playPickSound,
  playBurnSound,
  playSwapSound,
  playWinSound,
  playTurnSound,
  playGameStartingSound,
  isSoundEnabled,
  setSoundEnabled,
} from '../utils/sound';
import { vibrateTap, vibrateSuccess, vibrateWarning } from '../utils/haptics';
import type { Card as CardType } from '../types/card.types';
import type { ClientHandSlot, ClientPlayerState } from '../types/player.types';
import type { PeekedCard, PlayerRoundResult } from '../types/game.types';

// ============================================================
// Constants
// ============================================================

const PEEK_DURATION_MS = 8000;
const PEEK_TICK_MS = 100;

// ============================================================
// Avatar color palette (deterministic by player index)
// ============================================================

const AVATAR_PALETTE = [
  { bg: '#1a3a2a', color: '#5ecf5e', dot: '#5ecf5e' }, // green
  { bg: '#1a1a3a', color: '#7a7aee', dot: '#7a7aee' }, // blue
  { bg: '#3a1a1a', color: '#cf5e5e', dot: '#cf5e5e' }, // red
  { bg: '#2a1f00', color: '#c9a227', dot: '#c9a227' }, // gold
  { bg: '#0a2a2a', color: '#5ecfcf', dot: '#5ecfcf' }, // teal
  { bg: '#2a1a2a', color: '#ee7aee', dot: '#ee7aee' }, // pink
];

function getAvatarColors(playerIndex: number) {
  return AVATAR_PALETTE[playerIndex % AVATAR_PALETTE.length];
}

// ============================================================
// Discard history card type
// ============================================================

interface DiscardHistoryCard {
  id: string;
  rank: string;
  suit: string;
  isRed: boolean;
}

// ============================================================
// F-309: Confetti overlay for victory animation
// ============================================================

const CONFETTI_COLORS = [
  '#FFD700',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98FB98',
  '#F0E68C',
  '#FF69B4',
];

const ConfettiOverlay: FC = () => {
  const pieces = Array.from({ length: 40 }, (_, i) => i);
  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      pointerEvents="none"
      zIndex={200}
      overflow="hidden"
    >
      {pieces.map((i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 1.5;
        const duration = 2 + Math.random() * 2;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const size = 6 + Math.random() * 8;
        const rotate = Math.random() * 360;
        return (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              top: '-20px',
              left: `${left}%`,
              width: `${size}px`,
              height: `${size * 0.6}px`,
              backgroundColor: color,
              borderRadius: '2px',
              rotate: `${rotate}deg`,
            }}
            animate={{
              y: ['0vh', '110vh'],
              x: [0, (Math.random() - 0.5) * 120],
              rotate: [rotate, rotate + 360 * (Math.random() > 0.5 ? 1 : -1)],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration,
              delay,
              ease: 'easeIn',
              repeat: Infinity,
              repeatDelay: Math.random() * 2,
            }}
          />
        );
      })}
    </Box>
  );
};

// ============================================================
// Opponent Display
// ============================================================

interface OpponentProps {
  player: ClientPlayerState;
  playerIndex: number;
  isCurrentTurn: boolean;
  targetScore: number;
  debugRevealed?: Record<string, CardType>;
  modifiedSlots?: { playerId: string; slot: string }[];
}

/** Mobile slim row (~30px tall) */
const MobileOpponentRow: FC<OpponentProps> = ({
  player,
  playerIndex,
  isCurrentTurn,
  targetScore,
}) => {
  const initials = player.username.slice(0, 2).toUpperCase();
  const av = getAvatarColors(playerIndex);
  const dangerThreshold = targetScore - 15;
  const isDanger = player.totalScore >= dangerThreshold;

  return (
    <Box
      display="flex"
      alignItems="center"
      gap="8px"
      px="10px"
      py="4px"
      borderBottom="0.5px solid #13131e"
      position="relative"
      bg={isCurrentTurn ? '#17150a' : isDanger ? '#140a0a' : 'transparent'}
      sx={{
        '&::before': isCurrentTurn
          ? {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '2px',
              background: '#c9a227',
              borderRadius: '0 1px 1px 0',
            }
          : isDanger
            ? {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '2px',
                background: '#cf5e5e',
                borderRadius: '0 1px 1px 0',
              }
            : {},
      }}
    >
      {/* Turn pip */}
      <Box
        w="5px"
        h="5px"
        borderRadius="full"
        bg={isCurrentTurn ? '#c9a227' : 'transparent'}
        flexShrink={0}
      />
      {/* Avatar */}
      <Box
        w="20px"
        h="20px"
        borderRadius="full"
        bg={av.bg}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="8px"
        fontWeight="700"
        color={av.color}
        flexShrink={0}
      >
        {initials}
      </Box>
      {/* Name */}
      <Box
        flex={1}
        minW={0}
        fontSize="11px"
        color="#bbb"
        fontWeight="500"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {player.username}
        {player.isBot && (
          <Box as="span" fontSize="8px" color="#3a3a6a" fontWeight="400" ml="3px">
            BOT
          </Box>
        )}
      </Box>
      {/* Mini card pips */}
      <Box display="flex" gap="2px" alignItems="center" flexShrink={0}>
        {player.hand.map((h: ClientHandSlot) => (
          <Box
            key={h.slot}
            w="9px"
            h="13px"
            borderRadius="2px"
            bg="#2a2a4a"
            border="0.5px solid #3a3a5a"
          />
        ))}
      </Box>
      {/* Score */}
      <Box
        fontSize="10px"
        color={isDanger ? '#cf5e5e' : '#555'}
        fontWeight="500"
        minW="32px"
        textAlign="right"
        flexShrink={0}
      >
        {player.totalScore}
        {isDanger ? ' !' : ''}
      </Box>
    </Box>
  );
};

/** Desktop side opponent card (left/right columns) */
const DesktopSideOpponent: FC<OpponentProps> = ({
  player,
  playerIndex,
  isCurrentTurn,
  targetScore,
  debugRevealed,
  modifiedSlots,
}) => {
  const initials = player.username.slice(0, 2).toUpperCase();
  const av = getAvatarColors(playerIndex);
  const dangerThreshold = targetScore - 15;
  const isDanger = player.totalScore >= dangerThreshold;

  return (
    <Box
      bg={isCurrentTurn ? '#1e1b0c' : '#1a1a26'}
      border="0.5px solid"
      borderColor={isCurrentTurn ? '#c9a22780' : isDanger ? '#cf5e5e60' : '#2a2a3a'}
      borderRadius="10px"
      px="10px"
      py="8px"
      display="flex"
      alignItems="center"
      gap="8px"
    >
      {/* Avatar */}
      <Box
        w="30px"
        h="30px"
        borderRadius="full"
        bg={av.bg}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="11px"
        fontWeight="700"
        color={av.color}
        flexShrink={0}
      >
        {initials}
      </Box>
      {/* Info */}
      <Box flex={1} minW={0}>
        <Box fontSize="12px" color="#ccc" fontWeight="500" noOfLines={1}>
          {player.username}
          {player.isBot && (
            <Box
              as="span"
              fontSize="9px"
              color="#555"
              bg="#1a1a28"
              px="5px"
              py="1px"
              borderRadius="3px"
              ml="5px"
            >
              BOT
            </Box>
          )}
          {isCurrentTurn && (
            <Box
              as="span"
              fontSize="9px"
              color="#c9a227"
              bg="#2a1f00"
              px="5px"
              py="1px"
              borderRadius="3px"
              ml="5px"
            >
              TURN
            </Box>
          )}
        </Box>
        <Box fontSize="11px" color={isDanger ? '#cf5e5e' : '#555'} mt="2px">
          {player.totalScore} pts{isDanger ? ' — danger!' : ''}
        </Box>
        {/* Mini card backs */}
        <Box display="flex" gap="3px" flexWrap="wrap" mt="5px">
          {player.hand.map((h: ClientHandSlot) => {
            const key = `${player.playerId}:${h.slot}`;
            const revealedCard = debugRevealed?.[key];
            const isModified =
              modifiedSlots?.some((m) => m.playerId === player.playerId && m.slot === h.slot) ??
              false;
            return (
              <Box
                key={h.slot}
                w="16px"
                h="22px"
                borderRadius="3px"
                bg={revealedCard ? 'white' : '#2a2a4a'}
                border="0.5px solid"
                borderColor={revealedCard ? '#ddd' : '#3a3a5a'}
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="7px"
                fontWeight="700"
                color={revealedCard ? (revealedCard.isRed ? '#c0392b' : '#222') : undefined}
                sx={
                  isModified && !revealedCard
                    ? {
                        '@keyframes bgFlash': {
                          '0%': { background: '#2a2a4a' },
                          '20%': { background: '#1a3a2a' },
                          '70%': { background: '#1a3a2a' },
                          '100%': { background: '#2a2a4a' },
                        },
                        animation: 'bgFlash 1.5s ease-out forwards',
                      }
                    : {}
                }
              >
                {revealedCard ? `${revealedCard.rank}${revealedCard.suit}` : null}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

/** Desktop top opponent card (top row, column layout) */
const DesktopTopOpponent: FC<OpponentProps> = ({
  player,
  playerIndex,
  isCurrentTurn,
  targetScore,
  debugRevealed,
  modifiedSlots,
}) => {
  const initials = player.username.slice(0, 2).toUpperCase();
  const av = getAvatarColors(playerIndex);
  const dangerThreshold = targetScore - 15;
  const isDanger = player.totalScore >= dangerThreshold;

  return (
    <Box
      bg={isCurrentTurn ? '#1e1b0c' : '#1a1a26'}
      border="0.5px solid"
      borderColor={isCurrentTurn ? '#c9a22780' : isDanger ? '#cf5e5e60' : '#2a2a3a'}
      borderRadius="10px"
      px="12px"
      py="8px"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="6px"
      minW="110px"
    >
      {/* Header row: avatar + name/score */}
      <Box display="flex" alignItems="center" gap="6px">
        <Box
          w="28px"
          h="28px"
          borderRadius="full"
          bg={av.bg}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="10px"
          fontWeight="700"
          color={av.color}
          flexShrink={0}
        >
          {initials}
        </Box>
        <Box>
          <Box fontSize="11px" color="#ccc" fontWeight="500" whiteSpace="nowrap">
            {player.username}
            {isCurrentTurn && (
              <Box
                as="span"
                fontSize="9px"
                color="#c9a227"
                bg="#2a1f00"
                px="5px"
                py="1px"
                borderRadius="3px"
                ml="4px"
              >
                TURN
              </Box>
            )}
            {player.isBot && !isCurrentTurn && (
              <Box
                as="span"
                fontSize="9px"
                color="#555"
                bg="#1a1a28"
                px="5px"
                py="1px"
                borderRadius="3px"
                ml="4px"
              >
                BOT
              </Box>
            )}
          </Box>
          <Box fontSize="10px" color={isDanger ? '#cf5e5e' : '#555'}>
            {player.totalScore} pts
          </Box>
        </Box>
      </Box>
      {/* Mini card backs */}
      <Box display="flex" gap="3px">
        {player.hand.map((h: ClientHandSlot) => {
          const key = `${player.playerId}:${h.slot}`;
          const revealedCard = debugRevealed?.[key];
          const isModified =
            modifiedSlots?.some((m) => m.playerId === player.playerId && m.slot === h.slot) ??
            false;
          return (
            <Box
              key={h.slot}
              w="16px"
              h="22px"
              borderRadius="3px"
              bg={revealedCard ? 'white' : '#2a2a4a'}
              border="0.5px solid"
              borderColor={revealedCard ? '#ddd' : '#3a3a5a'}
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="7px"
              fontWeight="700"
              color={revealedCard ? (revealedCard.isRed ? '#c0392b' : '#222') : undefined}
              sx={
                isModified && !revealedCard
                  ? {
                      '@keyframes bgFlash': {
                        '0%': { background: '#2a2a4a' },
                        '20%': { background: '#1a3a2a' },
                        '70%': { background: '#1a3a2a' },
                        '100%': { background: '#2a2a4a' },
                      },
                      animation: 'bgFlash 1.5s ease-out forwards',
                    }
                  : {}
              }
            >
              {revealedCard ? `${revealedCard.rank}${revealedCard.suit}` : null}
            </Box>
          );
        })}
      </Box>
    </Box>
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
    lastSwapResult,
    checkCalledData,
    roundEndData,
    gameEndData,
    modifiedSlots,
    nextRoundStartsAt,
    endPeek,
    callCheck,
    performAction,
    discardChoice,
    redJackSwap,
    redQueenPeek,
    redKingChoice,
    leaveRoom,
    kickPlayer,
    debugPeek,
    endGame,
    startNextRound,
    pauseGame,
    resumeGame,
    clearRoundEndData,
    clearGameEndData,
    undoTakeDiscard,
  } = useSocket();
  const toast = useToast();

  // Peek animation state
  const [isPeeking, setIsPeeking] = useState(true);
  const [peekProgress, setPeekProgress] = useState(100);

  // RS-007: Track known card slots (peeked during setup or Red Queen) for eye badge
  const [knownSlots, setKnownSlots] = useState<Set<string>>(new Set());

  // Reset peeking state and known slots when a new round starts
  useEffect(() => {
    if (peekedCards && peekedCards.length > 0 && gameState?.phase === 'peeking') {
      setIsPeeking(true);
      setPeekProgress(100);
      // Seed known slots from setup peek cards
      setKnownSlots(new Set(peekedCards.map((pc: PeekedCard) => pc.slot)));
    }
  }, [peekedCards, gameState?.phase]);

  // Debug: track revealed cards by key `${playerId}:${slot}`
  const [debugRevealed, setDebugRevealed] = useState<Record<string, CardType>>({});

  const [debugRevealAll, setDebugRevealAll] = useState(false);

  // Burn confirmation modal state
  const [pendingBurnSlot, setPendingBurnSlot] = useState<string | null>(null);

  // Game menu modal
  const { isOpen: isMenuOpen, onOpen: onMenuOpen, onClose: onMenuClose } = useDisclosure();
  // How to play modal
  const { isOpen: isInfoOpen, onOpen: onInfoOpen, onClose: onInfoClose } = useDisclosure();

  // Responsive: tablet/desktop detection
  const isDesktop = useBreakpointValue({ base: false, md: true }, { ssr: false }) ?? false;

  // Sound toggle state (synced with localStorage)
  const [soundEnabled, _setSoundEnabled] = useState(isSoundEnabled);
  const toggleSound = useCallback(() => {
    const newVal = !soundEnabled;
    _setSoundEnabled(newVal);
    setSoundEnabled(newVal);
  }, [soundEnabled]);

  // Turn timer countdown state (seconds remaining)
  const [turnTimeLeft, setTurnTimeLeft] = useState<number | null>(null);
  const TURN_TIMEOUT_SECS = 30;

  // Red card flash state (UI-006)
  const [showRedFlash, setShowRedFlash] = useState(false);

  // Round countdown timer state (seconds remaining before next round auto-starts)
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null);
  const roundCountdownSoundPlayedRef = useRef(false);

  // F-308: Track discard pile top card ID to animate new cards appearing
  const [discardAnimKey, setDiscardAnimKey] = useState<string>('');

  // Discard history — last 5 discarded cards (newest last), reset each round
  const [discardHistory, setDiscardHistory] = useState<DiscardHistoryCard[]>([]);
  const prevDiscardTopIdRef = useRef<string>('');
  const prevRoundNumberRef = useRef<number>(0);
  useEffect(() => {
    if (!gameState) return;
    const pile = gameState.discardPile;
    // Reset on new round
    if (gameState.roundNumber !== prevRoundNumberRef.current) {
      prevRoundNumberRef.current = gameState.roundNumber;
      prevDiscardTopIdRef.current = '';
      setDiscardHistory([]);
      return;
    }
    if (pile.length === 0) return;
    const top = pile[pile.length - 1];
    if (top.id !== prevDiscardTopIdRef.current) {
      prevDiscardTopIdRef.current = top.id;
      setDiscardAnimKey(top.id);
      setDiscardHistory((prev) =>
        [...prev, { id: top.id, rank: top.rank, suit: top.suit, isRed: top.isRed }].slice(-5),
      );
    }
  }, [gameState?.discardPile, gameState?.roundNumber]);

  // F-308: Track drawn card ID to animate it appearing
  const [drawnCardAnimKey, setDrawnCardAnimKey] = useState<string>('');
  useEffect(() => {
    if (drawnCard) {
      setDrawnCardAnimKey(drawnCard.id);
    }
  }, [drawnCard?.id]);

  // F-308: Burn shake animation — slot currently animating
  const [burningSlot, setBurningSlot] = useState<string | null>(null);

  // Trigger red flash when a red face card special effect activates
  useEffect(() => {
    if (
      pendingEffect?.effect === 'redJack' ||
      pendingEffect?.effect === 'redQueen' ||
      pendingEffect?.effect === 'redKing'
    ) {
      setShowRedFlash(true);
      const timer = setTimeout(() => setShowRedFlash(false), 400);
      return () => clearTimeout(timer);
    }
  }, [pendingEffect]);

  // Play turn sound when it becomes this player's turn during active play
  useEffect(() => {
    if (isMyTurn && gameState?.phase === 'playing') {
      playTurnSound();
    }
  }, [isMyTurn, gameState?.phase]);

  // Round countdown timer — ticks down seconds until next round auto-starts
  useEffect(() => {
    if (nextRoundStartsAt == null) {
      setRoundCountdown(null);
      roundCountdownSoundPlayedRef.current = false;
      return;
    }

    // Play game-starting audio once when countdown begins
    if (!roundCountdownSoundPlayedRef.current) {
      roundCountdownSoundPlayedRef.current = true;
      playGameStartingSound();
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((nextRoundStartsAt - Date.now()) / 1000));
      setRoundCountdown(remaining);
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [nextRoundStartsAt]);

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

  // Listen for player-left notifications (keep socket listener for gameEnded logic)
  useEffect(() => {
    const handler = (_data: { username: string; gameEnded: boolean }) => {
      // Toast removed — notifications kept silent
    };
    socket.on('playerLeftGame', handler);
    return () => {
      socket.off('playerLeftGame', handler);
    };
  }, []);

  // Listen for turn timeout (keep socket listener but no toast)
  useEffect(() => {
    const handler = (_data: { playerId: string; username: string }) => {
      // Toast removed — notifications kept silent
    };
    socket.on('turnTimedOut', handler);
    return () => {
      socket.off('turnTimedOut', handler);
    };
  }, []);

  // Listen for game paused (keep socket listener but no toast) (F-280)
  useEffect(() => {
    const handler = (_data: { pausedBy: string; username: string }) => {
      // Toast removed — notifications kept silent
    };
    socket.on('gamePaused', handler);
    return () => {
      socket.off('gamePaused', handler);
    };
  }, []);

  // Listen for game resumed (keep socket listener but no toast) (F-280)
  useEffect(() => {
    const handler = () => {
      // Toast removed — notifications kept silent
    };
    socket.on('gameResumed', handler);
    return () => {
      socket.off('gameResumed', handler);
    };
  }, []);

  // Turn timer countdown — derived from gameState.turnStartedAt
  // Timer is paused (hidden) during special effect prompts
  // Timer is frozen (visible but stopped) when game is paused (F-279)
  useEffect(() => {
    if (!gameState?.turnStartedAt || gameState.phase !== 'playing' || pendingEffect) {
      setTurnTimeLeft(null);
      return;
    }

    // When paused, freeze the timer at its current value — don't clear it,
    // just stop the interval. The server will send a new turnStartedAt on resume.
    if (gameState.paused) {
      return;
    }

    const computeRemaining = () => {
      const elapsed = (Date.now() - gameState.turnStartedAt!) / 1000;
      return Math.max(0, TURN_TIMEOUT_SECS - elapsed);
    };

    setTurnTimeLeft(computeRemaining());

    const interval = setInterval(() => {
      const remaining = computeRemaining();
      setTurnTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [gameState?.turnStartedAt, gameState?.phase, gameState?.paused, pendingEffect]);

  // Burn result — play sound, haptics, and show inline feedback banner (RS-006) (F-044 to F-048)
  const [burnBanner, setBurnBanner] = useState<{ success: boolean } | null>(null);
  useEffect(() => {
    if (!lastBurnResult) return;
    playBurnSound();
    if (lastBurnResult.burnSuccess) {
      vibrateSuccess();
    } else {
      vibrateWarning();
    }
    setBurnBanner({ success: lastBurnResult.burnSuccess });
    const t = setTimeout(() => setBurnBanner(null), 2500);
    return () => clearTimeout(t);
  }, [lastBurnResult]);

  // Clear burn banner when turn advances to the next player
  useEffect(() => {
    setBurnBanner(null);
  }, [gameState?.currentTurnIndex]);

  // Red Jack swap toast notification
  useEffect(() => {
    if (!lastSwapResult) return;
    const { swapperSlot, swapperUsername, targetPlayerId, targetSlot, targetUsername } =
      lastSwapResult;
    if (!swapperSlot || !targetSlot) return;

    playSwapSound();
    let title: string;
    let description: string;

    if (lastSwapResult.playerId === playerId) {
      // I am the swapper
      title = 'Card Swapped!';
      description = `You swapped slot ${swapperSlot} with ${targetUsername}'s slot ${targetSlot}`;
    } else if (targetPlayerId === playerId) {
      // I am the target
      title = 'Card Swapped!';
      description = `${swapperUsername} swapped their slot ${swapperSlot} with your slot ${targetSlot}`;
    } else {
      // I am a bystander
      title = 'Card Swap';
      description = `${swapperUsername} swapped a card with ${targetUsername}`;
    }

    toast({
      title,
      description,
      status: 'info',
      duration: 3000,
      position: 'top',
    });
  }, [lastSwapResult, playerId, toast]);

  // Check called — toast removed (F-062); banner UI still shows

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

  // Play win sound for round winners (skip if game also ended — gameEnded effect handles that)
  useEffect(() => {
    if (!roundEndData || !playerId) return;
    if (roundEndData.gameEnded) return;
    if (roundEndData.roundWinners.includes(playerId)) {
      playWinSound();
    }
  }, [roundEndData, playerId]);

  // Play win sound for the game winner
  useEffect(() => {
    if (!gameEndData || !playerId) return;
    if (gameEndData.winner.playerId === playerId) {
      playWinSound();
    }
  }, [gameEndData, playerId]);

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
    } else if (result.success) {
      playPickSound();
      vibrateTap();
    }
  }, [canAct, hasDrawnCard, turnData, performAction, toast]);

  const handleTakeDiscard = useCallback(async () => {
    if (!canAct || hasDrawnCard || !turnData?.availableActions.includes('takeDiscard')) return;
    const result = await performAction('takeDiscard');
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    } else if (result.success) {
      playPickSound();
      vibrateTap();
    }
  }, [canAct, hasDrawnCard, turnData, performAction, toast]);

  const handleUndoTakeDiscard = useCallback(async () => {
    const result = await undoTakeDiscard();
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [undoTakeDiscard, toast]);

  const handleBurnCard = useCallback(
    async (slot: string) => {
      if (!canAct || hasDrawnCard || !turnData?.availableActions.includes('burn')) return;
      // F-308: trigger shake animation on the burning slot
      setBurningSlot(slot);
      setTimeout(() => setBurningSlot(null), 500);
      const result = await performAction('burn', slot);
      if (!result.success && result.error) {
        toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
      } else if (result.success) {
        playPickSound();
        vibrateTap();
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
        playPickSound();
        vibrateTap();
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
        // RS-007: mark this slot as known
        setKnownSlots((prev) => new Set([...prev, slot]));
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
  const myPlayerIndex = gameState.players.findIndex((p) => p.playerId === playerId);
  const opponents = gameState.players.filter((p) => p.playerId !== playerId);
  // Map playerId -> global player index for avatar colors
  const playerIndexMap = new Map(gameState.players.map((p, idx) => [p.playerId, idx]));
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
      bg="table.felt"
      display="flex"
      flexDirection="column"
      position="relative"
      sx={{ overflowX: 'clip', overflowY: 'visible' }}
      pb="env(safe-area-inset-bottom)"
    >
      {/* Red card flash overlay (UI-006) */}
      <AnimatePresence>
        {showRedFlash && (
          <motion.div
            key="red-flash"
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#d94a4a',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
        )}
      </AnimatePresence>
      {/* Pause overlay removed — pause/resume handled via menu modal & header badge */}
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
            bg="table.border"
            px={6}
            py={4}
            borderRadius="lg"
            border="1px solid"
            borderColor="warning.a10"
            shadow="dark-lg"
          >
            <Text fontSize="md" color="warning.a10" fontWeight="bold">
              Memorize your cards!
            </Text>
            <Progress
              value={peekProgress}
              size="sm"
              colorScheme="yellow"
              w="200px"
              borderRadius="full"
              bg="surface.tonal20"
            />
            <Text fontSize="xs" color="surface.tonal40">
              {Math.ceil((peekProgress / 100) * (PEEK_DURATION_MS / 1000))}s remaining
            </Text>
          </VStack>
        </Box>
      )}
      {/* Score / Round info */}
      <Flex
        px={{ base: 4, md: 5 }}
        py={{ base: 2, md: 3 }}
        bg="#13131a"
        borderBottom="0.5px solid #222"
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
              <EyeOutlined style={{ fontSize: '14px', color: 'white' }} />
            </Box>
          )}
          <Text fontSize={{ base: 'sm', md: 'md' }} color="gray.400">
            Round:{' '}
            <Text as="span" color="gray.100" fontWeight="bold">
              {gameState.roundNumber}
            </Text>
          </Text>
          {gameState.targetScore !== 70 && (
            <Text fontSize={{ base: 'sm', md: 'md' }} color="warning.a10">
              Target:{' '}
              <Text as="span" fontWeight="bold">
                {gameState.targetScore}pts
              </Text>
            </Text>
          )}
        </HStack>
        <HStack spacing={{ base: 2, md: 3 }}>
          {/* Paused badge */}
          {gameState.paused && (
            <Badge colorScheme="yellow" fontSize={{ base: 'xs', md: 'sm' }} px={2} py={1}>
              PAUSED
              {gameState.pausedBy
                ? ` (${gameState.pausedBy === playerId ? 'You' : (gameState.players.find((p) => p.playerId === gameState.pausedBy)?.username ?? 'Host')})`
                : ''}
            </Badge>
          )}
          {/* Check called banner */}
          {checkCalledData && (
            <Badge colorScheme="red" fontSize={{ base: 'xs', md: 'sm' }} px={2} py={1}>
              CHECK ({checkCalledData.playerId === playerId ? 'You' : checkCalledData.username})
            </Badge>
          )}
          {/* CHECK button — gold styling (RS-003) */}
          {turnData?.canCheck && !hasDrawnCard && !pendingEffect && (
            <Tooltip
              label="Call CHECK — you think you have the lowest hand"
              placement="bottom"
              isDisabled={!isDesktop}
            >
              <Button
                px="12px"
                py="4px"
                h="auto"
                minH="28px"
                borderRadius="6px"
                bg="#c9a227"
                color="#1a1200"
                fontSize={{ base: '11px', md: '12px' }}
                fontWeight="600"
                border="none"
                _hover={{ bg: '#b8911e' }}
                _active={{ bg: '#a07e18' }}
                onClick={handleCallCheck}
              >
                CHECK
              </Button>
            </Tooltip>
          )}

          {isDesktop ? (
            <>
              {/* Desktop: inline menu options */}
              <Tooltip label={gameState.paused ? 'Resume Game' : 'Pause Game'}>
                <IconButton
                  aria-label={gameState.paused ? 'Resume game' : 'Pause game'}
                  size="sm"
                  variant="ghost"
                  color={gameState.paused ? 'warning.a10' : 'gray.400'}
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  isDisabled={
                    gameState.phase === 'roundEnd' ||
                    gameState.phase === 'gameEnd' ||
                    gameState.phase === 'dealing'
                  }
                  onClick={async () => {
                    const result = gameState.paused ? await resumeGame() : await pauseGame();
                    if (!result.success && result.error) {
                      toast({
                        title: result.error,
                        status: 'error',
                        duration: 2000,
                        position: 'top',
                      });
                    }
                  }}
                  icon={gameState.paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                />
              </Tooltip>

              <Tooltip label={soundEnabled ? 'Mute sound' : 'Unmute sound'}>
                <IconButton
                  aria-label="Toggle sound"
                  size="sm"
                  variant="ghost"
                  color={soundEnabled ? 'gray.400' : 'gray.600'}
                  _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                  onClick={toggleSound}
                  icon={<SoundOutlined />}
                />
              </Tooltip>

              <Tooltip label="Exit game">
                <IconButton
                  aria-label="Exit game"
                  size="sm"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: 'danger.a10', bg: 'whiteAlpha.100' }}
                  onClick={handleExitGame}
                  icon={<LogoutOutlined />}
                />
              </Tooltip>
            </>
          ) : (
            /* Mobile: single menu button */
            <IconButton
              aria-label="Game menu"
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={onMenuOpen}
              icon={<MenuOutlined />}
            />
          )}
        </HStack>
      </Flex>
      {/* Game Menu Modal — bottom sheet style */}
      <Modal isOpen={isMenuOpen} onClose={onMenuClose} size="full" motionPreset="slideInBottom">
        <ModalOverlay bg="rgba(0,0,0,0.55)" />
        <ModalContent
          bg="transparent"
          color="white"
          display="flex"
          alignItems="flex-end"
          justifyContent="center"
          m={0}
          p="12px"
          maxW="480px"
          mx="auto"
          shadow="none"
          mt="auto"
        >
          <Box
            w="100%"
            bg="#1c1c28"
            borderRadius="14px"
            border="0.5px solid #2a2a3a"
            overflow="hidden"
            mb={2}
          >
            {/* Drag handle row with close button */}
            <Flex align="center" justify="center" position="relative" mt="14px" mb="10px" px="16px">
              <Box w="36px" h="3px" bg="#333" borderRadius="2px" />
              <Box
                as="button"
                position="absolute"
                right="16px"
                top="50%"
                transform="translateY(-50%)"
                fontSize="16px"
                color="#555"
                bg="transparent"
                border="none"
                cursor="pointer"
                lineHeight={1}
                px="4px"
                _hover={{ color: '#aaa' }}
                onClick={onMenuClose}
                aria-label="Close menu"
              >
                ✕
              </Box>
            </Flex>

            {/* RS-014: Score summary */}
            <Box px="16px" pb="4px">
              <Text
                fontSize="10px"
                color="#444"
                letterSpacing="0.1em"
                textTransform="uppercase"
                mb="6px"
              >
                Scores
              </Text>
              {[...gameState.players]
                .sort((a, b) => a.totalScore - b.totalScore)
                .map((p) => (
                  <Flex key={p.playerId} justify="space-between" align="center" py="4px">
                    <HStack spacing="6px">
                      <Box
                        w="6px"
                        h="6px"
                        borderRadius="full"
                        bg={p.playerId === playerId ? '#c9a227' : p.isBot ? '#7a7aee' : '#4ecb4e'}
                      />
                      <Text
                        fontSize="13px"
                        color={p.playerId === playerId ? '#c9a227' : '#ccc'}
                        fontWeight={p.playerId === playerId ? '600' : 'normal'}
                      >
                        {p.username}
                        {p.playerId === playerId ? ' (You)' : ''}
                      </Text>
                    </HStack>
                    <Text
                      fontSize="13px"
                      fontWeight="600"
                      color={p.totalScore >= 50 ? '#cf7070' : '#999'}
                    >
                      {p.totalScore}
                    </Text>
                  </Flex>
                ))}
            </Box>

            <Box h="0.5px" bg="#1a1a24" />

            {/* How to Play */}
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="10px"
              px="16px"
              py="13px"
              w="100%"
              borderBottom="0.5px solid #1a1a24"
              cursor="pointer"
              _hover={{ bg: '#222232' }}
              onClick={() => {
                onMenuClose();
                onInfoOpen();
              }}
            >
              <Text fontSize="15px" color="#666" w="20px" textAlign="center">
                ?
              </Text>
              <Text fontSize="14px" color="#ccc">
                How to Play
              </Text>
            </Box>

            {/* Pause / Resume */}
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="10px"
              px="16px"
              py="13px"
              w="100%"
              borderBottom="0.5px solid #1a1a24"
              cursor="pointer"
              opacity={
                gameState.phase === 'roundEnd' ||
                gameState.phase === 'gameEnd' ||
                gameState.phase === 'dealing'
                  ? 0.4
                  : 1
              }
              _hover={{ bg: '#222232' }}
              onClick={async () => {
                if (
                  gameState.phase === 'roundEnd' ||
                  gameState.phase === 'gameEnd' ||
                  gameState.phase === 'dealing'
                )
                  return;
                const result = gameState.paused ? await resumeGame() : await pauseGame();
                if (!result.success && result.error) {
                  toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
                }
              }}
            >
              <Text fontSize="15px" color="#666" w="20px" textAlign="center">
                {gameState.paused ? '▶' : '⏸'}
              </Text>
              <Text fontSize="14px" color="#ccc">
                {gameState.paused ? 'Resume Game' : 'Pause Game'}
              </Text>
            </Box>

            {/* Sound toggle */}
            <Flex
              justify="space-between"
              align="center"
              px="16px"
              py="12px"
              borderBottom="0.5px solid #1a1a24"
            >
              <HStack spacing="10px">
                <Text fontSize="15px" color="#666" w="20px" textAlign="center">
                  ♪
                </Text>
                <Text fontSize="14px" color="#ccc">
                  Sound
                </Text>
              </HStack>
              {/* Custom toggle */}
              <Box
                as="button"
                w="38px"
                h="22px"
                borderRadius="11px"
                bg={soundEnabled ? '#3a6a4a' : '#2a2a3a'}
                position="relative"
                cursor="pointer"
                transition="background 0.2s"
                onClick={toggleSound}
                flexShrink={0}
              >
                <Box
                  w="16px"
                  h="16px"
                  borderRadius="full"
                  bg={soundEnabled ? '#5ecf5e' : '#555'}
                  position="absolute"
                  top="3px"
                  left={soundEnabled ? '19px' : '3px'}
                  transition="left 0.2s, background 0.2s"
                />
              </Box>
            </Flex>

            {/* Players section — host-only */}
            {roomData?.host === playerId &&
              gameState.players.filter((p) => p.playerId !== playerId).length > 0 && (
                <>
                  <Text
                    fontSize="10px"
                    color="#444"
                    letterSpacing="0.1em"
                    textTransform="uppercase"
                    px="16px"
                    pt="10px"
                    pb="4px"
                  >
                    Players
                  </Text>
                  {gameState.players
                    .filter((p) => p.playerId !== playerId)
                    .map((p) => (
                      <Flex
                        key={p.playerId}
                        justify="space-between"
                        align="center"
                        px="16px"
                        py="10px"
                        borderTop="0.5px solid #1a1a24"
                      >
                        <Text fontSize="13px" color="#ccc">
                          {p.username}
                          {p.isBot ? ' (Bot)' : ''}
                        </Text>
                        <Box
                          as="span"
                          fontSize="14px"
                          color="#3a2a2a"
                          cursor="pointer"
                          px="6px"
                          py="2px"
                          borderRadius="4px"
                          sx={{ '&:hover': { color: '#cf5e5e' } }}
                          onClick={async () => {
                            onMenuClose();
                            const result = await kickPlayer(p.playerId);
                            toast({
                              title: result.success
                                ? `${p.username} was removed`
                                : (result.error ?? 'Failed to kick player'),
                              status: result.success ? 'info' : 'error',
                              duration: 2500,
                              position: 'top',
                            });
                          }}
                        >
                          ✕
                        </Box>
                      </Flex>
                    ))}
                  <Box h="0.5px" bg="#1a1a24" />
                </>
              )}

            {/* Exit Game — danger row */}
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="10px"
              px="16px"
              py="13px"
              w="100%"
              cursor="pointer"
              _hover={{ bg: '#1a1010' }}
              onClick={() => {
                onMenuClose();
                handleExitGame();
              }}
            >
              <Text fontSize="15px" color="#7a3a3a" w="20px" textAlign="center">
                ⎋
              </Text>
              <Text fontSize="14px" color="#cf7070">
                Exit Game
              </Text>
            </Box>
          </Box>
        </ModalContent>
      </Modal>
      {/* How to Play Info Modal */}
      <Modal
        isOpen={isInfoOpen}
        onClose={onInfoClose}
        isCentered
        size={{ base: 'sm', md: 'md' }}
        scrollBehavior="inside"
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="table.border" color="white">
          <ModalHeader fontSize="md" borderBottom="1px solid" borderColor="surface.tonal30" pb={3}>
            How to Play
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody py={4} fontSize="sm">
            <VStack align="stretch" spacing={2}>
              <Box bg="surface.tonal20" px={3} py={2} borderRadius="md">
                <Text fontWeight="semibold" color="white">
                  Draw from Deck
                </Text>
                <Text color="gray.300" fontSize="xs" mt={1}>
                  Tap the deck → tap a hand card to swap, or tap discard to keep your hand.
                </Text>
              </Box>
              <Box bg="surface.tonal20" px={3} py={2} borderRadius="md">
                <Text fontWeight="semibold" color="white">
                  Take from Discard
                </Text>
                <Text color="gray.300" fontSize="xs" mt={1}>
                  Tap the discard pile → must tap a hand card to swap.
                </Text>
              </Box>
              <Box bg="surface.tonal20" px={3} py={2} borderRadius="md">
                <Text fontWeight="semibold" color="white">
                  Burn a Card
                </Text>
                <Text color="gray.300" fontSize="xs" mt={1}>
                  Tap a hand card directly (without drawing). If it matches the top discard's rank,
                  it's removed. If wrong, you get a penalty card.
                </Text>
              </Box>
              <Box bg="surface.tonal20" px={3} py={2} borderRadius="md">
                <Text fontWeight="semibold" color="white">
                  Call CHECK
                </Text>
                <Text color="gray.300" fontSize="xs" mt={1}>
                  Tap CHECK before your action if you think you have the lowest hand.
                </Text>
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
      {/* Final Round banner (UI-005) */}
      {checkCalledData && (
        <Box
          bg="danger.a0"
          px={4}
          py={2}
          textAlign="center"
          flexShrink={0}
          animation="pulse 2s ease-in-out infinite"
        >
          <Text
            fontSize={{ base: 'sm', md: 'md' }}
            fontWeight="bold"
            color="white"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            {checkCalledData.playerId === playerId ? 'YOU' : checkCalledData.username.toUpperCase()}{' '}
            CALLED CHECK — FINAL TURN
          </Text>
        </Box>
      )}
      {/* ── MOBILE: OPPONENT SLIM ROWS ── */}
      {!isDesktop && (
        <Box bg="#0d0d14" flexShrink={0}>
          {/* Section header */}
          <Box display="flex" justifyContent="space-between" px="10px" pt="6px" pb="2px">
            <Box fontSize="9px" color="#333" textTransform="uppercase" letterSpacing="0.08em">
              opponents
            </Box>
            <Box fontSize="9px" color="#333">
              {opponents.length}
            </Box>
          </Box>
          {opponents.map((opp) => (
            <MobileOpponentRow
              key={opp.playerId}
              player={opp}
              playerIndex={playerIndexMap.get(opp.playerId) ?? 0}
              isCurrentTurn={
                gameState.players[gameState.currentTurnIndex]?.playerId === opp.playerId
              }
              targetScore={gameState.targetScore}
              debugRevealed={debugRevealed}
              modifiedSlots={modifiedSlots}
            />
          ))}
        </Box>
      )}
      {/* ── MOBILE: SCORE BAR ── */}
      {!isDesktop && (
        <Box
          display="flex"
          gap="4px"
          bg="#0d0d14"
          px="10px"
          py="4px"
          overflowX="auto"
          flexShrink={0}
          sx={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
        >
          {/* "You" pill */}
          <Box
            bg="#1a1a3a"
            color="#7a7aee"
            border="0.5px solid #2a2a3a"
            borderRadius="10px"
            px="7px"
            py="2px"
            fontSize="9px"
            fontWeight="500"
            whiteSpace="nowrap"
            flexShrink={0}
          >
            You · {myPlayer.totalScore}
          </Box>
          {opponents.map((opp) => {
            const oppIdx = playerIndexMap.get(opp.playerId) ?? 0;
            const av = getAvatarColors(oppIdx);
            const dangerThreshold = gameState.targetScore - 15;
            const isDanger = opp.totalScore >= dangerThreshold;
            return (
              <Box
                key={opp.playerId}
                bg="#1a1a28"
                color={isDanger ? '#cf5e5e' : '#555'}
                border="0.5px solid #2a2a3a"
                borderRadius="10px"
                px="7px"
                py="2px"
                fontSize="9px"
                fontWeight="500"
                whiteSpace="nowrap"
                flexShrink={0}
                display="flex"
                alignItems="center"
                gap="4px"
              >
                <Box w="6px" h="6px" borderRadius="full" bg={av.dot} flexShrink={0} />
                {opp.username} · {opp.totalScore}
                {isDanger ? ' !' : ''}
              </Box>
            );
          })}
        </Box>
      )}
      {/* ── MOBILE: TABLE CENTER ── */}
      {!isDesktop && (
        <Box
          flex={1}
          bg="#0d0d12"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          px="14px"
          py="14px"
          overflow="hidden"
        >
          <Box
            bg="#12181a"
            borderRadius="14px"
            border="0.5px solid #1a2a22"
            px="14px"
            py="14px"
            display="flex"
            flexDirection="column"
            gap="12px"
          >
            {/* Timer row — SVG ring + text label + progress bar */}
            {turnTimeLeft !== null &&
              gameState.phase === 'playing' &&
              (() => {
                const pct = turnTimeLeft / TURN_TIMEOUT_SECS;
                const timerColor = pct > 0.6 ? '#4ecb4e' : pct > 0.3 ? '#c9a227' : '#cf5e5e';
                const circumference = 2 * Math.PI * 14;
                const isPulsing = pct <= 0.3;
                const currentTurnPlayer = gameState.players[gameState.currentTurnIndex];
                const isMyTurnNow = currentTurnPlayer?.playerId === playerId;
                const statusText =
                  hasDrawnCard && drawnFromDiscard
                    ? 'tap a hand card to swap'
                    : hasDrawnCard
                      ? 'tap hand to swap · tap discard to keep'
                      : isMyTurnNow
                        ? `your turn · ${Math.ceil(turnTimeLeft)}s`
                        : `${currentTurnPlayer?.username ?? ''} · ${Math.ceil(turnTimeLeft)}s`;
                return (
                  <Box
                    display="flex"
                    alignItems="center"
                    gap="10px"
                    sx={
                      isPulsing
                        ? {
                            '@keyframes timerPulse': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.55 },
                            },
                            animation: 'timerPulse 1s ease-in-out infinite',
                          }
                        : {}
                    }
                  >
                    <svg width="36" height="36" viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#1a2a1a"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke={timerColor}
                        strokeWidth="2.5"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - pct)}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                        style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s' }}
                      />
                      <text
                        x="18"
                        y="22"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={timerColor}
                        fontFamily="Inter, system-ui, sans-serif"
                      >
                        {Math.ceil(turnTimeLeft)}
                      </text>
                    </svg>
                    <Box flex={1}>
                      <Text fontSize="11px" color={timerColor} mb="4px" noOfLines={1}>
                        {statusText}
                      </Text>
                      <Box h="5px" bg="#1a2a1a" borderRadius="3px" overflow="hidden">
                        <Box
                          h="100%"
                          borderRadius="3px"
                          bg={timerColor}
                          w={`${pct * 100}%`}
                          style={{ transition: 'width 0.5s linear, background 0.5s' }}
                        />
                      </Box>
                    </Box>
                  </Box>
                );
              })()}

            {/* Burn result feedback banner (RS-006) */}
            {burnBanner && (
              <Box
                px="14px"
                py="6px"
                borderRadius="8px"
                bg={burnBanner.success ? 'rgba(94,207,94,0.12)' : 'rgba(207,94,94,0.12)'}
                border={`1px solid ${burnBanner.success ? '#5ecf5e' : '#cf5e5e'}`}
                textAlign="center"
              >
                <Text
                  fontSize="13px"
                  fontWeight="600"
                  color={burnBanner.success ? '#5ecf5e' : '#cf5e5e'}
                >
                  {burnBanner.success ? '✓ Burned!' : 'X No match! +1 penalty card'}
                </Text>
              </Box>
            )}

            {/* Pile area — draw + discard */}
            <Flex justify="center" align="center" gap={{ base: '28px', md: '40px' }}>
              {/* Draw Pile */}
              <VStack spacing="5px">
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
                  isDisabled={!isDesktop || (!canAct && gameState.phase !== 'playing')}
                >
                  <Box>
                    <CardBack
                      size="lg"
                      isClickable={
                        canAct &&
                        !hasDrawnCard &&
                        (turnData?.availableActions.includes('drawDeck') ?? false)
                      }
                      onClick={handleDrawDeck}
                    />
                  </Box>
                </Tooltip>
                <Text fontSize="10px" color="#444">
                  draw pile
                </Text>
                {canAct && !hasDrawnCard && turnData?.availableActions.includes('drawDeck') && (
                  <Text fontSize="10px" color="#333">
                    tap to draw
                  </Text>
                )}
              </VStack>

              {/* Swap arrow */}
              <Text color="#2a2a3a" fontSize="20px">
                ⇄
              </Text>

              {/* Drawn Card (floating) */}
              <AnimatePresence mode="wait">
                {hasDrawnCard && drawnCard && (
                  <VStack spacing="5px">
                    <motion.div
                      key={drawnCardAnimKey}
                      initial={{ scale: 0.6, opacity: 0, y: -20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.6, opacity: 0, y: 20 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    >
                      <Box
                        borderRadius="md"
                        border="2px solid #c9a227"
                        boxShadow="0 0 16px rgba(215, 172, 97, 0.5)"
                        animation="pulse 1.5s ease-in-out infinite"
                      >
                        <Card card={drawnCard} size="lg" />
                      </Box>
                    </motion.div>
                    <Text fontSize="10px" color="#c9a227" fontWeight="600">
                      {drawnFromDiscard ? 'from discard' : 'drawn'}
                    </Text>
                  </VStack>
                )}
              </AnimatePresence>

              {/* Discard Pile */}
              <VStack spacing="5px">
                <Tooltip
                  label={
                    hasDrawnCard && drawnFromDiscard
                      ? 'Must swap with a hand card'
                      : hasDrawnCard
                        ? 'Discard drawn card'
                        : topDiscard?.isBurned
                          ? 'Burned card — cannot pick up'
                          : canAct && turnData?.availableActions.includes('takeDiscard')
                            ? 'Tap to take from discard'
                            : !canAct
                              ? 'Not your turn'
                              : ''
                  }
                  isDisabled={!isDesktop || (!canAct && gameState.phase !== 'playing')}
                >
                  <Box>
                    {topDiscard ? (
                      <Box position="relative">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={discardAnimKey}
                            initial={{ rotateY: 90, opacity: 0 }}
                            animate={{ rotateY: 0, opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            style={{ transformStyle: 'preserve-3d' }}
                          >
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
                                  : !hasDrawnCard &&
                                      canAct &&
                                      !topDiscard.isBurned &&
                                      turnData?.availableActions.includes('takeDiscard')
                                    ? handleTakeDiscard
                                    : undefined
                              }
                            />
                          </motion.div>
                        </AnimatePresence>
                        {topDiscard.isBurned && (
                          <Box
                            position="absolute"
                            top="-6px"
                            right="-6px"
                            bg="warning.a0"
                            borderRadius="full"
                            w="24px"
                            h="24px"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            shadow="md"
                            border="2px solid"
                            borderColor="warning.a10"
                          >
                            <FireOutlined style={{ fontSize: '12px', color: 'white' }} />
                          </Box>
                        )}
                      </Box>
                    ) : (
                      <Box
                        w="58px"
                        h="80px"
                        borderRadius="8px"
                        border="2px dashed"
                        borderColor={hasDrawnCard && !drawnFromDiscard ? '#c9a227' : '#2a2a3a'}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        cursor={hasDrawnCard && !drawnFromDiscard ? 'pointer' : 'default'}
                        onClick={
                          hasDrawnCard && !drawnFromDiscard
                            ? () => handleDiscardChoice(null)
                            : undefined
                        }
                      >
                        <Text
                          fontSize="9px"
                          color={hasDrawnCard && !drawnFromDiscard ? '#c9a227' : '#333'}
                        >
                          {hasDrawnCard && !drawnFromDiscard ? 'discard' : 'empty'}
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Tooltip>
                <Text
                  fontSize="10px"
                  color={hasDrawnCard && !drawnFromDiscard && topDiscard ? '#c9a227' : '#444'}
                >
                  {hasDrawnCard && !drawnFromDiscard ? 'selected' : 'discard'}
                </Text>
                {canAct &&
                  !hasDrawnCard &&
                  topDiscard &&
                  !topDiscard.isBurned &&
                  turnData?.availableActions.includes('takeDiscard') && (
                    <Text fontSize="10px" color="#333">
                      tap to take
                    </Text>
                  )}
              </VStack>
            </Flex>

            {/* Discard history strip */}
            {discardHistory.length > 0 && (
              <Box
                display="flex"
                alignItems="center"
                gap="6px"
                flexWrap="nowrap"
                overflowX="auto"
                sx={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
              >
                <Box fontSize="8px" color="#444" flexShrink={0}>
                  recent:
                </Box>
                {discardHistory.map((c, i) => {
                  const isNewest = i === discardHistory.length - 1;
                  return (
                    <Box
                      key={c.id}
                      w="20px"
                      h="28px"
                      borderRadius="3px"
                      bg="white"
                      border="0.5px solid #ddd"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="7px"
                      fontWeight="700"
                      color={c.isRed ? '#c0392b' : '#222'}
                      opacity={isNewest ? 1 : 0.35}
                      flexShrink={0}
                    >
                      {c.rank}
                      {c.suit}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      )}{' '}
      {/* end !isDesktop table */}
      {/* ── MOBILE: PLAYER ZONE ── */}
      {!isDesktop && (
        <Box bg="#13131a" px="14px" pt="10px" pb="16px" flexShrink={0}>
          {/* hand label */}
          <Text
            fontSize="10px"
            color={hasDrawnCard && drawnFromDiscard ? '#c9a227' : '#555'}
            textAlign="center"
            textTransform="uppercase"
            letterSpacing="0.07em"
            fontWeight="500"
            mb="8px"
          >
            {hasDrawnCard && drawnFromDiscard
              ? 'pick a slot to replace'
              : gameState.phase === 'roundEnd' || gameState.phase === 'gameEnd'
                ? 'round over'
                : 'your hand'}
          </Text>

          {/* Undo button when discard was taken */}
          {hasDrawnCard && drawnFromDiscard && (
            <Flex justify="center" mb="8px">
              <Box
                as="button"
                px="12px"
                py="4px"
                borderRadius="6px"
                bg="#1c1c2e"
                border="0.5px solid #2a2a3a"
                color="#888"
                fontSize="12px"
                cursor="pointer"
                onClick={handleUndoTakeDiscard}
                _hover={{ bg: '#222235' }}
              >
                undo
              </Box>
            </Flex>
          )}

          {/* Hand row */}
          <Box
            overflowX="auto"
            overflowY="visible"
            pb={3}
            sx={{
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <HStack
              spacing={{ base: '8px', md: '10px' }}
              justify={myPlayer.hand.length > 4 ? 'flex-start' : 'center'}
              w={myPlayer.hand.length > 4 ? 'max-content' : '100%'}
              px={myPlayer.hand.length > 4 ? 2 : 0}
            >
              {myPlayer.hand.map((h: ClientHandSlot, cardIdx: number) => {
                const peekedCard = getPeekedCardForSlot(h.slot);
                const showFaceUp = isPeekedSlot(h.slot) && peekedCard !== null;
                const debugKey = `${playerId}:${h.slot}`;
                const debugCard = debugRevealed[debugKey];
                const visibleCard = showFaceUp ? peekedCard : (debugCard ?? h.card);
                const burnAvailable =
                  canAct && !hasDrawnCard && (turnData?.availableActions.includes('burn') ?? false);
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
                    setPendingBurnSlot(h.slot);
                  }
                };

                const isModified =
                  playerId !== null &&
                  modifiedSlots.some((m) => m.playerId === playerId && m.slot === h.slot);

                return (
                  <Tooltip
                    key={h.slot}
                    label={tooltipLabel}
                    isDisabled={!isDesktop || !isClickable}
                  >
                    <motion.div
                      key={`${gameState.roundNumber}:${h.slot}`}
                      initial={{ opacity: 0, y: 20, scale: 0.85 }}
                      animate={
                        burningSlot === h.slot
                          ? {
                              x: [0, -6, 6, -6, 6, -4, 4, 0],
                              rotate: [0, -3, 3, -3, 3, -2, 2, 0],
                              opacity: 1,
                              y: 0,
                              scale: 1,
                            }
                          : { opacity: 1, y: 0, scale: 1 }
                      }
                      transition={
                        burningSlot === h.slot
                          ? { duration: 0.45, ease: 'easeInOut' }
                          : { duration: 0.3, delay: cardIdx * 0.07, ease: 'easeOut' }
                      }
                      style={{ display: 'inline-block' }}
                    >
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        gap="4px"
                        position="relative"
                        flexShrink={0}
                      >
                        <Box
                          position="relative"
                          overflow="visible"
                          borderRadius="md"
                          sx={
                            isModified
                              ? {
                                  '&::after': {
                                    content: '""',
                                    position: 'absolute',
                                    inset: 0,
                                    borderRadius: 'md',
                                    background: '#1a3a2a',
                                    opacity: 0,
                                    pointerEvents: 'none',
                                    zIndex: 2,
                                    animation: 'bgFlashOverlay 1.5s ease-out forwards',
                                  },
                                  '@keyframes bgFlashOverlay': {
                                    '0%': { opacity: 0 },
                                    '20%': { opacity: 0.45 },
                                    '70%': { opacity: 0.45 },
                                    '100%': { opacity: 0 },
                                  },
                                }
                              : {}
                          }
                        >
                          {showFaceUp && peekedCard ? (
                            <FlippableCard
                              card={peekedCard}
                              isFaceUp={true}
                              isSelected={true}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={isDesktop ? 'lg' : 'md'}
                            />
                          ) : visibleCard ? (
                            <Card
                              card={visibleCard}
                              isSelected={isPeekedSlot(h.slot)}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={isDesktop ? 'lg' : 'md'}
                            />
                          ) : (
                            <CardBack
                              isSelected={isPeekedSlot(h.slot)}
                              isKnown={!isPeeking && knownSlots.has(h.slot)}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={isDesktop ? 'lg' : 'md'}
                            />
                          )}
                        </Box>
                        {/* Plain slot label — not a Badge */}
                        <Text
                          fontSize="10px"
                          color={
                            isPeekedSlot(h.slot)
                              ? '#c9a227'
                              : pendingBurnSlot === h.slot
                                ? '#cf5e5e'
                                : '#555'
                          }
                          fontWeight="500"
                        >
                          {h.slot}
                        </Text>
                      </Box>
                    </motion.div>
                  </Tooltip>
                );
              })}
            </HStack>
          </Box>

          {/* hint-text */}
          <Text fontSize="11px" color="#555" textAlign="center" mt="6px">
            {gameState.phase === 'peeking'
              ? 'memorize your cards'
              : hasDrawnCard && drawnFromDiscard
                ? 'tap a slot to place the discard card · tap discard again to cancel'
                : hasDrawnCard
                  ? 'tap hand to swap · tap discard to keep hand'
                  : 'tap draw pile · tap discard then hand · tap hand card to burn'}
          </Text>
        </Box>
      )}{' '}
      {/* end !isDesktop player zone */}
      {/* ── DESKTOP: OVAL 3-COL GRID ── */}
      {isDesktop &&
        (() => {
          const topOpponents = opponents.slice(0, Math.min(3, opponents.length));
          const sideOpponents = opponents.slice(Math.min(3, opponents.length));
          const leftOpp = sideOpponents[0] ?? null;
          const rightOpp = sideOpponents[1] ?? null;
          const dangerThreshold = gameState.targetScore - 15;
          return (
            <Box flex={1} display="flex" flexDirection="column" overflow="hidden">
              {/* 3-col grid */}
              <Box
                display="grid"
                gridTemplateColumns="1fr 1fr 1fr"
                gridTemplateRows="auto 1fr auto"
                flex={1}
                overflow="hidden"
              >
                {/* dt-top: top opponents */}
                <Box
                  gridColumn="1 / -1"
                  gridRow="1"
                  display="flex"
                  justifyContent="center"
                  gap="10px"
                  padding="12px 12px 0"
                >
                  {topOpponents.map((opp) => (
                    <DesktopTopOpponent
                      key={opp.playerId}
                      player={opp}
                      playerIndex={playerIndexMap.get(opp.playerId) ?? 0}
                      isCurrentTurn={
                        gameState.players[gameState.currentTurnIndex]?.playerId === opp.playerId
                      }
                      targetScore={gameState.targetScore}
                      debugRevealed={debugRevealed}
                      modifiedSlots={modifiedSlots}
                    />
                  ))}
                </Box>

                {/* dt-left */}
                <Box
                  gridColumn="1"
                  gridRow="2"
                  display="flex"
                  alignItems="center"
                  justifyContent="flex-end"
                  padding="10px 8px 10px 12px"
                >
                  {leftOpp && (
                    <DesktopSideOpponent
                      player={leftOpp}
                      playerIndex={playerIndexMap.get(leftOpp.playerId) ?? 0}
                      isCurrentTurn={
                        gameState.players[gameState.currentTurnIndex]?.playerId === leftOpp.playerId
                      }
                      targetScore={gameState.targetScore}
                      debugRevealed={debugRevealed}
                      modifiedSlots={modifiedSlots}
                    />
                  )}
                </Box>

                {/* dt-center: table surface */}
                <Box
                  gridColumn="2"
                  gridRow="2"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  overflow="hidden"
                >
                  <Box
                    bg="#111820"
                    borderRadius="14px"
                    border="0.5px solid #1a2a22"
                    padding="14px"
                    display="flex"
                    flexDirection="column"
                    gap="12px"
                    w="100%"
                  >
                    {/* Timer */}
                    {turnTimeLeft !== null &&
                      gameState.phase === 'playing' &&
                      (() => {
                        const pct = turnTimeLeft / TURN_TIMEOUT_SECS;
                        const timerColor =
                          pct > 0.6 ? '#4ecb4e' : pct > 0.3 ? '#c9a227' : '#cf5e5e';
                        const circumference = 2 * Math.PI * 12;
                        const isPulsing = pct <= 0.3;
                        const currentTurnPlayer = gameState.players[gameState.currentTurnIndex];
                        const isMyTurnNow = currentTurnPlayer?.playerId === playerId;
                        const statusText =
                          hasDrawnCard && drawnFromDiscard
                            ? 'tap a hand card to swap'
                            : hasDrawnCard
                              ? 'tap hand to swap · tap discard to keep'
                              : isMyTurnNow
                                ? `your turn · ${Math.ceil(turnTimeLeft)}s`
                                : `${currentTurnPlayer?.username ?? ''} · ${Math.ceil(turnTimeLeft)}s`;
                        return (
                          <Box
                            display="flex"
                            alignItems="center"
                            gap="10px"
                            sx={
                              isPulsing
                                ? {
                                    '@keyframes timerPulse': {
                                      '0%, 100%': { opacity: 1 },
                                      '50%': { opacity: 0.55 },
                                    },
                                    animation: 'timerPulse 1s ease-in-out infinite',
                                  }
                                : {}
                            }
                          >
                            <svg
                              width="30"
                              height="30"
                              viewBox="0 0 30 30"
                              style={{ flexShrink: 0 }}
                            >
                              <circle
                                cx="15"
                                cy="15"
                                r="12"
                                fill="none"
                                stroke="#1a2a1a"
                                strokeWidth="2.5"
                              />
                              <circle
                                cx="15"
                                cy="15"
                                r="12"
                                fill="none"
                                stroke={timerColor}
                                strokeWidth="2.5"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference * (1 - pct)}
                                strokeLinecap="round"
                                transform="rotate(-90 15 15)"
                                style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s' }}
                              />
                              <text
                                x="15"
                                y="19"
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="600"
                                fill={timerColor}
                                fontFamily="Inter, system-ui, sans-serif"
                              >
                                {Math.ceil(turnTimeLeft)}
                              </text>
                            </svg>
                            <Box flex={1}>
                              <Text fontSize="11px" color={timerColor} mb="3px" noOfLines={1}>
                                {statusText}
                              </Text>
                              <Box h="4px" bg="#1a2a1a" borderRadius="3px" overflow="hidden">
                                <Box
                                  h="100%"
                                  borderRadius="3px"
                                  bg={timerColor}
                                  w={`${pct * 100}%`}
                                  style={{ transition: 'width 0.5s linear, background 0.5s' }}
                                />
                              </Box>
                            </Box>
                          </Box>
                        );
                      })()}

                    {/* Burn result feedback */}
                    {burnBanner && (
                      <Box
                        px="14px"
                        py="6px"
                        borderRadius="8px"
                        bg={burnBanner.success ? 'rgba(94,207,94,0.12)' : 'rgba(207,94,94,0.12)'}
                        border={`1px solid ${burnBanner.success ? '#5ecf5e' : '#cf5e5e'}`}
                        textAlign="center"
                      >
                        <Text
                          fontSize="13px"
                          fontWeight="600"
                          color={burnBanner.success ? '#5ecf5e' : '#cf5e5e'}
                        >
                          {burnBanner.success ? '✓ Burned!' : 'X No match! +1 penalty card'}
                        </Text>
                      </Box>
                    )}

                    {/* Pile area */}
                    <Flex justify="center" align="center" gap="40px">
                      {/* Draw Pile */}
                      <VStack spacing="5px">
                        <Tooltip
                          label={
                            canAct &&
                            !hasDrawnCard &&
                            turnData?.availableActions.includes('drawDeck')
                              ? 'Draw from deck'
                              : hasDrawnCard
                                ? 'Card already drawn'
                                : !canAct
                                  ? 'Not your turn'
                                  : ''
                          }
                          isDisabled={!isDesktop}
                        >
                          <Box>
                            <CardBack
                              size="lg"
                              isClickable={
                                canAct &&
                                !hasDrawnCard &&
                                (turnData?.availableActions.includes('drawDeck') ?? false)
                              }
                              onClick={handleDrawDeck}
                            />
                          </Box>
                        </Tooltip>
                        <Text fontSize="10px" color="#444">
                          draw pile
                        </Text>
                      </VStack>
                      <Text color="#2a2a3a" fontSize="20px">
                        ⇄
                      </Text>
                      <AnimatePresence mode="wait">
                        {hasDrawnCard && drawnCard && (
                          <VStack spacing="5px">
                            <motion.div
                              key={drawnCardAnimKey}
                              initial={{ scale: 0.6, opacity: 0, y: -20 }}
                              animate={{ scale: 1, opacity: 1, y: 0 }}
                              exit={{ scale: 0.6, opacity: 0, y: 20 }}
                              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            >
                              <Box
                                borderRadius="md"
                                border="2px solid #c9a227"
                                boxShadow="0 0 16px rgba(215,172,97,0.5)"
                                animation="pulse 1.5s ease-in-out infinite"
                              >
                                <Card card={drawnCard} size="lg" />
                              </Box>
                            </motion.div>
                            <Text fontSize="10px" color="#c9a227" fontWeight="600">
                              {drawnFromDiscard ? 'from discard' : 'drawn'}
                            </Text>
                          </VStack>
                        )}
                      </AnimatePresence>
                      {/* Discard Pile */}
                      <VStack spacing="5px">
                        <Tooltip
                          label={
                            hasDrawnCard && drawnFromDiscard
                              ? 'Must swap with a hand card'
                              : hasDrawnCard
                                ? 'Discard drawn card'
                                : topDiscard?.isBurned
                                  ? 'Burned card — cannot pick up'
                                  : canAct && turnData?.availableActions.includes('takeDiscard')
                                    ? 'Tap to take from discard'
                                    : !canAct
                                      ? 'Not your turn'
                                      : ''
                          }
                          isDisabled={!isDesktop}
                        >
                          <Box>
                            {topDiscard ? (
                              <Box position="relative">
                                <AnimatePresence mode="wait">
                                  <motion.div
                                    key={discardAnimKey}
                                    initial={{ rotateY: 90, opacity: 0 }}
                                    animate={{ rotateY: 0, opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.25, ease: 'easeOut' }}
                                    style={{ transformStyle: 'preserve-3d' }}
                                  >
                                    <Card
                                      card={topDiscard}
                                      size="lg"
                                      isClickable={
                                        hasDrawnCard
                                          ? !drawnFromDiscard
                                          : canAct &&
                                            !topDiscard.isBurned &&
                                            (turnData?.availableActions.includes('takeDiscard') ??
                                              false)
                                      }
                                      onClick={
                                        hasDrawnCard && !drawnFromDiscard
                                          ? () => handleDiscardChoice(null)
                                          : !hasDrawnCard &&
                                              canAct &&
                                              !topDiscard.isBurned &&
                                              turnData?.availableActions.includes('takeDiscard')
                                            ? handleTakeDiscard
                                            : undefined
                                      }
                                    />
                                  </motion.div>
                                </AnimatePresence>
                                {topDiscard.isBurned && (
                                  <Box
                                    position="absolute"
                                    top="-6px"
                                    right="-6px"
                                    bg="warning.a0"
                                    borderRadius="full"
                                    w="24px"
                                    h="24px"
                                    display="flex"
                                    alignItems="center"
                                    justifyContent="center"
                                    shadow="md"
                                    border="2px solid"
                                    borderColor="warning.a10"
                                  >
                                    <FireOutlined style={{ fontSize: '12px', color: 'white' }} />
                                  </Box>
                                )}
                              </Box>
                            ) : (
                              <Box
                                w="62px"
                                h="86px"
                                borderRadius="8px"
                                border="2px dashed"
                                borderColor={
                                  hasDrawnCard && !drawnFromDiscard ? '#c9a227' : '#2a2a3a'
                                }
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                cursor={hasDrawnCard && !drawnFromDiscard ? 'pointer' : 'default'}
                                onClick={
                                  hasDrawnCard && !drawnFromDiscard
                                    ? () => handleDiscardChoice(null)
                                    : undefined
                                }
                              >
                                <Text
                                  fontSize="9px"
                                  color={hasDrawnCard && !drawnFromDiscard ? '#c9a227' : '#333'}
                                >
                                  {hasDrawnCard && !drawnFromDiscard ? 'discard' : 'empty'}
                                </Text>
                              </Box>
                            )}
                          </Box>
                        </Tooltip>
                        <Text
                          fontSize="10px"
                          color={
                            hasDrawnCard && !drawnFromDiscard && topDiscard ? '#c9a227' : '#444'
                          }
                        >
                          {hasDrawnCard && !drawnFromDiscard ? 'selected' : 'discard'}
                        </Text>
                      </VStack>
                    </Flex>

                    {/* Desktop discard history */}
                    {discardHistory.length > 0 && (
                      <Box
                        display="flex"
                        alignItems="center"
                        gap="6px"
                        flexWrap="nowrap"
                        overflowX="auto"
                        sx={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
                      >
                        <Box fontSize="8px" color="#444" flexShrink={0}>
                          last discards:
                        </Box>
                        {discardHistory.map((c, i) => {
                          const isNewest = i === discardHistory.length - 1;
                          return (
                            <Box
                              key={c.id}
                              w="30px"
                              h="42px"
                              borderRadius="4px"
                              bg="white"
                              border="0.5px solid #ddd"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              fontSize="10px"
                              fontWeight="700"
                              color={c.isRed ? '#c0392b' : '#222'}
                              opacity={isNewest ? 1 : 0.35}
                              flexShrink={0}
                            >
                              {c.rank}
                              {c.suit}
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                </Box>

                {/* dt-right */}
                <Box
                  gridColumn="3"
                  gridRow="2"
                  display="flex"
                  alignItems="center"
                  justifyContent="flex-start"
                  padding="10px 12px 10px 8px"
                >
                  {rightOpp && (
                    <DesktopSideOpponent
                      player={rightOpp}
                      playerIndex={playerIndexMap.get(rightOpp.playerId) ?? 0}
                      isCurrentTurn={
                        gameState.players[gameState.currentTurnIndex]?.playerId ===
                        rightOpp.playerId
                      }
                      targetScore={gameState.targetScore}
                      debugRevealed={debugRevealed}
                      modifiedSlots={modifiedSlots}
                    />
                  )}
                </Box>

                {/* dt-bottom: hand zone */}
                <Box gridColumn="1 / -1" gridRow="3" padding="0 12px 14px">
                  <Box
                    bg="#13131a"
                    borderRadius="12px"
                    border="0.5px solid #1e1e2a"
                    px="16px"
                    py="12px"
                  >
                    {/* hand label */}
                    <Text
                      fontSize="10px"
                      color={hasDrawnCard && drawnFromDiscard ? '#c9a227' : '#555'}
                      textAlign="center"
                      textTransform="uppercase"
                      letterSpacing="0.07em"
                      fontWeight="500"
                      mb="8px"
                    >
                      {hasDrawnCard && drawnFromDiscard
                        ? 'pick a slot to replace'
                        : gameState.phase === 'roundEnd' || gameState.phase === 'gameEnd'
                          ? 'round over'
                          : 'your hand'}
                    </Text>
                    {hasDrawnCard && drawnFromDiscard && (
                      <Flex justify="center" mb="8px">
                        <Box
                          as="button"
                          px="12px"
                          py="4px"
                          borderRadius="6px"
                          bg="#1c1c2e"
                          border="0.5px solid #2a2a3a"
                          color="#888"
                          fontSize="12px"
                          cursor="pointer"
                          onClick={handleUndoTakeDiscard}
                          _hover={{ bg: '#222235' }}
                        >
                          undo
                        </Box>
                      </Flex>
                    )}
                    {/* Hand row */}
                    <Box
                      overflowX="auto"
                      overflowY="visible"
                      pb={3}
                      sx={{
                        '&::-webkit-scrollbar': { display: 'none' },
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        WebkitOverflowScrolling: 'touch',
                      }}
                    >
                      <HStack
                        spacing="10px"
                        justify={myPlayer.hand.length > 4 ? 'flex-start' : 'center'}
                        w={myPlayer.hand.length > 4 ? 'max-content' : '100%'}
                        px={myPlayer.hand.length > 4 ? 2 : 0}
                      >
                        {myPlayer.hand.map((h: ClientHandSlot, cardIdx: number) => {
                          const peekedCard = getPeekedCardForSlot(h.slot);
                          const showFaceUp = isPeekedSlot(h.slot) && peekedCard !== null;
                          const debugKey = `${playerId}:${h.slot}`;
                          const debugCard = debugRevealed[debugKey];
                          const visibleCard = showFaceUp ? peekedCard : (debugCard ?? h.card);
                          const burnAvailable =
                            canAct &&
                            !hasDrawnCard &&
                            (turnData?.availableActions.includes('burn') ?? false);
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
                              setPendingBurnSlot(h.slot);
                            }
                          };
                          const isModified =
                            playerId !== null &&
                            modifiedSlots.some((m) => m.playerId === playerId && m.slot === h.slot);
                          return (
                            <Tooltip
                              key={h.slot}
                              label={tooltipLabel}
                              isDisabled={!isDesktop || !isClickable}
                            >
                              <motion.div
                                key={`${gameState.roundNumber}:${h.slot}`}
                                initial={{ opacity: 0, y: 20, scale: 0.85 }}
                                animate={
                                  burningSlot === h.slot
                                    ? {
                                        x: [0, -6, 6, -6, 6, -4, 4, 0],
                                        rotate: [0, -3, 3, -3, 3, -2, 2, 0],
                                        opacity: 1,
                                        y: 0,
                                        scale: 1,
                                      }
                                    : { opacity: 1, y: 0, scale: 1 }
                                }
                                transition={
                                  burningSlot === h.slot
                                    ? { duration: 0.45, ease: 'easeInOut' }
                                    : { duration: 0.3, delay: cardIdx * 0.07, ease: 'easeOut' }
                                }
                                style={{ display: 'inline-block' }}
                              >
                                <Box
                                  display="flex"
                                  flexDirection="column"
                                  alignItems="center"
                                  gap="4px"
                                  position="relative"
                                  flexShrink={0}
                                >
                                  <Box
                                    position="relative"
                                    overflow="visible"
                                    borderRadius="md"
                                    sx={
                                      isModified
                                        ? {
                                            '&::after': {
                                              content: '""',
                                              position: 'absolute',
                                              inset: 0,
                                              borderRadius: 'md',
                                              background: '#1a3a2a',
                                              opacity: 0,
                                              pointerEvents: 'none',
                                              zIndex: 2,
                                              animation: 'bgFlashOverlay 1.5s ease-out forwards',
                                            },
                                            '@keyframes bgFlashOverlay': {
                                              '0%': { opacity: 0 },
                                              '20%': { opacity: 0.45 },
                                              '70%': { opacity: 0.45 },
                                              '100%': { opacity: 0 },
                                            },
                                          }
                                        : {}
                                    }
                                  >
                                    {showFaceUp && peekedCard ? (
                                      <FlippableCard
                                        card={peekedCard}
                                        isFaceUp={true}
                                        isSelected={true}
                                        isClickable={isClickable}
                                        onClick={handleClick}
                                        size="lg"
                                      />
                                    ) : visibleCard ? (
                                      <Card
                                        card={visibleCard}
                                        isSelected={isPeekedSlot(h.slot)}
                                        isClickable={isClickable}
                                        onClick={handleClick}
                                        size="lg"
                                      />
                                    ) : (
                                      <CardBack
                                        isSelected={isPeekedSlot(h.slot)}
                                        isKnown={!isPeeking && knownSlots.has(h.slot)}
                                        isClickable={isClickable}
                                        onClick={handleClick}
                                        size="lg"
                                      />
                                    )}
                                  </Box>
                                  <Text
                                    fontSize="10px"
                                    color={
                                      isPeekedSlot(h.slot)
                                        ? '#c9a227'
                                        : pendingBurnSlot === h.slot
                                          ? '#cf5e5e'
                                          : '#555'
                                    }
                                    fontWeight="500"
                                  >
                                    {h.slot}
                                  </Text>
                                </Box>
                              </motion.div>
                            </Tooltip>
                          );
                        })}
                      </HStack>
                    </Box>
                    <Text fontSize="11px" color="#555" textAlign="center" mt="6px">
                      {gameState.phase === 'peeking'
                        ? 'memorize your cards'
                        : hasDrawnCard && drawnFromDiscard
                          ? 'tap a slot to place the discard card · tap discard again to cancel'
                          : hasDrawnCard
                            ? 'tap hand to swap · tap discard to keep hand'
                            : 'tap draw pile · tap discard then hand · tap hand card to burn'}
                    </Text>
                  </Box>
                </Box>
              </Box>

              {/* Desktop score strip */}
              <Box
                bg="#0a0a10"
                borderTop="0.5px solid #1a1a24"
                px="12px"
                py="8px"
                pb="12px"
                display="flex"
                gap="6px"
                flexWrap="wrap"
                flexShrink={0}
              >
                {/* "You" pill */}
                <Box
                  bg="#1a1a26"
                  border="0.5px solid #2a2a3a"
                  borderRadius="20px"
                  px="10px"
                  py="4px"
                  fontSize="11px"
                  display="flex"
                  alignItems="center"
                  gap="6px"
                >
                  <Box
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg={getAvatarColors(myPlayerIndex).dot}
                    flexShrink={0}
                  />
                  <Box as="span" color="#7a7aee">
                    You · {myPlayer.totalScore}
                  </Box>
                </Box>
                {opponents.map((opp) => {
                  const oppIdx = playerIndexMap.get(opp.playerId) ?? 0;
                  const av = getAvatarColors(oppIdx);
                  const isDanger = opp.totalScore >= dangerThreshold;
                  return (
                    <Box
                      key={opp.playerId}
                      bg="#1a1a26"
                      border="0.5px solid #2a2a3a"
                      borderRadius="20px"
                      px="10px"
                      py="4px"
                      fontSize="11px"
                      display="flex"
                      alignItems="center"
                      gap="6px"
                    >
                      <Box w="6px" h="6px" borderRadius="full" bg={av.dot} flexShrink={0} />
                      <Box as="span" color={isDanger ? '#cf5e5e' : '#aaa'}>
                        {opp.username} · {opp.totalScore}
                        {isDanger ? ' !' : ''}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })()}
      {/* Burn Confirmation Modal                                       */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingBurnSlot !== null}
        onClose={() => setPendingBurnSlot(null)}
        isCentered
        size="xs"
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent bg="table.border" color="white">
          <ModalHeader fontSize="md" pb={2}>
            Burn card?
          </ModalHeader>
          <ModalBody>
            <Text fontSize="sm">
              Burn the card in slot <strong>{pendingBurnSlot}</strong>? If it doesn&apos;t match the
              discard pile top, you&apos;ll receive a penalty card.
            </Text>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="sm" variant="ghost" onClick={() => setPendingBurnSlot(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              colorScheme="red"
              onClick={() => {
                if (pendingBurnSlot) {
                  handleBurnCard(pendingBurnSlot);
                }
                setPendingBurnSlot(null);
              }}
            >
              Burn
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
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
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="table.border" color="white">
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
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="table.border" color="white">
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
                <Text fontSize="sm" color="warning.a10" fontWeight="bold">
                  Memorize this card! ({queenPeekTimer ? '3s' : '...'})
                </Text>
                <Box mx="auto">
                  <FlippableCard
                    card={queenPeekedCard}
                    isFaceUp={true}
                    isSelected={true}
                    size="lg"
                  />
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
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="#1c1c28" color="white" border="0.5px solid #2a2a3a">
          <ModalHeader pb={2}>
            {/* Drag handle */}
            <Box w="36px" h="3px" bg="#333" borderRadius="2px" mx="auto" mb="14px" />
            <HStack spacing={2} mb={1}>
              <Text color="#c0392b" fontSize="18px">
                ♦
              </Text>
              <Text fontSize="15px" fontWeight="600" color="#eee">
                Red King — Draw 2
              </Text>
            </HStack>
            <Text fontSize="12px" color="#555" fontWeight="normal">
              You drew 2 cards. Choose what to do with them.
            </Text>
            {/* RS-002: Step indicator */}
            <HStack spacing={2} mt={3}>
              <Box
                h="3px"
                flex={1}
                borderRadius="2px"
                bg={kingMode ? '#c9a227' : '#2a2a3a'}
                transition="background 0.2s"
              />
              <Box
                h="3px"
                flex={1}
                borderRadius="2px"
                bg={
                  (kingMode === 'keepOne' && kingKeepIndex !== null && kingReplaceSlot) ||
                  (kingMode === 'keepBoth' && kingReplaceSlots[0] && kingReplaceSlots[1]) ||
                  kingMode === 'returnBoth'
                    ? '#c9a227'
                    : '#2a2a3a'
                }
                transition="background 0.2s"
              />
            </HStack>
            <Text fontSize="10px" color="#555" mt={1}>
              {!kingMode
                ? 'Step 1 of 2 — choose an action'
                : kingMode === 'returnBoth'
                  ? 'Step 2 of 2 — confirm'
                  : 'Step 2 of 2 — select slots'}
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
                          kingMode === 'keepOne' && kingKeepIndex === i ? '#c9a227' : '#2a2a3a'
                        }
                        boxShadow={
                          kingMode === 'keepOne' && kingKeepIndex === i
                            ? '0 0 0 1px #c9a22740'
                            : 'none'
                        }
                        borderRadius="md"
                        cursor={kingMode === 'keepOne' ? 'pointer' : 'default'}
                        onClick={() => {
                          if (kingMode === 'keepOne') setKingKeepIndex(i as 0 | 1);
                        }}
                        transition="border-color 0.15s, box-shadow 0.15s"
                      >
                        <Card card={c} size="md" />
                      </Box>
                      <Text
                        fontSize="11px"
                        fontWeight="600"
                        color={kingMode === 'keepOne' && kingKeepIndex === i ? '#c9a227' : '#555'}
                      >
                        Card {i + 1}
                      </Text>
                    </VStack>
                  ))}
                </HStack>
              )}

              {/* RS-002: Mode selection — all neutral outline, no color bias */}
              <HStack spacing={2} justify="center" flexWrap="wrap">
                {(['returnBoth', 'keepOne', 'keepBoth'] as const).map((mode) => {
                  const labels = {
                    returnBoth: 'Return Both',
                    keepOne: 'Keep 1',
                    keepBoth: 'Keep Both',
                  };
                  const isActive = kingMode === mode;
                  return (
                    <Box
                      key={mode}
                      as="button"
                      flex={1}
                      h="44px"
                      borderRadius="8px"
                      bg={isActive ? '#1f1a0a' : '#16162a'}
                      border={`1px solid ${isActive ? '#c9a227' : '#2a2a4a'}`}
                      color={isActive ? '#c9a227' : '#777'}
                      fontSize="13px"
                      fontWeight="600"
                      cursor="pointer"
                      transition="border-color 0.15s, color 0.15s, background 0.15s"
                      onClick={() => {
                        setKingMode(mode);
                        setKingKeepIndex(null);
                        setKingReplaceSlot(null);
                        setKingReplaceSlots([null, null]);
                      }}
                    >
                      {labels[mode]}
                    </Box>
                  );
                })}
              </HStack>

              {/* Keep One: select which drawn card + which hand slot */}
              {kingMode === 'keepOne' && (
                <VStack spacing={3} align="stretch">
                  <Text
                    fontSize="11px"
                    color="#444"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.05em"
                  >
                    Select slot to replace
                  </Text>
                  <HStack spacing={2} flexWrap="wrap">
                    {myPlayer.hand.map((h) => (
                      <Box
                        key={h.slot}
                        as="button"
                        flex={1}
                        h="44px"
                        borderRadius="8px"
                        bg={kingReplaceSlot === h.slot ? '#1f1a0a' : '#16162a'}
                        border={`1px solid ${kingReplaceSlot === h.slot ? '#c9a227' : '#2a2a4a'}`}
                        color={kingReplaceSlot === h.slot ? '#c9a227' : '#777'}
                        fontSize="14px"
                        fontWeight="600"
                        cursor="pointer"
                        transition="border-color 0.15s, color 0.15s, background 0.15s"
                        onClick={() => setKingReplaceSlot(h.slot)}
                      >
                        {h.slot}
                      </Box>
                    ))}
                  </HStack>
                </VStack>
              )}

              {/* Keep Both: select 2 hand slots */}
              {kingMode === 'keepBoth' && (
                <VStack spacing={3} align="stretch">
                  <Text
                    fontSize="11px"
                    color="#444"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.05em"
                  >
                    Select 2 slots to replace
                  </Text>
                  <HStack spacing={2} flexWrap="wrap">
                    {myPlayer.hand.map((h) => {
                      const isFirst = kingReplaceSlots[0] === h.slot;
                      const isSecond = kingReplaceSlots[1] === h.slot;
                      const isSelected = isFirst || isSecond;
                      return (
                        <Box
                          key={h.slot}
                          as="button"
                          flex={1}
                          h="44px"
                          borderRadius="8px"
                          bg={isSelected ? '#1f1a0a' : '#16162a'}
                          border={`1px solid ${isSelected ? '#c9a227' : '#2a2a4a'}`}
                          color={isSelected ? '#c9a227' : '#777'}
                          fontSize="13px"
                          fontWeight="600"
                          cursor="pointer"
                          transition="border-color 0.15s, color 0.15s"
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
                        </Box>
                      );
                    })}
                  </HStack>
                </VStack>
              )}

              {/* RS-002: Helper text when selections incomplete */}
              {kingMode &&
                kingMode !== 'returnBoth' &&
                !(kingMode === 'keepOne' && kingKeepIndex !== null && kingReplaceSlot) &&
                !(kingMode === 'keepBoth' && kingReplaceSlots[0] && kingReplaceSlots[1]) && (
                  <Text fontSize="11px" color="#555" textAlign="center">
                    {kingMode === 'keepOne'
                      ? 'Select a card above and a slot to continue.'
                      : 'Select 2 slots to continue.'}
                  </Text>
                )}
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              flex={1}
              py="10px"
              borderRadius="8px"
              bg="#1c1c2e"
              color="#666"
              fontSize="13px"
              fontWeight="600"
              _hover={{ bg: '#22222e' }}
              isDisabled={kingLoading}
            >
              {/* No cancel for Red King — must choose */}
            </Button>
            <Button
              flex={1}
              py="10px"
              borderRadius="8px"
              bg="#c9a227"
              color="#1a1200"
              fontSize="13px"
              fontWeight="600"
              _hover={{ bg: '#b8911e' }}
              _disabled={{ opacity: 0.35, cursor: 'not-allowed' }}
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
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="table.border" color="white" maxH="90vh" overflow="auto">
          <ModalHeader textAlign="center">
            <Heading size="md" color="warning.a10">
              Round {roundEndData?.roundNumber} Complete
            </Heading>
            <Text fontSize="sm" color="gray.400" fontWeight="normal" mt={1}>
              {roundEndData?.checkCalledBy ? (
                <>
                  {roundEndData.checkCalledBy === playerId
                    ? 'You'
                    : (gameState?.players.find((p) => p.playerId === roundEndData.checkCalledBy)
                        ?.username ?? 'Someone')}{' '}
                  called check
                  {roundEndData.checkerDoubled ? ' (score doubled!)' : ''}
                </>
              ) : (
                <>
                  {roundEndData?.roundWinners.includes(playerId ?? '')
                    ? 'You burned all your cards!'
                    : `${gameState?.players.find((p) => roundEndData?.roundWinners.includes(p.playerId))?.username ?? 'Someone'} burned all their cards!`}
                </>
              )}
            </Text>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* All hands revealed */}
              {roundEndData?.allHands.map((hand: PlayerRoundResult) => {
                const isWinner = roundEndData.roundWinners.includes(hand.playerId);
                const isMe = hand.playerId === playerId;
                const isChecker = hand.playerId === roundEndData.checkCalledBy;
                const isDoubled = isChecker && roundEndData.checkerDoubled;
                return (
                  <Box
                    key={hand.playerId}
                    p={3}
                    borderRadius="md"
                    border="2px solid"
                    borderColor={isWinner ? 'success.a10' : 'gray.600'}
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
                        {isChecker && (
                          <Badge colorScheme={isDoubled ? 'red' : 'blue'} fontSize="2xs">
                            Checker
                          </Badge>
                        )}
                      </HStack>
                      <Text
                        fontWeight="bold"
                        fontSize="sm"
                        color={isWinner ? 'success.a10' : 'danger.a10'}
                      >
                        {isDoubled ? `${hand.handSum} x2 = ${hand.handSum * 2}` : `${hand.handSum}`}{' '}
                        pts
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
                            borderColor={isWinner ? 'success.a10' : 'gray.500'}
                            bg="white"
                            position="relative"
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            fontSize={{ base: '2xs', md: 'xs' }}
                          >
                            <Text
                              color={c.isRed ? 'card.red' : 'card.black'}
                              fontWeight="bold"
                              lineHeight={1}
                            >
                              {c.rank}
                            </Text>
                            <Text color={c.isRed ? 'card.red' : 'card.black'} lineHeight={1}>
                              {c.suit}
                            </Text>
                            {/* Point value badge — bottom-right corner */}
                            <Text
                              position="absolute"
                              bottom="1px"
                              right="2px"
                              fontSize={{ base: '7px', md: '9px' }}
                              fontWeight="bold"
                              color={c.value === 0 ? 'green.600' : 'gray.500'}
                              lineHeight={1}
                            >
                              {c.value}
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
                              (roundEndData?.updatedScores[p.playerId] ?? 0) >=
                              (gameState.targetScore ?? 70)
                                ? 'danger.a10'
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
            {roundEndData?.nextRoundStarting ? (
              <VStack spacing={2}>
                {roundCountdown != null && roundCountdown > 0 ? (
                  <>
                    <Text fontSize="md" fontWeight="bold" color="brand.400">
                      Next round in {roundCountdown}s...
                    </Text>
                    {roomData?.host === playerId && (
                      <Button
                        colorScheme="red"
                        variant="outline"
                        size="sm"
                        onClick={() => endGame()}
                      >
                        End Game
                      </Button>
                    )}
                  </>
                ) : roundCountdown === 0 ? (
                  <Text fontSize="md" fontWeight="bold" color="success.a10">
                    Starting...
                  </Text>
                ) : roomData?.host === playerId ? (
                  <HStack spacing={3}>
                    <Button colorScheme="red" variant="outline" size="sm" onClick={() => endGame()}>
                      End Game
                    </Button>
                    <Button colorScheme="green" size="sm" onClick={() => startNextRound()}>
                      Start Next Round
                    </Button>
                  </HStack>
                ) : (
                  <Text fontSize="sm" color="gray.400">
                    Waiting for host to start next round...
                  </Text>
                )}
              </VStack>
            ) : (
              <Text fontSize="xs" color="gray.500">
                Game over!
              </Text>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
      {/* ============================================================ */}
      {/* F-309: Victory confetti — shown when current player wins      */}
      {/* ============================================================ */}
      {gameEndData !== null && gameEndData.winner.playerId === playerId && <ConfettiOverlay />}
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
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="table.border" color="white" maxH="90vh" overflow="auto">
          <ModalHeader textAlign="center">
            {/* F-309: Animated "You Win!" heading for winner */}
            {gameEndData?.winner.playerId === playerId ? (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 1.15, 1], opacity: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <Heading size="lg" color="warning.a10" mb={2}>
                  You Win! 🏆
                </Heading>
              </motion.div>
            ) : (
              <Heading size="lg" color="warning.a10" mb={2}>
                Game Over
              </Heading>
            )}
            <VStack spacing={1}>
              <Text fontSize="md" color="success.a10">
                Winner: {gameEndData?.winner.username}
                {gameEndData?.winner.playerId === playerId ? ' (You!)' : ''} —{' '}
                {gameEndData?.winner.score} pts
              </Text>
              <Text fontSize="md" color="danger.a10">
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
                            color={isWinner ? 'success.a10' : isLoser ? 'danger.a10' : 'gray.100'}
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
                            position="relative"
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="2xs"
                          >
                            <Text
                              color={c.isRed ? 'card.red' : 'card.black'}
                              fontWeight="bold"
                              lineHeight={1}
                            >
                              {c.rank}
                            </Text>
                            <Text color={c.isRed ? 'card.red' : 'card.black'} lineHeight={1}>
                              {c.suit}
                            </Text>
                            {/* Point value badge — bottom-right corner */}
                            <Text
                              position="absolute"
                              bottom="1px"
                              right="2px"
                              fontSize="7px"
                              fontWeight="bold"
                              color={c.value === 0 ? 'green.600' : 'gray.500'}
                              lineHeight={1}
                            >
                              {c.value}
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
            <Button colorScheme="purple" size="md" onClick={handleReturnToLobby}>
              Return to Home
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

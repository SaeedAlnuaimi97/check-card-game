import { useEffect, useState, useCallback, useRef, FC } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  HStack,
  Badge,
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
  modifiedSlots,
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
        {player.hand.map((h: ClientHandSlot) => {
          const isModified =
            modifiedSlots?.some((m) => m.playerId === player.playerId && m.slot === h.slot) ??
            false;
          return (
            <Box key={h.slot} position="relative" w="9px" h="13px" flexShrink={0}>
              <Box w="9px" h="13px" borderRadius="2px" bg="#2a2a4a" border="0.5px solid #3a3a5a" />
              {isModified && (
                <Box
                  position="absolute"
                  inset={0}
                  borderRadius="2px"
                  pointerEvents="none"
                  zIndex={10}
                  sx={{
                    '@keyframes pipSwapFlash': {
                      '0%': { opacity: 0, boxShadow: 'none' },
                      '10%': { opacity: 1, boxShadow: '0 0 6px 3px #00e5cccc' },
                      '45%': { opacity: 0.85, boxShadow: '0 0 5px 2px #00e5cc88' },
                      '100%': { opacity: 0, boxShadow: 'none' },
                    },
                    animation: 'pipSwapFlash 1.8s ease-out forwards',
                    background: '#00e5cc',
                  }}
                />
              )}
            </Box>
          );
        })}
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
                          '0%': { background: '#2a2a4a', boxShadow: 'none' },
                          '10%': { background: '#00e5cc', boxShadow: '0 0 8px 3px #00e5cc99' },
                          '40%': { background: '#00b8a0', boxShadow: '0 0 6px 2px #00e5cc66' },
                          '100%': { background: '#2a2a4a', boxShadow: 'none' },
                        },
                        animation: 'bgFlash 1.8s ease-out forwards',
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
                        '0%': { background: '#2a2a4a', boxShadow: 'none' },
                        '10%': { background: '#00e5cc', boxShadow: '0 0 8px 3px #00e5cc99' },
                        '40%': { background: '#00b8a0', boxShadow: '0 0 6px 2px #00e5cc66' },
                        '100%': { background: '#2a2a4a', boxShadow: 'none' },
                      },
                      animation: 'bgFlash 1.8s ease-out forwards',
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
  const [isPeeking, setIsPeeking] = useState(false);
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

  // Burn result — toast notification for bystanders (not the burner themselves)
  useEffect(() => {
    if (!lastBurnResult) return;
    if (lastBurnResult.playerId === playerId) return; // burner sees the inline banner
    const burnerUsername =
      gameState?.players.find((p) => p.playerId === lastBurnResult.playerId)?.username ?? 'Someone';
    if (lastBurnResult.burnSuccess && lastBurnResult.burnedCard) {
      const { rank, suit } = lastBurnResult.burnedCard;
      toast({
        title: 'Card Burned',
        description: `${burnerUsername} burned a ${rank}${suit}!`,
        status: 'info',
        duration: 3000,
        position: 'top',
      });
    } else {
      toast({
        title: 'Burn Failed',
        description: `${burnerUsername} failed to burn — got a penalty card`,
        status: 'warning',
        duration: 3000,
        position: 'top',
      });
    }
  }, [lastBurnResult, playerId, gameState?.players, toast]);

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
          overflowX="hidden"
          overflowY="visible"
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

            {/* Pile area — draw pile ⇄ discard pile; drawn card replaces draw pile when held */}
            <Flex justify="center" align="center" gap={{ base: '28px', md: '40px' }}>
              {/* Left slot: draw pile normally, drawn card when held */}
              <VStack spacing="5px">
                {hasDrawnCard && drawnCard ? (
                  /* ── Drawn card replaces draw pile slot ── */
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={drawnCardAnimKey}
                      initial={{ rotateY: 90, opacity: 0, y: -8 }}
                      animate={{ rotateY: 0, opacity: 1, y: 0 }}
                      exit={{ rotateY: 90, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      style={{ transformStyle: 'preserve-3d' }}
                    >
                      <VStack spacing="4px">
                        <Box
                          px="8px"
                          py="2px"
                          borderRadius="8px"
                          bg="#c9a227"
                          color="#1a1200"
                          fontSize="8px"
                          fontWeight="700"
                          letterSpacing="0.06em"
                          textTransform="uppercase"
                        >
                          {drawnFromDiscard ? 'from discard' : 'you drew'}
                        </Box>
                        <Box
                          borderRadius="8px"
                          border="2px solid #c9a227"
                          boxShadow="0 0 14px rgba(201,162,39,0.45)"
                        >
                          <Card card={drawnCard} size="lg" />
                        </Box>
                      </VStack>
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  /* ── Normal draw pile ── */
                  <>
                    <Tooltip
                      label={
                        canAct && turnData?.availableActions.includes('drawDeck')
                          ? 'Draw from deck'
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
                    {canAct && turnData?.availableActions.includes('drawDeck') && (
                      <Text fontSize="10px" color="#333">
                        tap to draw
                      </Text>
                    )}
                  </>
                )}
                <Text fontSize="10px" color="#444">
                  {hasDrawnCard ? 'drawn card' : 'draw pile'}
                </Text>
              </VStack>

              {/* Separator arrow */}
              <Text color="#2a2a3a" fontSize="20px">
                →
              </Text>

              {/* Discard Pile */}
              <VStack spacing="5px">
                <Tooltip
                  label={
                    hasDrawnCard && !drawnFromDiscard
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
                                canAct &&
                                (hasDrawnCard
                                  ? !drawnFromDiscard
                                  : !topDiscard.isBurned &&
                                    (turnData?.availableActions.includes('takeDiscard') ?? false))
                              }
                              onClick={
                                canAct && hasDrawnCard && !drawnFromDiscard
                                  ? () => handleDiscardChoice(null)
                                  : canAct &&
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
                        border="2px dashed #2a2a3a"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <Text fontSize="9px" color="#333">
                          empty
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Tooltip>
                <Text fontSize="10px" color="#444">
                  discard
                </Text>
                {canAct && hasDrawnCard && !drawnFromDiscard && (
                  <Text fontSize="10px" color="#c9a227" fontWeight="500">
                    tap to discard
                  </Text>
                )}
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
        <Box
          bg="#13131a"
          px="10px"
          pt="20px"
          pb="10px"
          flexShrink={0}
          overflow="visible"
          borderTop={canAct ? '2px solid #00e5cc' : '2px solid transparent'}
          boxShadow={canAct ? '0 -4px 18px 0 #00e5cc44' : 'none'}
          transition="border-color 0.3s, box-shadow 0.3s"
        >
          {/* hand label */}
          {isPeeking ? (
            /* Option C memo pill — replaces plain label during peeking phase */
            <Flex align="center" justify="center" mb="10px">
              <Flex
                align="center"
                gap="6px"
                bg="#1e1a08"
                border="1px solid #4a3a00"
                borderRadius="20px"
                px="12px"
                py="4px"
              >
                <Text fontSize="11px" color="#c9a227" fontWeight="600">
                  memorize
                </Text>
                <Text
                  fontSize="13px"
                  fontWeight="800"
                  color="#c9a227"
                  minW="20px"
                  textAlign="center"
                >
                  {Math.ceil((peekProgress / 100) * (PEEK_DURATION_MS / 1000))}
                </Text>
                <Text fontSize="11px" color="#c9a227" fontWeight="600">
                  sec
                </Text>
              </Flex>
            </Flex>
          ) : (
            <Text
              fontSize="10px"
              color={hasDrawnCard && drawnFromDiscard ? '#c9a227' : '#555'}
              textAlign="center"
              textTransform="uppercase"
              letterSpacing="0.07em"
              fontWeight="500"
              mb="16px"
            >
              {hasDrawnCard && drawnFromDiscard
                ? 'pick a slot to replace'
                : gameState.phase === 'roundEnd' || gameState.phase === 'gameEnd'
                  ? 'round over'
                  : 'your hand'}
            </Text>
          )}

          {/* Undo button when discard was taken */}
          {hasDrawnCard && drawnFromDiscard && (
            <Flex justify="center" mb="4px">
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
            w="100%"
            py={isPeeking ? '12px' : '1px'}
            sx={{
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <HStack
              spacing={{ base: '6px', md: '10px' }}
              justify="center"
              minW="max-content"
              w="100%"
              px={2}
              pt="8px"
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
                      style={{
                        display: 'inline-block',
                        opacity: isPeeking && !showFaceUp ? 0.35 : 1,
                        transition: 'opacity 0.3s',
                      }}
                    >
                      <Box
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        gap="4px"
                        position="relative"
                        flexShrink={0}
                      >
                        <Box position="relative" overflow="visible" borderRadius="md">
                          {showFaceUp && peekedCard ? (
                            <FlippableCard
                              card={peekedCard}
                              isFaceUp={true}
                              isSelected={true}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={isDesktop ? 'lg' : isPeeking ? 'md' : 'sm'}
                            />
                          ) : visibleCard ? (
                            <Card
                              card={visibleCard}
                              isSelected={isPeekedSlot(h.slot)}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={isDesktop ? 'lg' : isPeeking ? 'md' : 'sm'}
                            />
                          ) : (
                            <CardBack
                              isSelected={isPeekedSlot(h.slot)}
                              isKnown={!isPeeking && knownSlots.has(h.slot)}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={isDesktop ? 'lg' : isPeeking ? 'md' : 'sm'}
                            />
                          )}
                          {isModified && (
                            <Box
                              position="absolute"
                              inset={0}
                              borderRadius="md"
                              pointerEvents="none"
                              zIndex={10}
                              sx={{
                                '@keyframes swapFlash': {
                                  '0%': { opacity: 0, boxShadow: 'none' },
                                  '10%': { opacity: 0.82, boxShadow: '0 0 18px 6px #00e5ccbb' },
                                  '45%': { opacity: 0.7, boxShadow: '0 0 14px 4px #00e5cc88' },
                                  '100%': { opacity: 0, boxShadow: 'none' },
                                },
                                animation: 'swapFlash 1.8s ease-out forwards',
                                background: '#00e5cc',
                              }}
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
                          fontWeight={isPeekedSlot(h.slot) ? '700' : '500'}
                        >
                          {h.slot}
                        </Text>
                        {/* Point value shown only during peek for revealed cards */}
                        {isPeeking &&
                          isPeekedSlot(h.slot) &&
                          peekedCards &&
                          (() => {
                            const pc = peekedCards.find((p: PeekedCard) => p.slot === h.slot);
                            return pc ? (
                              <Text fontSize="9px" color="#666">
                                {pc.card.value} pts
                              </Text>
                            ) : null;
                          })()}
                      </Box>
                    </motion.div>
                  </Tooltip>
                );
              })}
            </HStack>
          </Box>

          {/* Peeking timer bar (Option C) / hint-text */}
          {isPeeking ? (
            <Flex align="center" gap="8px" mt="10px" px="4px">
              <Text fontSize="16px" fontWeight="800" color="#c9a227" minW="24px">
                {Math.ceil((peekProgress / 100) * (PEEK_DURATION_MS / 1000))}s
              </Text>
              <Box flex={1} h="5px" bg="#1a1a24" borderRadius="3px" overflow="hidden">
                <Box
                  h="100%"
                  bg="#c9a227"
                  borderRadius="3px"
                  w={`${peekProgress}%`}
                  transition="width 0.1s linear"
                />
              </Box>
              <Text fontSize="10px" color="#555">
                cards flip when timer ends
              </Text>
            </Flex>
          ) : (
            <Text fontSize="11px" color="#555" textAlign="center" mt="6px">
              {hasDrawnCard && drawnFromDiscard
                ? 'tap a slot to swap · tap discard again to cancel'
                : hasDrawnCard
                  ? 'tap a hand card to swap · tap discard pile to discard'
                  : 'tap draw pile · tap discard then hand · tap hand card to burn'}
            </Text>
          )}
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
            <Box
              flex={1}
              display="flex"
              flexDirection="column"
              overflowX="clip"
              overflowY="visible"
            >
              {/* 3-col grid */}
              <Box
                display="grid"
                gridTemplateColumns="1fr 2fr 1fr"
                gridTemplateRows="auto 1fr auto"
                flex={1}
                overflowX="clip"
                overflowY="visible"
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
                    border={canAct ? '1.5px solid #00e5cc' : '0.5px solid #1e1e2a'}
                    boxShadow={canAct ? '0 0 20px 2px #00e5cc33' : 'none'}
                    px="16px"
                    py="12px"
                    overflow="visible"
                    transition="border-color 0.3s, box-shadow 0.3s"
                  >
                    {/* hand label */}
                    {isPeeking ? (
                      /* Option C memo pill for desktop */
                      <Flex align="center" justify="center" mb="10px">
                        <Flex
                          align="center"
                          gap="6px"
                          bg="#1e1a08"
                          border="1px solid #4a3a00"
                          borderRadius="20px"
                          px="12px"
                          py="4px"
                        >
                          <Text fontSize="11px" color="#c9a227" fontWeight="600">
                            memorize
                          </Text>
                          <Text
                            fontSize="13px"
                            fontWeight="800"
                            color="#c9a227"
                            minW="20px"
                            textAlign="center"
                          >
                            {Math.ceil((peekProgress / 100) * (PEEK_DURATION_MS / 1000))}
                          </Text>
                          <Text fontSize="11px" color="#c9a227" fontWeight="600">
                            sec
                          </Text>
                        </Flex>
                      </Flex>
                    ) : (
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
                    )}
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
                      w="100%"
                      py={isPeeking ? '14px' : '1px'}
                      sx={{
                        clipPath: isPeeking ? 'inset(-30px -9999px -30px -9999px)' : 'none',
                        '&::-webkit-scrollbar': { display: 'none' },
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        WebkitOverflowScrolling: 'touch',
                      }}
                    >
                      <HStack
                        spacing={{ base: '6px', md: '10px' }}
                        justify="center"
                        minW="max-content"
                        w="100%"
                        px={2}
                        pt="0px"
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
                                style={{
                                  display: 'inline-block',
                                  opacity: isPeeking && !showFaceUp ? 0.35 : 1,
                                  transition: 'opacity 0.3s',
                                }}
                              >
                                <Box
                                  display="flex"
                                  flexDirection="column"
                                  alignItems="center"
                                  gap="4px"
                                  position="relative"
                                  flexShrink={0}
                                >
                                  <Box position="relative" overflow="visible" borderRadius="md">
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
                                    {isModified && (
                                      <Box
                                        position="absolute"
                                        inset={0}
                                        borderRadius="md"
                                        pointerEvents="none"
                                        zIndex={10}
                                        sx={{
                                          '@keyframes swapFlash': {
                                            '0%': { opacity: 0, boxShadow: 'none' },
                                            '10%': {
                                              opacity: 0.82,
                                              boxShadow: '0 0 18px 6px #00e5ccbb',
                                            },
                                            '45%': {
                                              opacity: 0.7,
                                              boxShadow: '0 0 14px 4px #00e5cc88',
                                            },
                                            '100%': { opacity: 0, boxShadow: 'none' },
                                          },
                                          animation: 'swapFlash 1.8s ease-out forwards',
                                          background: '#00e5cc',
                                        }}
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
                                    fontWeight={isPeekedSlot(h.slot) ? '700' : '500'}
                                  >
                                    {h.slot}
                                  </Text>
                                  {/* Point value shown only during peek for revealed cards */}
                                  {isPeeking &&
                                    isPeekedSlot(h.slot) &&
                                    peekedCards &&
                                    (() => {
                                      const pc = peekedCards.find(
                                        (p: PeekedCard) => p.slot === h.slot,
                                      );
                                      return pc ? (
                                        <Text fontSize="9px" color="#666">
                                          {pc.card.value} pts
                                        </Text>
                                      ) : null;
                                    })()}
                                </Box>
                              </motion.div>
                            </Tooltip>
                          );
                        })}
                      </HStack>
                    </Box>
                    {/* Peeking timer bar (Option C) / hint-text */}
                    {isPeeking ? (
                      <Flex align="center" gap="8px" mt="10px" px="4px">
                        <Text fontSize="16px" fontWeight="800" color="#c9a227" minW="24px">
                          {Math.ceil((peekProgress / 100) * (PEEK_DURATION_MS / 1000))}s
                        </Text>
                        <Box flex={1} h="5px" bg="#1a1a24" borderRadius="3px" overflow="hidden">
                          <Box
                            h="100%"
                            bg="#c9a227"
                            borderRadius="3px"
                            w={`${peekProgress}%`}
                            transition="width 0.1s linear"
                          />
                        </Box>
                        <Text fontSize="10px" color="#555">
                          cards flip when timer ends
                        </Text>
                      </Flex>
                    ) : (
                      <Text fontSize="11px" color="#555" textAlign="center" mt="6px">
                        {hasDrawnCard && drawnFromDiscard
                          ? 'tap a slot to place the discard card · tap discard again to cancel'
                          : hasDrawnCard
                            ? 'tap hand to swap · tap discard to keep hand'
                            : 'tap draw pile · tap discard then hand · tap hand card to burn'}
                      </Text>
                    )}
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
        closeOnOverlayClick={false}
        closeOnEsc={false}
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="rgba(0,0,0,0.6)" />
        <ModalContent
          bg="#1c1c28"
          borderRadius="16px 16px 0 0"
          borderTop="0.5px solid #2a2a3a"
          p={0}
          mx={0}
          mb={0}
          mt="auto"
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          maxW="unset"
          overflow="hidden"
        >
          {/* Drag handle */}
          <Box w="32px" h="3px" bg="#2a2a3a" borderRadius="2px" mx="auto" mt="10px" />

          {/* Header */}
          <Box px="16px" pt="10px" pb={0}>
            <HStack spacing="8px" mb="3px">
              <Text fontSize="15px">🔥</Text>
              <Text fontSize="15px" fontWeight="600" color="#eee">
                Burn slot {pendingBurnSlot}?
              </Text>
            </HStack>
            <Text fontSize="11px" color="#555" pb="10px" borderBottom="0.5px solid #22222e">
              Rank must match the top discard card. Wrong rank = penalty card added.
            </Text>
          </Box>

          {/* Comparison area */}
          <Box px="16px" pt="10px" display="flex" alignItems="center" gap="10px">
            {/* Your card (unknown) */}
            <Box display="flex" flexDirection="column" alignItems="center" gap="5px">
              <Text fontSize="9px" color="#444" textTransform="uppercase" letterSpacing="0.06em">
                your card ({pendingBurnSlot})
              </Text>
              <Box
                w="46px"
                h="64px"
                borderRadius="7px"
                bg="#1e0f0f"
                border="1.5px solid #cf5e5e"
                boxShadow="0 0 0 1px #cf5e5e30"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#3a3a6a"
                  strokeWidth="1.5"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path
                    d="M12 8v4m0 4h.01"
                    stroke="#3a3a6a"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </Box>
              <Text fontSize="10px" color="#cf5e5e">
                unknown
              </Text>
            </Box>

            {/* VS separator */}
            <Box flex={1} display="flex" flexDirection="column" alignItems="center" gap="4px">
              <Text fontSize="11px" color="#333" fontWeight="600">
                vs
              </Text>
              <Text fontSize="10px" color="#555" textAlign="center" fontWeight="600">
                rank unknown
              </Text>
            </Box>

            {/* Top discard */}
            <Box display="flex" flexDirection="column" alignItems="center" gap="5px">
              <Text fontSize="9px" color="#444" textTransform="uppercase" letterSpacing="0.06em">
                top discard
              </Text>
              {topDiscard ? (
                <Box
                  w="46px"
                  h="64px"
                  borderRadius="7px"
                  bg="white"
                  border="1.5px solid #ddd"
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                  position="relative"
                  fontWeight="700"
                  fontSize="16px"
                  color={topDiscard.isRed ? '#c0392b' : '#222'}
                >
                  <Box
                    position="absolute"
                    top="3px"
                    left="4px"
                    fontSize="9px"
                    fontWeight="700"
                    lineHeight={1.2}
                    color={topDiscard.isRed ? '#c0392b' : '#222'}
                  >
                    {topDiscard.rank}
                    <br />
                    {topDiscard.suit}
                  </Box>
                  <Text>{topDiscard.suit}</Text>
                  <Box
                    position="absolute"
                    bottom="3px"
                    right="4px"
                    fontSize="9px"
                    fontWeight="700"
                    transform="rotate(180deg)"
                    color={topDiscard.isRed ? '#c0392b' : '#222'}
                  >
                    {topDiscard.rank}
                    <br />
                    {topDiscard.suit}
                  </Box>
                </Box>
              ) : (
                <Box
                  w="46px"
                  h="64px"
                  borderRadius="7px"
                  bg="#22223a"
                  border="1.5px solid #3a3a5a"
                />
              )}
            </Box>
          </Box>

          {/* Risk box */}
          <Box
            mx="16px"
            mt="10px"
            px="10px"
            py="8px"
            bg="#1e1616"
            border="0.5px solid #3a2020"
            borderRadius="8px"
          >
            <Text fontSize="11px" color="#7a4a4a" lineHeight={1.5}>
              Card {pendingBurnSlot} is{' '}
              <Text as="strong" color="#cf7070" fontWeight="500">
                face-down
              </Text>{' '}
              — you don&apos;t know its rank. If it doesn&apos;t match {topDiscard?.rank ?? '?'},
              you&apos;ll receive a{' '}
              <Text as="strong" color="#cf7070" fontWeight="500">
                penalty card
              </Text>{' '}
              added face-down as slot E.
            </Text>
          </Box>

          {/* Actions */}
          <Box px="16px" pt="12px" pb="16px" display="flex" gap="8px" mt="10px">
            <Button
              flex={1}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg="#16162a"
              border="0.5px solid #2a2a3a"
              color="#555"
              fontSize="13px"
              fontWeight="600"
              _hover={{ bg: '#1c1c30' }}
              onClick={() => setPendingBurnSlot(null)}
            >
              Cancel
            </Button>
            <Button
              flex={2}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg="#cf5e5e"
              color="#fff"
              border="none"
              fontSize="13px"
              fontWeight="600"
              _hover={{ bg: '#d96e6e' }}
              onClick={() => {
                if (pendingBurnSlot) handleBurnCard(pendingBurnSlot);
                setPendingBurnSlot(null);
              }}
            >
              Burn it
            </Button>
          </Box>
        </ModalContent>
      </Modal>
      {/* ============================================================ */}
      {/* Red Jack Modal (F-049) — Blind swap with opponent             */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingEffect?.effect === 'redJack'}
        onClose={() => {}}
        closeOnOverlayClick={false}
        closeOnEsc={false}
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="rgba(0,0,0,0.6)" />
        <ModalContent
          bg="#1c1c28"
          borderRadius="16px 16px 0 0"
          borderTop="0.5px solid #2a2a3a"
          p={0}
          mx={0}
          mb={0}
          mt="auto"
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          maxW="unset"
          overflow="hidden"
        >
          {/* Drag handle */}
          <Box w="32px" h="3px" bg="#2a2a3a" borderRadius="2px" mx="auto" mt="10px" />

          {/* Header */}
          <Box px="16px" pt="10px" pb={0}>
            <HStack spacing="8px" mb="3px">
              <Text fontSize="15px" color="#c0392b">
                ♥
              </Text>
              <Text fontSize="15px" fontWeight="600" color="#eee">
                Red Jack — Blind Swap
              </Text>
            </HStack>
            <Text fontSize="11px" color="#555" pb="10px" borderBottom="0.5px solid #22222e">
              {jackMySlot && jackTargetPlayer && jackTargetSlot
                ? 'Confirm the blind swap — neither card will be revealed.'
                : jackMySlot && jackTargetPlayer
                  ? 'Step 2 — pick an opponent and one of their slots.'
                  : "Swap one of your cards with any opponent's card. Neither card is revealed."}
            </Text>
          </Box>

          {/* Step 1 / Step 2 / Confirm content */}
          {(() => {
            const targetOpp = opponents.find((o) => o.playerId === jackTargetPlayer);
            const isConfirm = !!(jackMySlot && jackTargetPlayer && jackTargetSlot);

            if (isConfirm) {
              // Confirm state: side-by-side summary
              return (
                <Box px="16px" pt="12px">
                  <Box display="flex" alignItems="center" gap="12px">
                    <Box display="flex" flexDirection="column" alignItems="center" gap="4px">
                      <Text
                        fontSize="9px"
                        color="#444"
                        textTransform="uppercase"
                        letterSpacing="0.06em"
                      >
                        your slot {jackMySlot}
                      </Text>
                      <Box
                        w="46px"
                        h="64px"
                        borderRadius="7px"
                        bg="#0a1a1f"
                        border="1.5px solid #5eb8cf"
                        boxShadow="0 0 0 1px #5eb8cf30"
                      />
                    </Box>
                    <Box
                      flex={1}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="4px"
                    >
                      <Text fontSize="18px" color="#2a3a4a">
                        ⇄
                      </Text>
                      <Text fontSize="10px" color="#333" textAlign="center">
                        blind
                      </Text>
                    </Box>
                    <Box display="flex" flexDirection="column" alignItems="center" gap="4px">
                      <Text
                        fontSize="9px"
                        color="#444"
                        textTransform="uppercase"
                        letterSpacing="0.06em"
                      >
                        {targetOpp?.username}&apos;s slot {jackTargetSlot}
                      </Text>
                      <Box
                        w="46px"
                        h="64px"
                        borderRadius="7px"
                        bg="#22223a"
                        border="1.5px solid #5eb8cf80"
                      />
                    </Box>
                  </Box>
                  <Box
                    mt="8px"
                    px="10px"
                    py="8px"
                    bg="#0a1a1f"
                    border="0.5px solid #1a3a4a"
                    borderRadius="8px"
                  >
                    <Text fontSize="11px" color="#4a7a8a" lineHeight={1.5}>
                      Neither you nor {targetOpp?.username} will see what was swapped. The cards
                      move silently.
                    </Text>
                  </Box>
                </Box>
              );
            }

            return (
              <>
                {/* Step 1: Your slot */}
                <Box px="16px" pt="10px">
                  <Text
                    fontSize="10px"
                    color="#444"
                    textTransform="uppercase"
                    letterSpacing="0.07em"
                    fontWeight="500"
                    mb="8px"
                  >
                    step 1 — choose your slot
                  </Text>
                  <Box display="flex" gap="8px">
                    {myPlayer.hand.map((h) => {
                      const isKnown = knownSlots.has(h.slot);
                      const isSelected = jackMySlot === h.slot;
                      return (
                        <Box
                          key={h.slot}
                          display="flex"
                          flexDirection="column"
                          alignItems="center"
                          gap="4px"
                          onClick={() => setJackMySlot(h.slot)}
                          cursor="pointer"
                        >
                          <Box
                            w="46px"
                            h="64px"
                            borderRadius="7px"
                            bg={isSelected ? '#0a1a1f' : '#22223a'}
                            border={`1.5px solid ${isSelected ? '#5eb8cf' : isKnown ? '#c9a22780' : '#3a3a5a'}`}
                            boxShadow={isSelected ? '0 0 0 1px #5eb8cf30' : 'none'}
                            position="relative"
                            transition="border-color 0.12s, background 0.12s"
                          >
                            {isKnown && !isSelected && (
                              <Box
                                position="absolute"
                                top="3px"
                                right="3px"
                                w="12px"
                                h="12px"
                                bg="#c9a227"
                                borderRadius="50%"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                              >
                                <svg viewBox="0 0 10 7" fill="none" width="7" height="7">
                                  <ellipse
                                    cx="5"
                                    cy="3.5"
                                    rx="4"
                                    ry="2.5"
                                    stroke="white"
                                    strokeWidth="1"
                                  />
                                  <circle cx="5" cy="3.5" r="1.2" fill="white" />
                                </svg>
                              </Box>
                            )}
                          </Box>
                          <Text
                            fontSize="10px"
                            color={isSelected ? '#5eb8cf' : '#555'}
                            fontWeight="500"
                          >
                            {h.slot}
                          </Text>
                        </Box>
                      );
                    })}
                  </Box>
                  {jackMySlot && (
                    <Text fontSize="10px" color="#3a3a4a" mt="6px" lineHeight={1.5}>
                      Tip: swapping a known card you want to shed can be strategic. Swapping an
                      unknown card is a gamble.
                    </Text>
                  )}
                </Box>

                {/* Step 2: Opponent + their slot (shown after my slot selected) */}
                {jackMySlot && (
                  <>
                    <Box px="16px" pt="10px">
                      <Text
                        fontSize="10px"
                        color="#444"
                        textTransform="uppercase"
                        letterSpacing="0.07em"
                        fontWeight="500"
                        mb="6px"
                      >
                        step 2 — pick an opponent
                      </Text>
                      <Box display="flex" gap="6px" flexWrap="wrap" mt="6px">
                        {opponents.map((opp) => {
                          const isSelected = jackTargetPlayer === opp.playerId;
                          return (
                            <Box
                              key={opp.playerId}
                              display="flex"
                              alignItems="center"
                              gap="5px"
                              px="10px"
                              py="5px"
                              borderRadius="20px"
                              border={`1px solid ${isSelected ? '#5eb8cf' : '#2a2a3a'}`}
                              bg={isSelected ? '#0a1a1f' : '#16162a'}
                              color={isSelected ? '#5eb8cf' : '#666'}
                              fontSize="11px"
                              cursor="pointer"
                              onClick={() => {
                                setJackTargetPlayer(opp.playerId);
                                setJackTargetSlot(null);
                              }}
                            >
                              <Box w="7px" h="7px" borderRadius="50%" bg="currentColor" />
                              <Text>{opp.username}</Text>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>

                    {jackTargetPlayer && targetOpp && (
                      <Box px="16px" pt="10px">
                        <Text
                          fontSize="10px"
                          color="#444"
                          textTransform="uppercase"
                          letterSpacing="0.07em"
                          fontWeight="500"
                          mb="8px"
                        >
                          their slot
                        </Text>
                        <Box display="flex" gap="8px">
                          {targetOpp.hand.map((h) => {
                            const isSelected = jackTargetSlot === h.slot;
                            return (
                              <Box
                                key={h.slot}
                                display="flex"
                                flexDirection="column"
                                alignItems="center"
                                gap="4px"
                                onClick={() => setJackTargetSlot(h.slot)}
                                cursor="pointer"
                              >
                                <Box
                                  w="46px"
                                  h="64px"
                                  borderRadius="7px"
                                  bg={isSelected ? '#0a1a1f' : '#22223a'}
                                  border={`1.5px solid ${isSelected ? '#5eb8cf' : '#3a3a5a'}`}
                                  boxShadow={isSelected ? '0 0 0 1px #5eb8cf30' : 'none'}
                                  transition="border-color 0.12s, background 0.12s"
                                />
                                <Text
                                  fontSize="10px"
                                  color={isSelected ? '#5eb8cf' : '#555'}
                                  fontWeight="500"
                                >
                                  {h.slot}
                                </Text>
                              </Box>
                            );
                          })}
                        </Box>
                        <Text fontSize="10px" color="#3a3a4a" mt="8px" lineHeight={1.5}>
                          {targetOpp.username} has {targetOpp.hand.length} card
                          {targetOpp.hand.length !== 1 ? 's' : ''}. You cannot see their values —
                          this is a blind swap.
                        </Text>
                      </Box>
                    )}
                  </>
                )}
              </>
            );
          })()}

          {/* Actions */}
          <Box px="16px" pt="12px" pb="16px" display="flex" gap="8px" mt="10px">
            <Button
              flex={1}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg="transparent"
              border="0.5px solid #2a2a3a"
              color="#555"
              fontSize="13px"
              fontWeight="500"
              _hover={{ bg: '#16162a' }}
              onClick={() => handleJackSubmit(true)}
              isLoading={jackLoading}
            >
              Skip
            </Button>
            <Button
              flex={2}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg={jackMySlot && jackTargetPlayer && jackTargetSlot ? '#c9a227' : '#1e1e2e'}
              color={jackMySlot && jackTargetPlayer && jackTargetSlot ? '#1a1200' : '#333'}
              border={
                jackMySlot && jackTargetPlayer && jackTargetSlot ? 'none' : '0.5px solid #2a2a3a'
              }
              fontSize="13px"
              fontWeight="600"
              _hover={jackMySlot && jackTargetPlayer && jackTargetSlot ? { bg: '#b8911e' } : {}}
              isDisabled={!jackMySlot || !jackTargetPlayer || !jackTargetSlot}
              isLoading={jackLoading}
              onClick={() => handleJackSubmit(false)}
              cursor={jackMySlot && jackTargetPlayer && jackTargetSlot ? 'pointer' : 'not-allowed'}
            >
              {jackMySlot && jackTargetPlayer && jackTargetSlot
                ? 'Swap'
                : jackMySlot && jackTargetPlayer
                  ? 'Choose their slot'
                  : jackMySlot
                    ? 'Choose a slot first'
                    : 'Choose a slot first'}
            </Button>
          </Box>
        </ModalContent>
      </Modal>
      {/* ============================================================ */}
      {/* Red Queen Modal (F-050) — Peek at own card                    */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingEffect?.effect === 'redQueen' || queenPeekTimer}
        onClose={() => {}}
        closeOnOverlayClick={false}
        closeOnEsc={false}
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="rgba(0,0,0,0.6)" />
        <ModalContent
          bg="#1c1c28"
          borderRadius="16px 16px 0 0"
          borderTop="0.5px solid #2a2a3a"
          p={0}
          mx={0}
          mb={0}
          mt="auto"
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          maxW="unset"
          overflow="hidden"
        >
          {/* Drag handle */}
          <Box w="32px" h="3px" bg="#2a2a3a" borderRadius="2px" mx="auto" mt="10px" />

          {/* Header */}
          <Box px="16px" pt="10px" pb={0}>
            <HStack spacing="8px" mb="3px">
              <Text fontSize="15px" color="#c0392b">
                ♦
              </Text>
              <Text fontSize="15px" fontWeight="600" color="#eee">
                Red Queen — Peek
              </Text>
            </HStack>
            <Text fontSize="11px" color="#555" pb="10px" borderBottom="0.5px solid #22222e">
              {queenPeekedCard
                ? 'Slot revealed — only you can see this.'
                : 'Choose one of your face-down cards to peek at privately. Only you will see it.'}
            </Text>
          </Box>

          {queenPeekedCard ? (
            /* Revealed state */
            <Box
              mx="16px"
              mt="10px"
              p="10px 12px"
              bg="#14200f"
              border="0.5px solid #2a4020"
              borderRadius="8px"
              display="flex"
              alignItems="center"
              gap="10px"
            >
              {/* Large face-up card */}
              <Box
                w="52px"
                h="72px"
                borderRadius="8px"
                bg="white"
                border="2px solid #c9a227"
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                position="relative"
                fontWeight="700"
                fontSize="20px"
                flexShrink={0}
                color={queenPeekedCard.isRed ? '#c0392b' : '#222'}
              >
                <Box
                  position="absolute"
                  top="3px"
                  left="4px"
                  fontSize="10px"
                  fontWeight="700"
                  lineHeight={1.2}
                  color={queenPeekedCard.isRed ? '#c0392b' : '#222'}
                >
                  {queenPeekedCard.rank}
                  <br />
                  {queenPeekedCard.suit}
                </Box>
                <Text>{queenPeekedCard.suit}</Text>
                <Box
                  position="absolute"
                  bottom="3px"
                  right="4px"
                  fontSize="10px"
                  fontWeight="700"
                  transform="rotate(180deg)"
                  color={queenPeekedCard.isRed ? '#c0392b' : '#222'}
                >
                  {queenPeekedCard.rank}
                  <br />
                  {queenPeekedCard.suit}
                </Box>
              </Box>
              <Box display="flex" flexDirection="column" gap="4px">
                <Text fontSize="12px" color="#5ecf5e" fontWeight="500">
                  {queenPeekedCard.rank}
                  {queenPeekedCard.suit} revealed
                </Text>
                <Text fontSize="11px" color="#888">
                  Value: {queenPeekedCard.value} point{queenPeekedCard.value !== 1 ? 's' : ''}
                </Text>
                <Text fontSize="10px" color="#3a5a3a" lineHeight={1.4}>
                  Only you can see this. The card stays in its slot. It is now marked as known.
                </Text>
              </Box>
            </Box>
          ) : (
            /* Select state */
            <Box px="16px" pt="10px">
              <Text
                fontSize="10px"
                color="#444"
                textTransform="uppercase"
                letterSpacing="0.07em"
                fontWeight="500"
                mb="8px"
              >
                your hand — tap a slot to peek
              </Text>
              <Box display="flex" gap="8px">
                {myPlayer.hand.map((h) => {
                  const isKnown = knownSlots.has(h.slot);
                  return (
                    <Box
                      key={h.slot}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="4px"
                    >
                      <Box
                        w="46px"
                        h="64px"
                        borderRadius="7px"
                        bg={isKnown ? '#22223a' : '#22223a'}
                        border={`1.5px solid ${isKnown ? '#c9a22780' : '#3a3a5a'}`}
                        position="relative"
                        opacity={isKnown ? 0.5 : 1}
                        cursor={isKnown ? 'not-allowed' : queenLoading ? 'wait' : 'pointer'}
                        onClick={() => {
                          if (!isKnown) handleQueenPeek(h.slot);
                        }}
                        transition="border-color 0.12s, opacity 0.12s"
                        _hover={!isKnown ? { borderColor: '#5a5a8a' } : {}}
                      >
                        {isKnown && (
                          <Box
                            position="absolute"
                            top="3px"
                            right="3px"
                            w="12px"
                            h="12px"
                            bg="#c9a227"
                            borderRadius="50%"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <svg viewBox="0 0 10 7" fill="none" width="7" height="7">
                              <ellipse
                                cx="5"
                                cy="3.5"
                                rx="4"
                                ry="2.5"
                                stroke="white"
                                strokeWidth="1"
                              />
                              <circle cx="5" cy="3.5" r="1.2" fill="white" />
                            </svg>
                          </Box>
                        )}
                      </Box>
                      <Text fontSize="10px" color={isKnown ? '#333' : '#555'} fontWeight="500">
                        {h.slot}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
              <Text fontSize="10px" color="#3a3a4a" mt="6px" lineHeight={1.5}>
                Already-known slots are dimmed and untappable — peek is wasted on them. Only unknown
                slots can be peeked.
              </Text>
            </Box>
          )}

          {/* Actions */}
          <Box px="16px" pt="12px" pb="16px" display="flex" gap="8px" mt="10px">
            {!queenPeekedCard && (
              <Button
                flex={1}
                py="10px"
                h="auto"
                borderRadius="9px"
                bg="transparent"
                border="0.5px solid #2a2a3a"
                color="#555"
                fontSize="13px"
                fontWeight="500"
                _hover={{ bg: '#16162a' }}
                isDisabled={queenLoading}
                onClick={() => {
                  // skip queen by peeking at first available slot... actually skip means close effect
                  // we have no dedicated skip — match existing pattern (no footer button in original)
                  // The queen modal auto-closes only after peek. We add a skip that calls with null.
                  // handleQueenPeek handles skip by the absence of a skip handler.
                  // Use jackSubmit-style: emit skip via redQueenPeek with a special value is not available.
                  // For now, we show the button as disabled placeholder matching the mockup "Skip" behavior.
                }}
              >
                Skip
              </Button>
            )}
            <Button
              flex={queenPeekedCard ? 1 : 2}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg={queenPeekedCard ? '#c9a227' : '#1e1e2e'}
              color={queenPeekedCard ? '#1a1200' : '#333'}
              border={queenPeekedCard ? 'none' : '0.5px solid #2a2a3a'}
              fontSize="13px"
              fontWeight="600"
              isDisabled={!queenPeekedCard && true}
              cursor={queenPeekedCard ? 'pointer' : 'not-allowed'}
              onClick={() => {
                if (queenPeekedCard) {
                  setQueenPeekTimer(false);
                  setQueenPeekedCard(null);
                }
              }}
            >
              {queenPeekedCard ? 'Got it' : 'Select a slot'}
            </Button>
          </Box>
        </ModalContent>
      </Modal>
      {/* ============================================================ */}
      {/* Red King Modal (F-051 to F-053) — Draw 2, choose action       */}
      {/* ============================================================ */}
      <Modal
        isOpen={pendingEffect?.effect === 'redKing'}
        onClose={() => {}}
        closeOnOverlayClick={false}
        closeOnEsc={false}
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="rgba(0,0,0,0.6)" />
        <ModalContent
          bg="#1c1c28"
          borderRadius="16px 16px 0 0"
          borderTop="0.5px solid #2a2a3a"
          p={0}
          mx={0}
          mb={0}
          mt="auto"
          position="fixed"
          bottom={0}
          left={0}
          right={0}
          maxW="unset"
          overflow="hidden"
        >
          {/* Drag handle */}
          <Box w="32px" h="3px" bg="#2a2a3a" borderRadius="2px" mx="auto" mt="10px" />

          {/* Header */}
          <Box px="16px" pt="10px" pb={0}>
            <HStack spacing="8px" mb="3px">
              <Text fontSize="15px" color="#c0392b">
                ♣
              </Text>
              <Text fontSize="15px" fontWeight="600" color="#eee">
                Red King — Draw 2
              </Text>
            </HStack>
            <Text fontSize="11px" color="#555" pb="10px" borderBottom="0.5px solid #22222e">
              {!kingMode
                ? 'You drew 2 cards privately. Choose what to do with them.'
                : kingMode === 'returnBoth'
                  ? 'Both cards will be shuffled back. Your hand stays unchanged.'
                  : kingMode === 'keepOne'
                    ? kingKeepIndex === null
                      ? 'Step 1 — tap the drawn card you want to keep.'
                      : kingReplaceSlot
                        ? 'Ready — confirm to complete the exchange.'
                        : 'Step 2 — tap a hand slot to replace.'
                    : 'Both drawn cards stay. Pick 2 hand slots to replace.'}
            </Text>
          </Box>

          {/* Drawn cards */}
          {pendingEffect?.redKingCards && (
            <Box px="16px" pt="10px">
              <Text
                fontSize="10px"
                color="#444"
                textTransform="uppercase"
                letterSpacing="0.07em"
                fontWeight="500"
                mb="8px"
              >
                {kingMode === 'keepBoth'
                  ? 'both keeping'
                  : kingMode === 'keepOne'
                    ? 'drawn cards — tap to keep'
                    : 'your 2 drawn cards'}
              </Text>
              <Box display="flex" gap="12px" justifyContent="center">
                {pendingEffect.redKingCards.map((c, i) => {
                  const isKeeping =
                    kingMode === 'keepBoth' || (kingMode === 'keepOne' && kingKeepIndex === i);
                  const isReturning =
                    kingMode === 'keepOne' && kingKeepIndex !== null && kingKeepIndex !== i;
                  const isReturnBoth = kingMode === 'returnBoth';
                  const cardValue = c.value;

                  let labelText = '';
                  let labelColor = '#666';
                  if (isReturnBoth) {
                    labelText = 'returning';
                    labelColor = '#333';
                  } else if (isKeeping) {
                    labelText = `keeping · ${cardValue} pts`;
                    labelColor = '#c9a227';
                  } else if (isReturning) {
                    labelText = 'returning';
                    labelColor = '#333';
                  } else {
                    labelText = `${c.rank}${c.suit} · ${cardValue} pts`;
                    labelColor = '#666';
                  }

                  return (
                    <Box
                      key={i}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="5px"
                    >
                      <Box
                        w="56px"
                        h="78px"
                        borderRadius="8px"
                        bg="white"
                        border={`2px solid ${isKeeping ? '#c9a227' : '#ddd'}`}
                        boxShadow={isKeeping ? '0 0 0 1px #c9a22730' : 'none'}
                        opacity={isReturning || isReturnBoth ? 0.45 : 1}
                        transform={isKeeping ? 'translateY(-4px)' : 'none'}
                        cursor={kingMode === 'keepOne' && !isReturning ? 'pointer' : 'default'}
                        onClick={() => {
                          if (kingMode === 'keepOne') setKingKeepIndex(i as 0 | 1);
                        }}
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        justifyContent="center"
                        position="relative"
                        fontWeight="700"
                        fontSize="20px"
                        color={c.isRed ? '#c0392b' : '#222'}
                        transition="border-color 0.12s, box-shadow 0.12s, transform 0.12s, opacity 0.12s"
                      >
                        <Box
                          position="absolute"
                          top="4px"
                          left="5px"
                          fontSize="10px"
                          fontWeight="700"
                          lineHeight={1.2}
                          color={c.isRed ? '#c0392b' : '#222'}
                        >
                          {c.rank}
                          <br />
                          {c.suit}
                        </Box>
                        <Text color={c.isRed ? '#c0392b' : '#222'}>{c.suit}</Text>
                        <Box
                          position="absolute"
                          bottom="4px"
                          right="5px"
                          fontSize="10px"
                          fontWeight="700"
                          transform="rotate(180deg)"
                          color={c.isRed ? '#c0392b' : '#222'}
                        >
                          {c.rank}
                          <br />
                          {c.suit}
                        </Box>
                      </Box>
                      <Text fontSize="10px" textAlign="center" fontWeight="500" color={labelColor}>
                        {labelText}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Option pills */}
          <Box display="flex" gap="6px" px="16px" pt="10px">
            {[
              { mode: 'returnBoth' as const, title: 'Return both', sub: 'hand unchanged' },
              { mode: 'keepOne' as const, title: 'Keep 1', sub: 'replace 1 hand card' },
              { mode: 'keepBoth' as const, title: 'Keep 2', sub: 'replace 2 hand cards' },
            ].map(({ mode, title, sub }) => {
              const isActive = kingMode === mode;
              return (
                <Box
                  key={mode}
                  flex={1}
                  py="8px"
                  px="6px"
                  borderRadius="9px"
                  textAlign="center"
                  cursor="pointer"
                  border={`1px solid ${isActive ? '#c9a227' : '#2a2a3a'}`}
                  bg={isActive ? '#1f1a0a' : '#16162a'}
                  display="flex"
                  flexDirection="column"
                  gap="2px"
                  transition="border-color 0.12s, background 0.12s"
                  onClick={() => {
                    setKingMode(mode);
                    setKingKeepIndex(null);
                    setKingReplaceSlot(null);
                    setKingReplaceSlots([null, null]);
                  }}
                >
                  <Text fontSize="11px" fontWeight="600" color={isActive ? '#c9a227' : '#888'}>
                    {title}
                  </Text>
                  <Text fontSize="9px" color={isActive ? '#7a6020' : '#333'} lineHeight={1.3}>
                    {sub}
                  </Text>
                </Box>
              );
            })}
          </Box>

          {/* Return both: info box */}
          {kingMode === 'returnBoth' && (
            <Box
              mx="16px"
              mt="10px"
              px="11px"
              py="9px"
              bg="#0f141f"
              border="0.5px solid #1a2a3a"
              borderRadius="8px"
            >
              <Text fontSize="11px" color="#3a5a7a" lineHeight={1.5}>
                Both cards will be{' '}
                <Text as="strong" color="#5a7a9a" fontWeight="500">
                  shuffled back
                </Text>{' '}
                into the draw pile at random positions. Your hand stays exactly as it was.
              </Text>
            </Box>
          )}

          {/* Keep 1: hand slot picker */}
          {kingMode === 'keepOne' && kingKeepIndex !== null && (
            <Box px="16px" pt="10px">
              <Text
                fontSize="10px"
                color="#444"
                textTransform="uppercase"
                letterSpacing="0.07em"
                fontWeight="500"
                mb="8px"
              >
                step 2 — pick a hand slot to replace
              </Text>
              <Box display="flex" gap="6px">
                {myPlayer.hand.map((h) => {
                  const isKnown = knownSlots.has(h.slot);
                  const isSelected = kingReplaceSlot === h.slot;
                  return (
                    <Box
                      key={h.slot}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="4px"
                      onClick={() => setKingReplaceSlot(h.slot)}
                      cursor="pointer"
                    >
                      <Box
                        w="44px"
                        h="62px"
                        borderRadius="7px"
                        bg={isSelected ? '#1e0f0f' : '#22223a'}
                        border={`1.5px solid ${isSelected ? '#cf5e5e' : isKnown ? '#c9a22780' : '#3a3a5a'}`}
                        boxShadow={isSelected ? '0 0 0 1px #cf5e5e30' : 'none'}
                        position="relative"
                        transition="border-color 0.12s, background 0.12s"
                      >
                        {isKnown && !isSelected && (
                          <Box
                            position="absolute"
                            top="2px"
                            right="2px"
                            w="12px"
                            h="12px"
                            bg="#c9a227"
                            borderRadius="50%"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <svg viewBox="0 0 10 7" fill="none" width="7" height="7">
                              <ellipse
                                cx="5"
                                cy="3.5"
                                rx="4"
                                ry="2.5"
                                stroke="white"
                                strokeWidth="1"
                              />
                              <circle cx="5" cy="3.5" r="1.2" fill="white" />
                            </svg>
                          </Box>
                        )}
                      </Box>
                      <Text
                        fontSize="10px"
                        color={isSelected ? '#cf5e5e' : '#555'}
                        fontWeight="500"
                      >
                        {isSelected ? `${h.slot} ✕` : h.slot}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
              {!kingReplaceSlot && (
                <Text fontSize="10px" color="#3a3a4a" mt="6px" lineHeight={1.5}>
                  The replaced card goes to the discard pile. The other drawn card returns to the
                  deck.
                </Text>
              )}
            </Box>
          )}

          {/* Keep 2: hand slot picker (pick 2) */}
          {kingMode === 'keepBoth' && (
            <Box px="16px" pt="10px">
              <Box display="flex" alignItems="center" gap="6px" mb="8px">
                <Text
                  fontSize="10px"
                  color="#444"
                  textTransform="uppercase"
                  letterSpacing="0.07em"
                  fontWeight="500"
                >
                  pick 2 slots to discard —
                </Text>
                <Text fontSize="10px" color="#c9a227" fontWeight="600">
                  {(kingReplaceSlots[0] ? 1 : 0) + (kingReplaceSlots[1] ? 1 : 0)} / 2 selected
                </Text>
              </Box>
              <Box display="flex" gap="6px">
                {myPlayer.hand.map((h) => {
                  const isFirst = kingReplaceSlots[0] === h.slot;
                  const isSecond = kingReplaceSlots[1] === h.slot;
                  const isSelected = isFirst || isSecond;
                  const isKnown = knownSlots.has(h.slot);
                  return (
                    <Box
                      key={h.slot}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="4px"
                      cursor="pointer"
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
                      <Box
                        w="44px"
                        h="62px"
                        borderRadius="7px"
                        bg={isSelected ? '#1e0f0f' : '#22223a'}
                        border={`1.5px solid ${isSelected ? '#cf5e5e' : isKnown ? '#c9a22780' : '#3a3a5a'}`}
                        boxShadow={isSelected ? '0 0 0 1px #cf5e5e30' : 'none'}
                        position="relative"
                        transition="border-color 0.12s, background 0.12s"
                      >
                        {isKnown && !isSelected && (
                          <Box
                            position="absolute"
                            top="2px"
                            right="2px"
                            w="12px"
                            h="12px"
                            bg="#c9a227"
                            borderRadius="50%"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <svg viewBox="0 0 10 7" fill="none" width="7" height="7">
                              <ellipse
                                cx="5"
                                cy="3.5"
                                rx="4"
                                ry="2.5"
                                stroke="white"
                                strokeWidth="1"
                              />
                              <circle cx="5" cy="3.5" r="1.2" fill="white" />
                            </svg>
                          </Box>
                        )}
                      </Box>
                      <Text
                        fontSize="10px"
                        color={isSelected ? '#cf5e5e' : '#555'}
                        fontWeight="500"
                      >
                        {isSelected ? `${h.slot} ✕` : h.slot}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Summary box: keep 1 ready */}
          {kingMode === 'keepOne' &&
            kingKeepIndex !== null &&
            kingReplaceSlot &&
            pendingEffect?.redKingCards && (
              <Box
                mx="16px"
                mt="10px"
                px="11px"
                py="9px"
                bg="#141f0f"
                border="0.5px solid #2a3a1a"
                borderRadius="8px"
              >
                <Box display="flex" alignItems="center" gap="8px">
                  <Text fontSize="12px">✓</Text>
                  <Text fontSize="11px" color="#5a8a4a" lineHeight={1.5}>
                    Keep{' '}
                    <Text as="strong" color="#7ab85a" fontWeight="500">
                      {pendingEffect.redKingCards[kingKeepIndex].rank}
                      {pendingEffect.redKingCards[kingKeepIndex].suit}
                    </Text>{' '}
                    in slot {kingReplaceSlot}.{' '}
                    {pendingEffect.redKingCards[kingKeepIndex === 0 ? 1 : 0].rank}
                    {pendingEffect.redKingCards[kingKeepIndex === 0 ? 1 : 0].suit} returns to deck.
                    Old slot {kingReplaceSlot} goes to discard.
                  </Text>
                </Box>
              </Box>
            )}

          {/* Summary box: keep 2 ready */}
          {kingMode === 'keepBoth' &&
            kingReplaceSlots[0] &&
            kingReplaceSlots[1] &&
            pendingEffect?.redKingCards && (
              <Box
                mx="16px"
                mt="10px"
                px="11px"
                py="9px"
                bg="#141f0f"
                border="0.5px solid #2a3a1a"
                borderRadius="8px"
              >
                <Box display="flex" alignItems="center" gap="8px">
                  <Text fontSize="12px">✓</Text>
                  <Text fontSize="11px" color="#5a8a4a" lineHeight={1.5}>
                    Keep{' '}
                    <Text as="strong" color="#7ab85a" fontWeight="500">
                      {pendingEffect.redKingCards[0].rank}
                      {pendingEffect.redKingCards[0].suit}
                    </Text>{' '}
                    in slot {kingReplaceSlots[0]} and{' '}
                    <Text as="strong" color="#7ab85a" fontWeight="500">
                      {pendingEffect.redKingCards[1].rank}
                      {pendingEffect.redKingCards[1].suit}
                    </Text>{' '}
                    in slot {kingReplaceSlots[1]}. Both old cards go to discard pile.
                  </Text>
                </Box>
              </Box>
            )}

          {/* Helper text when selections incomplete */}
          {kingMode &&
            kingMode !== 'returnBoth' &&
            !(kingMode === 'keepOne' && kingKeepIndex !== null && kingReplaceSlot) &&
            !(kingMode === 'keepBoth' && kingReplaceSlots[0] && kingReplaceSlots[1]) && (
              <Text fontSize="11px" color="#555" textAlign="center" mt="10px" px="16px">
                {kingMode === 'keepOne'
                  ? kingKeepIndex === null
                    ? 'Tap a drawn card above to select which one to keep.'
                    : 'Now tap a hand slot to replace.'
                  : `Select ${2 - ((kingReplaceSlots[0] ? 1 : 0) + (kingReplaceSlots[1] ? 1 : 0))} more slot${2 - ((kingReplaceSlots[0] ? 1 : 0) + (kingReplaceSlots[1] ? 1 : 0)) !== 1 ? 's' : ''} to continue.`}
              </Text>
            )}

          {/* Actions — no cancel, must choose */}
          <Box px="16px" pt="12px" pb="16px" display="flex" gap="8px" mt="10px">
            <Box flex={1} /> {/* spacer */}
            <Button
              flex={2}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg={
                !kingMode ||
                (kingMode === 'keepOne' && (kingKeepIndex === null || !kingReplaceSlot)) ||
                (kingMode === 'keepBoth' && (!kingReplaceSlots[0] || !kingReplaceSlots[1]))
                  ? '#1e1e2e'
                  : '#c9a227'
              }
              color={
                !kingMode ||
                (kingMode === 'keepOne' && (kingKeepIndex === null || !kingReplaceSlot)) ||
                (kingMode === 'keepBoth' && (!kingReplaceSlots[0] || !kingReplaceSlots[1]))
                  ? '#333'
                  : '#1a1200'
              }
              border={
                !kingMode ||
                (kingMode === 'keepOne' && (kingKeepIndex === null || !kingReplaceSlot)) ||
                (kingMode === 'keepBoth' && (!kingReplaceSlots[0] || !kingReplaceSlots[1]))
                  ? '0.5px solid #2a2a3a'
                  : 'none'
              }
              fontSize="13px"
              fontWeight="600"
              _hover={
                kingMode === 'returnBoth' ||
                (kingMode === 'keepOne' && kingKeepIndex !== null && kingReplaceSlot) ||
                (kingMode === 'keepBoth' && kingReplaceSlots[0] && kingReplaceSlots[1])
                  ? { bg: '#b8911e' }
                  : {}
              }
              cursor={
                !kingMode ||
                (kingMode === 'keepOne' && (kingKeepIndex === null || !kingReplaceSlot)) ||
                (kingMode === 'keepBoth' && (!kingReplaceSlots[0] || !kingReplaceSlots[1]))
                  ? 'not-allowed'
                  : 'pointer'
              }
              isDisabled={
                !kingMode ||
                (kingMode === 'keepOne' && (kingKeepIndex === null || !kingReplaceSlot)) ||
                (kingMode === 'keepBoth' && (!kingReplaceSlots[0] || !kingReplaceSlots[1]))
              }
              isLoading={kingLoading}
              onClick={handleKingSubmit}
            >
              {kingMode === 'returnBoth'
                ? 'Confirm — return both'
                : kingMode === 'keepOne' && kingKeepIndex !== null && kingReplaceSlot
                  ? 'Confirm'
                  : kingMode === 'keepBoth' && kingReplaceSlots[0] && kingReplaceSlots[1]
                    ? 'Confirm'
                    : 'Select a card first'}
            </Button>
          </Box>
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
        size={{ base: 'full', md: 'lg' }}
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.900" />
        <ModalContent
          bg="#0f0f16"
          color="white"
          maxH={{ base: '100vh', md: '92vh' }}
          overflow="hidden"
          display="flex"
          flexDirection="column"
          borderRadius={{ base: 0, md: '16px' }}
          border="1px solid #1e1e2a"
          m={{ base: 0, md: 4 }}
        >
          {/* top bar */}
          <Box
            px="14px"
            py="9px"
            bg="#13131a"
            borderBottom="0.5px solid #1e1e2a"
            flexShrink={0}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Text fontSize="11px" color="#aaa" fontWeight="500">
              Round {roundEndData?.roundNumber} complete
            </Text>
          </Box>

          {/* scrollable body */}
          <Box flex={1} overflowY="auto" px="12px" pt="14px" pb="20px">
            <VStack spacing="12px" align="stretch">
              {/* ── hero ── */}
              {(() => {
                const iWon = roundEndData?.roundWinners.includes(playerId ?? '');
                const winnerName =
                  roundEndData?.allHands.find((h) => roundEndData.roundWinners.includes(h.playerId))
                    ?.username ?? 'Someone';
                const checkerName = roundEndData?.checkCalledBy
                  ? roundEndData.checkCalledBy === playerId
                    ? 'You'
                    : (gameState?.players.find((p) => p.playerId === roundEndData.checkCalledBy)
                        ?.username ?? 'Someone')
                  : null;
                return (
                  <Box textAlign="center" pt="6px" pb="2px">
                    <Text
                      fontSize="10px"
                      letterSpacing="0.12em"
                      textTransform="uppercase"
                      fontWeight="600"
                      color="#7a7aee"
                      mb="4px"
                    >
                      Round {roundEndData?.roundNumber}
                    </Text>
                    <Text fontSize="24px" fontWeight="800" lineHeight="1.1" color="#eee" mb="4px">
                      {iWon ? 'You won!' : `${winnerName} won!`}
                    </Text>
                    <Text fontSize="12px" color="#555">
                      {checkerName
                        ? `${checkerName} called check${roundEndData?.checkerDoubled ? ' · score doubled!' : ''}`
                        : iWon
                          ? 'You burned all your cards!'
                          : `${winnerName} burned all their cards!`}
                    </Text>
                  </Box>
                );
              })()}

              {/* ── winner banner ── */}
              {(() => {
                const winnerHand = roundEndData?.allHands.find((h) =>
                  roundEndData.roundWinners.includes(h.playerId),
                );
                if (!winnerHand) return null;
                const isMe = winnerHand.playerId === playerId;
                const isChecker = winnerHand.playerId === roundEndData?.checkCalledBy;
                const initials = winnerHand.username.slice(0, 2).toUpperCase();
                return (
                  <Box
                    borderRadius="12px"
                    px="14px"
                    py="12px"
                    bg="#0e2a1a"
                    border="1px solid #1a5a2a"
                    display="flex"
                    alignItems="center"
                    gap="10px"
                  >
                    <Box
                      w="36px"
                      h="36px"
                      borderRadius="full"
                      flexShrink={0}
                      bg="#1a1a3a"
                      color="#7a7aee"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="13px"
                      fontWeight="700"
                    >
                      {initials}
                    </Box>
                    <Box flex={1}>
                      <Text fontSize="14px" fontWeight="700" color="#eee">
                        {winnerHand.username}
                        {isMe ? ' (You)' : ''}
                      </Text>
                      <HStack spacing="5px" mt="4px" flexWrap="wrap">
                        <Box
                          px="7px"
                          py="2px"
                          borderRadius="4px"
                          fontSize="9px"
                          fontWeight="700"
                          letterSpacing="0.04em"
                          textTransform="uppercase"
                          bg="#1a4a2a"
                          color="#5ecf5e"
                          border="0.5px solid #2a6a3a"
                        >
                          winner
                        </Box>
                        {isChecker && (
                          <Box
                            px="7px"
                            py="2px"
                            borderRadius="4px"
                            fontSize="9px"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            textTransform="uppercase"
                            bg="#1a1a4a"
                            color="#7a7aee"
                            border="0.5px solid #2a2a6a"
                          >
                            checker
                          </Box>
                        )}
                      </HStack>
                    </Box>
                    <Text fontSize="22px" fontWeight="800" color="#5ecf5e" flexShrink={0}>
                      {winnerHand.handSum} pts
                    </Text>
                  </Box>
                );
              })()}

              {/* ── score table ── */}
              {(() => {
                const sorted = (gameState?.players ?? [])
                  .slice()
                  .sort(
                    (a, b) =>
                      (roundEndData?.updatedScores[a.playerId] ?? 0) -
                      (roundEndData?.updatedScores[b.playerId] ?? 0),
                  );
                return (
                  <Box>
                    <Flex
                      justify="space-between"
                      px="2px"
                      pb="6px"
                      borderBottom="0.5px solid #1a1a24"
                      fontSize="9px"
                      color="#333"
                      textTransform="uppercase"
                      letterSpacing="0.08em"
                      fontWeight="600"
                    >
                      <Text>player</Text>
                      <HStack spacing="20px">
                        <Text>this round</Text>
                        <Text>total</Text>
                      </HStack>
                    </Flex>
                    {sorted.map((p, idx) => {
                      const total = roundEndData?.updatedScores[p.playerId] ?? 0;
                      const hand = roundEndData?.allHands.find((h) => h.playerId === p.playerId);
                      const handSum = hand?.handSum ?? 0;
                      const isWinner = roundEndData?.roundWinners.includes(p.playerId) ?? false;
                      const isChecker = p.playerId === roundEndData?.checkCalledBy;
                      const isDoubled = isChecker && (roundEndData?.checkerDoubled ?? false);
                      const roundPts = isWinner ? 0 : isDoubled ? handSum * 2 : handSum;
                      const isMe = p.playerId === playerId;
                      const isDanger = total >= (gameState?.targetScore ?? 100);
                      const isBest = idx === 0;
                      const initials = p.username.slice(0, 2).toUpperCase();
                      return (
                        <Flex
                          key={p.playerId}
                          align="center"
                          gap="8px"
                          px="2px"
                          py="8px"
                          borderBottom="0.5px solid #13131e"
                          _last={{ borderBottom: 'none' }}
                        >
                          <Box
                            w="18px"
                            h="18px"
                            borderRadius="full"
                            flexShrink={0}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="9px"
                            fontWeight="700"
                            bg={idx === 0 ? '#3a2a00' : '#1a1a2a'}
                            color={idx === 0 ? '#c9a227' : '#555'}
                          >
                            {idx + 1}
                          </Box>
                          <Box
                            w="22px"
                            h="22px"
                            borderRadius="full"
                            flexShrink={0}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            fontSize="9px"
                            fontWeight="700"
                            bg="#1a1a3a"
                            color="#7a7aee"
                          >
                            {initials}
                          </Box>
                          <Text fontSize="12px" color="#ccc" flex={1} fontWeight="500">
                            {p.username}
                            {isMe && (
                              <Text as="span" fontSize="10px" color="#7a7aee">
                                {' '}
                                (You)
                              </Text>
                            )}
                          </Text>
                          <Text
                            fontSize="10px"
                            fontWeight="600"
                            minW="28px"
                            textAlign="right"
                            color={roundPts === 0 ? '#5ecf5e' : '#cf7070'}
                          >
                            +{roundPts}
                          </Text>
                          <Text
                            fontSize="13px"
                            fontWeight="700"
                            minW="36px"
                            textAlign="right"
                            color={isDanger ? '#cf5e5e' : isBest ? '#5ecf5e' : '#aaa'}
                          >
                            {total}
                          </Text>
                        </Flex>
                      );
                    })}
                  </Box>
                );
              })()}

              {/* ── hand reveals ── */}
              <Box>
                <Text
                  fontSize="10px"
                  color="#333"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  fontWeight="600"
                  mb="8px"
                >
                  hands revealed
                </Text>
                <VStack spacing="8px" align="stretch">
                  {roundEndData?.allHands.map((hand: PlayerRoundResult) => {
                    const isWinner = roundEndData.roundWinners.includes(hand.playerId);
                    const isMe = hand.playerId === playerId;
                    const isChecker = hand.playerId === roundEndData.checkCalledBy;
                    const isDoubled = isChecker && roundEndData.checkerDoubled;
                    const initials = hand.username.slice(0, 2).toUpperCase();
                    const displaySum = isDoubled ? hand.handSum * 2 : hand.handSum;
                    return (
                      <Box
                        key={hand.playerId}
                        bg={isWinner ? '#0e1e16' : '#1a1a26'}
                        borderRadius="10px"
                        border="0.5px solid"
                        borderColor={isWinner ? '#2a5a3a' : isMe ? '#3a3a6a' : '#2a2a3a'}
                        px="10px"
                        pt="10px"
                        pb="8px"
                      >
                        <Flex justify="space-between" align="center" mb="8px">
                          <HStack spacing="6px">
                            <Box
                              w="20px"
                              h="20px"
                              borderRadius="full"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              fontSize="8px"
                              fontWeight="700"
                              bg="#1a1a3a"
                              color="#7a7aee"
                            >
                              {initials}
                            </Box>
                            <Text fontSize="12px" fontWeight="600" color="#ccc">
                              {hand.username}
                              {isMe ? ' (You)' : ''}
                            </Text>
                            {isWinner && (
                              <Box
                                px="7px"
                                py="2px"
                                borderRadius="4px"
                                fontSize="9px"
                                fontWeight="700"
                                textTransform="uppercase"
                                letterSpacing="0.04em"
                                bg="#1a4a2a"
                                color="#5ecf5e"
                                border="0.5px solid #2a6a3a"
                              >
                                winner
                              </Box>
                            )}
                            {isChecker && !isWinner && (
                              <Box
                                px="7px"
                                py="2px"
                                borderRadius="4px"
                                fontSize="9px"
                                fontWeight="700"
                                textTransform="uppercase"
                                letterSpacing="0.04em"
                                bg={isDoubled ? '#3a1010' : '#1a1a4a'}
                                color={isDoubled ? '#cf5e5e' : '#7a7aee'}
                                border={`0.5px solid ${isDoubled ? '#5a2020' : '#2a2a6a'}`}
                              >
                                {isDoubled ? 'doubled' : 'checker'}
                              </Box>
                            )}
                          </HStack>
                          <Text
                            fontSize="14px"
                            fontWeight="800"
                            color={isWinner ? '#5ecf5e' : displaySum > 15 ? '#cf5e5e' : '#aaa'}
                          >
                            {isDoubled ? `${hand.handSum}×2 = ${displaySum}` : `${displaySum}`} pts
                          </Text>
                        </Flex>
                        <Flex gap="5px" flexWrap="wrap">
                          {hand.cards.map((c, i) => (
                            <Box
                              key={i}
                              display="flex"
                              flexDirection="column"
                              alignItems="center"
                              gap="3px"
                            >
                              <Box
                                w="38px"
                                h="52px"
                                borderRadius="5px"
                                bg="white"
                                border="1px solid"
                                borderColor={
                                  c.value === 0 ? '#5ecf5e' : c.value >= 10 ? '#cf5e5e40' : '#ddd'
                                }
                                boxShadow={c.value === 0 ? '0 0 0 1px #5ecf5e30' : 'none'}
                                position="relative"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                color={c.isRed ? '#c0392b' : '#222'}
                                fontSize="13px"
                                fontWeight="700"
                              >
                                <Text
                                  position="absolute"
                                  top="2px"
                                  left="3px"
                                  fontSize="7px"
                                  fontWeight="700"
                                  lineHeight="1.1"
                                  color={c.isRed ? '#c0392b' : '#222'}
                                >
                                  {c.rank}
                                  <br />
                                  {c.suit}
                                </Text>
                                <Text fontSize="9px">{c.suit}</Text>
                                <Text
                                  position="absolute"
                                  bottom="2px"
                                  right="3px"
                                  fontSize="7px"
                                  fontWeight="700"
                                  lineHeight="1.1"
                                  color={c.isRed ? '#c0392b' : '#222'}
                                  transform="rotate(180deg)"
                                >
                                  {c.rank}
                                  <br />
                                  {c.suit}
                                </Text>
                              </Box>
                              <Text fontSize="8px" color="#444">
                                {hand.slots[i]}
                              </Text>
                              <Text
                                fontSize="8px"
                                color={
                                  c.value === 0 ? '#5ecf5e' : c.value >= 10 ? '#cf5e5e' : '#555'
                                }
                              >
                                {c.value} pts
                              </Text>
                            </Box>
                          ))}
                        </Flex>
                      </Box>
                    );
                  })}
                </VStack>
              </Box>

              {/* ── score progress bars ── */}
              {(() => {
                const target = gameState?.targetScore ?? 100;
                const sorted = (gameState?.players ?? [])
                  .slice()
                  .sort(
                    (a, b) =>
                      (roundEndData?.updatedScores[a.playerId] ?? 0) -
                      (roundEndData?.updatedScores[b.playerId] ?? 0),
                  );
                return (
                  <Box>
                    <Text
                      fontSize="10px"
                      color="#333"
                      textTransform="uppercase"
                      letterSpacing="0.08em"
                      fontWeight="600"
                      mb="8px"
                    >
                      score progress · game ends at {target}
                    </Text>
                    <VStack spacing="6px" align="stretch">
                      {sorted.map((p) => {
                        const total = roundEndData?.updatedScores[p.playerId] ?? 0;
                        const pct = Math.min(100, Math.round((total / target) * 100));
                        const isMe = p.playerId === playerId;
                        const isDanger = total >= target * 0.75;
                        const barColor =
                          total >= target ? '#cf5e5e' : isDanger ? '#cf7070' : '#5ecf5e';
                        return (
                          <Box key={p.playerId}>
                            <Flex justify="space-between" fontSize="10px" mb="3px">
                              <Text color={isMe ? '#7a7aee' : '#888'}>
                                {p.username}
                                {isMe ? ' (You)' : ''}
                              </Text>
                              <Text color={isDanger ? '#cf5e5e' : '#5ecf5e'}>
                                {total} / {target}
                              </Text>
                            </Flex>
                            <Box h="3px" bg="#1a1a24" borderRadius="2px" overflow="hidden">
                              <Box h="100%" borderRadius="2px" bg={barColor} w={`${pct}%`} />
                            </Box>
                          </Box>
                        );
                      })}
                    </VStack>
                  </Box>
                );
              })()}

              {/* ── action buttons ── */}
              {roundEndData?.nextRoundStarting ? (
                <Box>
                  {roundCountdown != null && roundCountdown > 0 ? (
                    <VStack spacing="8px">
                      <Text fontSize="13px" fontWeight="700" color="#7a7aee" textAlign="center">
                        Next round in {roundCountdown}s…
                      </Text>
                      {roomData?.host === playerId && (
                        <Box
                          as="button"
                          w="100%"
                          py="11px"
                          borderRadius="10px"
                          fontSize="13px"
                          fontWeight="700"
                          cursor="pointer"
                          textAlign="center"
                          bg="transparent"
                          border="1px solid #5a2a2a"
                          color="#cf7070"
                          onClick={() => endGame()}
                          _hover={{ bg: '#1a0808' }}
                        >
                          End Game
                        </Box>
                      )}
                    </VStack>
                  ) : roundCountdown === 0 ? (
                    <Text fontSize="13px" fontWeight="700" color="#5ecf5e" textAlign="center">
                      Starting…
                    </Text>
                  ) : roomData?.host === playerId ? (
                    <Flex gap="8px">
                      <Box
                        as="button"
                        flex={1}
                        py="11px"
                        borderRadius="10px"
                        fontSize="13px"
                        fontWeight="700"
                        cursor="pointer"
                        textAlign="center"
                        bg="transparent"
                        border="1px solid #5a2a2a"
                        color="#cf7070"
                        onClick={() => endGame()}
                        _hover={{ bg: '#1a0808' }}
                      >
                        End Game
                      </Box>
                      <Box
                        as="button"
                        flex={1}
                        py="11px"
                        borderRadius="10px"
                        fontSize="13px"
                        fontWeight="700"
                        cursor="pointer"
                        textAlign="center"
                        bg="#4a8a5a"
                        color="#e8f5ec"
                        onClick={() => startNextRound()}
                        _hover={{ bg: '#3a7a4a' }}
                      >
                        Start Round {(roundEndData?.roundNumber ?? 0) + 1} →
                      </Box>
                    </Flex>
                  ) : (
                    <Text fontSize="12px" color="#555" textAlign="center">
                      Waiting for host to start next round…
                    </Text>
                  )}
                </Box>
              ) : (
                <Text fontSize="12px" color="#555" textAlign="center">
                  Game over!
                </Text>
              )}
            </VStack>
          </Box>
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
        size={{ base: 'full', md: 'lg' }}
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg="blackAlpha.900" />
        <ModalContent
          bg="#0f0f16"
          color="white"
          maxH={{ base: '100vh', md: '92vh' }}
          overflow="hidden"
          display="flex"
          flexDirection="column"
          borderRadius={{ base: 0, md: '16px' }}
          border="1px solid #1e1e2a"
          m={{ base: 0, md: 4 }}
        >
          {/* top bar */}
          <Box
            px="14px"
            py="9px"
            bg="#13131a"
            borderBottom="0.5px solid #1e1e2a"
            flexShrink={0}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Text fontSize="11px" color="#aaa" fontWeight="500">
              Game over · Round {gameState?.roundNumber}
            </Text>
          </Box>

          {/* scrollable body */}
          <Box flex={1} overflowY="auto" px="12px" pt="14px" pb="20px">
            <VStack spacing="12px" align="stretch">
              {/* ── hero ── */}
              {(() => {
                const iWon = gameEndData?.winner.playerId === playerId;
                const winnerName = gameEndData?.winner.username ?? 'Someone';
                const loserName = gameEndData?.loser.username ?? 'Someone';
                const loserIsMe = gameEndData?.loser.playerId === playerId;
                return (
                  <Box textAlign="center" pt="6px" pb="2px">
                    <Text
                      fontSize="10px"
                      letterSpacing="0.12em"
                      textTransform="uppercase"
                      fontWeight="600"
                      color="#c9a227"
                      mb="4px"
                    >
                      Game over
                    </Text>
                    {iWon ? (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: [0.5, 1.15, 1], opacity: 1 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      >
                        <Text
                          fontSize="24px"
                          fontWeight="800"
                          lineHeight="1.1"
                          color="#c9a227"
                          mb="4px"
                        >
                          You win!
                        </Text>
                      </motion.div>
                    ) : (
                      <Text
                        fontSize="24px"
                        fontWeight="800"
                        lineHeight="1.1"
                        color="#c9a227"
                        mb="4px"
                      >
                        {winnerName} wins!
                      </Text>
                    )}
                    <Text fontSize="12px" color="#555">
                      {loserIsMe ? 'You' : loserName} reached {gameEndData?.loser.score} points —
                      game ends
                    </Text>
                  </Box>
                );
              })()}

              {/* ── winner banner ── */}
              {gameEndData &&
                (() => {
                  const w = gameEndData.winner;
                  const isMe = w.playerId === playerId;
                  const initials = w.username.slice(0, 2).toUpperCase();
                  return (
                    <Box
                      borderRadius="12px"
                      px="14px"
                      py="12px"
                      bg="#1a1500"
                      border="1px solid #4a3a00"
                      display="flex"
                      alignItems="center"
                      gap="10px"
                    >
                      <Box
                        w="36px"
                        h="36px"
                        borderRadius="full"
                        flexShrink={0}
                        bg="#1a3a2a"
                        color="#5ecf5e"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        fontSize="13px"
                        fontWeight="700"
                      >
                        {initials}
                      </Box>
                      <Box flex={1}>
                        <Text fontSize="14px" fontWeight="700" color="#eee">
                          {w.username}
                          {isMe ? ' (You)' : ''}
                        </Text>
                        <HStack spacing="5px" mt="4px">
                          <Box
                            px="7px"
                            py="2px"
                            borderRadius="4px"
                            fontSize="9px"
                            fontWeight="700"
                            letterSpacing="0.04em"
                            textTransform="uppercase"
                            bg="#3a2a00"
                            color="#c9a227"
                            border="0.5px solid #6a4a00"
                          >
                            champion
                          </Box>
                        </HStack>
                      </Box>
                      <Text fontSize="22px" fontWeight="800" color="#c9a227" flexShrink={0}>
                        {w.score} pts
                      </Text>
                    </Box>
                  );
                })()}

              {/* ── full leaderboard ── */}
              {gameEndData &&
                (() => {
                  const sorted = Object.entries(gameEndData.finalScores).sort(
                    ([, a], [, b]) => a - b,
                  );
                  return (
                    <Box>
                      <Flex
                        justify="space-between"
                        px="2px"
                        pb="6px"
                        borderBottom="0.5px solid #1a1a24"
                        fontSize="9px"
                        color="#333"
                        textTransform="uppercase"
                        letterSpacing="0.08em"
                        fontWeight="600"
                      >
                        <Text>player</Text>
                        <HStack spacing="20px">
                          <Text>last round</Text>
                          <Text>final</Text>
                        </HStack>
                      </Flex>
                      {sorted.map(([pid, score], idx) => {
                        const playerName =
                          gameState?.players.find((p) => p.playerId === pid)?.username ?? pid;
                        const isMe = pid === playerId;
                        const isWinner = pid === gameEndData.winner.playerId;
                        const isLoser = pid === gameEndData.loser.playerId;
                        const handSum =
                          gameEndData.allHands.find((h) => h.playerId === pid)?.handSum ?? 0;
                        const isChecker = pid === roundEndData?.checkCalledBy;
                        const isDoubled = isChecker && (roundEndData?.checkerDoubled ?? false);
                        const lastRoundPts = isWinner ? 0 : isDoubled ? handSum * 2 : handSum;
                        const initials = playerName.slice(0, 2).toUpperCase();
                        return (
                          <Flex
                            key={pid}
                            align="center"
                            gap="8px"
                            px="2px"
                            py="8px"
                            borderBottom="0.5px solid #13131e"
                            _last={{ borderBottom: 'none' }}
                          >
                            <Box
                              w="18px"
                              h="18px"
                              borderRadius="full"
                              flexShrink={0}
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              fontSize="9px"
                              fontWeight="700"
                              bg={idx === 0 ? '#3a2a00' : '#1a1a2a'}
                              color={idx === 0 ? '#c9a227' : '#555'}
                            >
                              {idx + 1}
                            </Box>
                            <Box
                              w="22px"
                              h="22px"
                              borderRadius="full"
                              flexShrink={0}
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              fontSize="9px"
                              fontWeight="700"
                              bg={isWinner ? '#1a3a2a' : '#1a1a3a'}
                              color={isWinner ? '#5ecf5e' : '#7a7aee'}
                            >
                              {initials}
                            </Box>
                            <Text fontSize="12px" color="#ccc" flex={1} fontWeight="500">
                              {playerName}
                              {isMe && (
                                <Text as="span" fontSize="10px" color="#7a7aee">
                                  {' '}
                                  (You)
                                </Text>
                              )}
                            </Text>
                            <Text
                              fontSize="10px"
                              fontWeight="600"
                              minW="28px"
                              textAlign="right"
                              color={lastRoundPts === 0 ? '#5ecf5e' : '#cf7070'}
                            >
                              +{lastRoundPts}
                            </Text>
                            <Text
                              fontSize="13px"
                              fontWeight="700"
                              minW="36px"
                              textAlign="right"
                              color={isWinner ? '#5ecf5e' : isLoser ? '#cf5e5e' : '#aaa'}
                              position="relative"
                            >
                              {score}
                              {isLoser && (
                                <Text as="span" fontSize="8px" ml="3px">
                                  💀
                                </Text>
                              )}
                            </Text>
                          </Flex>
                        );
                      })}
                    </Box>
                  );
                })()}

              {/* ── final hands ── */}
              {gameEndData?.allHands && gameEndData.allHands.length > 0 && (
                <Box>
                  <Text
                    fontSize="10px"
                    color="#333"
                    textTransform="uppercase"
                    letterSpacing="0.08em"
                    fontWeight="600"
                    mb="8px"
                  >
                    final hands
                  </Text>
                  <VStack spacing="8px" align="stretch">
                    {gameEndData.allHands.map((hand: PlayerRoundResult) => {
                      const isWinner = hand.playerId === gameEndData.winner.playerId;
                      const isLoser = hand.playerId === gameEndData.loser.playerId;
                      const isMe = hand.playerId === playerId;
                      const initials = hand.username.slice(0, 2).toUpperCase();
                      return (
                        <Box
                          key={hand.playerId}
                          bg={isWinner ? '#0e1e16' : '#1a1a26'}
                          borderRadius="10px"
                          border="0.5px solid"
                          borderColor={
                            isWinner
                              ? '#2a5a3a'
                              : isLoser
                                ? '#5a2a2a20'
                                : isMe
                                  ? '#3a3a6a'
                                  : '#2a2a3a'
                          }
                          px="10px"
                          pt="10px"
                          pb="8px"
                        >
                          <Flex justify="space-between" align="center" mb="8px">
                            <HStack spacing="6px">
                              <Box
                                w="20px"
                                h="20px"
                                borderRadius="full"
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                                fontSize="8px"
                                fontWeight="700"
                                bg={isWinner ? '#1a3a2a' : '#1a1a3a'}
                                color={isWinner ? '#5ecf5e' : '#7a7aee'}
                              >
                                {initials}
                              </Box>
                              <Text fontSize="12px" fontWeight="600" color="#ccc">
                                {hand.username}
                                {isMe ? ' (You)' : ''}
                              </Text>
                              {isWinner && (
                                <Box
                                  px="7px"
                                  py="2px"
                                  borderRadius="4px"
                                  fontSize="9px"
                                  fontWeight="700"
                                  textTransform="uppercase"
                                  letterSpacing="0.04em"
                                  bg="#3a2a00"
                                  color="#c9a227"
                                  border="0.5px solid #6a4a00"
                                >
                                  winner
                                </Box>
                              )}
                              {isLoser && (
                                <Box
                                  px="7px"
                                  py="2px"
                                  borderRadius="4px"
                                  fontSize="9px"
                                  fontWeight="700"
                                  textTransform="uppercase"
                                  letterSpacing="0.04em"
                                  bg="#3a1010"
                                  color="#cf5e5e"
                                  border="0.5px solid #5a2020"
                                >
                                  loser
                                </Box>
                              )}
                            </HStack>
                            <Text
                              fontSize="14px"
                              fontWeight="800"
                              color={isWinner ? '#5ecf5e' : hand.handSum > 15 ? '#cf5e5e' : '#aaa'}
                            >
                              {hand.handSum} pts
                            </Text>
                          </Flex>
                          <Flex gap="5px" flexWrap="wrap">
                            {hand.cards.map((c, i) => (
                              <Box
                                key={i}
                                display="flex"
                                flexDirection="column"
                                alignItems="center"
                                gap="3px"
                              >
                                <Box
                                  w="38px"
                                  h="52px"
                                  borderRadius="5px"
                                  bg="white"
                                  border="1px solid"
                                  borderColor={
                                    c.value === 0 ? '#5ecf5e' : c.value >= 10 ? '#cf5e5e40' : '#ddd'
                                  }
                                  boxShadow={c.value === 0 ? '0 0 0 1px #5ecf5e30' : 'none'}
                                  position="relative"
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="center"
                                  color={c.isRed ? '#c0392b' : '#222'}
                                  fontSize="13px"
                                  fontWeight="700"
                                >
                                  <Text
                                    position="absolute"
                                    top="2px"
                                    left="3px"
                                    fontSize="7px"
                                    fontWeight="700"
                                    lineHeight="1.1"
                                    color={c.isRed ? '#c0392b' : '#222'}
                                  >
                                    {c.rank}
                                    <br />
                                    {c.suit}
                                  </Text>
                                  <Text fontSize="9px">{c.suit}</Text>
                                  <Text
                                    position="absolute"
                                    bottom="2px"
                                    right="3px"
                                    fontSize="7px"
                                    fontWeight="700"
                                    lineHeight="1.1"
                                    color={c.isRed ? '#c0392b' : '#222'}
                                    transform="rotate(180deg)"
                                  >
                                    {c.rank}
                                    <br />
                                    {c.suit}
                                  </Text>
                                </Box>
                                <Text fontSize="8px" color="#444">
                                  {hand.slots[i]}
                                </Text>
                                <Text
                                  fontSize="8px"
                                  color={
                                    c.value === 0 ? '#5ecf5e' : c.value >= 10 ? '#cf5e5e' : '#555'
                                  }
                                >
                                  {c.value} pts
                                </Text>
                              </Box>
                            ))}
                          </Flex>
                        </Box>
                      );
                    })}
                  </VStack>
                </Box>
              )}

              {/* ── game summary strip ── */}
              {gameEndData && (
                <Box
                  bg="#1a1a26"
                  borderRadius="10px"
                  border="0.5px solid #2a2a3a"
                  px="12px"
                  py="10px"
                >
                  <Text
                    fontSize="10px"
                    color="#333"
                    textTransform="uppercase"
                    letterSpacing="0.08em"
                    fontWeight="600"
                    mb="8px"
                  >
                    game summary
                  </Text>
                  <Flex>
                    <Box flex={1} textAlign="center" borderRight="0.5px solid #2a2a3a" pr="8px">
                      <Text fontSize="18px" fontWeight="800" color="#eee">
                        {gameState?.roundNumber}
                      </Text>
                      <Text fontSize="9px" color="#555">
                        rounds played
                      </Text>
                    </Box>
                    <Box flex={1} textAlign="center" px="8px" borderRight="0.5px solid #2a2a3a">
                      <Text fontSize="14px" fontWeight="800" color="#5ecf5e" lineHeight="1.4">
                        {gameEndData.winner.username}
                      </Text>
                      <Text fontSize="9px" color="#555">
                        champion
                      </Text>
                    </Box>
                    <Box flex={1} textAlign="center" pl="8px">
                      <Text fontSize="18px" fontWeight="800" color="#c9a227">
                        {gameEndData.winner.score}
                      </Text>
                      <Text fontSize="9px" color="#555">
                        winning score
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              )}

              {/* ── action buttons ── */}
              <Flex gap="8px">
                <Box
                  as="button"
                  flex={1}
                  py="11px"
                  borderRadius="10px"
                  fontSize="13px"
                  fontWeight="700"
                  cursor="pointer"
                  textAlign="center"
                  bg="transparent"
                  border="1px solid #2a2a4a"
                  color="#7a7aee"
                  onClick={handleReturnToLobby}
                  _hover={{ bg: '#0a0a1a' }}
                >
                  Play again
                </Box>
                <Box
                  as="button"
                  flex={1}
                  py="11px"
                  borderRadius="10px"
                  fontSize="13px"
                  fontWeight="700"
                  cursor="pointer"
                  textAlign="center"
                  bg="#c9a227"
                  color="#1a1200"
                  onClick={handleReturnToLobby}
                  _hover={{ bg: '#b89020' }}
                >
                  Return home
                </Box>
              </Flex>
            </VStack>
          </Box>
        </ModalContent>
      </Modal>
    </Box>
  );
};

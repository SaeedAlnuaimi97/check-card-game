import { useEffect, useState, useCallback, useRef, useMemo, memo, FC } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  HStack,
  Tooltip,
  useBreakpointValue,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { EyeOutlined, FireOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { DEBUG_MODE } from '../context/SocketContext';
import socket from '../services/socket';
import { Card } from '../components/cards/Card';
import { CardBack } from '../components/cards/CardBack';
import { FlippableCard } from '../components/cards/FlippableCard';
import { ChatDrawer } from '../components/ChatDrawer';
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
const PEEK_TICK_MS = 250; // 250ms is smooth enough; CSS transition handles visual interpolation

/** Create a display-only Card object for the bounty rank badge */
function makeBountyDisplayCard(rank: string): CardType {
  return {
    id: `bounty-${rank}`,
    suit: '♠',
    rank: rank as CardType['rank'],
    value: 0,
    isRed: false,
  };
}

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
// Reusable CSS keyframe objects — defined once at module level so Chakra
// doesn't re-process them on every render cycle
// ============================================================

const SX_KEYFRAMES_PIP_SWAP_FLASH = {
  '@keyframes pipSwapFlash': {
    '0%': { opacity: 0, boxShadow: 'none' },
    '10%': { opacity: 1, boxShadow: '0 0 6px 3px #e24b4bcc' },
    '45%': { opacity: 0.85, boxShadow: '0 0 5px 2px #e24b4b88' },
    '100%': { opacity: 0, boxShadow: 'none' },
  },
  animation: 'pipSwapFlash 1.8s ease-out forwards',
  background: '#e24b4b',
};

const SX_KEYFRAMES_BG_FLASH = {
  '@keyframes bgFlash': {
    '0%': { background: '#2a2a4a', boxShadow: 'none' },
    '10%': { background: '#00e5cc', boxShadow: '0 0 8px 3px #00e5cc99' },
    '40%': { background: '#00b8a0', boxShadow: '0 0 6px 2px #00e5cc66' },
    '100%': { background: '#2a2a4a', boxShadow: 'none' },
  },
  animation: 'bgFlash 1.8s ease-out forwards',
};

const SX_KEYFRAMES_TIMER_PULSE = {
  '@keyframes timerPulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.55 },
  },
  animation: 'timerPulse 1s ease-in-out infinite',
};

const SX_KEYFRAMES_SWAP_FLASH = {
  '@keyframes swapFlash': {
    '0%': { opacity: 0, boxShadow: 'none' },
    '10%': { opacity: 0.82, boxShadow: '0 0 18px 6px #e24b4bbb' },
    '45%': { opacity: 0.7, boxShadow: '0 0 14px 4px #e24b4b88' },
    '100%': { opacity: 0, boxShadow: 'none' },
  },
  animation: 'swapFlash 1.8s ease-out forwards',
  background: '#e24b4b',
};

const SX_KEYFRAMES_SWAP_PULSE = {
  '@keyframes swapPulse': {
    '0%': { transform: 'scale(1)' },
    '30%': { transform: 'scale(1.08)' },
    '100%': { transform: 'scale(1)' },
  },
  animation: 'swapPulse 0.5s ease-out',
};

const SX_KEYFRAMES_SWAP_BADGE_POP = {
  '@keyframes swapBadgePop': {
    '0%': { opacity: 0, transform: 'scale(0)' },
    '60%': { opacity: 1, transform: 'scale(1.2)' },
    '100%': { opacity: 1, transform: 'scale(1)' },
  },
  animation: 'swapBadgePop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards',
};

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

const ConfettiOverlay: FC = memo(() => {
  // Pre-compute all random values once on mount — never recalculate on re-renders
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2 + Math.random() * 2,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
        xDrift: (Math.random() - 0.5) * 120,
        spinDir: Math.random() > 0.5 ? 1 : -1,
        repeatDelay: Math.random() * 2,
      })),
    [],
  );

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
      {pieces.map(
        ({ i, left, delay, duration, color, size, rotate, xDrift, spinDir, repeatDelay }) => (
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
              x: [0, xDrift],
              rotate: [rotate, rotate + 360 * spinDir],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration,
              delay,
              ease: 'easeIn',
              repeat: Infinity,
              repeatDelay,
            }}
          />
        ),
      )}
    </Box>
  );
});

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
const MobileOpponentRow: FC<OpponentProps> = memo(
  ({ player, playerIndex, isCurrentTurn, targetScore, modifiedSlots }) => {
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
                <Box
                  w="9px"
                  h="13px"
                  borderRadius="2px"
                  bg="#2a2a4a"
                  border="0.5px solid #3a3a5a"
                />
                {isModified && (
                  <Box
                    position="absolute"
                    inset={0}
                    borderRadius="2px"
                    pointerEvents="none"
                    zIndex={10}
                    sx={SX_KEYFRAMES_PIP_SWAP_FLASH}
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
  },
);

/** Desktop side opponent card (left/right columns) */
const DesktopSideOpponent: FC<OpponentProps> = memo(
  ({ player, playerIndex, isCurrentTurn, targetScore, debugRevealed, modifiedSlots }) => {
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
                  sx={isModified && !revealedCard ? SX_KEYFRAMES_BG_FLASH : {}}
                >
                  {revealedCard ? `${revealedCard.rank}${revealedCard.suit}` : null}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    );
  },
);

/** Desktop top opponent card (top row, column layout) */
const DesktopTopOpponent: FC<OpponentProps> = memo(
  ({ player, playerIndex, isCurrentTurn, targetScore, debugRevealed, modifiedSlots }) => {
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
                sx={isModified && !revealedCard ? SX_KEYFRAMES_BG_FLASH : {}}
              >
                {revealedCard ? `${revealedCard.rank}${revealedCard.suit}` : null}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  },
);

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
    debugStackDeck,
    endGame,
    startNextRound,
    pauseGame,
    resumeGame,
    clearRoundEndData,
    clearGameEndData,
    undoTakeDiscard,
    sendReaction,
    lastReaction,
    playAgain,
  } = useSocket();
  const toast = useToast();

  // Chat drawer state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { lastChatMessage, clearLastChatMessage } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastPreviewMsg, setToastPreviewMsg] = useState<{ text: string; username: string } | null>(
    null,
  );
  const toastPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Peek animation state
  const [isPeeking, setIsPeeking] = useState(false);
  const [peekProgress, setPeekProgress] = useState(100);

  // Blind round countdown state
  const [isBlindCountdown, setIsBlindCountdown] = useState(false);
  const [blindCountdownSec, setBlindCountdownSec] = useState(0);
  const BLIND_COUNTDOWN_SEC = 5;
  const blindCountdownShownForRound = useRef<number | null>(null);

  // Reset peeking state when a new round starts
  useEffect(() => {
    if (peekedCards && peekedCards.length > 0 && gameState?.phase === 'peeking') {
      setIsPeeking(true);
      setPeekProgress(100);
    }
  }, [peekedCards, gameState?.phase]);

  // Blind round countdown — show message when a blind round starts
  useEffect(() => {
    if (
      gameState?.isBlindRound &&
      gameState?.phase === 'playing' &&
      peekedCards &&
      peekedCards.length === 0 &&
      gameState?.roundNumber > 0 &&
      blindCountdownShownForRound.current !== gameState.roundNumber
    ) {
      blindCountdownShownForRound.current = gameState.roundNumber;
      setIsBlindCountdown(true);
      setBlindCountdownSec(BLIND_COUNTDOWN_SEC);
    }
  }, [gameState?.isBlindRound, gameState?.phase, gameState?.roundNumber, peekedCards]);

  // Blind countdown timer
  useEffect(() => {
    if (!isBlindCountdown) return;
    if (blindCountdownSec <= 0) {
      setIsBlindCountdown(false);
      return;
    }
    const timer = setTimeout(() => {
      setBlindCountdownSec((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [isBlindCountdown, blindCountdownSec]);

  // Debug: track revealed cards by key `${playerId}:${slot}`
  const [debugRevealed, setDebugRevealed] = useState<Record<string, CardType>>({});

  const [debugRevealAll, setDebugRevealAll] = useState(false);

  // Burn confirmation modal state
  const [pendingBurnSlot, setPendingBurnSlot] = useState<string | null>(null);

  // Reaction button UI state
  const [reactionTrayOpen, setReactionTrayOpen] = useState(false);
  const [reactionCooling, setReactionCooling] = useState(false);
  const [reactionCooldownSec, setReactionCooldownSec] = useState(0);
  const reactionBtnRef = useRef<HTMLDivElement>(null);
  // Float emojis keyed by opponent playerId → list of active floats
  const [floatEmojis, setFloatEmojis] = useState<{ id: number; emoji: string; left: number }[]>([]);
  const floatIdRef = useRef(0);

  // ── Chat: unread badge + toast preview ──────────────────────
  useEffect(() => {
    if (!lastChatMessage) return;
    if (isChatOpen) {
      // Drawer is open — no badge, no toast
      return;
    }
    setUnreadCount((c) => c + 1);
    // Toast preview — auto-dismiss after 3s
    setToastPreviewMsg({ text: lastChatMessage.text, username: lastChatMessage.username });
    if (toastPreviewTimerRef.current) clearTimeout(toastPreviewTimerRef.current);
    toastPreviewTimerRef.current = setTimeout(() => {
      setToastPreviewMsg(null);
    }, 3000);
  }, [lastChatMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear unread + toast preview when opening the drawer
  const handleOpenChat = useCallback(() => {
    setIsChatOpen(true);
    setUnreadCount(0);
    setToastPreviewMsg(null);
    clearLastChatMessage();
  }, [clearLastChatMessage]);

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

  // Red Jack swap banner state
  const [swapBannerData, setSwapBannerData] = useState<{
    swapperUsername: string;
    targetSlot: string;
    role: 'target' | 'swapper' | 'bystander';
    targetUsername?: string;
    swapperSlot?: string;
  } | null>(null);

  // Round countdown timer state (seconds remaining before next round auto-starts)
  const [roundCountdown, setRoundCountdown] = useState<number | null>(null);
  const roundCountdownSoundPlayedRef = useRef(false);

  // F-308: Track discard pile top card ID to animate new cards appearing
  const [discardAnimKey, setDiscardAnimKey] = useState<string>('');

  // Discard history — last 5 discarded cards (newest last), reset each round
  const [discardHistory, setDiscardHistory] = useState<DiscardHistoryCard[]>([]);
  const prevDiscardTopIdRef = useRef<string>('');
  const prevRoundNumberRef = useRef<number>(0);
  // Refs for untracked setTimeout IDs — cleared on unmount to prevent stale state updates
  const burningSlotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queenPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cleanup untracked timers on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (burningSlotTimerRef.current) clearTimeout(burningSlotTimerRef.current);
      if (queenPeekTimerRef.current) clearTimeout(queenPeekTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const pile = gameState.discardPile;
    // Reset on new round
    if (gameState.roundNumber !== prevRoundNumberRef.current) {
      prevRoundNumberRef.current = gameState.roundNumber;
      prevDiscardTopIdRef.current = '';
      setDiscardHistory([]);
      // Flush all stale toasts from the previous round
      toast.closeAll();
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

  // Reaction: trigger float emoji when a reaction is received
  useEffect(() => {
    if (!lastReaction) return;
    const floatId = ++floatIdRef.current;
    const left = 15 + Math.random() * 55;
    setFloatEmojis((prev) => [...prev, { id: floatId, emoji: lastReaction.emoji, left }]);
    const timer = setTimeout(() => {
      setFloatEmojis((prev) => prev.filter((f) => f.id !== floatId));
    }, 2000);
    return () => clearTimeout(timer);
  }, [lastReaction]);

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
  // Timer continues during special effect prompts (shown inside the modal).
  // When a Red J/Q/K is discarded the server sets turnStartedAt=null, but
  // SocketContext snapshots the pre-wipe value into pendingEffect.turnStartedAt
  // so the timer can keep running inside the action card modal.
  // Timer is frozen (visible but stopped) when game is paused (F-279)
  useEffect(() => {
    // Use the snapshot from pendingEffect as fallback when turnStartedAt is null
    const originTs = gameState?.turnStartedAt ?? pendingEffect?.turnStartedAt ?? null;
    if (!originTs || gameState?.phase !== 'playing') {
      setTurnTimeLeft(null);
      return;
    }

    // When paused, freeze the timer at its current value — don't clear it,
    // just stop the interval. The server will send a new turnStartedAt on resume.
    if (gameState.paused) {
      return;
    }

    const computeRemaining = () => {
      const elapsed = (Date.now() - originTs) / 1000;
      return Math.max(0, TURN_TIMEOUT_SECS - elapsed);
    };

    setTurnTimeLeft(computeRemaining());

    const interval = setInterval(() => {
      const remaining = computeRemaining();
      setTurnTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000); // 1s tick; SVG ring uses CSS transition so animation stays smooth

    return () => clearInterval(interval);
  }, [gameState?.turnStartedAt, gameState?.phase, gameState?.paused, pendingEffect?.turnStartedAt]);

  // Burn result — play sound, haptics, and show inline feedback banner (RS-006) (F-044 to F-048)
  const [burnBanner, setBurnBanner] = useState<{ success: boolean; isBountyBurn?: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!lastBurnResult) return;
    playBurnSound();
    if (lastBurnResult.burnSuccess) {
      vibrateSuccess();
    } else {
      vibrateWarning();
    }
    const isBountyBurn =
      lastBurnResult.burnSuccess &&
      gameState?.gameMode === 'bountyHunt' &&
      !!gameState?.bountyRank &&
      lastBurnResult.burnedCard?.rank === gameState.bountyRank;
    setBurnBanner({ success: lastBurnResult.burnSuccess, isBountyBurn });
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
        id: 'burn-result',
        title: 'Card Burned',
        description: `${burnerUsername} burned a ${rank}${suit}!`,
        status: 'info',
        duration: 2000,
        isClosable: true,
        position: 'top',
      });
    } else {
      toast({
        id: 'burn-result',
        title: 'Burn Failed',
        description: `${burnerUsername} failed to burn — got a penalty card`,
        status: 'warning',
        duration: 2000,
        isClosable: true,
        position: 'top',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBurnResult, playerId, toast]);

  // Red Jack swap banner notification (replaces toast)
  useEffect(() => {
    if (!lastSwapResult) return;
    const { swapperSlot, swapperUsername, targetPlayerId, targetSlot, targetUsername } =
      lastSwapResult;
    if (!swapperSlot || !targetSlot) return;

    playSwapSound();

    let role: 'target' | 'swapper' | 'bystander';
    if (lastSwapResult.playerId === playerId) {
      role = 'swapper';
    } else if (targetPlayerId === playerId) {
      role = 'target';
    } else {
      role = 'bystander';
    }

    setSwapBannerData({
      swapperUsername: swapperUsername ?? 'Someone',
      targetSlot,
      role,
      targetUsername,
      swapperSlot,
    });

    // Banner persists until the player takes a new action (cleared in action handlers)
  }, [lastSwapResult, playerId]);

  // Check called — toast removed (F-062); banner UI still shows

  // Handle calling check
  const handleCallCheck = useCallback(async () => {
    setSwapBannerData(null);
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

  // Handle play again — create new room, redirect all players
  const handlePlayAgain = useCallback(async () => {
    const result = await playAgain();
    if (!result.success) {
      toast({
        title: 'Failed to create new game',
        description: result.error,
        status: 'error',
        duration: 3000,
        position: 'top',
      });
    }
    // The playAgainRedirect event in SocketContext handles navigation
  }, [playAgain, toast]);

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
    setSwapBannerData(null);
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
    setSwapBannerData(null);
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
      setSwapBannerData(null);
      // F-308: trigger shake animation on the burning slot
      setBurningSlot(slot);
      if (burningSlotTimerRef.current) clearTimeout(burningSlotTimerRef.current);
      burningSlotTimerRef.current = setTimeout(() => setBurningSlot(null), 500);
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
      setSwapBannerData(null);
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
  // Reaction button handlers
  // ----------------------------------------------------------
  const handleSendReaction = useCallback(
    async (emoji: string) => {
      if (reactionCooling) return;
      setReactionTrayOpen(false);
      setReactionCooling(true);
      setReactionCooldownSec(3);
      await sendReaction(emoji);
      // Countdown 3→0
      let cd = 3;
      const iv = setInterval(() => {
        cd--;
        setReactionCooldownSec(cd);
        if (cd <= 0) {
          clearInterval(iv);
          setReactionCooling(false);
          setReactionCooldownSec(0);
        }
      }, 1000);
    },
    [reactionCooling, sendReaction],
  );

  // Close reaction tray on outside click
  useEffect(() => {
    if (!reactionTrayOpen) return;
    const handler = (e: MouseEvent) => {
      if (reactionBtnRef.current && !reactionBtnRef.current.contains(e.target as Node)) {
        setReactionTrayOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionTrayOpen]);

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
  const [queenSelectedSlot, setQueenSelectedSlot] = useState<string | null>(null);
  const [queenLoading, setQueenLoading] = useState(false);
  const [queenPeekTimer, setQueenPeekTimer] = useState(false);

  // Red King state — new selection-first flow
  // kingSelectedIndices: which of the 2 drawn cards the player has tapped (0, 1, or both)
  const [kingSelectedIndices, setKingSelectedIndices] = useState<(0 | 1)[]>([]);
  // kingReplaceSlots: hand slots chosen to replace (one per selected drawn card, in order)
  const [kingReplaceSlots, setKingReplaceSlots] = useState<(string | null)[]>([null, null]);
  const [kingLoading, setKingLoading] = useState(false);

  // Derived: which step we are in
  // 'selectCard'  — initial, pick which drawn card(s) to keep
  // 'selectSlot'  — at least one card selected, now picking replacement hand slots
  const kingStep: 'selectCard' | 'selectSlot' =
    kingSelectedIndices.length === 0 ? 'selectCard' : 'selectSlot';

  // Whether the king selection is fully ready to confirm
  const kingReady =
    kingSelectedIndices.length === 0
      ? false // skip handled via separate button
      : kingSelectedIndices.length === 1
        ? kingReplaceSlots[0] !== null
        : kingReplaceSlots[0] !== null && kingReplaceSlots[1] !== null;

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
      setKingSelectedIndices([]);
      setKingReplaceSlots([null, null]);
      setKingLoading(false);
    }
  }, [pendingEffect]);

  // Red Jack: submit swap or skip
  const handleJackSubmit = useCallback(
    async (skip: boolean) => {
      setSwapBannerData(null);
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
      setSwapBannerData(null);
      setQueenLoading(true);
      setQueenSelectedSlot(slot);
      const result = await redQueenPeek(slot);
      setQueenLoading(false);
      if (result.success && result.card) {
        setQueenPeekedCard(result.card);
        setQueenPeekTimer(true);
        // Auto-close after 3 seconds
        if (queenPeekTimerRef.current) clearTimeout(queenPeekTimerRef.current);
        queenPeekTimerRef.current = setTimeout(() => {
          setQueenPeekTimer(false);
          setQueenPeekedCard(null);
          setQueenSelectedSlot(null);
        }, 3000);
      } else if (result.error) {
        setQueenSelectedSlot(null);
        toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
      }
    },
    [redQueenPeek, toast],
  );

  // Red King: submit choice (return both — separate skip button)
  const handleKingSkip = useCallback(async () => {
    setSwapBannerData(null);
    setKingLoading(true);
    const result = await redKingChoice({ type: 'returnBoth' });
    setKingLoading(false);
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [redKingChoice, toast]);

  // Red King: submit keep choice
  const handleKingSubmit = useCallback(async () => {
    if (!kingReady) return;
    setSwapBannerData(null);
    setKingLoading(true);

    let result: { success: boolean; error?: string };

    if (kingSelectedIndices.length === 1) {
      const slot = kingReplaceSlots[0];
      if (!slot) {
        setKingLoading(false);
        return;
      }
      result = await redKingChoice({
        type: 'keepOne',
        keepIndex: kingSelectedIndices[0],
        replaceSlot: slot,
      });
    } else {
      // keepBoth — kingReplaceSlots[i] is the slot for kingSelectedIndices[i]'s drawn card.
      // The server expects replaceSlots[i] = slot for drawnCards[i], so reorder
      // to match drawnCards indices (0, 1) rather than selection order.
      const slot0 = kingReplaceSlots[0];
      const slot1 = kingReplaceSlots[1];
      if (!slot0 || !slot1) {
        setKingLoading(false);
        return;
      }
      // Build a map: drawnCards index -> slot
      const slotByDrawnIndex: [string | null, string | null] = [null, null];
      slotByDrawnIndex[kingSelectedIndices[0]] = slot0;
      slotByDrawnIndex[kingSelectedIndices[1]] = slot1;

      result = await redKingChoice({
        type: 'keepBoth',
        replaceSlots: [slotByDrawnIndex[0]!, slotByDrawnIndex[1]!],
      });
    }

    setKingLoading(false);
    if (!result.success && result.error) {
      toast({ title: result.error, status: 'error', duration: 2000, position: 'top' });
    }
  }, [kingReady, kingSelectedIndices, kingReplaceSlots, redKingChoice, toast]);

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
      sx={{ overflowX: 'clip', overflowY: 'hidden' }}
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
      {/* ── HEADER (redesigned) ── */}
      <Flex px="12px" h="44px" bg="#0d0d1a" align="center" gap="8px" flexShrink={0}>
        {/* Left: Debug + Round number */}
        <Flex align="center" gap="8px" flexShrink={0}>
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
          {gameState.gameMode === 'suddenDeath' ? (
            <Text
              fontSize="13px"
              color="#e85d5d"
              fontWeight="700"
              whiteSpace="nowrap"
              letterSpacing="0.5px"
            >
              SUDDEN DEATH
            </Text>
          ) : (
            <>
              <Text fontSize="13px" color="#e8e8f0" fontWeight="500" whiteSpace="nowrap">
                Round: {gameState.roundNumber}
              </Text>
              {gameState.gameMode === 'bountyHunt' && (
                <Text fontSize="11px" color="#c9a227" fontWeight="600" whiteSpace="nowrap">
                  BOUNTY
                </Text>
              )}
              {gameState.gameMode === 'blindRounds' && (
                <Text
                  fontSize="11px"
                  color={gameState.isBlindRound ? '#7a7aee' : '#666'}
                  fontWeight="600"
                  whiteSpace="nowrap"
                >
                  {gameState.isBlindRound ? 'BLIND' : 'BLIND ROUNDS'}
                </Text>
              )}
              {gameState.targetScore !== 70 && (
                <Text fontSize="11px" color="#c9a227" fontWeight="500" whiteSpace="nowrap">
                  Target: {gameState.targetScore}pts
                </Text>
              )}
            </>
          )}
        </Flex>

        {/* Center: CHECK pill / Paused badge */}
        <Flex flex={1} justify="center">
          {gameState.paused ? (
            <Box
              h="26px"
              minW="70px"
              borderRadius="13px"
              border="1.5px solid #c9a227"
              bg="#c9a227"
              display="flex"
              alignItems="center"
              justifyContent="center"
              px="10px"
            >
              <Text fontSize="11px" fontWeight="600" color="#1a0e00" whiteSpace="nowrap">
                PAUSED
                {gameState.pausedBy
                  ? ` (${gameState.pausedBy === playerId ? 'You' : (gameState.players.find((p) => p.playerId === gameState.pausedBy)?.username ?? 'Host')})`
                  : ''}
              </Text>
            </Box>
          ) : checkCalledData ? (
            <Box
              h="26px"
              minW="70px"
              borderRadius="13px"
              border="1.5px solid #4ade80"
              bg={checkCalledData.playerId === playerId ? '#1a3b1a' : 'transparent'}
              display="flex"
              alignItems="center"
              justifyContent="center"
              px="10px"
              overflow="hidden"
            >
              <Text
                fontSize={checkCalledData.playerId === playerId ? '10px' : '11px'}
                fontWeight="600"
                color="#4ade80"
                whiteSpace="nowrap"
              >
                CHECK ({checkCalledData.playerId === playerId ? 'YOU' : checkCalledData.username})
              </Text>
            </Box>
          ) : turnData?.canCheck && !hasDrawnCard && !pendingEffect ? (
            <Box
              as="button"
              h="26px"
              minW="70px"
              borderRadius="13px"
              border="1.5px solid #c9a227"
              bg="#c9a227"
              display="flex"
              alignItems="center"
              justifyContent="center"
              px="10px"
              cursor="pointer"
              transition="background 0.15s"
              _hover={{ bg: '#b8911e' }}
              _active={{ bg: '#a07e18' }}
              onClick={handleCallCheck}
            >
              <Text fontSize="11px" fontWeight="600" color="#1a0e00" whiteSpace="nowrap">
                CHECK
              </Text>
            </Box>
          ) : null}
        </Flex>

        {/* Right: icon buttons */}
        <Flex align="center" gap="8px" flexShrink={0}>
          {/* Reaction button */}
          {gameState.phase === 'playing' && (
            <Box ref={reactionBtnRef} position="relative" flexShrink={0}>
              <Box
                as="button"
                w="28px"
                h="28px"
                borderRadius="50%"
                bg="#1a1a2e"
                border="0.5px solid #2a2a45"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="14px"
                cursor={reactionCooling ? 'default' : 'pointer'}
                userSelect="none"
                position="relative"
                flexShrink={0}
                transition="background 0.15s"
                _hover={reactionCooling ? {} : { bg: '#2a2a3e' }}
                onClick={() => {
                  if (reactionCooling) return;
                  setReactionTrayOpen((o) => !o);
                }}
              >
                {reactionCooling ? (
                  <>
                    <Box
                      as="svg"
                      position="absolute"
                      inset="-3px"
                      w="34px"
                      h="34px"
                      viewBox="0 0 34 34"
                      pointerEvents="none"
                    >
                      <circle
                        cx="17"
                        cy="17"
                        r="13"
                        fill="none"
                        stroke="#7a7aee"
                        strokeWidth="2"
                        strokeDasharray="82"
                        strokeLinecap="round"
                        style={{
                          transformOrigin: '50% 50%',
                          transform: 'rotate(-90deg)',
                          strokeDashoffset: `${82 - (82 * (3 - reactionCooldownSec)) / 3}`,
                          transition: 'stroke-dashoffset 1s linear',
                        }}
                      />
                    </Box>
                    <Box as="span" fontSize="10px" color="#888" fontWeight="600">
                      {reactionCooldownSec}
                    </Box>
                  </>
                ) : (
                  <Box as="span">{reactionTrayOpen ? '✕' : '😄'}</Box>
                )}
              </Box>
              {reactionTrayOpen && (
                <Box
                  position="absolute"
                  top="calc(100% + 8px)"
                  right={0}
                  bg="#1e1e2e"
                  border="1px solid #3a3a5a"
                  borderRadius="14px"
                  px="8px"
                  py="6px"
                  display="grid"
                  gridTemplateColumns="repeat(3, 1fr)"
                  gap="4px"
                  zIndex={40}
                  filter="drop-shadow(0 4px 12px rgba(0,0,0,0.4))"
                  sx={{
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: '-6px',
                      right: '9px',
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid #3a3a5a',
                    },
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      top: '-5px',
                      right: '10px',
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderBottom: '5px solid #1e1e2e',
                    },
                  }}
                >
                  {(['🖕', '😛', '🥲', '💀', '🤌', '🔥'] as const).map((emoji) => (
                    <Box
                      key={emoji}
                      as="button"
                      w="38px"
                      h="38px"
                      borderRadius="full"
                      bg="transparent"
                      border="none"
                      fontSize="22px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      cursor="pointer"
                      transition="transform 0.12s, background 0.1s"
                      _hover={{ transform: 'scale(1.25)', bg: '#2a2a42' }}
                      _active={{ transform: 'scale(0.95)' }}
                      onClick={() => handleSendReaction(emoji)}
                    >
                      {emoji}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Chat button */}
          <Box position="relative" flexShrink={0}>
            <Box
              as="button"
              w="28px"
              h="28px"
              borderRadius="50%"
              bg="#1a1a2e"
              border="0.5px solid #2a2a45"
              display="flex"
              alignItems="center"
              justifyContent="center"
              fontSize="13px"
              cursor="pointer"
              userSelect="none"
              flexShrink={0}
              transition="background 0.15s"
              _hover={{ bg: '#2a2a3e' }}
              onClick={handleOpenChat}
              aria-label="Open chat"
            >
              💬
            </Box>
            {unreadCount > 0 && (
              <Box
                position="absolute"
                top="-4px"
                right="-4px"
                minW="14px"
                h="14px"
                bg="#e74c3c"
                borderRadius="10px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                px="3px"
                fontSize="7px"
                fontWeight="600"
                color="white"
                pointerEvents="none"
                sx={{
                  animation: 'badgePop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  '@keyframes badgePop': {
                    from: { transform: 'scale(0)' },
                    to: { transform: 'scale(1)' },
                  },
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Box>
            )}
          </Box>

          {/* Info button */}
          <Box
            as="button"
            w="28px"
            h="28px"
            borderRadius="50%"
            bg="#1a1a2e"
            border="0.5px solid #2a2a45"
            display="flex"
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            flexShrink={0}
            transition="background 0.15s"
            _hover={{ bg: '#2a2a3e' }}
            onClick={onInfoOpen}
            aria-label="How to play"
          >
            <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="#7b8cde" strokeWidth="1.3" />
              <path d="M8 7v4M8 5.5v.5" stroke="#7b8cde" strokeWidth="1.3" strokeLinecap="round" />
            </Box>
          </Box>

          {/* Menu button (hamburger) */}
          <Box
            as="button"
            w="28px"
            h="28px"
            borderRadius="50%"
            bg="#1a1a2e"
            border="0.5px solid #2a2a45"
            display="flex"
            alignItems="center"
            justifyContent="center"
            cursor="pointer"
            flexShrink={0}
            transition="background 0.15s"
            _hover={{ bg: '#2a2a3e' }}
            onClick={onMenuOpen}
            aria-label="Game menu"
          >
            <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 5h10M3 8h7M3 11h9"
                stroke="#a0a0c0"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </Box>
          </Box>
        </Flex>
      </Flex>
      {/* ── Game Menu — bottom sheet (redesigned) ── */}
      <Modal isOpen={isMenuOpen} onClose={onMenuClose} size="full" motionPreset="slideInBottom">
        <ModalOverlay bg="rgba(0,0,0,0.55)" />
        <ModalContent
          bg="transparent"
          color="white"
          display="flex"
          alignItems="flex-end"
          justifyContent="flex-end"
          m={0}
          p={0}
          maxW="480px"
          mx="auto"
          shadow="none"
        >
          <Box
            w="100%"
            bg="#13131f"
            borderTopRadius="16px"
            borderTop="0.5px solid #2a2a45"
            overflow="hidden"
          >
            {/* Handle zone */}
            <Flex justify="center" pt="8px" pb="4px">
              <Box w="36px" h="3px" bg="#2a2a50" borderRadius="2px" />
            </Flex>

            {/* Header: MENU title + close button */}
            <Flex
              align="center"
              justify="space-between"
              px="14px"
              py="8px"
              pb="10px"
              borderBottom="0.5px solid #1e1e30"
            >
              <Text fontSize="11px" fontWeight="500" color="#a0a0c0" letterSpacing="0.06em">
                MENU
              </Text>
              <Box
                as="button"
                w="24px"
                h="24px"
                borderRadius="50%"
                bg="#1e1e35"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                border="none"
                _hover={{ bg: '#2a2a45' }}
                onClick={onMenuClose}
                aria-label="Close menu"
              >
                <Box as="svg" w="10px" h="10px" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 2l6 6M8 2l-6 6"
                    stroke="#7070a0"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </Box>
              </Box>
            </Flex>

            {/* Scores section */}
            <Box
              px="14px"
              py="10px"
              borderBottom="0.5px solid #1a1a2e"
              display="flex"
              flexDirection="column"
              gap="6px"
            >
              {[...gameState.players]
                .sort((a, b) => a.totalScore - b.totalScore)
                .map((p) => {
                  const pIdx = gameState.players.findIndex((gp) => gp.playerId === p.playerId);
                  const av = getAvatarColors(pIdx);
                  return (
                    <Flex key={p.playerId} align="center" gap="8px">
                      <Box
                        w="7px"
                        h="7px"
                        borderRadius="50%"
                        bg={p.playerId === playerId ? '#c9a227' : av.dot}
                        flexShrink={0}
                      />
                      <Text fontSize="12px" color="#e0e0f0" flex={1}>
                        {p.username}
                        {p.playerId === playerId && (
                          <Text as="span" color="#555580" fontSize="10px">
                            {' '}
                            (you)
                          </Text>
                        )}
                      </Text>
                      <Text
                        fontSize="13px"
                        fontWeight="500"
                        color={p.totalScore >= gameState.targetScore - 20 ? '#cf7070' : '#e0e0f0'}
                      >
                        {p.totalScore}
                      </Text>
                    </Flex>
                  );
                })}
            </Box>

            {/* Menu items */}
            <Box py="6px">
              {/* How to Play */}
              <Box
                as="button"
                display="flex"
                alignItems="center"
                gap="10px"
                px="14px"
                py="10px"
                w="100%"
                cursor="pointer"
                border="none"
                bg="transparent"
                transition="background 0.1s"
                _hover={{ bg: '#1a1a2e' }}
                _active={{ bg: '#1a1a2e' }}
                onClick={() => {
                  onMenuClose();
                  onInfoOpen();
                }}
              >
                <Box
                  w="28px"
                  h="28px"
                  borderRadius="8px"
                  bg="#1e1e35"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="5.5" stroke="#7b8cde" strokeWidth="1.3" />
                    <path
                      d="M8 6.5v1.5l1 1"
                      stroke="#7b8cde"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </Box>
                </Box>
                <Text fontSize="13px" color="#c8c8e0" flex={1} textAlign="left">
                  How to play
                </Text>
                <Box as="svg" w="12px" h="12px" viewBox="0 0 12 12" fill="none">
                  <path d="M4 3l3 3-3 3" stroke="#444460" strokeWidth="1.3" strokeLinecap="round" />
                </Box>
              </Box>

              {/* Pause / Resume */}
              <Box
                as="button"
                display="flex"
                alignItems="center"
                gap="10px"
                px="14px"
                py="10px"
                w="100%"
                cursor="pointer"
                border="none"
                bg="transparent"
                transition="background 0.1s"
                opacity={
                  gameState.phase === 'roundEnd' ||
                  gameState.phase === 'gameEnd' ||
                  gameState.phase === 'dealing'
                    ? 0.4
                    : 1
                }
                _hover={{ bg: '#1a1a2e' }}
                _active={{ bg: '#1a1a2e' }}
                onClick={async () => {
                  if (
                    gameState.phase === 'roundEnd' ||
                    gameState.phase === 'gameEnd' ||
                    gameState.phase === 'dealing'
                  )
                    return;
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
              >
                <Box
                  w="28px"
                  h="28px"
                  borderRadius="8px"
                  bg="#1e1e35"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  {gameState.paused ? (
                    <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
                      <path d="M5 3l8 5-8 5V3z" fill="#7b8cde" />
                    </Box>
                  ) : (
                    <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
                      <rect x="4" y="3" width="3" height="10" rx="1" fill="#7b8cde" />
                      <rect x="9" y="3" width="3" height="10" rx="1" fill="#7b8cde" />
                    </Box>
                  )}
                </Box>
                <Text fontSize="13px" color="#c8c8e0" flex={1} textAlign="left">
                  {gameState.paused ? 'Resume game' : 'Pause game'}
                </Text>
              </Box>

              {/* Sound toggle */}
              <Flex align="center" gap="10px" px="14px" py="10px">
                <Box
                  w="28px"
                  h="28px"
                  borderRadius="8px"
                  bg="#1e1e35"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 13l4-8 2 4 2-3 2 7"
                      stroke="#7b8cde"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Box>
                </Box>
                <Text fontSize="13px" color="#c8c8e0" flex={1}>
                  Sound
                </Text>
                <Box
                  as="button"
                  w="32px"
                  h="18px"
                  borderRadius="9px"
                  bg={soundEnabled ? '#3b4fd4' : '#2a2a45'}
                  position="relative"
                  cursor="pointer"
                  border="none"
                  transition="background 0.2s"
                  onClick={toggleSound}
                  flexShrink={0}
                >
                  <Box
                    w="14px"
                    h="14px"
                    borderRadius="50%"
                    bg="#fff"
                    position="absolute"
                    top="2px"
                    left={soundEnabled ? '16px' : '2px'}
                    transition="left 0.2s"
                  />
                </Box>
              </Flex>
            </Box>

            {/* Players section */}
            {gameState.players.filter((p) => p.playerId !== playerId).length > 0 && (
              <>
                <Text
                  fontSize="9px"
                  color="#444460"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  px="14px"
                  pt="8px"
                  pb="4px"
                >
                  PLAYERS
                </Text>
                {gameState.players
                  .filter((p) => p.playerId !== playerId)
                  .map((p) => {
                    const pIdx = gameState.players.findIndex((gp) => gp.playerId === p.playerId);
                    const av = getAvatarColors(pIdx);
                    return (
                      <Flex key={p.playerId} align="center" gap="8px" px="14px" py="6px">
                        <Box
                          w="26px"
                          h="26px"
                          borderRadius="50%"
                          bg={av.bg}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          fontSize="9px"
                          color={av.color}
                          fontWeight="600"
                          flexShrink={0}
                        >
                          {p.username.slice(0, 2).toUpperCase()}
                        </Box>
                        <Text fontSize="12px" color="#c8c8e0" flex={1}>
                          {p.username}
                        </Text>
                        {p.isBot && (
                          <Text
                            fontSize="9px"
                            color="#444460"
                            bg="#1a1a2e"
                            borderRadius="4px"
                            px="5px"
                            py="1px"
                          >
                            bot
                          </Text>
                        )}
                        {roomData?.host === playerId && (
                          <Box
                            as="button"
                            fontSize="12px"
                            color="#3a2a2a"
                            cursor="pointer"
                            px="6px"
                            py="2px"
                            borderRadius="4px"
                            border="none"
                            bg="transparent"
                            _hover={{ color: '#cf5e5e' }}
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
                        )}
                      </Flex>
                    );
                  })}
              </>
            )}

            {/* Exit game */}
            <Box
              as="button"
              display="flex"
              alignItems="center"
              gap="10px"
              px="14px"
              py="10px"
              w="100%"
              cursor="pointer"
              border="none"
              bg="transparent"
              borderTop="0.5px solid #1a1a2e"
              mt="4px"
              transition="background 0.1s"
              _hover={{ bg: '#1a1010' }}
              _active={{ bg: '#1a1010' }}
              onClick={() => {
                onMenuClose();
                handleExitGame();
              }}
            >
              <Box
                w="28px"
                h="28px"
                borderRadius="8px"
                bg="#2a1515"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M6 3H4a1 1 0 00-1 1v8a1 1 0 001 1h2M10 11l3-3-3-3M13 8H7"
                    stroke="#e24b4b"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Box>
              </Box>
              <Text fontSize="13px" color="#e24b4b" textAlign="left">
                Exit game
              </Text>
            </Box>

            {/* Safe area spacing */}
            <Box h="10px" />
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
      {/* Final Round banner (UI-005) — matches green bar from mock */}
      {checkCalledData && (
        <Box bg="#0d1a0d" px="12px" py="6px" borderBottom="0.5px solid #1a2e1a" flexShrink={0}>
          <Text fontSize="10px" fontWeight="500" color="#4ade80">
            {checkCalledData.playerId === playerId ? 'YOU' : checkCalledData.username.toUpperCase()}{' '}
            CALLED CHECK — FINAL TURN
          </Text>
        </Box>
      )}
      {/* ── MOBILE: OPPONENT SLIM ROWS ── */}
      {!isDesktop && (
        <Box bg="#0d0d14" flexShrink={0} position="relative">
          {/* Section header */}
          <Box display="flex" justifyContent="space-between" px="10px" pt="6px" pb="2px">
            <Box fontSize="9px" color="#333" textTransform="uppercase" letterSpacing="0.08em">
              opponents
            </Box>
            <Box fontSize="9px" color="#333">
              {opponents.length}
            </Box>
          </Box>
          {opponents.length >= 6 ? (
            /* ── 2-column grid layout for 6+ opponents ── */
            <Box display="grid" gridTemplateColumns="1fr 1fr">
              {opponents.map((opp, idx) => {
                const isLastOdd = idx === opponents.length - 1 && opponents.length % 2 !== 0;
                const isLeftColumn = idx % 2 === 0 && !isLastOdd;
                return (
                  <Box
                    key={opp.playerId}
                    gridColumn={isLastOdd ? '1 / -1' : undefined}
                    borderRight={isLeftColumn ? '0.5px solid #1e1e26' : undefined}
                  >
                    <MobileOpponentRow
                      player={opp}
                      playerIndex={playerIndexMap.get(opp.playerId) ?? 0}
                      isCurrentTurn={
                        gameState.players[gameState.currentTurnIndex]?.playerId === opp.playerId
                      }
                      targetScore={gameState.targetScore}
                      debugRevealed={debugRevealed}
                      modifiedSlots={modifiedSlots}
                    />
                  </Box>
                );
              })}
            </Box>
          ) : (
            opponents.map((opp) => (
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
            ))
          )}
          {/* Float emoji zone — reactions animate up over the opponent area */}
          <Box position="absolute" inset={0} pointerEvents="none" overflow="visible" zIndex={20}>
            {floatEmojis.map((f) => (
              <motion.div
                key={f.id}
                style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: `${f.left}%`,
                  fontSize: '28px',
                  pointerEvents: 'none',
                }}
                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 1, 0], y: [0, -8, -22, -58], scale: [0.5, 1.3, 1, 0.8] }}
                transition={{ duration: 1.8, ease: 'easeOut' }}
              >
                {f.emoji}
              </motion.div>
            ))}
          </Box>
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
          minH={0}
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
                    sx={isPulsing ? SX_KEYFRAMES_TIMER_PULSE : {}}
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
                        style={{ transition: 'stroke-dashoffset 1s linear, stroke 1s' }}
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
                          style={{ transition: 'width 1s linear, background 1s' }}
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
                bg={
                  burnBanner.isBountyBurn
                    ? 'rgba(201,162,39,0.15)'
                    : burnBanner.success
                      ? 'rgba(94,207,94,0.12)'
                      : 'rgba(207,94,94,0.12)'
                }
                border={`1px solid ${
                  burnBanner.isBountyBurn ? '#c9a227' : burnBanner.success ? '#5ecf5e' : '#cf5e5e'
                }`}
                textAlign="center"
              >
                <Text
                  fontSize="13px"
                  fontWeight="600"
                  color={
                    burnBanner.isBountyBurn ? '#c9a227' : burnBanner.success ? '#5ecf5e' : '#cf5e5e'
                  }
                >
                  {burnBanner.isBountyBurn
                    ? 'BOUNTY BURN -5'
                    : burnBanner.success
                      ? '✓ Burned!'
                      : 'X No match! +1 penalty card'}
                </Text>
              </Box>
            )}

            {/* Bounty Hunt: bounty rank badge */}
            {gameState.gameMode === 'bountyHunt' && gameState.bountyRank && (
              <Flex
                justify="center"
                align="center"
                gap="8px"
                px="10px"
                py="4px"
                borderRadius="8px"
                bg="rgba(201,162,39,0.1)"
                border="1px solid rgba(201,162,39,0.3)"
              >
                <Text
                  fontSize="10px"
                  color="#c9a227"
                  fontWeight="600"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                >
                  Bounty
                </Text>
                <Box transform="scale(0.5)" transformOrigin="center" my="-16px" mx="-10px">
                  <Card card={makeBountyDisplayCard(gameState.bountyRank)} size="sm" />
                </Box>
                <Text fontSize="9px" color="#8a7a3a">
                  2x in hand / -5 per burn
                </Text>
              </Flex>
            )}

            {/* Pile area — draw pile ⇄ discard pile; drawn card replaces draw pile when held */}
            <Flex justify="center" align="center" gap={{ base: '28px', md: '40px' }}>
              {/* Debug: action card buttons to stack the deck */}
              {DEBUG_MODE && !hasDrawnCard && (
                <VStack spacing="4px" flexShrink={0}>
                  {(
                    [
                      { label: 'K', rank: 'K', suit: '♥' },
                      { label: 'J', rank: 'J', suit: '♥' },
                      { label: 'Q', rank: 'Q', suit: '♥' },
                    ] as const
                  ).map((c) => (
                    <Box
                      key={c.label}
                      as="button"
                      w="34px"
                      h="44px"
                      borderRadius="6px"
                      bg="#1a0a0a"
                      border="1px solid #3a1a1a"
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      justifyContent="center"
                      cursor="pointer"
                      fontSize="11px"
                      fontWeight="700"
                      color="#c0392b"
                      lineHeight={1.1}
                      transition="background 0.1s, border-color 0.15s"
                      _hover={{ bg: '#2a1010', borderColor: '#c0392b' }}
                      _active={{ bg: '#3a1515' }}
                      onClick={async () => {
                        const res = await debugStackDeck(c.rank, c.suit);
                        if (!res.success) {
                          toast({
                            title: res.error ?? 'Not in deck',
                            status: 'warning',
                            duration: 1500,
                            position: 'top',
                          });
                        }
                      }}
                      title={`Stack ${c.rank}${c.suit} on top of deck`}
                    >
                      <Box as="span">{c.rank}</Box>
                      <Box as="span" fontSize="10px">
                        {c.suit}
                      </Box>
                    </Box>
                  ))}
                  <Text fontSize="7px" color="#333" whiteSpace="nowrap">
                    debug
                  </Text>
                </VStack>
              )}

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
                    <Box>
                      <CardBack
                        size="lg"
                        isBlindRound={gameState.isBlindRound}
                        isClickable={
                          canAct &&
                          !hasDrawnCard &&
                          (turnData?.availableActions.includes('drawDeck') ?? false)
                        }
                        onClick={handleDrawDeck}
                      />
                    </Box>
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
          {/* ── Swap event banner ── */}
          <AnimatePresence>
            {swapBannerData && (
              <motion.div
                key="swap-banner"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <Flex
                  mx="4px"
                  mb="10px"
                  bg="#1a0d0d"
                  border="1px solid #4a1515"
                  borderRadius="10px"
                  px="10px"
                  py="8px"
                  align="flex-start"
                  gap="8px"
                >
                  <Box
                    w="28px"
                    h="28px"
                    borderRadius="6px"
                    bg="#2a1515"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                  >
                    <Box as="svg" w="14px" h="14px" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 5h10M3 5l2-2M3 5l2 2M13 11H3M13 11l-2-2M13 11l-2 2"
                        stroke="#e24b4b"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Box>
                  </Box>
                  <Box flex={1}>
                    <Text fontSize="11px" fontWeight="500" color="#f09595" mb="2px">
                      {swapBannerData.role === 'target' ? (
                        <>
                          {swapBannerData.swapperUsername} swapped with your slot{' '}
                          <Text as="span" color="#e24b4b" fontWeight="500">
                            {swapBannerData.targetSlot}
                          </Text>
                        </>
                      ) : swapBannerData.role === 'swapper' ? (
                        <>
                          You swapped slot {swapBannerData.swapperSlot} with{' '}
                          {swapBannerData.targetUsername}&apos;s slot{' '}
                          <Text as="span" color="#e24b4b" fontWeight="500">
                            {swapBannerData.targetSlot}
                          </Text>
                        </>
                      ) : (
                        <>
                          {swapBannerData.swapperUsername} swapped a card with{' '}
                          {swapBannerData.targetUsername}
                        </>
                      )}
                    </Text>
                    {swapBannerData.role === 'target' && (
                      <Text fontSize="10px" color="#7a4040" lineHeight="1.4">
                        Your card is now unknown — use a Red Queen peek when you get the chance.
                      </Text>
                    )}
                  </Box>
                </Flex>
              </motion.div>
            )}
          </AnimatePresence>

          {/* hand label */}
          {isBlindCountdown ? (
            /* Blind round interstitial — no peeking */
            <Flex direction="column" align="center" justify="center" gap="8px" mb="10px" py="12px">
              <Flex
                align="center"
                gap="8px"
                bg="rgba(26,26,58,0.6)"
                border="1px solid #2a2a5a"
                borderRadius="12px"
                px="16px"
                py="10px"
              >
                {/* Crossed-out eye icon */}
                <Box w="24px" h="24px" flexShrink={0}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"
                      stroke="#5a5a8a"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="3" stroke="#5a5a8a" strokeWidth="1.5" />
                    <line
                      x1="4"
                      y1="4"
                      x2="20"
                      y2="20"
                      stroke="#7a4040"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </Box>
                <Box>
                  <Text fontSize="14px" fontWeight="700" color="#8a8acc" lineHeight="1.3">
                    BLIND ROUND
                  </Text>
                  <Text fontSize="11px" color="#5a5a7a" lineHeight="1.3">
                    No peeking this round
                  </Text>
                </Box>
              </Flex>
              <Text fontSize="24px" fontWeight="800" color="#8a8acc">
                {blindCountdownSec}
              </Text>
              <Text fontSize="10px" color="#5a5a7a">
                starting in {blindCountdownSec}s...
              </Text>
            </Flex>
          ) : isPeeking ? (
            /* Option C memo pill — replaces plain label during peeking phase */
            <VStack spacing="6px" mb="10px">
              {/* Bounty rank badge during peek (so it's visible at game start) */}
              {gameState.gameMode === 'bountyHunt' && gameState.bountyRank && (
                <Flex
                  justify="center"
                  align="center"
                  gap="8px"
                  px="10px"
                  py="4px"
                  borderRadius="8px"
                  bg="rgba(201,162,39,0.1)"
                  border="1px solid rgba(201,162,39,0.3)"
                >
                  <Text
                    fontSize="10px"
                    color="#c9a227"
                    fontWeight="600"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                  >
                    Bounty
                  </Text>
                  <Box transform="scale(0.5)" transformOrigin="center" my="-16px" mx="-10px">
                    <Card card={makeBountyDisplayCard(gameState.bountyRank)} size="sm" />
                  </Box>
                  <Text fontSize="9px" color="#8a7a3a">
                    2x in hand / -5 per burn
                  </Text>
                </Flex>
              )}
              <Flex align="center" justify="center">
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
            </VStack>
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

                // Is this slot the one that was just swapped (Red Jack target)?
                const isSwapTarget =
                  swapBannerData?.role === 'target' && swapBannerData.targetSlot === h.slot;

                const cardSize = isDesktop
                  ? 'lg'
                  : isPeeking && myPlayer.hand.length <= 4
                    ? 'md'
                    : 'sm';

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
                        <Box
                          position="relative"
                          overflow="visible"
                          borderRadius="md"
                          sx={isSwapTarget ? SX_KEYFRAMES_SWAP_PULSE : undefined}
                        >
                          {showFaceUp && peekedCard ? (
                            <FlippableCard
                              card={peekedCard}
                              isFaceUp={true}
                              isSelected={true}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={cardSize}
                            />
                          ) : visibleCard ? (
                            <Card
                              card={visibleCard}
                              isSelected={isPeekedSlot(h.slot)}
                              isClickable={isClickable}
                              onClick={handleClick}
                              size={cardSize}
                            />
                          ) : isSwapTarget ? (
                            /* Swapped unknown card — red border + red "?" */
                            <Box
                              w={cardSize === 'lg' ? '100px' : cardSize === 'md' ? '80px' : '52px'}
                              h={cardSize === 'lg' ? '140px' : cardSize === 'md' ? '112px' : '74px'}
                              borderRadius="md"
                              border="2px solid"
                              borderColor="#e24b4b"
                              bg="card.back"
                              cursor={isClickable ? 'pointer' : 'default'}
                              onClick={handleClick}
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              position="relative"
                              userSelect="none"
                            >
                              <Text
                                fontSize={
                                  cardSize === 'lg' ? '28px' : cardSize === 'md' ? '22px' : '16px'
                                }
                                fontWeight="700"
                                color="#e24b4b"
                              >
                                ?
                              </Text>
                            </Box>
                          ) : (
                            <CardBack
                              isSelected={isPeekedSlot(h.slot)}
                              isClickable={isClickable}
                              isBlindRound={gameState.isBlindRound}
                              onClick={handleClick}
                              size={cardSize}
                            />
                          )}
                          {/* Swap glow overlay */}
                          {isModified && (
                            <Box
                              position="absolute"
                              inset={0}
                              borderRadius="md"
                              pointerEvents="none"
                              zIndex={10}
                              sx={SX_KEYFRAMES_SWAP_FLASH}
                            />
                          )}
                          {/* Swap badge — red circle at top-right */}
                          {isSwapTarget && (
                            <Box
                              position="absolute"
                              top="-7px"
                              right="-7px"
                              w="18px"
                              h="18px"
                              bg="#e24b4b"
                              borderRadius="50%"
                              border="2px solid #09090f"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              zIndex={12}
                              sx={SX_KEYFRAMES_SWAP_BADGE_POP}
                            >
                              <Box as="svg" w="8px" h="8px" viewBox="0 0 10 10" fill="none">
                                <path
                                  d="M2 5h6M2 5l1.5-1.5M2 5l1.5 1.5M8 5l-1.5-1.5M8 5l-1.5 1.5"
                                  stroke="white"
                                  strokeWidth="1.2"
                                  strokeLinecap="round"
                                />
                              </Box>
                            </Box>
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
                                : isSwapTarget
                                  ? '#e24b4b'
                                  : '#555'
                          }
                          fontWeight={isPeekedSlot(h.slot) || isSwapTarget ? '700' : '500'}
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
                  transition="width 0.25s linear"
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
          const leftOpponents = opponents.slice(0, Math.min(3, opponents.length));
          const remaining = opponents.slice(leftOpponents.length);
          const topOpponents = remaining.slice(0, Math.min(3, remaining.length));
          const rightOpponents = remaining.slice(topOpponents.length).slice(0, 3);
          const dangerThreshold = gameState.targetScore - 15;
          return (
            <Box
              flex={1}
              display="flex"
              flexDirection="column"
              overflowX="clip"
              overflowY="visible"
              position="relative"
            >
              {/* Desktop float emoji zone — reactions animate up over the table */}
              <Box
                position="absolute"
                inset={0}
                pointerEvents="none"
                overflow="visible"
                zIndex={20}
              >
                {floatEmojis.map((f) => (
                  <motion.div
                    key={f.id}
                    style={{
                      position: 'absolute',
                      bottom: '20%',
                      left: `${f.left}%`,
                      fontSize: '32px',
                      pointerEvents: 'none',
                    }}
                    initial={{ opacity: 0, y: 0, scale: 0.5 }}
                    animate={{
                      opacity: [0, 1, 1, 0],
                      y: [0, -10, -30, -80],
                      scale: [0.5, 1.4, 1, 0.8],
                    }}
                    transition={{ duration: 1.8, ease: 'easeOut' }}
                  >
                    {f.emoji}
                  </motion.div>
                ))}
              </Box>
              {/* 3-col grid */}
              <Box
                display="grid"
                gridTemplateColumns="1fr 2fr 1fr"
                gridTemplateRows="auto 1fr auto"
                flex={1}
                overflowX="clip"
                overflowY="visible"
              >
                {/* dt-top: top opponents (up to 3) */}
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

                {/* dt-left: up to 3 opponents stacked */}
                <Box
                  gridColumn="1"
                  gridRow="2"
                  display="flex"
                  flexDirection="column"
                  alignItems="stretch"
                  justifyContent="center"
                  gap="6px"
                  padding="10px 8px 10px 12px"
                >
                  {leftOpponents.map((opp) => (
                    <DesktopSideOpponent
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
                            sx={isPulsing ? SX_KEYFRAMES_TIMER_PULSE : {}}
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
                                style={{ transition: 'stroke-dashoffset 1s linear, stroke 1s' }}
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
                                  style={{ transition: 'width 1s linear, background 1s' }}
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
                        bg={
                          burnBanner.isBountyBurn
                            ? 'rgba(201,162,39,0.15)'
                            : burnBanner.success
                              ? 'rgba(94,207,94,0.12)'
                              : 'rgba(207,94,94,0.12)'
                        }
                        border={`1px solid ${
                          burnBanner.isBountyBurn
                            ? '#c9a227'
                            : burnBanner.success
                              ? '#5ecf5e'
                              : '#cf5e5e'
                        }`}
                        textAlign="center"
                      >
                        <Text
                          fontSize="13px"
                          fontWeight="600"
                          color={
                            burnBanner.isBountyBurn
                              ? '#c9a227'
                              : burnBanner.success
                                ? '#5ecf5e'
                                : '#cf5e5e'
                          }
                        >
                          {burnBanner.isBountyBurn
                            ? 'BOUNTY BURN -5'
                            : burnBanner.success
                              ? '✓ Burned!'
                              : 'X No match! +1 penalty card'}
                        </Text>
                      </Box>
                    )}

                    {/* Bounty Hunt: bounty rank badge */}
                    {gameState.gameMode === 'bountyHunt' && gameState.bountyRank && (
                      <Flex
                        justify="center"
                        align="center"
                        gap="8px"
                        px="10px"
                        py="4px"
                        borderRadius="8px"
                        bg="rgba(201,162,39,0.1)"
                        border="1px solid rgba(201,162,39,0.3)"
                      >
                        <Text
                          fontSize="10px"
                          color="#c9a227"
                          fontWeight="600"
                          letterSpacing="0.08em"
                          textTransform="uppercase"
                        >
                          Bounty
                        </Text>
                        <Box transform="scale(0.5)" transformOrigin="center" my="-16px" mx="-10px">
                          <Card card={makeBountyDisplayCard(gameState.bountyRank)} size="sm" />
                        </Box>
                        <Text fontSize="9px" color="#8a7a3a">
                          2x in hand / -5 per burn
                        </Text>
                      </Flex>
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
                              isBlindRound={gameState.isBlindRound}
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

                {/* dt-right: up to 3 opponents stacked */}
                <Box
                  gridColumn="3"
                  gridRow="2"
                  display="flex"
                  flexDirection="column"
                  alignItems="stretch"
                  justifyContent="center"
                  gap="6px"
                  padding="10px 12px 10px 8px"
                >
                  {rightOpponents.map((opp) => (
                    <DesktopSideOpponent
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
                    {isBlindCountdown ? (
                      /* Blind round interstitial — no peeking */
                      <Flex
                        direction="column"
                        align="center"
                        justify="center"
                        gap="8px"
                        mb="10px"
                        py="12px"
                      >
                        <Flex
                          align="center"
                          gap="8px"
                          bg="rgba(26,26,58,0.6)"
                          border="1px solid #2a2a5a"
                          borderRadius="12px"
                          px="16px"
                          py="10px"
                        >
                          <Box w="24px" h="24px" flexShrink={0}>
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"
                                stroke="#5a5a8a"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle cx="12" cy="12" r="3" stroke="#5a5a8a" strokeWidth="1.5" />
                              <line
                                x1="4"
                                y1="4"
                                x2="20"
                                y2="20"
                                stroke="#7a4040"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </Box>
                          <Box>
                            <Text fontSize="14px" fontWeight="700" color="#8a8acc" lineHeight="1.3">
                              BLIND ROUND
                            </Text>
                            <Text fontSize="11px" color="#5a5a7a" lineHeight="1.3">
                              No peeking this round
                            </Text>
                          </Box>
                        </Flex>
                        <Text fontSize="24px" fontWeight="800" color="#8a8acc">
                          {blindCountdownSec}
                        </Text>
                        <Text fontSize="10px" color="#5a5a7a">
                          starting in {blindCountdownSec}s...
                        </Text>
                      </Flex>
                    ) : isPeeking ? (
                      /* Option C memo pill for desktop */
                      <VStack spacing="6px" mb="10px">
                        {/* Bounty rank badge during peek */}
                        {gameState.gameMode === 'bountyHunt' && gameState.bountyRank && (
                          <Flex
                            justify="center"
                            align="center"
                            gap="8px"
                            px="10px"
                            py="4px"
                            borderRadius="8px"
                            bg="rgba(201,162,39,0.1)"
                            border="1px solid rgba(201,162,39,0.3)"
                          >
                            <Text
                              fontSize="10px"
                              color="#c9a227"
                              fontWeight="600"
                              letterSpacing="0.08em"
                              textTransform="uppercase"
                            >
                              Bounty
                            </Text>
                            <Box
                              transform="scale(0.5)"
                              transformOrigin="center"
                              my="-16px"
                              mx="-10px"
                            >
                              <Card card={makeBountyDisplayCard(gameState.bountyRank)} size="sm" />
                            </Box>
                            <Text fontSize="9px" color="#8a7a3a">
                              2x in hand / -5 per burn
                            </Text>
                          </Flex>
                        )}
                        <Flex align="center" justify="center">
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
                      </VStack>
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

                          // Is this slot the one that was just swapped (Red Jack target)?
                          const isSwapTarget =
                            swapBannerData?.role === 'target' &&
                            swapBannerData.targetSlot === h.slot;

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
                                  <Box
                                    position="relative"
                                    overflow="visible"
                                    borderRadius="md"
                                    sx={isSwapTarget ? SX_KEYFRAMES_SWAP_PULSE : undefined}
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
                                    ) : isSwapTarget ? (
                                      /* Swapped unknown card — red border + red "?" */
                                      <Box
                                        w="100px"
                                        h="140px"
                                        borderRadius="md"
                                        border="2px solid"
                                        borderColor="#e24b4b"
                                        bg="card.back"
                                        cursor={isClickable ? 'pointer' : 'default'}
                                        onClick={handleClick}
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        position="relative"
                                        userSelect="none"
                                      >
                                        <Text fontSize="28px" fontWeight="700" color="#e24b4b">
                                          ?
                                        </Text>
                                      </Box>
                                    ) : (
                                      <CardBack
                                        isSelected={isPeekedSlot(h.slot)}
                                        isClickable={isClickable}
                                        isBlindRound={gameState.isBlindRound}
                                        onClick={handleClick}
                                        size="lg"
                                      />
                                    )}
                                    {/* Swap glow overlay */}
                                    {isModified && (
                                      <Box
                                        position="absolute"
                                        inset={0}
                                        borderRadius="md"
                                        pointerEvents="none"
                                        zIndex={10}
                                        sx={SX_KEYFRAMES_SWAP_FLASH}
                                      />
                                    )}
                                    {/* Swap badge — red circle at top-right */}
                                    {isSwapTarget && (
                                      <Box
                                        position="absolute"
                                        top="-7px"
                                        right="-7px"
                                        w="18px"
                                        h="18px"
                                        bg="#e24b4b"
                                        borderRadius="50%"
                                        border="2px solid #09090f"
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        zIndex={12}
                                        sx={SX_KEYFRAMES_SWAP_BADGE_POP}
                                      >
                                        <Box
                                          as="svg"
                                          w="8px"
                                          h="8px"
                                          viewBox="0 0 10 10"
                                          fill="none"
                                        >
                                          <path
                                            d="M2 5h6M2 5l1.5-1.5M2 5l1.5 1.5M8 5l-1.5-1.5M8 5l-1.5 1.5"
                                            stroke="white"
                                            strokeWidth="1.2"
                                            strokeLinecap="round"
                                          />
                                        </Box>
                                      </Box>
                                    )}
                                  </Box>
                                  <Text
                                    fontSize="10px"
                                    color={
                                      isPeekedSlot(h.slot)
                                        ? '#c9a227'
                                        : pendingBurnSlot === h.slot
                                          ? '#cf5e5e'
                                          : isSwapTarget
                                            ? '#e24b4b'
                                            : '#555'
                                    }
                                    fontWeight={
                                      isPeekedSlot(h.slot) || isSwapTarget ? '700' : '500'
                                    }
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
                            transition="width 0.25s linear"
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
          borderRadius={{ base: '16px 16px 0 0', md: '14px' }}
          borderTop={{ base: '0.5px solid #2a2a3a', md: 'none' }}
          border={{ base: 'none', md: '0.5px solid #2a2a3a' }}
          p={0}
          mx={{ base: 0, md: 'auto' }}
          mb={{ base: 0, md: '12px' }}
          mt="auto"
          position="fixed"
          bottom={{ base: 0, md: '0' }}
          left={{ base: 0, md: 'auto' }}
          right={{ base: 0, md: 'auto' }}
          maxW={{ base: 'unset', md: '480px' }}
          w={{ base: '100%', md: '480px' }}
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
            {/* Turn timer strip — visible while this player's turn timer is running */}
            {turnTimeLeft !== null &&
              (() => {
                const pct = turnTimeLeft / TURN_TIMEOUT_SECS;
                const tc = pct > 0.6 ? '#4ecb4e' : pct > 0.3 ? '#c9a227' : '#cf5e5e';
                return (
                  <Box
                    display="flex"
                    alignItems="center"
                    gap="8px"
                    pt="8px"
                    pb="2px"
                    sx={pct <= 0.3 ? { animation: 'timerPulse 1s ease-in-out infinite' } : {}}
                  >
                    <Text fontSize="11px" color={tc} fontWeight="600" minW="24px">
                      {Math.ceil(turnTimeLeft)}s
                    </Text>
                    <Box flex={1} h="4px" bg="#1a2a1a" borderRadius="3px" overflow="hidden">
                      <Box
                        h="100%"
                        bg={tc}
                        w={`${pct * 100}%`}
                        borderRadius="3px"
                        style={{ transition: 'width 1s linear, background 1s' }}
                      />
                    </Box>
                  </Box>
                );
              })()}
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
                            border={`1.5px solid ${isSelected ? '#5eb8cf' : '#3a3a5a'}`}
                            boxShadow={isSelected ? '0 0 0 1px #5eb8cf30' : 'none'}
                            position="relative"
                            transition="border-color 0.12s, background 0.12s"
                          ></Box>
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
              bg="#1e0e0e"
              border="1px solid #7a2a2a"
              color="#e07070"
              fontSize="13px"
              fontWeight="600"
              _hover={{ bg: '#2a1010', borderColor: '#c0392b', color: '#ff8080' }}
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
          borderRadius={{ base: '16px 16px 0 0', md: '14px' }}
          borderTop={{ base: '0.5px solid #2a2a3a', md: 'none' }}
          border={{ base: 'none', md: '0.5px solid #2a2a3a' }}
          p={0}
          mx={{ base: 0, md: 'auto' }}
          mb={{ base: 0, md: '12px' }}
          mt="auto"
          position="fixed"
          bottom={{ base: 0, md: '0' }}
          left={{ base: 0, md: 'auto' }}
          right={{ base: 0, md: 'auto' }}
          maxW={{ base: 'unset', md: '480px' }}
          w={{ base: '100%', md: '480px' }}
          maxH={{ base: '92vh', md: '75vh' }}
          overflow="hidden"
          display="flex"
          flexDirection="column"
        >
          {/* Drag handle */}
          <Box
            w="32px"
            h="3px"
            bg="#2a2a3a"
            borderRadius="2px"
            mx="auto"
            mt="10px"
            flexShrink={0}
          />

          {/* Header */}
          <Box px="16px" pt="10px" pb={0} flexShrink={0}>
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
            {/* Turn timer strip */}
            {turnTimeLeft !== null &&
              (() => {
                const pct = turnTimeLeft / TURN_TIMEOUT_SECS;
                const tc = pct > 0.6 ? '#4ecb4e' : pct > 0.3 ? '#c9a227' : '#cf5e5e';
                return (
                  <Box
                    display="flex"
                    alignItems="center"
                    gap="8px"
                    pt="8px"
                    pb="2px"
                    sx={pct <= 0.3 ? { animation: 'timerPulse 1s ease-in-out infinite' } : {}}
                  >
                    <Text fontSize="11px" color={tc} fontWeight="600" minW="24px">
                      {Math.ceil(turnTimeLeft)}s
                    </Text>
                    <Box flex={1} h="4px" bg="#1a2a1a" borderRadius="3px" overflow="hidden">
                      <Box
                        h="100%"
                        bg={tc}
                        w={`${pct * 100}%`}
                        borderRadius="3px"
                        style={{ transition: 'width 1s linear, background 1s' }}
                      />
                    </Box>
                  </Box>
                );
              })()}
          </Box>

          {/* Scrollable body */}
          <Box flex={1} overflowY="auto">
            {queenPeekedCard ? (
              /* Revealed state: show the peeked card + all hand slots so the user
               can see exactly which slot was looked at */
              <Box px="16px" pt="10px">
                {/* Full hand overview — all slots visible, selected one highlighted */}
                <Text
                  fontSize="10px"
                  color="#444"
                  textTransform="uppercase"
                  letterSpacing="0.07em"
                  fontWeight="500"
                  mb="8px"
                >
                  your hand
                </Text>
                <Box display="flex" gap="8px" mb="10px">
                  {myPlayer.hand.map((h) => {
                    const isRevealed = h.slot === queenSelectedSlot;
                    return (
                      <Box
                        key={h.slot}
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        gap="4px"
                      >
                        {isRevealed ? (
                          /* Show the actual face-up card for the peeked slot */
                          <Box
                            w="46px"
                            h="64px"
                            borderRadius="7px"
                            bg="white"
                            border="2px solid #c9a227"
                            display="flex"
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            position="relative"
                            fontWeight="700"
                            fontSize="16px"
                            flexShrink={0}
                            color={queenPeekedCard.isRed ? '#c0392b' : '#222'}
                            boxShadow="0 0 0 2px #c9a22740"
                          >
                            <Box
                              position="absolute"
                              top="2px"
                              left="3px"
                              fontSize="9px"
                              fontWeight="700"
                              lineHeight={1.2}
                              color={queenPeekedCard.isRed ? '#c0392b' : '#222'}
                            >
                              {queenPeekedCard.rank}
                              <br />
                              {queenPeekedCard.suit}
                            </Box>
                            <Text fontSize="14px">{queenPeekedCard.suit}</Text>
                            <Box
                              position="absolute"
                              bottom="2px"
                              right="3px"
                              fontSize="9px"
                              fontWeight="700"
                              transform="rotate(180deg)"
                              color={queenPeekedCard.isRed ? '#c0392b' : '#222'}
                            >
                              {queenPeekedCard.rank}
                              <br />
                              {queenPeekedCard.suit}
                            </Box>
                          </Box>
                        ) : (
                          /* Other slots remain face-down */
                          <Box
                            w="46px"
                            h="64px"
                            borderRadius="7px"
                            bg="#22223a"
                            border="1.5px solid #3a3a5a"
                            opacity={0.5}
                          />
                        )}
                        <Text
                          fontSize="10px"
                          color={isRevealed ? '#c9a227' : '#555'}
                          fontWeight={isRevealed ? '600' : '400'}
                        >
                          {h.slot}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
                {/* Card detail info */}
                <Box
                  p="8px 12px"
                  bg="#14200f"
                  border="0.5px solid #2a4020"
                  borderRadius="8px"
                  display="flex"
                  alignItems="center"
                  gap="8px"
                >
                  <Text fontSize="12px" color="#5ecf5e" fontWeight="500">
                    Slot {queenSelectedSlot} — {queenPeekedCard.rank}
                    {queenPeekedCard.suit}
                  </Text>
                  <Text fontSize="11px" color="#888">
                    · {queenPeekedCard.value} pt{queenPeekedCard.value !== 1 ? 's' : ''}
                  </Text>
                  <Text fontSize="10px" color="#3a5a3a" ml="auto">
                    Only you can see this
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
                          bg="#22223a"
                          border="1.5px solid #3a3a5a"
                          position="relative"
                          cursor={queenLoading ? 'wait' : 'pointer'}
                          onClick={() => handleQueenPeek(h.slot)}
                          transition="border-color 0.12s"
                          _hover={{ borderColor: '#5a5a8a' }}
                        />
                        <Text fontSize="10px" color="#555" fontWeight="500">
                          {h.slot}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
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
                    setQueenSelectedSlot(null);
                  }
                }}
              >
                {queenPeekedCard ? 'Got it' : 'Select a slot'}
              </Button>
            </Box>
          </Box>
          {/* end scrollable body */}
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
          borderRadius={{ base: '16px 16px 0 0', md: '14px' }}
          borderTop={{ base: '0.5px solid #2a2a3a', md: 'none' }}
          border={{ base: 'none', md: '0.5px solid #2a2a3a' }}
          p={0}
          mx={{ base: 0, md: 'auto' }}
          mb={{ base: 0, md: '12px' }}
          mt="auto"
          position="fixed"
          bottom={{ base: 0, md: '0' }}
          left={{ base: 0, md: 'auto' }}
          right={{ base: 0, md: 'auto' }}
          maxW={{ base: 'unset', md: '480px' }}
          w={{ base: '100%', md: '480px' }}
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
              {kingStep === 'selectCard'
                ? 'Select the card(s) you want to keep, or skip below.'
                : kingSelectedIndices.length === 1
                  ? kingReplaceSlots[0]
                    ? 'Ready — confirm to keep this card in the selected slot.'
                    : 'Select the slot you want to place this card in.'
                  : kingReplaceSlots[0] && kingReplaceSlots[1]
                    ? 'Ready — confirm to keep both cards.'
                    : `Select ${2 - (kingReplaceSlots[0] ? 1 : 0) - (kingReplaceSlots[1] ? 1 : 0)} more slot${2 - (kingReplaceSlots[0] ? 1 : 0) - (kingReplaceSlots[1] ? 1 : 0) !== 1 ? 's' : ''} to replace.`}
            </Text>
            {/* Turn timer strip */}
            {turnTimeLeft !== null &&
              (() => {
                const pct = turnTimeLeft / TURN_TIMEOUT_SECS;
                const tc = pct > 0.6 ? '#4ecb4e' : pct > 0.3 ? '#c9a227' : '#cf5e5e';
                return (
                  <Box
                    display="flex"
                    alignItems="center"
                    gap="8px"
                    pt="8px"
                    pb="2px"
                    sx={pct <= 0.3 ? { animation: 'timerPulse 1s ease-in-out infinite' } : {}}
                  >
                    <Text fontSize="11px" color={tc} fontWeight="600" minW="24px">
                      {Math.ceil(turnTimeLeft)}s
                    </Text>
                    <Box flex={1} h="4px" bg="#1a2a1a" borderRadius="3px" overflow="hidden">
                      <Box
                        h="100%"
                        bg={tc}
                        w={`${pct * 100}%`}
                        borderRadius="3px"
                        style={{ transition: 'width 1s linear, background 1s' }}
                      />
                    </Box>
                  </Box>
                );
              })()}
          </Box>
          {/* ── Step 1: Drawn cards (always visible, tappable) ── */}
          {pendingEffect?.redKingCards && (
            <Box px="16px" pt="12px">
              <Text
                fontSize="10px"
                color="#444"
                textTransform="uppercase"
                letterSpacing="0.07em"
                fontWeight="500"
                mb="10px"
              >
                {kingStep === 'selectCard' ? 'your 2 drawn cards — tap to select' : 'drawn cards'}
              </Text>
              <Box display="flex" gap="14px" justifyContent="center">
                {pendingEffect.redKingCards.map((c, i) => {
                  const idx = i as 0 | 1;
                  const isSelected = kingSelectedIndices.includes(idx);
                  const slotForThis =
                    kingSelectedIndices.length === 1 && isSelected
                      ? kingReplaceSlots[0]
                      : kingSelectedIndices.length === 2
                        ? kingReplaceSlots[kingSelectedIndices.indexOf(idx)]
                        : null;

                  return (
                    <Box
                      key={i}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="6px"
                      cursor="pointer"
                      onClick={() => {
                        setKingSelectedIndices((prev) => {
                          if (prev.includes(idx)) {
                            const newIndices = prev.filter((x) => x !== idx);
                            setKingReplaceSlots((prevSlots) => {
                              if (prev.length === 1) return [null, null];
                              const pos = prev.indexOf(idx);
                              const newSlots = [...prevSlots] as [string | null, string | null];
                              newSlots[pos] = null;
                              if (newSlots[0] === null && newSlots[1] !== null) {
                                return [newSlots[1], null];
                              }
                              return newSlots;
                            });
                            return newIndices as (0 | 1)[];
                          }
                          if (prev.length >= 2) return prev;
                          return [...prev, idx] as (0 | 1)[];
                        });
                      }}
                    >
                      <Box
                        w="62px"
                        h="86px"
                        borderRadius="9px"
                        bg="white"
                        border={`2px solid ${isSelected ? '#c9a227' : '#ddd'}`}
                        boxShadow={isSelected ? '0 0 0 3px #c9a22740' : 'none'}
                        transform={isSelected ? 'translateY(-4px)' : 'none'}
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        justifyContent="center"
                        position="relative"
                        fontWeight="700"
                        fontSize="22px"
                        color={c.isRed ? '#c0392b' : '#222'}
                        transition="border-color 0.15s, box-shadow 0.15s, transform 0.15s"
                      >
                        <Box
                          position="absolute"
                          top="5px"
                          left="6px"
                          fontSize="11px"
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
                          bottom="5px"
                          right="6px"
                          fontSize="11px"
                          fontWeight="700"
                          transform="rotate(180deg)"
                          color={c.isRed ? '#c0392b' : '#222'}
                        >
                          {c.rank}
                          <br />
                          {c.suit}
                        </Box>
                        {isSelected && (
                          <Box
                            position="absolute"
                            top="-6px"
                            right="-6px"
                            w="18px"
                            h="18px"
                            borderRadius="50%"
                            bg="#c9a227"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                          >
                            <Text fontSize="9px" color="#1a1200" fontWeight="800">
                              ✓
                            </Text>
                          </Box>
                        )}
                      </Box>
                      <Text
                        fontSize="10px"
                        fontWeight="500"
                        color={isSelected ? '#c9a227' : '#555'}
                      >
                        {isSelected
                          ? slotForThis
                            ? `→ slot ${slotForThis}`
                            : `${c.rank}${c.suit} · keeping`
                          : `${c.rank}${c.suit} · ${c.value} pts`}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* ── Step 2: Hand slot picker ── */}
          {kingStep === 'selectSlot' && (
            <Box px="16px" pt="14px">
              <Text
                fontSize="10px"
                color="#444"
                textTransform="uppercase"
                letterSpacing="0.07em"
                fontWeight="500"
                mb="10px"
              >
                {kingSelectedIndices.length === 1
                  ? 'your hand — tap a slot to replace'
                  : `your hand — pick 2 slots to replace (${(kingReplaceSlots[0] ? 1 : 0) + (kingReplaceSlots[1] ? 1 : 0)}/2)`}
              </Text>
              <Box display="flex" gap="8px" flexWrap="wrap">
                {myPlayer.hand.map((h) => {
                  const slotPos0 = kingReplaceSlots[0] === h.slot;
                  const slotPos1 = kingReplaceSlots[1] === h.slot;
                  const isSelected = slotPos0 || slotPos1;
                  const drawnCardForSlot = isSelected
                    ? slotPos0
                      ? pendingEffect?.redKingCards?.[kingSelectedIndices[0]]
                      : pendingEffect?.redKingCards?.[kingSelectedIndices[1]]
                    : null;

                  return (
                    <Box
                      key={h.slot}
                      display="flex"
                      flexDirection="column"
                      alignItems="center"
                      gap="4px"
                      cursor="pointer"
                      onClick={() => {
                        if (kingSelectedIndices.length === 1) {
                          setKingReplaceSlots((prev) =>
                            prev[0] === h.slot ? [null, null] : [h.slot, null],
                          );
                        } else {
                          setKingReplaceSlots((prev) => {
                            if (prev[0] === h.slot) return [null, prev[1]];
                            if (prev[1] === h.slot) return [prev[0], null];
                            if (!prev[0]) return [h.slot, prev[1]];
                            if (!prev[1]) return [prev[0], h.slot];
                            return prev;
                          });
                        }
                      }}
                    >
                      <Box
                        w="48px"
                        h="66px"
                        borderRadius="7px"
                        bg={
                          isSelected ? (drawnCardForSlot?.isRed ? '#fff5f5' : '#f5f5f5') : '#22223a'
                        }
                        border={`1.5px solid ${isSelected ? '#c9a227' : '#3a3a5a'}`}
                        boxShadow={isSelected ? '0 0 0 2px #c9a22740' : 'none'}
                        position="relative"
                        display="flex"
                        flexDirection="column"
                        alignItems="center"
                        justifyContent="center"
                        transition="border-color 0.12s, background 0.12s, box-shadow 0.12s"
                        transform={isSelected ? 'translateY(-2px)' : 'none'}
                      >
                        {isSelected && drawnCardForSlot ? (
                          <>
                            <Box
                              position="absolute"
                              top="4px"
                              left="4px"
                              fontSize="9px"
                              fontWeight="700"
                              lineHeight={1.2}
                              color={drawnCardForSlot.isRed ? '#c0392b' : '#222'}
                            >
                              {drawnCardForSlot.rank}
                              <br />
                              {drawnCardForSlot.suit}
                            </Box>
                            <Text
                              fontSize="14px"
                              color={drawnCardForSlot.isRed ? '#c0392b' : '#222'}
                            >
                              {drawnCardForSlot.suit}
                            </Text>
                          </>
                        ) : (
                          <Box
                            w="28px"
                            h="40px"
                            borderRadius="4px"
                            bg="#2a2a4a"
                            border="1px solid #3a3a5a"
                          />
                        )}
                      </Box>
                      <Text
                        fontSize="10px"
                        color={isSelected ? '#c9a227' : '#555'}
                        fontWeight="500"
                      >
                        {h.slot}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* ── Bottom action row ── */}
          <Box px="16px" pt="14px" pb="16px" display="flex" gap="8px">
            <Button
              flex={1}
              py="10px"
              h="auto"
              borderRadius="9px"
              bg="#16162a"
              color="#555"
              border="0.5px solid #2a2a3a"
              fontSize="12px"
              fontWeight="500"
              _hover={{ bg: '#1e1e38', color: '#888' }}
              isDisabled={kingLoading}
              onClick={handleKingSkip}
            >
              Skip
            </Button>
            {kingReady && (
              <Button
                flex={2}
                py="10px"
                h="auto"
                borderRadius="9px"
                bg="#c9a227"
                color="#1a1200"
                fontSize="13px"
                fontWeight="600"
                _hover={{ bg: '#b8911e' }}
                isLoading={kingLoading}
                onClick={handleKingSubmit}
              >
                Confirm
              </Button>
            )}
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
          h={{ base: '100dvh', md: 'auto' }}
          maxH={{ base: '100dvh', md: '92vh' }}
          overflow="hidden"
          display="flex"
          flexDirection="column"
          borderRadius={{ base: 0, md: '16px' }}
          border="1px solid #1e1e2a"
          m={{ base: 0, md: 4 }}
          paddingTop={{ base: 'env(safe-area-inset-top)', md: '0' }}
          paddingBottom={{ base: 'env(safe-area-inset-bottom)', md: '0' }}
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
            <Text
              fontSize="11px"
              color={gameState?.gameMode === 'suddenDeath' ? '#e85d5d' : '#aaa'}
              fontWeight="500"
            >
              {gameState?.gameMode === 'suddenDeath'
                ? 'SUDDEN DEATH — Game Over'
                : `Round ${roundEndData?.roundNumber} complete`}
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
                      color={gameState?.gameMode === 'suddenDeath' ? '#e85d5d' : '#7a7aee'}
                      mb="4px"
                    >
                      {gameState?.gameMode === 'suddenDeath'
                        ? 'Sudden Death'
                        : `Round ${roundEndData?.roundNumber}`}
                    </Text>
                    <Text fontSize="24px" fontWeight="800" lineHeight="1.1" color="#eee" mb="4px">
                      {iWon ? 'You won!' : `${winnerName} won!`}
                    </Text>
                    <Text fontSize="12px" color="#555">
                      {checkerName
                        ? `${checkerName} called check${roundEndData?.checkerDoubled && gameState?.gameMode !== 'suddenDeath' ? ' · score doubled!' : ''}`
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
                          {hand.cards.map((c, i) => {
                            const isBountyCard =
                              gameState?.gameMode === 'bountyHunt' &&
                              !!gameState?.bountyRank &&
                              c.rank === gameState.bountyRank;
                            return (
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
                                  border={isBountyCard ? '1.5px solid' : '1px solid'}
                                  borderColor={
                                    isBountyCard
                                      ? '#c9a227'
                                      : c.value === 0
                                        ? '#5ecf5e'
                                        : c.value >= 10
                                          ? '#cf5e5e40'
                                          : '#ddd'
                                  }
                                  boxShadow={
                                    isBountyCard
                                      ? '0 0 0 1px rgba(201,162,39,0.3)'
                                      : c.value === 0
                                        ? '0 0 0 1px #5ecf5e30'
                                        : 'none'
                                  }
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
                                    isBountyCard
                                      ? '#c9a227'
                                      : c.value === 0
                                        ? '#5ecf5e'
                                        : c.value >= 10
                                          ? '#cf5e5e'
                                          : '#555'
                                  }
                                >
                                  {isBountyCard ? `${c.value} → ${c.value * 2}` : `${c.value} pts`}
                                </Text>
                              </Box>
                            );
                          })}
                        </Flex>
                        {/* Bounty Hunt: burn bonus annotation */}
                        {gameState?.gameMode === 'bountyHunt' &&
                          gameState?.bountyBurnCounts &&
                          (gameState.bountyBurnCounts[hand.playerId] ?? 0) > 0 && (
                            <Text fontSize="9px" color="#c9a227" mt="4px" fontWeight="600">
                              Bounty burns: {gameState.bountyBurnCounts[hand.playerId]} x (-5) = -
                              {gameState.bountyBurnCounts[hand.playerId] * 5}
                            </Text>
                          )}
                      </Box>
                    );
                  })}
                </VStack>
              </Box>

              {/* ── score progress bars (hidden for Sudden Death — single round) ── */}
              {gameState?.gameMode !== 'suddenDeath' &&
                (() => {
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

              {/* Blind Rounds: warning about next round being blind */}
              {gameState?.gameMode === 'blindRounds' &&
                roundEndData &&
                !roundEndData.gameEnded &&
                (roundEndData.roundNumber + 1) % 3 === 0 && (
                  <Box
                    px="12px"
                    py="8px"
                    borderRadius="8px"
                    bg="rgba(122,122,238,0.08)"
                    border="1px solid rgba(122,122,238,0.2)"
                    textAlign="center"
                  >
                    <Text
                      fontSize="10px"
                      color="#7a7aee"
                      fontWeight="700"
                      textTransform="uppercase"
                      letterSpacing="0.08em"
                    >
                      Next round: BLIND ROUND
                    </Text>
                    <Text fontSize="9px" color="#5a5a9e" mt="2px">
                      No peek phase. Opponent card counts hidden.
                    </Text>
                  </Box>
                )}
            </VStack>
          </Box>

          {/* sticky footer — always visible above safe area */}
          <Box
            px="12px"
            pt="10px"
            pb="12px"
            bg="#0f0f16"
            borderTop="0.5px solid #1e1e2a"
            flexShrink={0}
          >
            {roundEndData?.nextRoundStarting ? (
              <>
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
              </>
            ) : (
              <Text fontSize="12px" color="#555" textAlign="center">
                Game over!
              </Text>
            )}
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
            <Text
              fontSize="11px"
              color={gameState?.gameMode === 'suddenDeath' ? '#e85d5d' : '#aaa'}
              fontWeight="500"
            >
              {gameState?.gameMode === 'suddenDeath'
                ? 'SUDDEN DEATH — Game Over'
                : `Game over · Round ${gameState?.roundNumber}`}
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
                      color={gameState?.gameMode === 'suddenDeath' ? '#e85d5d' : '#c9a227'}
                      mb="4px"
                    >
                      {gameState?.gameMode === 'suddenDeath' ? 'Sudden Death' : 'Game over'}
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
                      {gameState?.gameMode === 'suddenDeath'
                        ? `${loserIsMe ? 'You had' : `${loserName} had`} the highest score — ${gameEndData?.loser.score} points`
                        : `${loserIsMe ? 'You' : loserName} reached ${gameEndData?.loser.score} points — game ends`}
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
                            {hand.cards.map((c, i) => {
                              const isBountyCard =
                                gameState?.gameMode === 'bountyHunt' &&
                                !!gameState?.bountyRank &&
                                c.rank === gameState.bountyRank;
                              return (
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
                                    border={isBountyCard ? '1.5px solid' : '1px solid'}
                                    borderColor={
                                      isBountyCard
                                        ? '#c9a227'
                                        : c.value === 0
                                          ? '#5ecf5e'
                                          : c.value >= 10
                                            ? '#cf5e5e40'
                                            : '#ddd'
                                    }
                                    boxShadow={
                                      isBountyCard
                                        ? '0 0 0 1px rgba(201,162,39,0.3)'
                                        : c.value === 0
                                          ? '0 0 0 1px #5ecf5e30'
                                          : 'none'
                                    }
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
                                      isBountyCard
                                        ? '#c9a227'
                                        : c.value === 0
                                          ? '#5ecf5e'
                                          : c.value >= 10
                                            ? '#cf5e5e'
                                            : '#555'
                                    }
                                  >
                                    {isBountyCard
                                      ? `${c.value} → ${c.value * 2}`
                                      : `${c.value} pts`}
                                  </Text>
                                </Box>
                              );
                            })}
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
                  onClick={handlePlayAgain}
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
      {/* ── Chat drawer (full-screen overlay) ── */}
      <ChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      {/* ── Chat toast preview ── */}
      {toastPreviewMsg && (
        <Box
          position="fixed"
          bottom="72px"
          left="50%"
          zIndex={190}
          pointerEvents="auto"
          sx={{
            transform: 'translateX(-50%)',
            animation: 'toastSlideUp 0.2s ease-out',
            '@keyframes toastSlideUp': {
              from: { opacity: 0, transform: 'translateX(-50%) translateY(10px)' },
              to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
            },
          }}
          onClick={handleOpenChat}
          cursor="pointer"
        >
          <Flex
            align="center"
            gap="8px"
            bg="#1a1a2e"
            border="0.5px solid #2a2a50"
            borderRadius="18px"
            px="12px"
            h="36px"
            maxW="260px"
          >
            <Box
              w="14px"
              h="14px"
              borderRadius="50%"
              bg="#1f2b5e"
              color="#7b8cde"
              fontSize="7px"
              fontWeight="700"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              {toastPreviewMsg.username.slice(0, 2).toUpperCase()}
            </Box>
            <Text
              fontSize="12px"
              color="#c8c8e8"
              overflow="hidden"
              whiteSpace="nowrap"
              textOverflow="ellipsis"
              maxW="200px"
            >
              <Text as="span" fontWeight="600">
                {toastPreviewMsg.username}:
              </Text>{' '}
              {toastPreviewMsg.text}
            </Text>
          </Flex>
        </Box>
      )}
    </Box>
  );
};

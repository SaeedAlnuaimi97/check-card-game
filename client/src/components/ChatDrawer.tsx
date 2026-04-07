import { FC, useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useSocket, ChatMessage } from '../context/SocketContext';

// ============================================================
// Types
// ============================================================

type DrawerState = 'closed' | 'peek' | 'half' | 'full';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================================
// Helpers
// ============================================================

const QUICK_CHIPS = ['😂', '🔥', 'gg', 'no way!', 'nice', 'rip'];

/** Get consistent initials + avatar colors for a player */
function getAvatarStyle(username: string): { bg: string; color: string } {
  const hues = [
    { bg: '#1f2b5e', color: '#7b8cde' },
    { bg: '#3b1f3b', color: '#c07bd0' },
    { bg: '#1a3b2b', color: '#4ade80' },
    { bg: '#3b2a1a', color: '#d0a04a' },
    { bg: '#1a2a3b', color: '#4aade0' },
    { bg: '#3b1a2a', color: '#d04a7b' },
  ];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h + username.charCodeAt(i)) % hues.length;
  return hues[h];
}

function getInitials(username: string): string {
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return username.slice(0, 2).toUpperCase();
}

/** Returns true if two messages are from the same sender and within 60 seconds */
function isConsecutive(prev: ChatMessage, next: ChatMessage): boolean {
  return (
    !prev.isSystem &&
    !next.isSystem &&
    prev.playerId === next.playerId &&
    next.timestamp - prev.timestamp < 60_000
  );
}

// ============================================================
// Sub-components
// ============================================================

interface MessageBubbleProps {
  msg: ChatMessage;
  myPlayerId: string | null;
  isFirst: boolean; // first in a consecutive run — show avatar + name
}

const MessageBubble: FC<MessageBubbleProps> = ({ msg, myPlayerId, isFirst }) => {
  const isMe = msg.playerId === myPlayerId;
  const avatarStyle = getAvatarStyle(msg.username);
  const initials = getInitials(msg.username);

  if (msg.isSystem) {
    return (
      <Flex justify="center" px="16px">
        <Box
          bg="#1e1e2e"
          borderRadius="20px"
          px="10px"
          py="4px"
          fontSize="11px"
          color="#555580"
          maxW="80%"
          textAlign="center"
        >
          {msg.text}
        </Box>
      </Flex>
    );
  }

  if (isMe) {
    return (
      <Flex direction="column" align="flex-end" px="12px">
        {isFirst && (
          <Text fontSize="10px" color="#555580" mb="2px" mr="34px">
            {msg.username}
          </Text>
        )}
        <Flex align="flex-end" gap="6px">
          <Box
            bg="#1a3b2b"
            color="#a8f0c8"
            borderRadius="10px 10px 2px 10px"
            px="10px"
            py="6px"
            fontSize="13px"
            maxW="75%"
            wordBreak="break-word"
            sx={{
              animation: 'chatPopIn 0.18s ease-out',
              '@keyframes chatPopIn': {
                from: { opacity: 0, transform: 'scale(0.92)' },
                to: { opacity: 1, transform: 'scale(1)' },
              },
            }}
          >
            {msg.text}
          </Box>
          {isFirst ? (
            <Box
              w="22px"
              h="22px"
              borderRadius="50%"
              bg={avatarStyle.bg}
              color={avatarStyle.color}
              fontSize="9px"
              fontWeight="600"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              {initials}
            </Box>
          ) : (
            <Box w="22px" h="22px" flexShrink={0} />
          )}
        </Flex>
      </Flex>
    );
  }

  // Opponent message
  return (
    <Flex direction="column" align="flex-start" px="12px">
      {isFirst && (
        <Text fontSize="10px" color="#555580" mb="2px" ml="30px">
          {msg.username}
        </Text>
      )}
      <Flex align="flex-end" gap="6px">
        {isFirst ? (
          <Box
            w="22px"
            h="22px"
            borderRadius="50%"
            bg={avatarStyle.bg}
            color={avatarStyle.color}
            fontSize="9px"
            fontWeight="600"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            {initials}
          </Box>
        ) : (
          <Box w="22px" h="22px" flexShrink={0} />
        )}
        <Box
          bg="#1e1e35"
          color="#c8c8e8"
          borderRadius="10px 10px 10px 2px"
          px="10px"
          py="6px"
          fontSize="13px"
          maxW="75%"
          wordBreak="break-word"
          sx={{
            animation: 'chatPopIn 0.18s ease-out',
            '@keyframes chatPopIn': {
              from: { opacity: 0, transform: 'scale(0.92)' },
              to: { opacity: 1, transform: 'scale(1)' },
            },
          }}
        >
          {msg.text}
        </Box>
      </Flex>
    </Flex>
  );
};

// ============================================================
// ChatDrawer
// ============================================================

const SNAP_HEIGHTS: Record<DrawerState, string> = {
  closed: '0px',
  peek: '120px',
  half: '55vh',
  full: '90vh',
};

export const ChatDrawer: FC<ChatDrawerProps> = ({ isOpen, onClose }) => {
  const {
    chatMessages,
    clearLastChatMessage,
    sendChatMessage,
    getChatHistory,
    playerId,
    roomData,
  } = useSocket();

  const [drawerState, setDrawerState] = useState<DrawerState>('closed');
  const [inputText, setInputText] = useState('');
  const [showNewMsgPill, setShowNewMsgPill] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const msgListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(chatMessages.length);

  // Drag state
  const dragStartYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const currentDragOffsetRef = useRef(0);

  // ── Open / Close transitions ──────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setDrawerState('half');
      clearLastChatMessage();
      // Load history once per session in a room
      if (!historyLoaded && roomData) {
        getChatHistory().then(() => setHistoryLoaded(true));
      }
    } else {
      setDrawerState('closed');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus input when transitioning to full
  useEffect(() => {
    if (drawerState === 'full' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [drawerState]);

  // ── Auto-scroll ───────────────────────────────────────────

  const isNearBottom = useCallback(() => {
    const el = msgListRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = msgListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useEffect(() => {
    const newCount = chatMessages.length;
    if (newCount > prevMsgCountRef.current && drawerState !== 'closed') {
      if (isNearBottom()) {
        scrollToBottom();
        setShowNewMsgPill(false);
      } else {
        setShowNewMsgPill(true);
      }
    }
    prevMsgCountRef.current = newCount;
  }, [chatMessages.length, drawerState, isNearBottom, scrollToBottom]);

  // Initial scroll to bottom when drawer first opens
  useEffect(() => {
    if (drawerState === 'half' || drawerState === 'full') {
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [drawerState, scrollToBottom]);

  // ── Escape key ────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && drawerState !== 'closed') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerState, onClose]);

  // ── Drag gestures ─────────────────────────────────────────

  const handleDragStart = useCallback((clientY: number) => {
    isDraggingRef.current = true;
    dragStartYRef.current = clientY;
    dragStartTimeRef.current = Date.now();
    currentDragOffsetRef.current = 0;
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDraggingRef.current) return;
    const delta = clientY - dragStartYRef.current;
    currentDragOffsetRef.current = delta;
    // Live drag feedback — move the drawer element directly
    if (drawerRef.current) {
      const clampedDelta = Math.max(0, delta); // only allow dragging down
      drawerRef.current.style.transform = `translateY(${clampedDelta}px)`;
    }
  }, []);

  const handleDragEnd = useCallback(
    (clientY: number) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      // Reset inline transform
      if (drawerRef.current) {
        drawerRef.current.style.transform = '';
      }

      const delta = clientY - dragStartYRef.current;
      const elapsed = Date.now() - dragStartTimeRef.current;
      const velocity = Math.abs(delta) / elapsed; // px/ms

      // Fast downward swipe → close regardless
      if (velocity > 0.5 && delta > 0) {
        onClose();
        return;
      }

      // Snap based on direction + current state
      if (delta > 60) {
        // Dragged down — close from half or peek, step down from full
        if (drawerState === 'full') setDrawerState('half');
        else onClose(); // half → close, peek → close
      } else if (delta < -60) {
        // Dragged up
        if (drawerState === 'peek') setDrawerState('half');
        else if (drawerState === 'half') setDrawerState('full');
      }
    },
    [drawerState, onClose],
  );

  // ── Send message ──────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    await sendChatMessage(text);
  }, [inputText, sendChatMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChipSend = useCallback(
    async (text: string) => {
      await sendChatMessage(text);
    },
    [sendChatMessage],
  );

  // ── Backdrop opacity ──────────────────────────────────────

  const backdropOpacity = drawerState === 'closed' ? 0 : drawerState === 'peek' ? 0.2 : 0.55;

  // ── Players for header avatars ────────────────────────────

  const players = roomData?.players ?? [];

  // ── Render ────────────────────────────────────────────────

  if (drawerState === 'closed' && !isOpen) return null;

  return (
    <Box
      position="fixed"
      inset="0"
      zIndex={200}
      pointerEvents={drawerState === 'closed' ? 'none' : 'auto'}
    >
      {/* Backdrop */}
      <Box
        position="absolute"
        inset="0"
        bg="rgba(0,0,0,0.55)"
        opacity={backdropOpacity}
        transition="opacity 320ms cubic-bezier(0.32, 0.72, 0, 1)"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <Box
        ref={drawerRef}
        position="absolute"
        bottom="0"
        left="0"
        right="0"
        height={SNAP_HEIGHTS[drawerState]}
        bg="#0f0f20"
        borderTopRadius="16px"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        role="dialog"
        aria-label="Table chat"
        transition={
          drawerState === 'closed'
            ? 'height 260ms cubic-bezier(0.4, 0, 1, 1)'
            : 'height 320ms cubic-bezier(0.32, 0.72, 0, 1)'
        }
        sx={{ willChange: 'height' }}
      >
        {/* ── Drag handle zone ── */}
        <Box
          h="24px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="grab"
          flexShrink={0}
          onMouseDown={(e) => handleDragStart(e.clientY)}
          onMouseMove={(e) => isDraggingRef.current && handleDragMove(e.clientY)}
          onMouseUp={(e) => handleDragEnd(e.clientY)}
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
          onTouchEnd={(e) => handleDragEnd(e.changedTouches[0].clientY)}
        >
          <Box w="40px" h="4px" bg="#2a2a50" borderRadius="2px" />
        </Box>

        {/* ── Header bar ── */}
        <Flex
          h="40px"
          px="14px"
          align="center"
          justify="space-between"
          borderBottom="0.5px solid #1e1e35"
          flexShrink={0}
        >
          {/* Left: status dot + label */}
          <Flex align="center" gap="6px">
            <Box w="8px" h="8px" borderRadius="50%" bg="#4ade80" />
            <Text fontSize="10px" fontWeight="500" color="#a0a0c0" letterSpacing="0.08em">
              TABLE CHAT
            </Text>
          </Flex>

          {/* Right: player avatar stack */}
          <Flex align="center" gap="4px">
            {players.slice(0, 5).map((p) => {
              const av = getAvatarStyle(p.username);
              return (
                <Box
                  key={p.id}
                  w="24px"
                  h="24px"
                  borderRadius="50%"
                  bg={av.bg}
                  color={av.color}
                  fontSize="9px"
                  fontWeight="600"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  title={p.username}
                >
                  {getInitials(p.username)}
                </Box>
              );
            })}
          </Flex>
        </Flex>

        {/* ── Message list ── */}
        <Box
          ref={msgListRef}
          flex={1}
          overflowY="auto"
          bg="#12121f"
          py="12px"
          display="flex"
          flexDirection="column"
          gap="0"
          position="relative"
          sx={{
            '&::-webkit-scrollbar': { width: '3px' },
            '&::-webkit-scrollbar-track': { bg: 'transparent' },
            '&::-webkit-scrollbar-thumb': { bg: '#2a2a50', borderRadius: '2px' },
          }}
          onScroll={() => {
            if (isNearBottom()) setShowNewMsgPill(false);
          }}
        >
          {chatMessages.length === 0 ? (
            <Flex
              flex={1}
              direction="column"
              align="center"
              justify="center"
              gap="8px"
              minH="60px"
              mt="24px"
            >
              <Text fontSize="22px">💬</Text>
              <Text fontSize="12px" color="#555580" textAlign="center">
                no messages yet — say something!
              </Text>
            </Flex>
          ) : (
            <>
              {chatMessages.map((msg, i) => {
                const prev = i > 0 ? chatMessages[i - 1] : null;
                const consecutive = prev ? isConsecutive(prev, msg) : false;
                return (
                  <Box key={msg.id} mt={consecutive ? '4px' : i === 0 ? '0' : '10px'}>
                    <MessageBubble msg={msg} myPlayerId={playerId} isFirst={!consecutive} />
                  </Box>
                );
              })}
            </>
          )}

          {/* "↓ new messages" pill */}
          {showNewMsgPill && (
            <Flex position="sticky" bottom="8px" justify="center" pointerEvents="auto">
              <Box
                as="button"
                bg="#3b4fd4"
                color="white"
                fontSize="11px"
                fontWeight="600"
                borderRadius="20px"
                px="12px"
                py="5px"
                cursor="pointer"
                border="none"
                onClick={() => {
                  scrollToBottom();
                  setShowNewMsgPill(false);
                }}
              >
                ↓ new messages
              </Box>
            </Flex>
          )}
        </Box>

        {/* ── Input row ── */}
        <Flex
          h="48px"
          px="12px"
          align="center"
          gap="8px"
          bg="#0f0f20"
          borderTop="0.5px solid #1e1e35"
          flexShrink={0}
        >
          <Box
            as="input"
            ref={inputRef}
            flex={1}
            bg="#1e1e35"
            borderRadius="20px"
            px="14px"
            py="8px"
            border="0.5px solid #2a2a50"
            fontSize="13px"
            color="#c8c8e8"
            outline="none"
            value={inputText}
            placeholder="say something..."
            sx={{
              '&::placeholder': { color: '#444460' },
              '&:focus': { borderColor: '#4a4a80', outline: 'none' },
            }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {/* Send button */}
          <Box
            as="button"
            w="34px"
            h="34px"
            borderRadius="50%"
            bg={inputText.trim() ? '#3b4fd4' : '#1e1e35'}
            border="none"
            display="flex"
            alignItems="center"
            justifyContent="center"
            cursor={inputText.trim() ? 'pointer' : 'default'}
            flexShrink={0}
            transition="background 0.15s"
            onClick={handleSend}
            aria-label="Send message"
          >
            <Box as="svg" w="14px" h="14px" viewBox="0 0 14 14" fill="none">
              <path
                d="M1 7h12M7 1l6 6-6 6"
                stroke={inputText.trim() ? 'white' : '#2a2a50'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Box>
          </Box>
        </Flex>

        {/* ── Quick-react chips ── */}
        <Flex
          px="12px"
          pb="12px"
          pt="6px"
          gap="6px"
          overflowX="auto"
          flexShrink={0}
          bg="#0f0f20"
          sx={{
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {QUICK_CHIPS.map((chip) => (
            <Box
              key={chip}
              as="button"
              bg="#1e1e35"
              border="0.5px solid #2a2a50"
              borderRadius="20px"
              px="12px"
              py="5px"
              fontSize="12px"
              fontWeight="500"
              color="#7070a0"
              cursor="pointer"
              flexShrink={0}
              whiteSpace="nowrap"
              transition="background 0.1s, color 0.1s"
              _hover={{ bg: '#2a2a50', color: '#c8c8e8' }}
              onClick={() => handleChipSend(chip)}
            >
              {chip}
            </Box>
          ))}
        </Flex>
      </Box>
    </Box>
  );
};

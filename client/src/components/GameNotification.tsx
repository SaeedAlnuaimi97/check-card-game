/**
 * GameNotification — subtle inline notification banners for game events (F-361, F-362).
 *
 * Replaces distracting Chakra toasts with a compact slide-down banner
 * that includes a close button and auto-dismiss. Deduplicates by notification ID.
 */

import { FC, useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Box, CloseButton, HStack, Text } from '@chakra-ui/react';

// ============================================================
// Types
// ============================================================

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface GameNotificationItem {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  duration?: number; // ms, default 3000
}

const TYPE_STYLES: Record<NotificationType, { bg: string; borderColor: string; color: string }> = {
  info: { bg: 'rgba(49, 130, 206, 0.15)', borderColor: 'blue.400', color: 'blue.200' },
  success: { bg: 'rgba(72, 187, 120, 0.15)', borderColor: 'green.400', color: 'green.200' },
  warning: { bg: 'rgba(236, 201, 75, 0.15)', borderColor: 'yellow.400', color: 'yellow.200' },
  error: { bg: 'rgba(245, 101, 101, 0.15)', borderColor: 'red.400', color: 'red.200' },
};

const DEFAULT_DURATION = 3000;
const MAX_VISIBLE = 3; // max simultaneous notifications

// ============================================================
// Hook: useGameNotifications
// ============================================================

export function useGameNotifications() {
  const [notifications, setNotifications] = useState<GameNotificationItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Track recently shown IDs for dedup (F-362)
  const recentIdsRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (item: GameNotificationItem) => {
      // Dedup: skip if same ID was shown within the last 1 second (F-362)
      const now = Date.now();
      const lastShown = recentIdsRef.current.get(item.id);
      if (lastShown && now - lastShown < 1000) {
        return;
      }
      recentIdsRef.current.set(item.id, now);

      // Clean up old entries from recentIds (older than 5s)
      for (const [key, ts] of recentIdsRef.current) {
        if (now - ts > 5000) recentIdsRef.current.delete(key);
      }

      setNotifications((prev) => {
        // Remove existing notification with same ID
        const filtered = prev.filter((n) => n.id !== item.id);
        // Enforce max visible
        const trimmed =
          filtered.length >= MAX_VISIBLE
            ? filtered.slice(filtered.length - MAX_VISIBLE + 1)
            : filtered;
        return [...trimmed, item];
      });

      // Clear any existing timer for this ID
      const existingTimer = timersRef.current.get(item.id);
      if (existingTimer) clearTimeout(existingTimer);

      // Auto-dismiss
      const duration = item.duration ?? DEFAULT_DURATION;
      const timer = setTimeout(() => {
        dismiss(item.id);
      }, duration);
      timersRef.current.set(item.id, timer);
    },
    [dismiss],
  );

  return { notifications, notify, dismiss };
}

// ============================================================
// Component: GameNotificationStack
// ============================================================

interface GameNotificationStackProps {
  notifications: GameNotificationItem[];
  onDismiss: (id: string) => void;
}

const MotionBox = motion(Box);

export const GameNotificationStack: FC<GameNotificationStackProps> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <Box
      position="fixed"
      top="60px"
      left="50%"
      transform="translateX(-50%)"
      zIndex={100}
      w={{ base: '92%', md: '420px' }}
      display="flex"
      flexDirection="column"
      gap={1}
      pointerEvents="none"
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => {
          const style = TYPE_STYLES[n.type];
          return (
            <MotionBox
              key={n.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              pointerEvents="auto"
            >
              <HStack
                bg={style.bg}
                borderLeft="3px solid"
                borderColor={style.borderColor}
                borderRadius="md"
                px={3}
                py={1.5}
                backdropFilter="blur(8px)"
                justify="space-between"
                align="center"
                spacing={2}
              >
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="600" color={style.color} noOfLines={1}>
                    {n.title}
                  </Text>
                  {n.description && (
                    <Text fontSize="xs" color="gray.400" noOfLines={1}>
                      {n.description}
                    </Text>
                  )}
                </Box>
                <CloseButton
                  size="sm"
                  color="gray.500"
                  _hover={{ color: 'gray.300' }}
                  onClick={() => onDismiss(n.id)}
                />
              </HStack>
            </MotionBox>
          );
        })}
      </AnimatePresence>
    </Box>
  );
};

import { useState, useEffect, useCallback, FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Spinner,
  Tab,
  Table,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  Badge,
} from '@chakra-ui/react';
import { getOrCreateGuestId } from '../utils/fingerprint';
import socket from '../services/socket';

// ============================================================
// Types
// ============================================================

interface LeaderboardEntry {
  rank: number;
  guestId: string;
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  lastPlayedAt: string;
}

interface RecentGame {
  roomCode: string;
  endedAt: string;
  totalRounds: number;
  playerCount: number;
  myScore: number;
  winnerUsername: string;
  isWin: boolean;
}

interface PersonalStats {
  guestId: string;
  username: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  recentGames: RecentGame[];
}

// ============================================================
// Socket-based data fetchers
// ============================================================

function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'getLeaderboard',
      { limit: 50 },
      (response: { success: boolean; leaderboard?: LeaderboardEntry[]; error?: string }) => {
        if (response?.success && response.leaderboard) {
          resolve(response.leaderboard);
        } else {
          reject(new Error(response?.error || 'Failed to fetch leaderboard'));
        }
      },
    );
  });
}

function fetchStats(guestId: string): Promise<PersonalStats> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'getStats',
      { guestId },
      (response: { success: boolean; stats?: PersonalStats; error?: string }) => {
        if (response?.success && response.stats) {
          resolve(response.stats);
        } else {
          reject(new Error(response?.error || 'Failed to fetch stats'));
        }
      },
    );
  });
}

// ============================================================
// Helper: medal color for rank
// ============================================================

function rankColor(rank: number): string | undefined {
  if (rank === 1) return 'gold';
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return undefined;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ============================================================
// Component
// ============================================================

export const Leaderboard: FC = () => {
  const navigate = useNavigate();
  const guestId = getOrCreateGuestId();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lb, st] = await Promise.all([fetchLeaderboard(), fetchStats(guestId)]);
      setLeaderboard(lb);
      setStats(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [guestId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <Box minH="100vh" bg="gray.900" color="white" p={{ base: 3, md: 6 }} overflowX="hidden">
      <VStack spacing={6} maxW="900px" w="100%" mx="auto">
        {/* Header */}
        <Flex w="100%" justify="space-between" align="center">
          <Button variant="ghost" color="gray.400" onClick={() => navigate('/')}>
            Back
          </Button>
          <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="bold">
            Leaderboard
          </Text>
          <Button variant="ghost" color="gray.400" onClick={loadData} isDisabled={loading}>
            Refresh
          </Button>
        </Flex>

        {loading && !leaderboard.length ? (
          <Flex justify="center" py={16}>
            <Spinner size="lg" color="brand.400" />
          </Flex>
        ) : error ? (
          <VStack spacing={4} py={16}>
            <Text color="red.300">{error}</Text>
            <Button colorScheme="blue" onClick={loadData}>
              Retry
            </Button>
          </VStack>
        ) : (
          <Tabs
            index={tabIndex}
            onChange={setTabIndex}
            variant="soft-rounded"
            colorScheme="green"
            w="100%"
          >
            <TabList mb={4} gap={2}>
              <Tab fontSize={{ base: 'sm', md: 'md' }} px={{ base: 3, md: 4 }}>
                Top Players
              </Tab>
              <Tab fontSize={{ base: 'sm', md: 'md' }} px={{ base: 3, md: 4 }}>
                My Stats
              </Tab>
            </TabList>

            <TabPanels>
              {/* ---- Tab 1: Top Players ---- */}
              <TabPanel px={0}>
                {leaderboard.length === 0 ? (
                  <Text textAlign="center" color="gray.500" py={8}>
                    No games played yet. Be the first!
                  </Text>
                ) : (
                  <Box overflowX="auto" maxW="100%">
                    <Table variant="simple" size="sm">
                      <Thead>
                        <Tr>
                          <Th color="gray.400">#</Th>
                          <Th color="gray.400">Player</Th>
                          <Th color="gray.400" isNumeric>
                            Games
                          </Th>
                          <Th color="gray.400" isNumeric>
                            Wins
                          </Th>
                          <Th color="gray.400" isNumeric>
                            Win%
                          </Th>
                          <Th
                            color="gray.400"
                            isNumeric
                            display={{ base: 'none', md: 'table-cell' }}
                          >
                            Avg Score
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {leaderboard.map((entry) => {
                          const medal = rankColor(entry.rank);
                          const isMe = entry.guestId === guestId;
                          return (
                            <Tr key={entry.guestId} bg={isMe ? 'green.900' : undefined}>
                              <Td>
                                <Text
                                  fontWeight="bold"
                                  color={medal ?? 'gray.400'}
                                  fontSize={medal ? 'lg' : 'md'}
                                >
                                  {entry.rank}
                                </Text>
                              </Td>
                              <Td maxW={{ base: '100px', md: '200px' }}>
                                <Text fontWeight={isMe ? 'bold' : 'normal'} isTruncated>
                                  {entry.username}
                                </Text>
                              </Td>
                              <Td isNumeric>{entry.gamesPlayed}</Td>
                              <Td isNumeric fontWeight="semibold" color="green.300">
                                {entry.wins}
                              </Td>
                              <Td isNumeric>{entry.winRate}%</Td>
                              <Td isNumeric display={{ base: 'none', md: 'table-cell' }}>
                                {entry.avgScore}
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>
                )}
              </TabPanel>

              {/* ---- Tab 2: My Stats (F-238) ---- */}
              <TabPanel px={0}>
                {!stats || stats.gamesPlayed === 0 ? (
                  <Text textAlign="center" color="gray.500" py={8}>
                    No games played yet. Join a room and play!
                  </Text>
                ) : (
                  <VStack spacing={6} align="stretch">
                    {/* Summary cards */}
                    <Flex wrap="wrap" gap={4} justify="center">
                      <StatCard label="Games" value={stats.gamesPlayed} />
                      <StatCard label="Wins" value={stats.wins} color="green.300" />
                      <StatCard label="Losses" value={stats.losses} color="red.300" />
                      <StatCard label="Win Rate" value={`${stats.winRate}%`} />
                      <StatCard label="Avg Score" value={stats.avgScore} />
                    </Flex>

                    {/* Recent games */}
                    <VStack spacing={3} align="stretch">
                      <Text fontSize="lg" fontWeight="semibold" color="gray.300">
                        Recent Games
                      </Text>
                      {stats.recentGames.length === 0 ? (
                        <Text color="gray.500" fontSize="sm">
                          No recent games.
                        </Text>
                      ) : (
                        <Box overflowX="auto">
                          <Table variant="simple" size="sm">
                            <Thead>
                              <Tr>
                                <Th color="gray.400">Date</Th>
                                <Th color="gray.400" isNumeric>
                                  Players
                                </Th>
                                <Th color="gray.400" isNumeric>
                                  Score
                                </Th>
                                <Th color="gray.400">Result</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {stats.recentGames.map((game, i) => (
                                <Tr key={`${game.roomCode}-${i}`}>
                                  <Td fontSize="xs" color="gray.400">
                                    {formatDate(game.endedAt)}
                                  </Td>
                                  <Td isNumeric>{game.playerCount}</Td>
                                  <Td isNumeric>{game.myScore}</Td>
                                  <Td>
                                    <Badge colorScheme={game.isWin ? 'green' : 'red'} fontSize="xs">
                                      {game.isWin ? 'WIN' : 'LOSS'}
                                    </Badge>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      )}
                    </VStack>
                  </VStack>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        )}
      </VStack>
    </Box>
  );
};

// ============================================================
// StatCard helper component
// ============================================================

const StatCard: FC<{ label: string; value: string | number; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <Box
    bg="gray.800"
    borderRadius="lg"
    px={{ base: 3, md: 5 }}
    py={3}
    textAlign="center"
    minW={{ base: '70px', md: '100px' }}
  >
    <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="bold" color={color ?? 'white'}>
      {value}
    </Text>
    <Text fontSize="xs" color="gray.500" textTransform="uppercase">
      {label}
    </Text>
  </Box>
);

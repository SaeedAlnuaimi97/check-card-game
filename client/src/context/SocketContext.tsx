import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  FC,
  ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import socket from '../services/socket';
import { getOrCreateGuestId, clearGuestId } from '../utils/fingerprint';
import type { Card } from '../types/card.types';
import type {
  ClientGameState,
  PeekedCard,
  RoomData,
  ActionType,
  SpecialEffectType,
  WaitingForSpecialEffectPayload,
  SpecialEffectResolvedPayload,
  BurnResultPayload,
  CheckCalledPayload,
  RoundEndedPayload,
  GameEndedPayload,
} from '../types/game.types';
import type { SlotLabel } from '../types/player.types';

// ============================================================
// Debug Mode
// ============================================================

export const DEBUG_MODE = false;

// ============================================================
// Types
// ============================================================

interface YourTurnData {
  playerId: string;
  canCheck: boolean;
  availableActions: ActionType[];
  turnStartedAt?: number;
}

interface SocketContextValue {
  isConnected: boolean;
  playerId: string | null;
  username: string | null;
  roomData: RoomData | null;
  gameState: ClientGameState | null;
  peekedCards: PeekedCard[] | null;
  isMyTurn: boolean;
  turnData: YourTurnData | null;
  /** Card drawn from deck or taken from discard, pending discard choice (F-037, F-041) */
  drawnCard: Card | null;
  /** True when the drawn card was taken from the discard pile (must swap, can't discard) */
  drawnFromDiscard: boolean;
  /** Pending special effect data, or null if none (F-054) */
  pendingEffect: WaitingForSpecialEffectPayload | null;
  /** Last burn result received */
  lastBurnResult: BurnResultPayload | null;
  /** Data from when someone called check (F-062) */
  checkCalledData: CheckCalledPayload | null;
  /** Round end results, including all hands and scores (F-070) */
  roundEndData: RoundEndedPayload | null;
  /** Game end results, including winner and loser (F-075) */
  gameEndData: GameEndedPayload | null;
  /** Last Red Jack swap result — both players get notified which slots were swapped */
  lastSwapResult: SpecialEffectResolvedPayload | null;
  /** Slots that were recently modified (swap, burn penalty, red king placement) — cleared after 2.5s */
  modifiedSlots: { playerId: string; slot: string }[];
  createRoom: (username: string) => Promise<{ success: boolean; error?: string }>;
  joinRoom: (roomCode: string, username: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  startGame: (targetScore?: number) => Promise<{ success: boolean; error?: string }>;
  /** Host starts the next round after round-end modal */
  startNextRound: () => Promise<{ success: boolean; error?: string }>;
  /** Host ends the game early during round-end phase */
  endGame: () => Promise<{ success: boolean; error?: string }>;
  /** Host kicks a player from the lobby (F-203/F-306) */
  kickPlayer: (targetPlayerId: string) => Promise<{ success: boolean; error?: string }>;
  /** Host adds a bot to the lobby (F-300/F-301) */
  addBot: (difficulty: 'easy' | 'expert') => Promise<{ success: boolean; error?: string }>;
  /** Host removes a bot from the lobby (F-300/F-301) */
  removeBot: (botPlayerId: string) => Promise<{ success: boolean; error?: string }>;
  /** Host pauses the game (F-272) */
  pauseGame: () => Promise<{ success: boolean; error?: string }>;
  /** Host resumes the game (F-273) */
  resumeGame: () => Promise<{ success: boolean; error?: string }>;
  endPeek: () => Promise<{ success: boolean; error?: string }>;
  /** Call check at the start of your turn (F-059) */
  callCheck: () => Promise<{ success: boolean; error?: string }>;
  performAction: (
    actionType: ActionType,
    slot?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** After drawing from deck or taking from discard, choose to swap with a hand slot or discard the drawn card (F-038, F-042) */
  discardChoice: (slot: SlotLabel | null) => Promise<{ success: boolean; error?: string }>;
  /** Undo a pending take-from-discard action — puts the card back on the discard pile */
  undoTakeDiscard: () => Promise<{ success: boolean; error?: string }>;
  /** Red Jack: swap or skip (F-049) */
  redJackSwap: (
    skip: boolean,
    mySlot?: string,
    targetPlayerId?: string,
    targetSlot?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Red Queen: peek at own slot (F-050) */
  redQueenPeek: (slot: string) => Promise<{ success: boolean; card?: Card; error?: string }>;
  /** Red King: choose what to do with 2 drawn cards (F-051) */
  redKingChoice: (choice: {
    type: 'returnBoth' | 'keepOne' | 'keepBoth';
    keepIndex?: 0 | 1;
    replaceSlot?: string;
    replaceSlots?: [string, string];
  }) => Promise<{ success: boolean; error?: string }>;
  /** Debug: peek at any player's card at a given slot */
  debugPeek: (
    targetPlayerId: string,
    slot: string,
  ) => Promise<{ success: boolean; card?: Card; error?: string }>;
  /** Clear round end data (used by UI after showing modal) */
  clearRoundEndData: () => void;
  /** Clear game end data (used by UI after showing modal) */
  clearGameEndData: () => void;
  /** Username retrieved from the server for a returning guest (via identifyGuest socket event) */
  storedUsername: string | null;
  /**
   * Delete this guest's profile + scoreboard data from the server, clear the
   * local guestId, and reset storedUsername so the user is treated as new.
   */
  deleteGuestProfile: () => Promise<{ success: boolean; error?: string }>;
  /** Manually clear the cached storedUsername (e.g. after deletion) */
  clearStoredUsername: () => void;
  /** Attempt to rejoin a room by room code (used by /game/:roomCode route) */
  rejoinWithCode: (roomCode: string) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: FC<SocketProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [peekedCards, setPeekedCards] = useState<PeekedCard[] | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [turnData, setTurnData] = useState<YourTurnData | null>(null);
  const [drawnCard, setDrawnCard] = useState<Card | null>(null);
  const [drawnFromDiscard, setDrawnFromDiscard] = useState(false);
  const [pendingEffect, setPendingEffect] = useState<WaitingForSpecialEffectPayload | null>(null);
  const [lastBurnResult, setLastBurnResult] = useState<BurnResultPayload | null>(null);
  const [lastSwapResult, setLastSwapResult] = useState<SpecialEffectResolvedPayload | null>(null);
  const [modifiedSlots, setModifiedSlots] = useState<{ playerId: string; slot: string }[]>([]);
  const [checkCalledData, setCheckCalledData] = useState<CheckCalledPayload | null>(null);
  const [roundEndData, setRoundEndData] = useState<RoundEndedPayload | null>(null);
  const [gameEndData, setGameEndData] = useState<GameEndedPayload | null>(null);
  const [storedUsername, setStoredUsername] = useState<string | null>(null);

  // Use a ref for navigate to avoid re-registering socket listeners
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Use a ref for playerId so socket listeners always have the latest value
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;

  // Refs for room data so reconnection logic can access latest values
  const roomDataRef = useRef(roomData);
  roomDataRef.current = roomData;

  const usernameRef = useRef(username);
  usernameRef.current = username;

  // Connect socket on mount
  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      setIsConnected(true);

      // Identify this client's guestId to the server and retrieve stored username
      socket.emit(
        'identifyGuest',
        { guestId: getOrCreateGuestId() },
        (response: { username?: string }) => {
          if (response?.username) {
            console.log('[identifyGuest] Returning user recognized:', response.username);
            setStoredUsername(response.username);
          }
        },
      );

      // Attempt to rejoin room if we have stored session credentials
      const storedPlayerId = localStorage.getItem('playerId');
      const storedRoomCode = localStorage.getItem('roomCode');
      if (storedPlayerId && storedRoomCode) {
        console.log(
          `[reconnect] Attempting rejoin: player=${storedPlayerId} room=${storedRoomCode}`,
        );
        socket.emit(
          'rejoinRoom',
          { playerId: storedPlayerId, roomCode: storedRoomCode },
          (response: {
            success: boolean;
            room?: RoomData;
            gameState?: ClientGameState;
            drawnCard?: Card | null;
            drawnFromDiscard?: boolean;
            pendingEffect?: WaitingForSpecialEffectPayload | null;
            error?: string;
          }) => {
            if (response.success) {
              console.log('[reconnect] Rejoin successful, room status:', response.room?.status);
              setPlayerId(storedPlayerId);
              setUsername(localStorage.getItem('username') || 'Player');
              if (response.room) {
                setRoomData(response.room);
              }
              if (response.gameState) {
                setGameState(response.gameState);
                // Restore mid-turn state if the player disconnected during their turn
                if (response.drawnCard) {
                  setDrawnCard(response.drawnCard);
                  setDrawnFromDiscard(response.drawnFromDiscard === true);
                }
                if (response.pendingEffect) {
                  setPendingEffect(response.pendingEffect);
                }
                // Navigate to game board for an active game
                navigateRef.current('/game');
              } else if (response.room?.status === 'lobby') {
                // Navigate back to lobby (e.g. player refreshed while waiting)
                navigateRef.current('/room');
              }
            } else {
              console.log('[reconnect] Rejoin failed:', response.error);
              // Clear stale session data so the home page shows normally
              localStorage.removeItem('playerId');
              localStorage.removeItem('roomCode');
              localStorage.removeItem('username');
            }
          },
        );
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('roomUpdated', (data: RoomData) => {
      setRoomData(data);
    });

    socket.on('error', (data: { message: string }) => {
      console.error('Socket error:', data.message);
    });

    socket.on('gameStarted', (data: { gameState: ClientGameState; peekedCards: PeekedCard[] }) => {
      console.log('Game started, peeked cards:', data.peekedCards);
      setGameState(data.gameState);
      setPeekedCards(data.peekedCards);
      setIsMyTurn(false);
      setTurnData(null);
      setCheckCalledData(null);
      setRoundEndData(null);
      setGameEndData(null);
      setDrawnCard(null);
      setDrawnFromDiscard(false);
      setPendingEffect(null);
      setLastBurnResult(null);
      navigateRef.current('/game');
    });

    socket.on('gameStateUpdated', (data: ClientGameState) => {
      console.log('Game state updated, phase:', data.phase);
      setGameState(data);

      // Determine if it's still this player's turn based on game state
      const currentTurnPlayer = data.players[data.currentTurnIndex];
      const stillMyTurn = currentTurnPlayer?.playerId === playerIdRef.current;

      if (!stillMyTurn) {
        // Turn has changed to another player — clear turn state
        setIsMyTurn(false);
        setTurnData(null);
        // Clear drawn card — our turn has ended
        setDrawnCard(null);
        setDrawnFromDiscard(false);
        // Clear burn result from previous turn
        setLastBurnResult(null);
      }
    });

    socket.on('yourTurn', (data: YourTurnData) => {
      console.log('Your turn!', data);
      setIsMyTurn(true);
      setTurnData(data);
      // Also update gameState.turnStartedAt as fallback in case
      // gameStateUpdated arrives before emitYourTurn sets the timestamp
      if (data.turnStartedAt != null) {
        setGameState((prev) => (prev ? { ...prev, turnStartedAt: data.turnStartedAt! } : prev));
      }
    });

    socket.on('cardDrawn', (data: { card: Card; fromDiscard?: boolean }) => {
      console.log('Card drawn:', data.card, data.fromDiscard ? '(from discard)' : '(from deck)');
      setDrawnCard(data.card);
      setDrawnFromDiscard(data.fromDiscard === true);
    });

    socket.on('burnResult', (data: BurnResultPayload) => {
      console.log('Burn result:', data.burnSuccess ? 'SUCCESS' : 'FAIL', data);
      setLastBurnResult(data);
    });

    socket.on('waitingForSpecialEffect', (data: WaitingForSpecialEffectPayload) => {
      console.log('Special effect triggered:', data.effect, data);
      setPendingEffect(data);
    });

    socket.on('specialEffectResolved', (data: SpecialEffectResolvedPayload) => {
      console.log('Special effect resolved:', data.effect, data.playerId);
      setPendingEffect(null);
      // Surface Red Jack swap details for toast notification
      if (data.effect === 'redJack' && !data.skipped) {
        setLastSwapResult(data);
      }
    });

    socket.on(
      'playerUsingSpecialEffect',
      (data: { playerId: string; effect: SpecialEffectType }) => {
        console.log(`Player ${data.playerId} is using ${data.effect} effect`);
      },
    );

    socket.on('playerLeftGame', (data: { username: string; gameEnded: boolean }) => {
      console.log(`Player ${data.username} left the game. Game ended: ${data.gameEnded}`);
      if (data.gameEnded) {
        setGameState(null);
        setPeekedCards(null);
        setDrawnCard(null);
        setDrawnFromDiscard(false);
        setPendingEffect(null);
        setLastBurnResult(null);
        setCheckCalledData(null);
        setRoundEndData(null);
        setGameEndData(null);
        setIsMyTurn(false);
        setTurnData(null);
        navigateRef.current('/');
      }
    });

    // Player temporarily disconnected (grace period active)
    socket.on('playerDisconnected', (data: { playerId: string; username: string }) => {
      console.log(`Player ${data.username} disconnected (grace period active)`);
    });

    // Player reconnected after grace period
    socket.on('playerReconnected', (data: { playerId: string; username: string }) => {
      console.log(`Player ${data.username} reconnected`);
    });

    // F-062: Someone called check
    socket.on('checkCalled', (data: CheckCalledPayload) => {
      console.log(`${data.username} called CHECK!`);
      setCheckCalledData(data);
    });

    // F-070: Round ended — all hands revealed, scores updated
    socket.on('roundEnded', (data: RoundEndedPayload) => {
      console.log('Round ended:', data);
      setRoundEndData(data);
      setIsMyTurn(false);
      setTurnData(null);
      setDrawnCard(null);
      setDrawnFromDiscard(false);
      setPendingEffect(null);
      setCheckCalledData(null);
    });

    // F-075: Game ended — final scores, winner, loser
    socket.on('gameEnded', (data: GameEndedPayload) => {
      console.log('Game ended:', data);
      setGameEndData(data);
      setIsMyTurn(false);
      setTurnData(null);
    });

    // Turn timed out — auto-skip notification
    socket.on('turnTimedOut', (data: { playerId: string; username: string }) => {
      console.log(`${data.username} (${data.playerId}) turn timed out`);
    });

    // F-274: Game paused notification
    socket.on('gamePaused', (data: { pausedBy: string; username: string }) => {
      console.log(`Game paused by ${data.username}`);
    });

    // F-274: Game resumed notification
    socket.on('gameResumed', (data: { turnStartedAt: number }) => {
      console.log('Game resumed, turnStartedAt:', data.turnStartedAt);
    });

    socket.on('slotsModified', (data: { changes: { playerId: string; slot: string }[] }) => {
      setModifiedSlots(data.changes);
      setTimeout(() => setModifiedSlots([]), 2500);
    });

    // F-203/F-306: Host kicked this player from the lobby
    socket.on('kicked', (_data: { roomCode: string; reason: string }) => {
      console.log('You were kicked from the room');
      // Clear all session/state so the player returns to the home page
      localStorage.removeItem('playerId');
      localStorage.removeItem('roomCode');
      localStorage.removeItem('username');
      setRoomData(null);
      setPlayerId(null);
      setUsername(null);
      setGameState(null);
      setPeekedCards(null);
      setDrawnCard(null);
      setDrawnFromDiscard(false);
      setPendingEffect(null);
      setLastBurnResult(null);
      setCheckCalledData(null);
      setRoundEndData(null);
      setGameEndData(null);
      setIsMyTurn(false);
      setTurnData(null);
      navigateRef.current('/');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('roomUpdated');
      socket.off('error');
      socket.off('gameStarted');
      socket.off('gameStateUpdated');
      socket.off('yourTurn');
      socket.off('cardDrawn');
      socket.off('burnResult');
      socket.off('waitingForSpecialEffect');
      socket.off('specialEffectResolved');
      socket.off('playerUsingSpecialEffect');
      socket.off('playerLeftGame');
      socket.off('playerDisconnected');
      socket.off('playerReconnected');
      socket.off('checkCalled');
      socket.off('roundEnded');
      socket.off('gameEnded');
      socket.off('turnTimedOut');
      socket.off('gamePaused');
      socket.off('gameResumed');
      socket.off('slotsModified');
      socket.off('kicked');
      socket.disconnect();
    };
  }, []);

  // ----------------------------------------------------------
  // Create Room
  // ----------------------------------------------------------
  const createRoom = useCallback((name: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      socket.emit(
        'createRoom',
        { username: name, guestId: getOrCreateGuestId() },
        (response: {
          success: boolean;
          roomCode?: string;
          playerId?: string;
          room?: RoomData;
          error?: string;
        }) => {
          if (response.success && response.playerId && response.roomCode) {
            setPlayerId(response.playerId);
            setUsername(name);
            // Persist for reconnection (localStorage survives tab close / browser restart)
            localStorage.setItem('playerId', response.playerId);
            localStorage.setItem('roomCode', response.roomCode);
            localStorage.setItem('username', name);
            if (response.room) {
              setRoomData(response.room);
            }
          }
          resolve({ success: response.success, error: response.error });
        },
      );
    });
  }, []);

  // ----------------------------------------------------------
  // Join Room
  // ----------------------------------------------------------
  const joinRoom = useCallback(
    (roomCode: string, name: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        socket.emit(
          'joinRoom',
          { roomCode, username: name, guestId: getOrCreateGuestId() },
          (response: { success: boolean; playerId?: string; room?: RoomData; error?: string }) => {
            if (response.success && response.playerId) {
              setPlayerId(response.playerId);
              setUsername(name);
              // Persist for reconnection (localStorage survives tab close / browser restart)
              localStorage.setItem('playerId', response.playerId);
              localStorage.setItem('roomCode', roomCode);
              localStorage.setItem('username', name);
              if (response.room) {
                setRoomData(response.room);
              }
            }
            resolve({ success: response.success, error: response.error });
          },
        );
      });
    },
    [],
  );

  // ----------------------------------------------------------
  // Leave Room
  // ----------------------------------------------------------
  const leaveRoom = useCallback(() => {
    if (roomData && playerId) {
      socket.emit('leaveRoom', { roomCode: roomData.roomCode, playerId });
    }
    // Clear local storage
    localStorage.removeItem('playerId');
    localStorage.removeItem('roomCode');
    localStorage.removeItem('username');
    setRoomData(null);
    setPlayerId(null);
    setUsername(null);
    setGameState(null);
    setPeekedCards(null);
    setDrawnCard(null);
    setDrawnFromDiscard(false);
    setPendingEffect(null);
    setLastBurnResult(null);
    setCheckCalledData(null);
    setRoundEndData(null);
    setGameEndData(null);
    setIsMyTurn(false);
    setTurnData(null);
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // Start Game
  // ----------------------------------------------------------
  const startGame = useCallback(
    (targetScore?: number): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'startGame',
          { roomCode: roomData.roomCode, playerId, targetScore },
          (response: { success: boolean; error?: string }) => {
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Start Next Round — host triggers next round after round-end (F-076)
  // ----------------------------------------------------------
  const startNextRound = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'startNextRound',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // End Game — host manually ends the game during roundEnd phase
  // ----------------------------------------------------------
  const endGame = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'endGame',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // Kick Player — host removes player from lobby (F-203/F-306)
  // ----------------------------------------------------------
  const kickPlayer = useCallback(
    (targetPlayerId: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'kickPlayer',
          { roomCode: roomData.roomCode, hostId: playerId, targetPlayerId },
          (response: { success: boolean; error?: string }) => {
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Add Bot — host adds a bot to the lobby (F-300/F-301)
  // ----------------------------------------------------------
  const addBot = useCallback(
    (difficulty: 'easy' | 'expert'): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'addBot',
          { roomCode: roomData.roomCode, hostId: playerId, difficulty },
          (response: { success: boolean; error?: string }) => {
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Remove Bot — host removes a bot from the lobby (F-300/F-301)
  // ----------------------------------------------------------
  const removeBot = useCallback(
    (botPlayerId: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'removeBot',
          { roomCode: roomData.roomCode, hostId: playerId, botPlayerId },
          (response: { success: boolean; error?: string }) => {
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Pause Game — host pauses the game (F-272)
  // ----------------------------------------------------------
  const pauseGame = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'pauseGame',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // Resume Game — host resumes the game (F-273)
  // ----------------------------------------------------------
  const resumeGame = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'resumeGame',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // End Peek — transition from peeking to playing (F-031 → F-033)
  // ----------------------------------------------------------
  const endPeek = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'endPeek',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          setPeekedCards(null);
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // Call Check — call check at start of turn (F-059)
  // ----------------------------------------------------------
  const callCheck = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'callCheck',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // Perform Action — send a player action to the server (F-035)
  // ----------------------------------------------------------
  const performAction = useCallback(
    (actionType: ActionType, slot?: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        const action: { type: ActionType; slot?: string } = { type: actionType };
        if (slot) {
          action.slot = slot;
        }
        socket.emit(
          'playerAction',
          { roomCode: roomData.roomCode, playerId, action },
          (response: { success: boolean; error?: string }) => {
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Discard Choice — after drawing, swap with hand slot or discard drawn card (F-038)
  // ----------------------------------------------------------
  const discardChoice = useCallback(
    (slot: SlotLabel | null): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'discardChoice',
          { roomCode: roomData.roomCode, playerId, slot },
          (response: { success: boolean; error?: string }) => {
            setDrawnCard(null);
            setDrawnFromDiscard(false);
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Undo Take Discard — cancel pending take-from-discard action
  // ----------------------------------------------------------
  const undoTakeDiscard = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'undoTakeDiscard',
        { roomCode: roomData.roomCode, playerId },
        (response: { success: boolean; error?: string }) => {
          if (response.success) {
            setDrawnCard(null);
            setDrawnFromDiscard(false);
          }
          resolve(response);
        },
      );
    });
  }, [roomData, playerId]);

  // ----------------------------------------------------------
  // Red Jack Swap — swap or skip (F-049)
  // ----------------------------------------------------------
  const redJackSwap = useCallback(
    (
      skip: boolean,
      mySlot?: string,
      targetPlayerId?: string,
      targetSlot?: string,
    ): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'redJackSwap',
          {
            roomCode: roomData.roomCode,
            playerId,
            skip,
            mySlot,
            targetPlayerId,
            targetSlot,
          },
          (response: { success: boolean; error?: string }) => {
            if (response.success) {
              setPendingEffect(null);
            }
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Red Queen Peek — peek at own slot (F-050)
  // ----------------------------------------------------------
  const redQueenPeek = useCallback(
    (slot: string): Promise<{ success: boolean; card?: Card; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'redQueenPeek',
          { roomCode: roomData.roomCode, playerId, slot },
          (response: { success: boolean; card?: Card; error?: string }) => {
            // Do NOT clear pendingEffect here — the modal needs to stay open
            // for the 3-second peek display. GameBoard handles clearing it
            // after the peek timer expires.
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Red King Choice — choose what to do with 2 drawn cards (F-051)
  // ----------------------------------------------------------
  const redKingChoice = useCallback(
    (choice: {
      type: 'returnBoth' | 'keepOne' | 'keepBoth';
      keepIndex?: 0 | 1;
      replaceSlot?: string;
      replaceSlots?: [string, string];
    }): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData || !playerId) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'redKingChoice',
          { roomCode: roomData.roomCode, playerId, choice },
          (response: { success: boolean; error?: string }) => {
            if (response.success) {
              setPendingEffect(null);
            }
            resolve(response);
          },
        );
      });
    },
    [roomData, playerId],
  );

  // ----------------------------------------------------------
  // Debug Peek — reveal any card (debug only)
  // ----------------------------------------------------------
  const debugPeek = useCallback(
    (
      targetPlayerId: string,
      slot: string,
    ): Promise<{ success: boolean; card?: Card; error?: string }> => {
      return new Promise((resolve) => {
        if (!roomData) {
          resolve({ success: false, error: 'Not in a room' });
          return;
        }
        socket.emit(
          'debugPeek',
          { roomCode: roomData.roomCode, targetPlayerId, slot },
          (response: { success: boolean; card?: Card; error?: string }) => {
            resolve(response);
          },
        );
      });
    },
    [roomData],
  );

  // ----------------------------------------------------------
  // Clear round/game end data (for UI after showing modals)
  // ----------------------------------------------------------
  const clearRoundEndData = useCallback(() => {
    setRoundEndData(null);
  }, []);

  const clearGameEndData = useCallback(() => {
    setGameEndData(null);
  }, []);

  // ----------------------------------------------------------
  // Rejoin With Code — called by /game/:roomCode route (GameRejoin page)
  // ----------------------------------------------------------
  const rejoinWithCode = useCallback((roomCode: string) => {
    const storedPlayerId = localStorage.getItem('playerId');
    if (!storedPlayerId) {
      // No stored identity — redirect to lobby join page
      navigateRef.current(`/lobby/${roomCode}`, { replace: true });
      return;
    }

    // Update localStorage so future reconnects use this room code
    localStorage.setItem('roomCode', roomCode);

    const doRejoin = () => {
      socket.emit(
        'rejoinRoom',
        { playerId: storedPlayerId, roomCode },
        (response: {
          success: boolean;
          room?: RoomData;
          gameState?: ClientGameState;
          drawnCard?: Card | null;
          drawnFromDiscard?: boolean;
          pendingEffect?: WaitingForSpecialEffectPayload | null;
          error?: string;
        }) => {
          if (response.success) {
            console.log('[rejoinWithCode] Rejoin successful, status:', response.room?.status);
            setPlayerId(storedPlayerId);
            setUsername(localStorage.getItem('username') || 'Player');
            if (response.room) {
              setRoomData(response.room);
            }
            if (response.gameState) {
              setGameState(response.gameState);
              if (response.drawnCard) {
                setDrawnCard(response.drawnCard);
                setDrawnFromDiscard(response.drawnFromDiscard === true);
              }
              if (response.pendingEffect) {
                setPendingEffect(response.pendingEffect);
              }
              navigateRef.current('/game', { replace: true });
            } else if (response.room?.status === 'lobby') {
              navigateRef.current('/room', { replace: true });
            }
          } else {
            console.log('[rejoinWithCode] Rejoin failed:', response.error);
            localStorage.removeItem('playerId');
            localStorage.removeItem('roomCode');
            localStorage.removeItem('username');
            navigateRef.current(`/lobby/${roomCode}`, { replace: true });
          }
        },
      );
    };

    if (socket.connected) {
      doRejoin();
    } else {
      // Wait for the socket to connect, then attempt rejoin.
      // Use a one-time listener that fires after SocketContext's own connect handler.
      const onConnect = () => {
        socket.off('connect', onConnect);
        // Small delay to let SocketContext's main connect handler run first.
        // If it already handled the rejoin (because localStorage had the right roomCode),
        // gameState/roomData will be set and the effect in GameRejoin will navigate.
        setTimeout(() => {
          // Only attempt if the main connect handler hasn't already restored state
          if (!roomDataRef.current && !playerIdRef.current) {
            doRejoin();
          }
        }, 150);
      };
      socket.on('connect', onConnect);
    }
  }, []);

  // ----------------------------------------------------------
  // clearStoredUsername — reset cached identity in context
  // ----------------------------------------------------------
  const clearStoredUsername = useCallback(() => {
    setStoredUsername(null);
  }, []);

  // ----------------------------------------------------------
  // deleteGuestProfile — wipe server profile + local guestId
  // ----------------------------------------------------------
  const deleteGuestProfile = useCallback((): Promise<{ success: boolean; error?: string }> => {
    const guestId = getOrCreateGuestId();
    return new Promise((resolve) => {
      socket.emit(
        'deleteGuestProfile',
        { guestId },
        (response: { success: boolean; error?: string }) => {
          if (response.success) {
            clearGuestId();
            setStoredUsername(null);
          }
          resolve(response);
        },
      );
    });
  }, []);

  const value: SocketContextValue = {
    isConnected,
    playerId,
    username,
    roomData,
    gameState,
    peekedCards,
    isMyTurn,
    turnData,
    drawnCard,
    drawnFromDiscard,
    pendingEffect,
    lastBurnResult,
    lastSwapResult,
    modifiedSlots,
    checkCalledData,
    roundEndData,
    gameEndData,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    startNextRound,
    endGame,
    kickPlayer,
    addBot,
    removeBot,
    pauseGame,
    resumeGame,
    endPeek,
    callCheck,
    performAction,
    discardChoice,
    undoTakeDiscard,
    redJackSwap,
    redQueenPeek,
    redKingChoice,
    debugPeek,
    clearRoundEndData,
    clearGameEndData,
    storedUsername,
    deleteGuestProfile,
    clearStoredUsername,
    rejoinWithCode,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

// ============================================================
// Hook
// ============================================================

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

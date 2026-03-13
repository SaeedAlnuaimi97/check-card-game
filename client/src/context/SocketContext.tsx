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
import type { Card } from '../types/card.types';
import type {
  ClientGameState,
  PeekedCard,
  RoomData,
  ActionType,
  SpecialEffectType,
  WaitingForSpecialEffectPayload,
  BurnResultPayload,
  CheckCalledPayload,
  RoundEndedPayload,
  GameEndedPayload,
} from '../types/game.types';
import type { SlotLabel } from '../types/player.types';

// ============================================================
// Debug Mode
// ============================================================

export const DEBUG_MODE = true;

// ============================================================
// Types
// ============================================================

interface YourTurnData {
  playerId: string;
  canCheck: boolean;
  availableActions: ActionType[];
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
  createRoom: (username: string) => Promise<{ success: boolean; error?: string }>;
  joinRoom: (roomCode: string, username: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  startGame: () => Promise<{ success: boolean; error?: string }>;
  endPeek: () => Promise<{ success: boolean; error?: string }>;
  /** Call check at the start of your turn (F-059) */
  callCheck: () => Promise<{ success: boolean; error?: string }>;
  performAction: (
    actionType: ActionType,
    slot?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** After drawing from deck or taking from discard, choose to swap with a hand slot or discard the drawn card (F-038, F-042) */
  discardChoice: (slot: SlotLabel | null) => Promise<{ success: boolean; error?: string }>;
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
  const [checkCalledData, setCheckCalledData] = useState<CheckCalledPayload | null>(null);
  const [roundEndData, setRoundEndData] = useState<RoundEndedPayload | null>(null);
  const [gameEndData, setGameEndData] = useState<GameEndedPayload | null>(null);

  // Use a ref for navigate to avoid re-registering socket listeners
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Connect socket on mount
  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      setIsConnected(true);
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
      // Clear drawn card — turn has ended or state changed
      setDrawnCard(null);
      setDrawnFromDiscard(false);
      // Clear burn result from previous turn
      setLastBurnResult(null);
      // Reset turn state — will be re-set by 'yourTurn' if it's still our turn
      setIsMyTurn(false);
      setTurnData(null);
    });

    socket.on('yourTurn', (data: YourTurnData) => {
      console.log('Your turn!', data);
      setIsMyTurn(true);
      setTurnData(data);
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

    socket.on('specialEffectResolved', (data: { effect: SpecialEffectType; playerId: string }) => {
      console.log('Special effect resolved:', data.effect, data.playerId);
      setPendingEffect(null);
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
      socket.off('checkCalled');
      socket.off('roundEnded');
      socket.off('gameEnded');
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
        { username: name },
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
          { roomCode, username: name },
          (response: { success: boolean; playerId?: string; room?: RoomData; error?: string }) => {
            if (response.success && response.playerId) {
              setPlayerId(response.playerId);
              setUsername(name);
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
  const startGame = useCallback((): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!roomData || !playerId) {
        resolve({ success: false, error: 'Not in a room' });
        return;
      }
      socket.emit(
        'startGame',
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
    checkCalledData,
    roundEndData,
    gameEndData,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    endPeek,
    callCheck,
    performAction,
    discardChoice,
    redJackSwap,
    redQueenPeek,
    redKingChoice,
    debugPeek,
    clearRoundEndData,
    clearGameEndData,
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

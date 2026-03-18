import { describe, it, expect } from 'vitest';
import {
  chooseBotAction,
  chooseBotSpecialEffectResponse,
  shouldBotCallCheck,
} from '../game/BotPlayer';
import type { Card, GameState, PlayerState } from '../types/game.types';

// ============================================================
// Helpers
// ============================================================

function makeCard(
  id: string,
  rank: Card['rank'] = '5',
  suit: Card['suit'] = '♠',
  value?: number,
): Card {
  const isRed = suit === '♥' || suit === '♦';
  const computedValue = (() => {
    if (rank === 'A') return 1;
    if (rank === '10' && isRed) return 0;
    if (['10', 'J', 'Q', 'K'].includes(rank)) return 10;
    return parseInt(rank, 10) || 5;
  })();
  return { id, suit, rank, value: value ?? computedValue, isRed };
}

function makePlayer(
  playerId: string,
  hand: { slot: string; card: Card }[],
  opts: { isBot?: boolean; botDifficulty?: 'easy' | 'expert' } = {},
): PlayerState {
  return {
    playerId,
    username: playerId,
    hand,
    peekedSlots: [],
    totalScore: 0,
    ...opts,
  };
}

function createTestGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    deck: [],
    discardPile: [],
    players: [],
    currentTurnIndex: 0,
    checkCalledBy: null,
    checkCalledAtIndex: null,
    roundNumber: 1,
    scores: {},
    phase: 'playing',
    drawnCard: null,
    drawnByPlayerId: null,
    drawnSource: null,
    pendingEffect: null,
    turnStartedAt: null,
    gameStartedAt: null,
    paused: false,
    pausedBy: null,
    pausedAt: null,
    turnTimeRemainingMs: null,
    targetScore: 70,
    ...overrides,
  };
}

// ============================================================
// chooseBotAction — Easy Bot
// ============================================================

describe('chooseBotAction — easy', () => {
  it('returns drawDeck with discardSlot null when bot has no hand', () => {
    const bot = makePlayer('bot1', [], { isBot: true, botDifficulty: 'easy' });
    const gs = createTestGameState({ players: [bot] });
    const action = chooseBotAction(gs, 'bot1', 'easy');
    expect(action.type).toBe('drawDeck');
    expect(action.discardSlot).toBeNull();
  });

  it('always returns a valid action type', () => {
    const hand = [
      { slot: 'A', card: makeCard('c1', '5') },
      { slot: 'B', card: makeCard('c2', '8') },
      { slot: 'C', card: makeCard('c3', '3') },
      { slot: 'D', card: makeCard('c4', 'K') },
    ];
    const bot = makePlayer('bot1', hand, { isBot: true, botDifficulty: 'easy' });
    const topDiscard = makeCard('d1', '7');
    const gs = createTestGameState({
      players: [bot],
      discardPile: [topDiscard],
    });

    // Run multiple times to cover probabilistic branches
    for (let i = 0; i < 20; i++) {
      const action = chooseBotAction(gs, 'bot1', 'easy');
      expect(['drawDeck', 'takeDiscard', 'burn']).toContain(action.type);
      if (action.type === 'burn') expect(action.burnSlot).toBeDefined();
      if (action.type === 'takeDiscard') expect(action.swapSlot).toBeDefined();
      if (action.type === 'drawDeck') expect(action.discardSlot).toBeNull(); // easy always discards
    }
  });
});

// ============================================================
// chooseBotAction — Expert Bot
// ============================================================

describe('chooseBotAction — expert', () => {
  it('attempts burn when rank matches discard top', () => {
    const matchCard = makeCard('c1', 'Q', '♠', 10);
    const topDiscard = makeCard('d1', 'Q', '♥', 10);
    const hand = [
      { slot: 'A', card: matchCard },
      { slot: 'B', card: makeCard('c2', '4', '♠', 4) },
    ];
    const bot = makePlayer('bot1', hand, { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      discardPile: [topDiscard],
    });
    const action = chooseBotAction(gs, 'bot1', 'expert');
    expect(action.type).toBe('burn');
    expect(action.burnSlot).toBe('A');
  });

  it('takes discard when top card value ≤ 2', () => {
    const hand = [
      { slot: 'A', card: makeCard('c1', '5', '♠', 5) },
      { slot: 'B', card: makeCard('c2', 'K', '♠', 10) }, // highest
    ];
    const topDiscard = makeCard('d1', 'A', '♥', 1); // value 1, rank A - won't match K
    const bot = makePlayer('bot1', hand, { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      discardPile: [topDiscard],
    });
    const action = chooseBotAction(gs, 'bot1', 'expert');
    expect(action.type).toBe('takeDiscard');
    expect(action.swapSlot).toBe('B');
  });

  it('takes discard when top card is significantly better than highest hand card', () => {
    const hand = [
      { slot: 'A', card: makeCard('c1', '3', '♠', 3) },
      { slot: 'B', card: makeCard('c2', 'K', '♠', 10) }, // highest value = 10
    ];
    // discard value = 4, which is < 10 - 3 = 7 — should take
    const topDiscard = makeCard('d1', '4', '♥', 4);
    const bot = makePlayer('bot1', hand, { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      discardPile: [topDiscard],
    });
    const action = chooseBotAction(gs, 'bot1', 'expert');
    expect(action.type).toBe('takeDiscard');
    expect(action.swapSlot).toBe('B');
  });

  it('draws from deck swapping highest when discard is not beneficial', () => {
    const hand = [
      { slot: 'A', card: makeCard('c1', '2', '♠', 2) }, // lowest
      { slot: 'B', card: makeCard('c2', '8', '♠', 8) }, // highest
    ];
    const topDiscard = makeCard('d1', '7', '♠', 7); // not much better than highest (8-3=5, 7 > 5)
    const bot = makePlayer('bot1', hand, { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({
      players: [bot],
      discardPile: [topDiscard],
    });
    const action = chooseBotAction(gs, 'bot1', 'expert');
    expect(action.type).toBe('drawDeck');
    expect(action.discardSlot).toBe('B'); // highest slot, not lowest
  });

  it('returns drawDeck with null discardSlot when no hand', () => {
    const bot = makePlayer('bot1', [], { isBot: true, botDifficulty: 'expert' });
    const gs = createTestGameState({ players: [bot] });
    const action = chooseBotAction(gs, 'bot1', 'expert');
    expect(action.type).toBe('drawDeck');
    expect(action.discardSlot).toBeNull();
  });
});

// ============================================================
// chooseBotAction — unknown player ID
// ============================================================

describe('chooseBotAction — unknown player', () => {
  it('returns drawDeck safely for unknown player', () => {
    const gs = createTestGameState({ players: [] });
    const action = chooseBotAction(gs, 'ghost', 'expert');
    expect(action.type).toBe('drawDeck');
    expect(action.discardSlot).toBeNull();
  });
});

// ============================================================
// chooseBotSpecialEffectResponse — redJack
// ============================================================

describe('chooseBotSpecialEffectResponse — redJack', () => {
  it('easy bot always skips red jack', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', 'K', '♠', 10) }]);
    const gs = createTestGameState({ players: [bot] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'easy', 'redJack');
    expect(resp.skip).toBe(true);
  });

  it('expert bot skips when no opponents exist', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', 'K', '♠', 10) }]);
    const gs = createTestGameState({ players: [bot] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redJack');
    expect(resp.skip).toBe(true);
  });

  it('expert bot skips when bot has no cards', () => {
    const bot = makePlayer('bot1', []);
    const opponent = makePlayer('opp1', [{ slot: 'A', card: makeCard('c2', '3', '♥', 3) }]);
    const gs = createTestGameState({ players: [bot, opponent] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redJack');
    expect(resp.skip).toBe(true);
  });

  it('expert bot attempts swap when opponents exist', () => {
    const bot = makePlayer('bot1', [
      { slot: 'A', card: makeCard('c1', 'K', '♠', 10) }, // highest
    ]);
    const opponent = makePlayer('opp1', [{ slot: 'B', card: makeCard('c2', '2', '♦', 2) }]);
    const gs = createTestGameState({ players: [bot, opponent] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redJack');
    expect(resp.skip).toBe(false);
    expect(resp.ownSlot).toBe('A');
    expect(resp.targetPlayerId).toBe('opp1');
    expect(resp.targetSlot).toBe('B');
  });
});

// ============================================================
// chooseBotSpecialEffectResponse — redQueen
// ============================================================

describe('chooseBotSpecialEffectResponse — redQueen', () => {
  it('returns empty response when bot has no slots', () => {
    const bot = makePlayer('bot1', []);
    const gs = createTestGameState({ players: [bot] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'easy', 'redQueen');
    expect(resp.peekSlot).toBeUndefined();
  });

  it('returns a peekSlot from own hand (easy)', () => {
    const bot = makePlayer('bot1', [
      { slot: 'A', card: makeCard('c1', '5') },
      { slot: 'B', card: makeCard('c2', '9') },
    ]);
    const gs = createTestGameState({ players: [bot] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'easy', 'redQueen');
    expect(['A', 'B']).toContain(resp.peekSlot);
  });

  it('returns a peekSlot from own hand (expert)', () => {
    const bot = makePlayer('bot1', [{ slot: 'C', card: makeCard('c1', '3') }]);
    const gs = createTestGameState({ players: [bot] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redQueen');
    expect(resp.peekSlot).toBe('C');
  });
});

// ============================================================
// chooseBotSpecialEffectResponse — redKing
// ============================================================

describe('chooseBotSpecialEffectResponse — redKing', () => {
  it('easy bot returns both cards to deck (keepIndices=[], discardSlots=[])', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', '5', '♠', 5) }]);
    const gs = createTestGameState({ players: [bot] });
    const drawnCards: [Card, Card] = [makeCard('r1', '2', '♥', 2), makeCard('r2', '8', '♠', 8)];
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'easy', 'redKing', drawnCards);
    expect(resp.keepIndices).toEqual([]);
    expect(resp.discardSlots).toEqual([]);
  });

  it('returns empty response when redKingCards not provided', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', '5') }]);
    const gs = createTestGameState({ players: [bot] });
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redKing');
    expect(resp.keepIndices).toEqual([]);
    expect(resp.discardSlots).toEqual([]);
  });

  it('expert bot keeps better drawn card and replaces worst hand card', () => {
    // Hand: slot A = 10 (highest), slot B = 2
    const bot = makePlayer('bot1', [
      { slot: 'A', card: makeCard('c1', 'K', '♠', 10) }, // worst (highest value)
      { slot: 'B', card: makeCard('c2', '2', '♠', 2) },
    ]);
    const gs = createTestGameState({ players: [bot] });
    // drawn: card0 value=1, card1 value=8 — bestDrawn is card0 (idx 0)
    const drawnCards: [Card, Card] = [makeCard('r1', 'A', '♥', 1), makeCard('r2', '8', '♠', 8)];
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redKing', drawnCards);
    // bestDrawn.value=1 < worstCard.value=10 → keep
    expect(resp.keepIndices).toEqual([0]);
    expect(resp.discardSlots).toEqual(['A']);
  });

  it('expert bot discards drawn cards when they are not better than worst hand card', () => {
    // Hand: slot A = 3, slot B = 5 — highest is B (value 5)
    const bot = makePlayer('bot1', [
      { slot: 'A', card: makeCard('c1', '3', '♠', 3) },
      { slot: 'B', card: makeCard('c2', '5', '♠', 5) }, // highest
    ]);
    const gs = createTestGameState({ players: [bot] });
    // drawn: card0 value=6, card1 value=8 — bestDrawn is card0 (idx 0) with value=6
    // 6 is NOT < 5 → don't keep
    const drawnCards: [Card, Card] = [makeCard('r1', '6', '♠', 6), makeCard('r2', '8', '♠', 8)];
    const resp = chooseBotSpecialEffectResponse(gs, 'bot1', 'expert', 'redKing', drawnCards);
    expect(resp.keepIndices).toEqual([]);
    expect(resp.discardSlots).toEqual([]);
  });
});

// ============================================================
// shouldBotCallCheck
// ============================================================

describe('shouldBotCallCheck', () => {
  it('easy bot never calls check', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', '2', '♠', 2) }], {
      isBot: true,
      botDifficulty: 'easy',
    });
    const gs = createTestGameState({ players: [bot], currentTurnIndex: 0 });
    expect(shouldBotCallCheck(gs, 'bot1', 'easy')).toBe(false);
  });

  it('expert bot calls check when hand value is exactly 2', () => {
    const bot = makePlayer(
      'bot1',
      [
        { slot: 'A', card: makeCard('c1', 'A', '♠', 1) },
        { slot: 'B', card: makeCard('c2', 'A', '♥', 1) },
      ],
      { isBot: true, botDifficulty: 'expert' },
    );
    const gs = createTestGameState({ players: [bot], currentTurnIndex: 0 });
    expect(shouldBotCallCheck(gs, 'bot1', 'expert')).toBe(true);
  });

  it('expert bot calls check when hand value is 5', () => {
    const bot = makePlayer(
      'bot1',
      [
        { slot: 'A', card: makeCard('c1', '3', '♠', 3) },
        { slot: 'B', card: makeCard('c2', '2', '♠', 2) },
      ],
      { isBot: true, botDifficulty: 'expert' },
    );
    const gs = createTestGameState({ players: [bot], currentTurnIndex: 0 });
    expect(shouldBotCallCheck(gs, 'bot1', 'expert')).toBe(true);
  });

  it('expert bot calls check when hand value is exactly 6', () => {
    const bot = makePlayer(
      'bot1',
      [
        { slot: 'A', card: makeCard('c1', '3', '♠', 3) },
        { slot: 'B', card: makeCard('c2', '3', '♠', 3) },
      ],
      { isBot: true, botDifficulty: 'expert' },
    );
    const gs = createTestGameState({ players: [bot], currentTurnIndex: 0 });
    expect(shouldBotCallCheck(gs, 'bot1', 'expert')).toBe(true);
  });

  it('expert bot does not call check when hand value is 7', () => {
    const bot = makePlayer(
      'bot1',
      [
        { slot: 'A', card: makeCard('c1', '4', '♠', 4) },
        { slot: 'B', card: makeCard('c2', '3', '♠', 3) },
      ],
      { isBot: true, botDifficulty: 'expert' },
    );
    const gs = createTestGameState({ players: [bot], currentTurnIndex: 0 });
    expect(shouldBotCallCheck(gs, 'bot1', 'expert')).toBe(false);
  });

  it('expert bot does not call check when hand value is 1 (below range)', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', 'A', '♠', 1) }], {
      isBot: true,
      botDifficulty: 'expert',
    });
    const gs = createTestGameState({ players: [bot], currentTurnIndex: 0 });
    expect(shouldBotCallCheck(gs, 'bot1', 'expert')).toBe(false);
  });

  it('expert bot does not call check if check already called', () => {
    const bot = makePlayer('bot1', [{ slot: 'A', card: makeCard('c1', '3', '♠', 3) }], {
      isBot: true,
      botDifficulty: 'expert',
    });
    const gs = createTestGameState({
      players: [bot],
      currentTurnIndex: 0,
      checkCalledBy: 'someOtherPlayer',
    });
    expect(shouldBotCallCheck(gs, 'bot1', 'expert')).toBe(false);
  });
});

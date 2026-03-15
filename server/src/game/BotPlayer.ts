import type { GameState, SlotLabel, BotDifficulty, Card } from '../types/game.types';

// ============================================================
// Bot Action Types
// ============================================================

export type BotActionType = 'drawDeck' | 'takeDiscard' | 'burn';

export interface BotAction {
  type: BotActionType;
  /** For burn: slot to attempt burning */
  burnSlot?: SlotLabel;
  /** For drawDeck: after drawing, which slot to swap with (null = discard drawn card) */
  discardSlot?: SlotLabel | null;
  /** For takeDiscard: which hand slot to replace */
  swapSlot?: SlotLabel;
}

export interface BotSpecialEffectResponse {
  /** For Red Jack: skip (true) or swap; for Red Queen/King: always resolve */
  skip?: boolean;
  /** Red Jack: own slot to swap from */
  ownSlot?: SlotLabel;
  /** Red Jack: opponent player ID */
  targetPlayerId?: string;
  /** Red Jack: opponent slot */
  targetSlot?: SlotLabel;
  /** Red Queen: slot to peek */
  peekSlot?: SlotLabel;
  /** Red King: indices of drawn cards to keep (0-based in redKingCards array) */
  keepIndices?: number[];
  /** Red King: hand slots to discard (for cards being replaced) */
  discardSlots?: SlotLabel[];
}

// ============================================================
// Helpers
// ============================================================

function getCardValue(card: Card): number {
  return card.value;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getPlayerSlots(gameState: GameState, playerId: string): SlotLabel[] {
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) return [];
  return player.hand.map((h) => h.slot);
}

function getDiscardTopCard(gameState: GameState): Card | null {
  if (gameState.discardPile.length === 0) return null;
  return gameState.discardPile[gameState.discardPile.length - 1];
}

function canBurn(gameState: GameState, playerId: string, slot: SlotLabel): boolean {
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player) return false;
  const handSlot = player.hand.find((h) => h.slot === slot);
  if (!handSlot) return false;
  const topDiscard = getDiscardTopCard(gameState);
  if (!topDiscard) return false;
  // Burn succeeds when ranks match
  return handSlot.card.rank === topDiscard.rank;
}

function getLowestValueSlot(gameState: GameState, playerId: string): SlotLabel | null {
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player || player.hand.length === 0) return null;
  return player.hand.reduce((best, h) => (h.card.value < best.card.value ? h : best)).slot;
}

function getHighestValueSlot(gameState: GameState, playerId: string): SlotLabel | null {
  const player = gameState.players.find((p) => p.playerId === playerId);
  if (!player || player.hand.length === 0) return null;
  return player.hand.reduce((best, h) => (h.card.value > best.card.value ? h : best)).slot;
}

// ============================================================
// Easy Bot: Random valid actions
// ============================================================

function easyBotAction(gameState: GameState, botPlayerId: string): BotAction {
  const slots = getPlayerSlots(gameState, botPlayerId);
  if (slots.length === 0) return { type: 'drawDeck', discardSlot: null };

  // 30% chance to try a burn (random slot, doesn't check if it'll succeed)
  if (Math.random() < 0.3 && slots.length > 0) {
    const burnSlot = randomItem(slots);
    return { type: 'burn', burnSlot };
  }

  // 30% chance to take from discard
  if (Math.random() < 0.3 && getDiscardTopCard(gameState)) {
    const swapSlot = randomItem(slots);
    return { type: 'takeDiscard', swapSlot };
  }

  // Default: draw from deck, always discard the drawn card (safe)
  return { type: 'drawDeck', discardSlot: null };
}

// ============================================================
// Expert Bot: More strategic
// ============================================================

function expertBotAction(gameState: GameState, botPlayerId: string): BotAction {
  const slots = getPlayerSlots(gameState, botPlayerId);
  if (slots.length === 0) return { type: 'drawDeck', discardSlot: null };

  const topDiscard = getDiscardTopCard(gameState);
  const highestSlot = getHighestValueSlot(gameState, botPlayerId);
  const lowestSlot = getLowestValueSlot(gameState, botPlayerId);

  // 1. Burn if a match exists — always beneficial
  for (const slot of slots) {
    if (canBurn(gameState, botPlayerId, slot)) {
      return { type: 'burn', burnSlot: slot };
    }
  }

  // 2. Take discard if it's very low value (0-2) and we have a high card to replace
  if (topDiscard && getCardValue(topDiscard) <= 2 && highestSlot) {
    return { type: 'takeDiscard', swapSlot: highestSlot };
  }

  // 3. Take discard if it's clearly better than our known highest card
  const player = gameState.players.find((p) => p.playerId === botPlayerId);
  if (player && topDiscard && highestSlot) {
    const highCard = player.hand.find((h) => h.slot === highestSlot);
    if (highCard && getCardValue(topDiscard) < getCardValue(highCard.card) - 3) {
      return { type: 'takeDiscard', swapSlot: highestSlot };
    }
  }

  // 4. Draw from deck — swap highest card (we know its value)
  // Avoid swapping lowest known card
  const swapSlot = highestSlot !== lowestSlot ? highestSlot : null;
  return { type: 'drawDeck', discardSlot: swapSlot };
}

// ============================================================
// Main: Choose Bot Action
// ============================================================

/**
 * Chooses a bot action based on the current game state and bot difficulty.
 * The bot has full knowledge of its own hand (server-side).
 */
export function chooseBotAction(
  gameState: GameState,
  botPlayerId: string,
  difficulty: BotDifficulty,
): BotAction {
  switch (difficulty) {
    case 'easy':
      return easyBotAction(gameState, botPlayerId);
    case 'expert':
      return expertBotAction(gameState, botPlayerId);
  }
}

// ============================================================
// Bot Special Effect Responses
// ============================================================

/**
 * Decides how a bot responds to a pending special effect.
 */
export function chooseBotSpecialEffectResponse(
  gameState: GameState,
  botPlayerId: string,
  difficulty: BotDifficulty,
  effectType: 'redJack' | 'redQueen' | 'redKing',
  redKingCards?: [Card, Card],
): BotSpecialEffectResponse {
  const slots = getPlayerSlots(gameState, botPlayerId);

  switch (effectType) {
    case 'redJack': {
      // Easy: always skip
      if (difficulty === 'easy') return { skip: true };

      // Expert: swap own highest card with a random opponent's slot
      const opponents = gameState.players.filter(
        (p) => p.playerId !== botPlayerId && p.hand.length > 0,
      );
      if (opponents.length === 0) return { skip: true };

      const highestSlot = getHighestValueSlot(gameState, botPlayerId);
      if (!highestSlot) return { skip: true };

      const targetOpponent = randomItem(opponents);
      const targetSlot = randomItem(targetOpponent.hand.map((h) => h.slot));

      return {
        skip: false,
        ownSlot: highestSlot,
        targetPlayerId: targetOpponent.playerId,
        targetSlot,
      };
    }

    case 'redQueen': {
      // Always peek at a random slot (we can't know which is unknown)
      if (slots.length === 0) return {};
      return { peekSlot: randomItem(slots) };
    }

    case 'redKing': {
      if (!redKingCards) return { keepIndices: [], discardSlots: [] };

      const [card0, card1] = redKingCards;

      // Easy: return both
      if (difficulty === 'easy') return { keepIndices: [], discardSlots: [] };

      // Expert: keep the lower value card if it's better than our worst
      const highestSlot = getHighestValueSlot(gameState, botPlayerId);
      const player = gameState.players.find((p) => p.playerId === botPlayerId);
      const worstCard = player?.hand.find((h) => h.slot === highestSlot);

      const bestDrawn =
        card0.value <= card1.value ? { card: card0, idx: 0 } : { card: card1, idx: 1 };

      if (worstCard && bestDrawn.card.value < worstCard.card.value && highestSlot) {
        return { keepIndices: [bestDrawn.idx], discardSlots: [highestSlot] };
      }

      return { keepIndices: [], discardSlots: [] };
    }
  }
}

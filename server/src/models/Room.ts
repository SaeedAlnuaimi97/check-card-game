import mongoose, { Schema, Document } from 'mongoose';
import type { Card, GameState, HandSlot, PlayerState, RoomStatus } from '../types/game.types';

// ============================================================
// Sub-Schemas
// ============================================================

const CardSchema = new Schema<Card>(
  {
    id: { type: String, required: true },
    suit: { type: String, required: true, enum: ['\u2665', '\u2666', '\u2660', '\u2663'] },
    rank: {
      type: String,
      required: true,
      enum: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    },
    value: { type: Number, required: true },
    isRed: { type: Boolean, required: true },
    isBurned: { type: Boolean, default: undefined },
  },
  { _id: false },
);

const HandSlotSchema = new Schema<HandSlot>(
  {
    slot: { type: String, required: true },
    card: { type: CardSchema, required: true },
  },
  { _id: false },
);

const PlayerStateSchema = new Schema<PlayerState>(
  {
    playerId: { type: String, required: true },
    username: { type: String, required: true },
    hand: { type: [HandSlotSchema], required: true, default: [] },
    peekedSlots: { type: [String], required: true, default: [] },
    totalScore: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const PendingEffectSchema = new Schema(
  {
    type: { type: String, required: true, enum: ['redJack', 'redQueen', 'redKing'] },
    playerId: { type: String, required: true },
    card: { type: CardSchema, required: true },
    redKingCards: { type: [CardSchema], default: undefined },
  },
  { _id: false },
);

const GameStateSchema = new Schema<GameState>(
  {
    deck: { type: [CardSchema], required: true, default: [] },
    discardPile: { type: [CardSchema], required: true, default: [] },
    players: { type: [PlayerStateSchema], required: true, default: [] },
    currentTurnIndex: { type: Number, required: true, default: 0 },
    checkCalledBy: { type: String, default: null },
    checkCalledAtIndex: { type: Number, default: null },
    roundNumber: { type: Number, required: true, default: 1 },
    scores: { type: Schema.Types.Mixed, required: true, default: {} },
    phase: {
      type: String,
      required: true,
      enum: ['dealing', 'peeking', 'playing', 'roundEnd', 'gameEnd'],
      default: 'dealing',
    },
    drawnCard: { type: CardSchema, default: null },
    drawnByPlayerId: { type: String, default: null },
    drawnSource: { type: String, enum: ['deck', 'discard', null], default: null },
    pendingEffect: { type: PendingEffectSchema, default: null },
  },
  { _id: false },
);

// ============================================================
// Room Schema (F-013)
// ============================================================

const RoomPlayerSchema = new Schema(
  {
    id: { type: String, required: true },
    username: { type: String, required: true },
  },
  { _id: false },
);

export interface RoomDocument extends Document {
  roomCode: string;
  host: string;
  players: { id: string; username: string }[];
  gameState: GameState | null;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<RoomDocument>(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6,
    },
    host: { type: String, required: true },
    players: { type: [RoomPlayerSchema], required: true, default: [] },
    gameState: { type: GameStateSchema, default: null },
    status: {
      type: String,
      required: true,
      enum: ['lobby', 'playing', 'finished'],
      default: 'lobby',
    },
  },
  {
    timestamps: true,
  },
);

export const RoomModel = mongoose.model<RoomDocument>('Room', RoomSchema);

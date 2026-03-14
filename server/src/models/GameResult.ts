import mongoose, { Schema, Document } from 'mongoose';

// ============================================================
// GameResult Model (F-232)
// ============================================================
// Stores the outcome of a completed game for leaderboard and
// player history. Each document represents one finished game.

export interface GameResultPlayer {
  playerId: string;
  guestId: string;
  username: string;
  finalScore: number;
  isWinner: boolean;
  isLoser: boolean;
}

export interface IGameResult {
  roomCode: string;
  startedAt: Date;
  endedAt: Date;
  totalRounds: number;
  players: GameResultPlayer[];
  winnerId: string;
  loserId: string;
  winnerUsername: string;
  loserUsername: string;
}

export interface GameResultDocument extends Document, IGameResult {}

const GameResultPlayerSchema = new Schema<GameResultPlayer>(
  {
    playerId: { type: String, required: true },
    guestId: { type: String, required: true },
    username: { type: String, required: true },
    finalScore: { type: Number, required: true },
    isWinner: { type: Boolean, required: true },
    isLoser: { type: Boolean, required: true },
  },
  { _id: false },
);

const GameResultSchema = new Schema<GameResultDocument>(
  {
    roomCode: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    totalRounds: { type: Number, required: true },
    players: { type: [GameResultPlayerSchema], required: true },
    winnerId: { type: String, required: true },
    loserId: { type: String, required: true },
    winnerUsername: { type: String, required: true },
    loserUsername: { type: String, required: true },
  },
  {
    timestamps: false,
  },
);

// Indexes for leaderboard queries
GameResultSchema.index({ endedAt: -1 });
GameResultSchema.index({ 'players.guestId': 1 });
GameResultSchema.index({ winnerId: 1 });
GameResultSchema.index({ loserId: 1 });

export const GameResultModel = mongoose.model<GameResultDocument>('GameResult', GameResultSchema);

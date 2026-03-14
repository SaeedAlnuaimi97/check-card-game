import mongoose, { Schema, Document } from 'mongoose';

// ============================================================
// GuestProfile Model
// ============================================================
// Stores the last-used username for a guest ID so returning
// users can skip the username entry step.

export interface IGuestProfile {
  guestId: string;
  username: string;
  lastSeenAt: Date;
}

export interface GuestProfileDocument extends Document, IGuestProfile {}

const GuestProfileSchema = new Schema<GuestProfileDocument>(
  {
    guestId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
  },
);

export const GuestProfileModel = mongoose.model<GuestProfileDocument>(
  'GuestProfile',
  GuestProfileSchema,
);

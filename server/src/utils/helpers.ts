import crypto from 'crypto';

/**
 * Generate a 6-character uppercase alphanumeric room code.
 * Uses crypto for better randomness.
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit 0/O, 1/I to avoid confusion
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/**
 * Generate a unique player ID (UUID v4).
 */
export function generatePlayerId(): string {
  return crypto.randomUUID();
}

/**
 * Validate username: 1-10 characters, non-empty after trim.
 */
export function validateUsername(username: unknown): string | null {
  if (typeof username !== 'string') return null;
  const trimmed = username.trim();
  if (trimmed.length < 1 || trimmed.length > 10) return null;
  return trimmed;
}

/**
 * Validate room code: exactly 6 uppercase alphanumeric characters.
 */
export function validateRoomCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(upper)) return null;
  return upper;
}

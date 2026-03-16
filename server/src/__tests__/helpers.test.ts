import { describe, it, expect } from 'vitest';
import {
  generateRoomCode,
  generatePlayerId,
  validateUsername,
  validateRoomCode,
} from '../utils/helpers';

// ============================================================
// generateRoomCode
// ============================================================

describe('generateRoomCode', () => {
  it('returns a 6-character string', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
  });

  it('returns uppercase alphanumeric characters only', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('omits ambiguous characters (0, O, 1, I)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[0O1I]/);
    }
  });

  it('generates unique codes (statistical check)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRoomCode());
    }
    // With 30^6 possible codes, 100 should all be unique
    expect(codes.size).toBe(100);
  });
});

// ============================================================
// generatePlayerId
// ============================================================

describe('generatePlayerId', () => {
  it('returns a valid UUID v4 format', () => {
    const id = generatePlayerId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generatePlayerId());
    }
    expect(ids.size).toBe(100);
  });
});

// ============================================================
// validateUsername
// ============================================================

describe('validateUsername', () => {
  it('returns trimmed username for valid input', () => {
    expect(validateUsername('Alice')).toBe('Alice');
  });

  it('trims whitespace', () => {
    expect(validateUsername('  Bob  ')).toBe('Bob');
  });

  it('accepts 1-character username', () => {
    expect(validateUsername('A')).toBe('A');
  });

  it('accepts 10-character username', () => {
    const name = 'A'.repeat(10);
    expect(validateUsername(name)).toBe(name);
  });

  it('rejects empty string', () => {
    expect(validateUsername('')).toBeNull();
  });

  it('rejects whitespace-only string', () => {
    expect(validateUsername('   ')).toBeNull();
  });

  it('rejects string longer than 10 characters', () => {
    expect(validateUsername('A'.repeat(11))).toBeNull();
  });

  it('rejects non-string types', () => {
    expect(validateUsername(null)).toBeNull();
    expect(validateUsername(undefined)).toBeNull();
    expect(validateUsername(123)).toBeNull();
    expect(validateUsername({})).toBeNull();
    expect(validateUsername([])).toBeNull();
  });
});

// ============================================================
// validateRoomCode
// ============================================================

describe('validateRoomCode', () => {
  it('returns uppercase code for valid input', () => {
    expect(validateRoomCode('ABC123')).toBe('ABC123');
  });

  it('converts lowercase to uppercase', () => {
    expect(validateRoomCode('abc123')).toBe('ABC123');
  });

  it('trims whitespace', () => {
    expect(validateRoomCode('  ABC123  ')).toBe('ABC123');
  });

  it('rejects codes shorter than 6 characters', () => {
    expect(validateRoomCode('ABC12')).toBeNull();
  });

  it('rejects codes longer than 6 characters', () => {
    expect(validateRoomCode('ABC1234')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateRoomCode('')).toBeNull();
  });

  it('rejects codes with special characters', () => {
    expect(validateRoomCode('ABC12!')).toBeNull();
    expect(validateRoomCode('ABC-12')).toBeNull();
    expect(validateRoomCode('ABC 12')).toBeNull();
  });

  it('rejects non-string types', () => {
    expect(validateRoomCode(null)).toBeNull();
    expect(validateRoomCode(undefined)).toBeNull();
    expect(validateRoomCode(123456)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { GameResultModel, type IGameResult, type GameResultPlayer } from '../models/GameResult';

// ============================================================
// GameResult Model — schema & validation tests (F-232)
// ============================================================
// These tests verify the Mongoose schema structure, required field
// validation, and index definitions. They do NOT require a live
// MongoDB connection — they exercise Mongoose's synchronous
// validation layer.

function buildValidGameResult(): IGameResult {
  return {
    roomCode: 'ABCDEF',
    startedAt: new Date('2026-03-10T10:00:00Z'),
    endedAt: new Date('2026-03-10T10:30:00Z'),
    totalRounds: 5,
    players: [
      {
        playerId: 'p1',
        guestId: 'guest-abc',
        username: 'Alice',
        finalScore: 35,
        isWinner: true,
        isLoser: false,
      },
      {
        playerId: 'p2',
        guestId: 'guest-def',
        username: 'Bob',
        finalScore: 102,
        isWinner: false,
        isLoser: true,
      },
    ],
    winnerId: 'guest-abc',
    loserId: 'guest-def',
    winnerUsername: 'Alice',
    loserUsername: 'Bob',
  };
}

describe('GameResult model — schema validation', () => {
  it('validates a well-formed document', () => {
    const doc = new GameResultModel(buildValidGameResult());
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('stores all fields correctly', () => {
    const data = buildValidGameResult();
    const doc = new GameResultModel(data);

    expect(doc.roomCode).toBe('ABCDEF');
    expect(doc.startedAt).toEqual(data.startedAt);
    expect(doc.endedAt).toEqual(data.endedAt);
    expect(doc.totalRounds).toBe(5);
    expect(doc.winnerId).toBe('guest-abc');
    expect(doc.loserId).toBe('guest-def');
    expect(doc.winnerUsername).toBe('Alice');
    expect(doc.loserUsername).toBe('Bob');
  });

  it('stores player subdocuments correctly', () => {
    const doc = new GameResultModel(buildValidGameResult());
    expect(doc.players).toHaveLength(2);

    const alice = doc.players[0];
    expect(alice.playerId).toBe('p1');
    expect(alice.guestId).toBe('guest-abc');
    expect(alice.username).toBe('Alice');
    expect(alice.finalScore).toBe(35);
    expect(alice.isWinner).toBe(true);
    expect(alice.isLoser).toBe(false);

    const bob = doc.players[1];
    expect(bob.playerId).toBe('p2');
    expect(bob.guestId).toBe('guest-def');
    expect(bob.username).toBe('Bob');
    expect(bob.finalScore).toBe(102);
    expect(bob.isWinner).toBe(false);
    expect(bob.isLoser).toBe(true);
  });

  // ----------------------------------------------------------
  // Required field validation
  // ----------------------------------------------------------

  const requiredFields = [
    'roomCode',
    'startedAt',
    'endedAt',
    'totalRounds',
    'winnerId',
    'loserId',
    'winnerUsername',
    'loserUsername',
  ] as const;

  for (const field of requiredFields) {
    it(`rejects document missing required field: ${field}`, () => {
      const data: Record<string, unknown> = { ...buildValidGameResult() };
      delete data[field];
      const doc = new GameResultModel(data);
      const err = doc.validateSync();
      expect(err).toBeDefined();
      expect(err!.errors[field]).toBeDefined();
    });
  }

  it('defaults players to empty array when not provided', () => {
    const data: Record<string, unknown> = { ...buildValidGameResult() };
    delete data.players;
    const doc = new GameResultModel(data);
    expect(doc.players).toEqual([]);
  });

  // ----------------------------------------------------------
  // Player subdocument required fields
  // ----------------------------------------------------------

  const playerRequiredFields: (keyof GameResultPlayer)[] = [
    'playerId',
    'guestId',
    'username',
    'finalScore',
    'isWinner',
    'isLoser',
  ];

  for (const field of playerRequiredFields) {
    it(`rejects player subdocument missing field: ${field}`, () => {
      const data = buildValidGameResult();
      const badPlayer: Record<string, unknown> = { ...data.players[0] };
      delete badPlayer[field];
      data.players = [badPlayer as unknown as GameResultPlayer];
      const doc = new GameResultModel(data);
      const err = doc.validateSync();
      expect(err).toBeDefined();
    });
  }

  // ----------------------------------------------------------
  // Index definitions
  // ----------------------------------------------------------

  it('has indexes defined on the schema', () => {
    const indexes = GameResultModel.schema.indexes();
    // indexes() returns an array of [fields, options] tuples
    const indexedFields = indexes.map(([fields]) => Object.keys(fields));

    // Flatten to check each expected index path exists
    const flatFields = indexedFields.flat();
    expect(flatFields).toContain('endedAt');
    expect(flatFields).toContain('players.guestId');
    expect(flatFields).toContain('winnerId');
    expect(flatFields).toContain('loserId');
  });

  it('endedAt index is descending', () => {
    const indexes = GameResultModel.schema.indexes();
    const endedAtIndex = indexes.find(([fields]) => 'endedAt' in fields);
    expect(endedAtIndex).toBeDefined();
    expect(endedAtIndex![0].endedAt).toBe(-1);
  });
});

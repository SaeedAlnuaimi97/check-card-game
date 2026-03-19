import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getRoomMessages,
  addRoomMessage,
  clearRoomMessages,
  type ChatMessage,
} from '../socket/chatHandlers';

// ============================================================
// Helper
// ============================================================

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `id-${Math.random()}`,
    roomCode: 'CHAT_TEST_ROOM01',
    playerId: 'player-1',
    username: 'Alice',
    text: 'hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

const ROOM1 = 'CHAT_TEST_ROOM01';
const ROOM2 = 'CHAT_TEST_ROOM02';

function cleanup() {
  clearRoomMessages(ROOM1);
  clearRoomMessages(ROOM2);
  clearRoomMessages('NOOP');
}

// ============================================================
// getRoomMessages
// ============================================================

describe('getRoomMessages', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('returns empty array for unknown room', () => {
    expect(getRoomMessages('UNKNOWN_XYZ')).toEqual([]);
  });

  it('returns messages for a known room', () => {
    const msg = makeMsg();
    addRoomMessage(msg);
    expect(getRoomMessages(ROOM1)).toHaveLength(1);
    expect(getRoomMessages(ROOM1)[0]).toEqual(msg);
  });
});

// ============================================================
// addRoomMessage
// ============================================================

describe('addRoomMessage', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('appends a message to the room', () => {
    const msg = makeMsg({ text: 'first' });
    addRoomMessage(msg);
    expect(getRoomMessages(ROOM1)).toHaveLength(1);
    expect(getRoomMessages(ROOM1)[0].text).toBe('first');
  });

  it('appends multiple messages in order', () => {
    const m1 = makeMsg({ id: 'a', text: 'first' });
    const m2 = makeMsg({ id: 'b', text: 'second' });
    addRoomMessage(m1);
    addRoomMessage(m2);
    const msgs = getRoomMessages(ROOM1);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe('first');
    expect(msgs[1].text).toBe('second');
  });

  it('keeps messages isolated between rooms', () => {
    addRoomMessage(makeMsg({ roomCode: ROOM1, text: 'room1 msg' }));
    addRoomMessage(makeMsg({ roomCode: ROOM2, text: 'room2 msg' }));
    expect(getRoomMessages(ROOM1)).toHaveLength(1);
    expect(getRoomMessages(ROOM2)).toHaveLength(1);
    expect(getRoomMessages(ROOM1)[0].text).toBe('room1 msg');
    expect(getRoomMessages(ROOM2)[0].text).toBe('room2 msg');
  });

  it('caps the store at 200 messages per room', () => {
    for (let i = 0; i < 210; i++) {
      addRoomMessage(makeMsg({ id: `id-${i}`, text: `msg ${i}` }));
    }
    const msgs = getRoomMessages(ROOM1);
    expect(msgs).toHaveLength(200);
    // The oldest 10 messages should have been dropped
    expect(msgs[0].text).toBe('msg 10');
    expect(msgs[199].text).toBe('msg 209');
  });

  it('stores system messages correctly', () => {
    const msg = makeMsg({ isSystem: true, text: 'Felix played a card' });
    addRoomMessage(msg);
    expect(getRoomMessages(ROOM1)[0].isSystem).toBe(true);
  });
});

// ============================================================
// clearRoomMessages
// ============================================================

describe('clearRoomMessages', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('removes all messages for the room', () => {
    addRoomMessage(makeMsg({ text: 'to be cleared' }));
    expect(getRoomMessages(ROOM1)).toHaveLength(1);
    clearRoomMessages(ROOM1);
    expect(getRoomMessages(ROOM1)).toHaveLength(0);
  });

  it('does not affect other rooms', () => {
    addRoomMessage(makeMsg({ roomCode: ROOM1, text: 'keep' }));
    addRoomMessage(makeMsg({ roomCode: ROOM2, text: 'also keep' }));
    clearRoomMessages(ROOM1);
    expect(getRoomMessages(ROOM1)).toHaveLength(0);
    expect(getRoomMessages(ROOM2)).toHaveLength(1);
  });

  it('is safe to call on an empty/unknown room', () => {
    expect(() => clearRoomMessages('NOOP')).not.toThrow();
  });
});

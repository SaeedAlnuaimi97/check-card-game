import { Server as SocketIOServer, Socket } from 'socket.io';
import { RoomModel } from '../models/Room';

// ============================================================
// Types
// ============================================================

export interface ChatMessage {
  id: string;
  roomCode: string;
  playerId: string;
  username: string;
  text: string;
  timestamp: number;
  /** True when this is a system event (e.g. "Felix played a card") */
  isSystem?: boolean;
}

// ============================================================
// In-memory chat store
// Maximum of 200 messages retained per room to avoid unbounded growth.
// ============================================================

const MAX_MESSAGES_PER_ROOM = 200;
const chatStore = new Map<string, ChatMessage[]>();

export function getRoomMessages(roomCode: string): ChatMessage[] {
  return chatStore.get(roomCode) ?? [];
}

export function addRoomMessage(msg: ChatMessage): void {
  const msgs = chatStore.get(msg.roomCode) ?? [];
  msgs.push(msg);
  if (msgs.length > MAX_MESSAGES_PER_ROOM) {
    msgs.splice(0, msgs.length - MAX_MESSAGES_PER_ROOM);
  }
  chatStore.set(msg.roomCode, msgs);
}

export function clearRoomMessages(roomCode: string): void {
  chatStore.delete(roomCode);
}

// ============================================================
// Validation
// ============================================================

const MAX_MESSAGE_LENGTH = 200;

function sanitizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// ============================================================
// Handler registration
// ============================================================

export function registerChatHandlers(io: SocketIOServer, socket: Socket): void {
  /**
   * sendChatMessage — player sends a chat message to everyone in the room.
   *
   * Client sends:
   *   { roomCode: string, playerId: string, text: string }
   *
   * Server broadcasts to room:
   *   'chatMessage' with ChatMessage payload
   */
  socket.on(
    'sendChatMessage',
    async (
      data: { roomCode: string; playerId: string; text: string },
      callback: (res: { success: boolean; error?: string }) => void,
    ) => {
      try {
        const { roomCode, playerId, text } = data ?? {};

        // --- basic validation ---
        if (typeof roomCode !== 'string' || !roomCode) {
          return callback({ success: false, error: 'Missing roomCode' });
        }
        if (typeof playerId !== 'string' || !playerId) {
          return callback({ success: false, error: 'Missing playerId' });
        }
        if (typeof text !== 'string' || text.trim().length === 0) {
          return callback({ success: false, error: 'Message cannot be empty' });
        }

        const clean = sanitizeText(text);
        if (clean.length > MAX_MESSAGE_LENGTH) {
          return callback({ success: false, error: 'Message too long' });
        }

        // --- room must exist ---
        const room = await RoomModel.findOne({ roomCode: roomCode.toUpperCase() }).lean();
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        // --- player must be in the room ---
        const player = room.players.find((p) => p.id === playerId);
        if (!player) {
          return callback({ success: false, error: 'Player not in room' });
        }

        const msg: ChatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          roomCode: room.roomCode,
          playerId,
          username: player.username,
          text: clean,
          timestamp: Date.now(),
        };

        addRoomMessage(msg);

        // Broadcast to everyone in the room (including sender)
        io.to(room.roomCode).emit('chatMessage', msg);

        callback({ success: true });
      } catch (err) {
        console.error('[chat] sendChatMessage error:', err);
        callback({ success: false, error: 'Internal server error' });
      }
    },
  );

  /**
   * getChatHistory — client requests the message history for a room.
   * Called when the drawer first opens or on reconnect.
   *
   * Client sends:
   *   { roomCode: string, playerId: string }
   *
   * Server responds (callback):
   *   { success: true, messages: ChatMessage[] }
   */
  socket.on(
    'getChatHistory',
    async (
      data: { roomCode: string; playerId: string },
      callback: (res: { success: boolean; messages?: ChatMessage[]; error?: string }) => void,
    ) => {
      try {
        const { roomCode, playerId } = data ?? {};
        if (typeof roomCode !== 'string' || !roomCode) {
          return callback({ success: false, error: 'Missing roomCode' });
        }
        if (typeof playerId !== 'string' || !playerId) {
          return callback({ success: false, error: 'Missing playerId' });
        }

        const room = await RoomModel.findOne({ roomCode: roomCode.toUpperCase() }).lean();
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        const inRoom = room.players.some((p) => p.id === playerId);
        if (!inRoom) {
          return callback({ success: false, error: 'Player not in room' });
        }

        callback({ success: true, messages: getRoomMessages(room.roomCode) });
      } catch (err) {
        console.error('[chat] getChatHistory error:', err);
        callback({ success: false, error: 'Internal server error' });
      }
    },
  );
}

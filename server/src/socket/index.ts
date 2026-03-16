import { Server as SocketIOServer } from 'socket.io';
import { registerRoomHandlers } from './roomHandlers';
import { registerGameHandlers } from './gameHandlers';

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Register room management handlers (F-016 to F-021)
    registerRoomHandlers(io, socket);

    // Register game action handlers (F-033+)
    registerGameHandlers(io, socket);
  });
}

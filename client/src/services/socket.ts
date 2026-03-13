import { io, Socket } from 'socket.io-client';

// Use the same hostname the page was loaded from, so it works on LAN (e.g. phone).
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3001`;

const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

// ============================================================
// Web Lock API — prevent browser from freezing the tab
// ============================================================
// Requesting a Web Lock keeps the browser from aggressively suspending
// the page when it goes to background. The lock is held indefinitely
// (the promise never resolves) which is intentional.
if (typeof navigator !== 'undefined' && navigator.locks) {
  navigator.locks
    .request('check-card-game-keep-alive', () => new Promise(() => {}))
    .catch(() => {
      // Silently ignore — Web Locks not supported or blocked
    });
}

// ============================================================
// Visibility change — reconnect when tab returns to foreground
// ============================================================
// On mobile, the OS may throttle or kill the WebSocket when the tab
// is backgrounded. When the user returns we force a reconnect.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (socket.disconnected) {
      console.log('[socket] Tab visible, socket disconnected — reconnecting...');
      socket.connect();
    }
  }
});

// Also handle the 'pagehide' / 'pageshow' events for better mobile coverage.
// Some mobile browsers fire pageshow/pagehide but not visibilitychange
// when switching apps via the task switcher.
window.addEventListener('pageshow', () => {
  if (socket.disconnected) {
    console.log('[socket] pageshow fired, socket disconnected — reconnecting...');
    socket.connect();
  }
});

export default socket;

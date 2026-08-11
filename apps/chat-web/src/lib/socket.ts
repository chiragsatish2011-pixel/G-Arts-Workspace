import { io, type Socket } from 'socket.io-client';
import { SocketEvents } from '@g-arts/chat-shared';
import { getAccessToken, refreshAccessToken } from './api';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

let socket: Socket | null = null;
let state: ConnectionState = 'idle';
const stateListeners = new Set<(s: ConnectionState) => void>();

function setState(next: ConnectionState) {
  if (state === next) return;
  state = next;
  stateListeners.forEach((fn) => fn(next));
}

export function onConnectionState(fn: (s: ConnectionState) => void) {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

export function connectionState() {
  return state;
}

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io({
    path: '/socket.io',
    auth: { token: getAccessToken() },
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
    // Jitter stops every client in the office from reconnecting in lockstep
    // after a server restart.
    randomizationFactor: 0.5,
    timeout: 12_000
  });

  socket.on('connect', () => setState('connected'));
  socket.on('disconnect', (reason) => {
    setState(reason === 'io client disconnect' ? 'idle' : 'reconnecting');
  });
  socket.io.on('reconnect_attempt', () => setState('reconnecting'));
  socket.io.on('error', () => setState('reconnecting'));

  /**
   * The access token lives ~15 minutes but a socket can stay open for hours.
   * When the handshake is rejected for an expired token, refresh once and
   * reconnect with the new one rather than dropping the member to the login
   * screen mid-conversation.
   */
  socket.on('connect_error', async (err) => {
    const message = err.message ?? '';
    const recoverable =
      message.includes('Invalid token') ||
      message.includes('Session expired') ||
      message.includes('Authentication required');

    if (!recoverable) {
      setState('reconnecting');
      return;
    }

    try {
      const token = await refreshAccessToken();
      if (socket) {
        socket.auth = { token };
        socket.connect();
      }
    } catch {
      setState('offline');
    }
  });

  // The server tells us before it hangs up on an expired token, so we can hand
  // it a fresh one and keep the same connection.
  socket.on(SocketEvents.SESSION_EXPIRED, async () => {
    try {
      const token = await refreshAccessToken();
      socket?.emit(SocketEvents.REAUTH, { token });
      if (socket) socket.auth = { token };
    } catch {
      setState('offline');
    }
  });

  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getAccessToken() };
    setState('connecting');
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
  setState('idle');
}

/** Promise wrapper around an emit that expects an acknowledgement. */
export function emitAck<T = unknown>(event: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) {
      reject(new Error('Not connected'));
      return;
    }
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, response: T) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

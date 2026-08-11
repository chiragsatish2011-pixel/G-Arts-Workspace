/**
 * The realtime wire protocol, shared by the server and the client so the two
 * can never drift apart.
 */
export const SocketEvents = {
  // Connection lifecycle
  READY: 'ready',
  ERROR: 'error',
  // The client pushes a freshly refreshed access token so a long-lived socket
  // is not disconnected the moment its original token expires.
  REAUTH: 'auth:refresh',
  SESSION_EXPIRED: 'auth:expired',

  // Conversations
  CONVERSATION_SUBSCRIBE: 'conversation:subscribe',
  CONVERSATION_UNSUBSCRIBE: 'conversation:unsubscribe',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',

  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_REACT: 'message:react',
  MESSAGE_REACTION: 'message:reaction',
  MESSAGE_PIN: 'message:pin',
  MESSAGE_PINNED: 'message:pinned',

  // Read / delivery cursors — the data behind sent, delivered and read ticks
  READ: 'conversation:read',
  READ_UPDATED: 'conversation:read:updated',
  DELIVERED_UPDATED: 'conversation:delivered:updated',

  // Presence
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  PRESENCE_SET: 'presence:set',
  PRESENCE_CHANGED: 'presence:changed',

  // Voice / video
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_PARTICIPANT: 'voice:participant',
  VOICE_SIGNAL: 'voice:signal',
  VOICE_STATE: 'voice:state'
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];

export const HttpStatusCode = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500
} as const;

/** Per-socket token buckets. Keeps one noisy client from flooding a room. */
export const SOCKET_RATE_LIMITS: Record<string, { points: number; windowMs: number }> = {
  [SocketEvents.MESSAGE_SEND]: { points: 25, windowMs: 10_000 },
  [SocketEvents.MESSAGE_EDIT]: { points: 20, windowMs: 10_000 },
  [SocketEvents.MESSAGE_DELETE]: { points: 20, windowMs: 10_000 },
  [SocketEvents.MESSAGE_REACT]: { points: 40, windowMs: 10_000 },
  [SocketEvents.TYPING_START]: { points: 30, windowMs: 10_000 },
  [SocketEvents.READ]: { points: 60, windowMs: 10_000 },
  [SocketEvents.CONVERSATION_SUBSCRIBE]: { points: 60, windowMs: 10_000 },
  [SocketEvents.VOICE_SIGNAL]: { points: 200, windowMs: 10_000 },
  default: { points: 60, windowMs: 10_000 }
};

export const MAX_MESSAGE_LENGTH = 8000;
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown'
] as const;

/** Kept warm but restrained — this is a school noticeboard, not a group chat. */
export const QUICK_REACTIONS = ['👍', '🙏', '😊', '✅', '🎉', '👏', '💡', '👀'] as const;

export const DEFAULT_CHANNELS: Array<{
  name: string;
  type: 'text' | 'announcement';
  description: string;
}> = [
  {
    name: 'announcements',
    type: 'announcement',
    description: 'Notices from the Gurukul. Only administrators post here.'
  },
  {
    name: 'general',
    type: 'text',
    description: 'Day-to-day conversation for everyone.'
  }
];

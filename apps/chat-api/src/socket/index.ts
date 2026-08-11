import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HTTPServer } from 'node:http';
import { z } from 'zod';
import { SocketEvents, SOCKET_RATE_LIMITS, MAX_MESSAGE_LENGTH } from '@g-arts/chat-shared';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { redis, pubClient, subClient } from '../lib/redis.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { sessionKey } from '../services/session-keys.js';
import {
  verifyWorkspaceToken,
  resolveWorkspaceMember
} from '../services/workspace-identity.js';
import { conversationService, ConversationError } from '../services/conversation.js';
import { messageService } from '../services/message.js';
import { presenceService } from '../services/presence.js';
import { setSocketServer, room, userRoom } from './broadcaster.js';

interface SocketUser {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  sid: string;
  /** Access-token expiry, unix seconds. */
  exp: number;
}

declare module 'socket.io' {
  interface Socket {
    user: SocketUser;
    buckets: Map<string, { tokens: number; resetAt: number }>;
    expiryTimer?: ReturnType<typeof setTimeout>;
  }
}

// ---------------------------------------------------------------------------
// Payload validation. Anything arriving over a socket is untrusted input and
// gets the same treatment as an HTTP body.
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(64);

const schemas = {
  subscribe: z.object({ channelId: id }),
  send: z.object({
    channelId: id,
    content: z.string().max(MAX_MESSAGE_LENGTH).default(''),
    replyToId: id.nullish(),
    clientNonce: z.string().min(1).max(64).nullish(),
    attachmentIds: z.array(id).max(10).optional()
  }),
  edit: z.object({ messageId: id, content: z.string().min(1).max(MAX_MESSAGE_LENGTH) }),
  remove: z.object({ messageId: id }),
  react: z.object({ messageId: id, emoji: z.string().min(1).max(16) }),
  pin: z.object({ messageId: id, pinned: z.boolean() }),
  read: z.object({ channelId: id, messageId: id.optional() }),
  typing: z.object({ channelId: id }),
  presence: z.object({
    status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
    statusText: z.string().max(120).nullish()
  }),
  voiceJoin: z.object({ channelId: id }),
  voiceSignal: z.object({ channelId: id, targetUserId: id, signal: z.unknown() }),
  voiceState: z.object({
    channelId: id,
    muted: z.boolean().optional(),
    deafened: z.boolean().optional(),
    sharing: z.boolean().optional()
  }),
  reauth: z.object({ token: z.string().min(10) })
};

type Ack = ((response: unknown) => void) | undefined;

function reply(ack: Ack, response: unknown) {
  if (typeof ack === 'function') ack(response);
}

/** Fixed-window token bucket, per socket, per event. */
function allow(socket: Socket, event: string): boolean {
  const limit = SOCKET_RATE_LIMITS[event] ?? SOCKET_RATE_LIMITS.default;
  const now = Date.now();
  const bucket = socket.buckets.get(event);

  if (!bucket || bucket.resetAt <= now) {
    socket.buckets.set(event, { tokens: limit.points - 1, resetAt: now + limit.windowMs });
    return true;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens--;
  return true;
}

export async function initializeSocketIO(httpServer: HTTPServer): Promise<SocketIOServer> {
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: (origin, callback) => {
        if (config.isOriginAllowed(origin ?? undefined)) callback(null, true);
        else callback(new Error('Origin not allowed'));
      },
      credentials: true
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1e6,
    connectionStateRecovery: {
      // Lets a socket that drops for a few seconds (tunnel, lift, Wi-Fi hop)
      // resume its rooms and replay missed events instead of resyncing.
      maxDisconnectionDuration: 60_000,
      skipMiddlewares: false
    }
  });

  // Without the adapter, a message sent through instance A never reaches a
  // member connected to instance B.
  if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO running with the Redis adapter (multi-instance ready)');
  }

  setSocketServer(io);
  presenceService.start();

  // -------------------------------------------------------------------------
  // Handshake
  // -------------------------------------------------------------------------
  io.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth as { token?: string })?.token ??
        socket.handshake.headers.authorization?.replace(/^Bearer /, '');

      if (!raw) return next(new Error('Authentication required'));

      // Same bridge as the HTTP side: a Workspace token opens a socket.
      const workspace = verifyWorkspaceToken(raw);
      if (workspace) {
        const member = await resolveWorkspaceMember(workspace);
        socket.user = {
          userId: member.id,
          username: member.username,
          displayName: member.displayName,
          role: member.role,
          sid: `workspace:${workspace.sub}`,
          exp: workspace.exp ?? Math.floor(Date.now() / 1000) + 3600
        };
        socket.buckets = new Map();
        return next();
      }

      const payload = verifyAccessToken(raw);
      if (!payload) return next(new Error('Invalid token'));

      // The session must still be live — a signed-out or revoked device must
      // not be able to keep a socket open until its token happens to expire.
      if (!(await redis.exists(sessionKey(payload.sid)))) {
        return next(new Error('Session expired'));
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, displayName: true, role: true, disabledAt: true }
      });
      if (!user || user.disabledAt) return next(new Error('Member access has been revoked'));

      socket.user = {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        sid: payload.sid,
        exp: payload.exp
      };
      socket.buckets = new Map();
      next();
    } catch (err) {
      logger.debug({ err }, 'Socket handshake rejected');
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    void onConnection(io, socket);
  });

  return io;
}

/**
 * Disconnects the socket when its access token expires, unless the client has
 * pushed a fresh one first. Previously a socket authenticated once at
 * handshake and then stayed trusted indefinitely.
 */
function scheduleExpiry(socket: Socket) {
  if (socket.expiryTimer) clearTimeout(socket.expiryTimer);
  const msUntilExpiry = socket.user.exp * 1000 - Date.now();
  // A small grace window absorbs clock skew and an in-flight refresh.
  const delay = Math.max(msUntilExpiry + 30_000, 5_000);
  socket.expiryTimer = setTimeout(() => {
    socket.emit(SocketEvents.SESSION_EXPIRED, { reason: 'token_expired' });
    socket.disconnect(true);
  }, delay);
  socket.expiryTimer.unref?.();
}

async function onConnection(io: SocketIOServer, socket: Socket) {
  const { userId, username } = socket.user;
  logger.info({ userId, socketId: socket.id }, 'Socket connected');

  scheduleExpiry(socket);

  // Personal room for events that are about the member rather than a
  // conversation (a new DM, a mention, presence of someone they can see).
  socket.join(userRoom(userId));

  // Subscribe to every conversation the member can see, not just the one
  // currently open. Without this, unread badges and DM previews only updated
  // for the visible channel — and a member who had never opened #general
  // received nothing from it until they clicked in.
  const [memberships, openChannels] = await Promise.all([
    prisma.channelMember.findMany({ where: { userId }, select: { channelId: true } }),
    prisma.channel.findMany({
      where: { kind: 'channel', isPrivate: false, isArchived: false },
      select: { id: true }
    })
  ]);
  const visible = new Set([
    ...memberships.map((m) => m.channelId),
    ...openChannels.map((c) => c.id)
  ]);
  for (const channelId of visible) socket.join(room(channelId));

  const isFirstConnection = await presenceService.connect(userId, socket.id);

  // Everything already waiting for this member is now on their device.
  const delivered = await conversationService.markDelivered(userId);
  for (const entry of delivered) {
    socket.to(room(entry.channelId)).emit(SocketEvents.DELIVERED_UPDATED, entry);
  }

  if (isFirstConnection) {
    broadcastPresence(io, userId, { isConnected: true });
  }

  socket.emit(SocketEvents.READY, {
    userId,
    username,
    subscribed: visible.size,
    serverTime: new Date().toISOString()
  });

  // ---------------------------------------------------------------------
  // Helpers bound to this socket
  // ---------------------------------------------------------------------

  const guard =
    <T extends z.ZodTypeAny>(event: string, schema: T, handler: (data: z.infer<T>, ack: Ack) => Promise<void>) =>
    async (raw: unknown, ack: Ack) => {
      if (!allow(socket, event)) {
        reply(ack, { ok: false, error: 'You are doing that too quickly. Please slow down.' });
        socket.emit(SocketEvents.ERROR, { event, error: 'rate_limited' });
        return;
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        reply(ack, { ok: false, error: 'Invalid request' });
        return;
      }

      try {
        await handler(parsed.data, ack);
      } catch (err) {
        const message =
          err instanceof ConversationError ? err.message : 'Something went wrong. Please try again.';
        if (!(err instanceof ConversationError)) {
          logger.error({ err, event, userId }, 'Socket handler failed');
        }
        reply(ack, { ok: false, error: message });
        socket.emit(SocketEvents.ERROR, { event, error: message });
      }
    };

  const requireAccess = async (channelId: string, needPost = false) => {
    const result = await conversationService.access(channelId, userId, socket.user.role === 'admin');
    if (needPost && !result.canPost) {
      throw new ConversationError(
        result.channel.isArchived
          ? 'This conversation is archived'
          : 'Only admins can post in an announcement channel',
        403
      );
    }
    return result;
  };

  // ---------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------

  socket.on(
    SocketEvents.CONVERSATION_SUBSCRIBE,
    guard(SocketEvents.CONVERSATION_SUBSCRIBE, schemas.subscribe, async ({ channelId }, ack) => {
      // Authorisation happens here, on the server. The old handler joined
      // whatever room the client named, so any member could listen in on any
      // conversation simply by emitting its id.
      const { isOpenChannel, membership } = await requireAccess(channelId);
      if (isOpenChannel && !membership) {
        await conversationService.ensureMembership(channelId, userId);
      }
      socket.join(room(channelId));
      reply(ack, { ok: true });
    })
  );

  socket.on(
    SocketEvents.CONVERSATION_UNSUBSCRIBE,
    guard(SocketEvents.CONVERSATION_UNSUBSCRIBE, schemas.subscribe, async ({ channelId }, ack) => {
      socket.leave(room(channelId));
      reply(ack, { ok: true });
    })
  );

  // ---------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------

  socket.on(
    SocketEvents.MESSAGE_SEND,
    guard(SocketEvents.MESSAGE_SEND, schemas.send, async (data, ack) => {
      await requireAccess(data.channelId, true);

      const { message, deduplicated } = await messageService.create({
        channelId: data.channelId,
        userId,
        content: data.content,
        replyToId: data.replyToId ?? null,
        clientNonce: data.clientNonce ?? null,
        attachmentIds: data.attachmentIds
      });

      // The ack carries the persisted row so the client can swap its optimistic
      // placeholder for the real message and stop showing a pending tick.
      reply(ack, { ok: true, message, deduplicated });

      if (!deduplicated) {
        io.to(room(data.channelId)).emit(SocketEvents.MESSAGE_NEW, {
          channelId: data.channelId,
          message
        });
        await notifyRecipients(io, data.channelId, userId, message);
      }
    })
  );

  socket.on(
    SocketEvents.MESSAGE_EDIT,
    guard(SocketEvents.MESSAGE_EDIT, schemas.edit, async ({ messageId, content }, ack) => {
      const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true }
      });
      if (!existing) throw new ConversationError('Message not found', 404);
      await requireAccess(existing.channelId, true);

      const message = await messageService.edit(messageId, userId, content);
      reply(ack, { ok: true, message });

      // Broadcast to the conversation room. The previous code emitted to
      // `message:<id>`, a room nothing ever joined, so edits reached nobody.
      io.to(room(existing.channelId)).emit(SocketEvents.MESSAGE_UPDATED, {
        channelId: existing.channelId,
        message
      });
    })
  );

  socket.on(
    SocketEvents.MESSAGE_DELETE,
    guard(SocketEvents.MESSAGE_DELETE, schemas.remove, async ({ messageId }, ack) => {
      const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true }
      });
      if (!existing) throw new ConversationError('Message not found', 404);
      await requireAccess(existing.channelId);

      const result = await messageService.remove(messageId, userId, socket.user.role === 'admin');
      reply(ack, { ok: true });
      io.to(room(result.channelId)).emit(SocketEvents.MESSAGE_DELETED, result);
    })
  );

  socket.on(
    SocketEvents.MESSAGE_REACT,
    guard(SocketEvents.MESSAGE_REACT, schemas.react, async ({ messageId, emoji }, ack) => {
      const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true }
      });
      if (!existing) throw new ConversationError('Message not found', 404);
      await requireAccess(existing.channelId, true);

      const result = await messageService.toggleReaction(messageId, userId, emoji);
      reply(ack, { ok: true, ...result });
      io.to(room(result.channelId)).emit(SocketEvents.MESSAGE_REACTION, result);
    })
  );

  socket.on(
    SocketEvents.MESSAGE_PIN,
    guard(SocketEvents.MESSAGE_PIN, schemas.pin, async ({ messageId, pinned }, ack) => {
      const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true }
      });
      if (!existing) throw new ConversationError('Message not found', 404);
      await requireAccess(existing.channelId, true);

      const message = await messageService.setPinned(messageId, userId, pinned);
      reply(ack, { ok: true, message });
      io.to(room(existing.channelId)).emit(SocketEvents.MESSAGE_PINNED, {
        channelId: existing.channelId,
        message,
        pinned
      });
    })
  );

  // ---------------------------------------------------------------------
  // Read cursors — these drive the delivered/read ticks
  // ---------------------------------------------------------------------

  socket.on(
    SocketEvents.READ,
    guard(SocketEvents.READ, schemas.read, async ({ channelId, messageId }, ack) => {
      await requireAccess(channelId);
      const cursor = await conversationService.markRead(channelId, userId, messageId);
      reply(ack, { ok: true, cursor });
      if (cursor) {
        io.to(room(channelId)).emit(SocketEvents.READ_UPDATED, cursor);
      }
    })
  );

  // ---------------------------------------------------------------------
  // Typing & presence
  // ---------------------------------------------------------------------

  socket.on(
    SocketEvents.TYPING_START,
    guard(SocketEvents.TYPING_START, schemas.typing, async ({ channelId }) => {
      await requireAccess(channelId, true);
      socket.to(room(channelId)).emit(SocketEvents.TYPING_START, {
        channelId,
        userId,
        displayName: socket.user.displayName
      });
    })
  );

  socket.on(
    SocketEvents.TYPING_STOP,
    guard(SocketEvents.TYPING_STOP, schemas.typing, async ({ channelId }) => {
      socket.to(room(channelId)).emit(SocketEvents.TYPING_STOP, { channelId, userId });
    })
  );

  socket.on(
    SocketEvents.PRESENCE_SET,
    guard(SocketEvents.PRESENCE_SET, schemas.presence, async ({ status, statusText }, ack) => {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(status ? { status } : {}),
          ...(statusText !== undefined ? { statusText: statusText || null } : {})
        },
        select: { status: true, statusText: true }
      });
      reply(ack, { ok: true, ...updated });
      broadcastPresence(io, userId, updated);
    })
  );

  socket.on(
    SocketEvents.REAUTH,
    guard(SocketEvents.REAUTH, schemas.reauth, async ({ token }, ack) => {
      const payload = verifyAccessToken(token);
      if (!payload || payload.userId !== userId) {
        reply(ack, { ok: false, error: 'Invalid token' });
        socket.emit(SocketEvents.SESSION_EXPIRED, { reason: 'invalid_token' });
        socket.disconnect(true);
        return;
      }
      if (!(await redis.exists(sessionKey(payload.sid)))) {
        reply(ack, { ok: false, error: 'Session expired' });
        socket.emit(SocketEvents.SESSION_EXPIRED, { reason: 'session_revoked' });
        socket.disconnect(true);
        return;
      }
      socket.user.sid = payload.sid;
      socket.user.exp = payload.exp;
      scheduleExpiry(socket);
      reply(ack, { ok: true });
    })
  );

  // ---------------------------------------------------------------------
  // Voice
  // ---------------------------------------------------------------------

  socket.on(
    SocketEvents.VOICE_JOIN,
    guard(SocketEvents.VOICE_JOIN, schemas.voiceJoin, async ({ channelId }, ack) => {
      await requireAccess(channelId, true);
      socket.join(`voice:${channelId}`);

      // Upsert, so rejoining after a refresh does not stack duplicate rows the
      // way the old unconditional create did.
      const session = await prisma.voiceSession.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId, socketId: socket.id },
        update: { socketId: socket.id, joinedAt: new Date() },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
      });

      const participants = await prisma.voiceSession.findMany({
        where: { channelId },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
      });

      reply(ack, { ok: true, participants });
      io.to(`voice:${channelId}`).emit(SocketEvents.VOICE_PARTICIPANT, {
        action: 'join',
        channelId,
        participant: session
      });
    })
  );

  socket.on(
    SocketEvents.VOICE_LEAVE,
    guard(SocketEvents.VOICE_LEAVE, schemas.voiceJoin, async ({ channelId }, ack) => {
      await prisma.voiceSession.deleteMany({ where: { channelId, userId } });
      socket.leave(`voice:${channelId}`);
      reply(ack, { ok: true });
      io.to(`voice:${channelId}`).emit(SocketEvents.VOICE_PARTICIPANT, {
        action: 'leave',
        channelId,
        userId
      });
    })
  );

  socket.on(
    SocketEvents.VOICE_SIGNAL,
    guard(SocketEvents.VOICE_SIGNAL, schemas.voiceSignal, async ({ channelId, targetUserId, signal }) => {
      // Signalling is only relayed between two people already in the same
      // voice room, so it cannot be used to spray arbitrary payloads.
      await requireAccess(channelId);
      const target = await prisma.voiceSession.findUnique({
        where: { channelId_userId: { channelId, userId: targetUserId } },
        select: { userId: true }
      });
      if (!target) return;

      io.to(userRoom(targetUserId)).emit(SocketEvents.VOICE_SIGNAL, {
        channelId,
        fromUserId: userId,
        signal
      });
    })
  );

  socket.on(
    SocketEvents.VOICE_STATE,
    guard(SocketEvents.VOICE_STATE, schemas.voiceState, async ({ channelId, ...state }) => {
      await prisma.voiceSession.updateMany({ where: { channelId, userId }, data: state });
      socket.to(`voice:${channelId}`).emit(SocketEvents.VOICE_STATE, { channelId, userId, ...state });
    })
  );

  // ---------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------

  socket.on('disconnect', async (reason) => {
    if (socket.expiryTimer) clearTimeout(socket.expiryTimer);
    logger.info({ userId, socketId: socket.id, reason }, 'Socket disconnected');

    try {
      // Only drop voice rows belonging to this socket. The old handler deleted
      // every voice session for the member, so closing one tab kicked them out
      // of a call running in another.
      const voice = await prisma.voiceSession.findMany({
        where: { userId, socketId: socket.id },
        select: { channelId: true }
      });
      if (voice.length > 0) {
        await prisma.voiceSession.deleteMany({ where: { userId, socketId: socket.id } });
        for (const v of voice) {
          io.to(`voice:${v.channelId}`).emit(SocketEvents.VOICE_PARTICIPANT, {
            action: 'leave',
            channelId: v.channelId,
            userId
          });
        }
      }

      const wasLast = await presenceService.disconnect(userId, socket.id);
      if (wasLast) {
        broadcastPresence(io, userId, { isConnected: false, lastSeenAt: new Date().toISOString() });
      }
    } catch (err) {
      logger.error({ err, userId }, 'Disconnect cleanup failed');
    }
  });
}

/**
 * Presence goes to everyone who shares a conversation with the member, rather
 * than `io.emit` to the whole server. On a private team server that difference
 * is small; it matters the moment the roster grows.
 */
function broadcastPresence(io: SocketIOServer, userId: string, patch: Record<string, unknown>) {
  void (async () => {
    const rooms = await prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true }
    });
    const payload = { userId, ...patch };
    const targets = new Set(rooms.map((r) => room(r.channelId)));
    if (targets.size === 0) {
      io.to(userRoom(userId)).emit(SocketEvents.PRESENCE_CHANGED, payload);
      return;
    }
    io.to([...targets]).emit(SocketEvents.PRESENCE_CHANGED, payload);
  })();
}

/**
 * Pushes a conversation-level nudge to members who are connected but have not
 * joined this room (for instance a brand-new DM), so their sidebar updates
 * without a refresh.
 */
async function notifyRecipients(
  io: SocketIOServer,
  channelId: string,
  authorId: string,
  message: unknown
) {
  const recipients = await conversationService.recipientIds(channelId);
  for (const recipientId of recipients) {
    if (recipientId === authorId) continue;
    io.to(userRoom(recipientId)).emit(SocketEvents.CONVERSATION_UPDATED, {
      channelId,
      lastMessage: message
    });
  }
}

export { room, userRoom };

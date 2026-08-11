import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SocketEvents } from '@g-arts/chat-shared';
import { conversationService, ConversationError } from '../services/conversation.js';
import { messageService } from '../services/message.js';
import { prisma } from '../lib/prisma.js';
import { limits } from '../plugins/rate-limit.js';
import {
  broadcastToChannel,
  broadcastToUsers,
  subscribeUserToChannel,
  unsubscribeUserFromChannel
} from '../socket/broadcaster.js';

const createChannelSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['text', 'voice', 'announcement']).default('text'),
  description: z.string().max(300).optional(),
  topic: z.string().max(200).optional(),
  isPrivate: z.boolean().default(false),
  // Ids are cuids, not uuids. The old schema demanded `.uuid()` here and on
  // replyToId, so every nested channel and every reply was rejected with a 400.
  memberIds: z.array(z.string().min(1).max(64)).max(200).optional()
});

const updateChannelSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).nullable().optional(),
  topic: z.string().max(200).nullable().optional(),
  position: z.number().int().min(0).optional(),
  isArchived: z.boolean().optional()
});

const messageSchema = z.object({
  content: z.string().max(8000).default(''),
  replyToId: z.string().min(1).max(64).nullish(),
  clientNonce: z.string().min(1).max(64).nullish(),
  attachmentIds: z.array(z.string().min(1).max(64)).max(10).optional()
});

const prefsSchema = z.object({
  notifyLevel: z.enum(['all', 'mentions', 'none']).optional(),
  mutedUntil: z.string().datetime().nullable().optional(),
  isFavorite: z.boolean().optional(),
  hidden: z.boolean().optional()
});

export async function conversationRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  const fail = (reply: import('fastify').FastifyReply, err: unknown) => {
    if (err instanceof ConversationError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    throw err;
  };

  // -------------------------------------------------------------------------
  // Listing & creation
  // -------------------------------------------------------------------------

  fastify.get('/', async (request) => ({
    conversations: await conversationService.listForUser(request.user.userId)
  }));

  fastify.post('/', async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can create channels' });
    }
    const parsed = createChannelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }

    try {
      const channel = await conversationService.createChannel({
        ...parsed.data,
        createdById: request.user.userId
      });
      const memberIds = channel.members.map((m) => m.userId);
      for (const userId of memberIds) await subscribeUserToChannel(userId, channel.id);
      broadcastToUsers(memberIds, SocketEvents.CONVERSATION_CREATED, { channelId: channel.id });
      return reply.status(201).send({ conversation: channel });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /** Opens (or reopens) a 1:1 thread. Idempotent. */
  fastify.post('/direct', async (request, reply) => {
    const parsed = z.object({ userId: z.string().min(1).max(64) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'A member id is required' });

    try {
      const channel = await conversationService.openDirect(request.user.userId, parsed.data.userId);
      const memberIds = channel.members.map((m) => m.userId);
      for (const userId of memberIds) await subscribeUserToChannel(userId, channel.id);
      broadcastToUsers(memberIds, SocketEvents.CONVERSATION_CREATED, { channelId: channel.id });
      return { conversation: channel };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/group', async (request, reply) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(60),
        memberIds: z.array(z.string().min(1).max(64)).min(2).max(200)
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'A name and at least two other members are required' });
    }

    try {
      const channel = await conversationService.createGroup(
        request.user.userId,
        parsed.data.name,
        parsed.data.memberIds
      );
      const memberIds = channel.members.map((m) => m.userId);
      for (const userId of memberIds) await subscribeUserToChannel(userId, channel.id);
      broadcastToUsers(memberIds, SocketEvents.CONVERSATION_CREATED, { channelId: channel.id });
      return reply.status(201).send({ conversation: channel });
    } catch (err) {
      return fail(reply, err);
    }
  });

  // -------------------------------------------------------------------------
  // Search — registered before /:id so a literal path is never captured by the
  // parameter route.
  // -------------------------------------------------------------------------

  fastify.get('/search', { config: limits.search }, async (request, reply) => {
    const parsed = z
      .object({
        q: z.string().min(2).max(200),
        channelId: z.string().min(1).max(64).optional(),
        fromUserId: z.string().min(1).max(64).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Search needs at least two characters' });
    }

    const messages = await messageService.search(request.user.userId, parsed.data.q, {
      channelId: parsed.data.channelId,
      fromUserId: parsed.data.fromUserId,
      limit: parsed.data.limit
    });
    return { messages };
  });

  // -------------------------------------------------------------------------
  // A single conversation
  // -------------------------------------------------------------------------

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { channel, membership } = await conversationService.access(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );
      return { conversation: channel, membership };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateChannelSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input' });

    try {
      const { channel, membership } = await conversationService.access(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );
      const isOwner = membership?.role === 'owner' || membership?.role === 'admin';
      if (request.user.role !== 'admin' && !isOwner) {
        return reply.status(403).send({ error: 'You cannot change this conversation' });
      }
      if (channel.kind === 'dm') {
        return reply.status(400).send({ error: 'Direct messages cannot be renamed' });
      }

      const updated = await conversationService.update(id, parsed.data);
      broadcastToChannel(id, SocketEvents.CONVERSATION_UPDATED, { channelId: id, conversation: updated });
      return { conversation: updated };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.delete('/:id', { onRequest: [fastify.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await prisma.channel.findUnique({ where: { id }, select: { kind: true } });
    if (!channel) return reply.status(404).send({ error: 'Conversation not found' });
    if (channel.kind !== 'channel') {
      return reply.status(400).send({ error: 'Only channels can be deleted' });
    }

    const recipients = await conversationService.recipientIds(id);
    await conversationService.delete(id);
    broadcastToUsers(recipients, SocketEvents.CONVERSATION_DELETED, { channelId: id });
    return { success: true };
  });

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  fastify.get('/:id/messages', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({
        before: z.string().min(1).max(64).optional(),
        // Capped, so a client cannot ask for the entire history in one request.
        limit: z.coerce.number().int().min(1).max(100).optional()
      })
      .safeParse(request.query);

    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      return await conversationService.getMessages(id, parsed.success ? parsed.data : {});
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/:id/messages', { config: limits.write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid message' });

    try {
      const access = await conversationService.access(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );
      if (!access.canPost) {
        return reply.status(403).send({
          error: access.channel.isArchived
            ? 'This conversation is archived'
            : 'Only admins can post in an announcement channel'
        });
      }
      if (access.isOpenChannel && !access.membership) {
        await conversationService.ensureMembership(id, request.user.userId);
      }

      const { message, deduplicated } = await messageService.create({
        channelId: id,
        userId: request.user.userId,
        content: parsed.data.content,
        replyToId: parsed.data.replyToId ?? null,
        clientNonce: parsed.data.clientNonce ?? null,
        attachmentIds: parsed.data.attachmentIds
      });

      if (!deduplicated) {
        broadcastToChannel(id, SocketEvents.MESSAGE_NEW, { channelId: id, message });
      }
      return reply.status(deduplicated ? 200 : 201).send({ message });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.patch('/:id/messages/:messageId', async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string };
    const parsed = z.object({ content: z.string().min(1).max(8000) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Content is required' });

    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      const message = await messageService.edit(messageId, request.user.userId, parsed.data.content);
      broadcastToChannel(id, SocketEvents.MESSAGE_UPDATED, { channelId: id, message });
      return { message };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.delete('/:id/messages/:messageId', async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string };
    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      const result = await messageService.remove(
        messageId,
        request.user.userId,
        request.user.role === 'admin'
      );
      broadcastToChannel(id, SocketEvents.MESSAGE_DELETED, result);
      return { success: true };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/:id/messages/:messageId/reactions', async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string };
    const parsed = z.object({ emoji: z.string().min(1).max(16) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'An emoji is required' });

    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      const result = await messageService.toggleReaction(
        messageId,
        request.user.userId,
        parsed.data.emoji
      );
      broadcastToChannel(id, SocketEvents.MESSAGE_REACTION, result);
      return result;
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.get('/:id/pins', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      return { messages: await conversationService.getPinned(id) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/:id/messages/:messageId/pin', async (request, reply) => {
    const { id, messageId } = request.params as { id: string; messageId: string };
    const parsed = z.object({ pinned: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input' });

    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      const message = await messageService.setPinned(
        messageId,
        request.user.userId,
        parsed.data.pinned
      );
      broadcastToChannel(id, SocketEvents.MESSAGE_PINNED, {
        channelId: id,
        message,
        pinned: parsed.data.pinned
      });
      return { message };
    } catch (err) {
      return fail(reply, err);
    }
  });

  // -------------------------------------------------------------------------
  // Read state & preferences
  // -------------------------------------------------------------------------

  fastify.post('/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({ messageId: z.string().min(1).max(64).optional() })
      .safeParse(request.body ?? {});

    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      const cursor = await conversationService.markRead(
        id,
        request.user.userId,
        parsed.success ? parsed.data.messageId : undefined
      );
      if (cursor) broadcastToChannel(id, SocketEvents.READ_UPDATED, cursor);
      return { cursor };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.patch('/:id/preferences', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = prefsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input' });

    try {
      await conversationService.access(id, request.user.userId, request.user.role === 'admin');
      await conversationService.ensureMembership(id, request.user.userId);
      const membership = await conversationService.updateMemberPrefs(id, request.user.userId, {
        ...parsed.data,
        mutedUntil:
          parsed.data.mutedUntil === undefined
            ? undefined
            : parsed.data.mutedUntil === null
              ? null
              : new Date(parsed.data.mutedUntil)
      });
      return { membership };
    } catch (err) {
      return fail(reply, err);
    }
  });

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  fastify.post('/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({ userIds: z.array(z.string().min(1).max(64)).min(1).max(100) })
      .safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Member ids are required' });

    try {
      const { channel, membership } = await conversationService.access(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );
      if (channel.kind === 'dm') {
        return reply.status(400).send({ error: 'People cannot be added to a direct message' });
      }
      const isOwner = membership?.role === 'owner' || membership?.role === 'admin';
      if (request.user.role !== 'admin' && !isOwner) {
        return reply.status(403).send({ error: 'You cannot add people to this conversation' });
      }

      const members = await conversationService.addMembers(id, parsed.data.userIds);
      for (const userId of parsed.data.userIds) await subscribeUserToChannel(userId, id);
      broadcastToUsers(parsed.data.userIds, SocketEvents.CONVERSATION_CREATED, { channelId: id });
      broadcastToChannel(id, SocketEvents.CONVERSATION_UPDATED, { channelId: id, members });
      return { members };
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.delete('/:id/members/:userId', async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string };
    try {
      const { channel, membership } = await conversationService.access(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );
      if (channel.kind === 'dm') {
        return reply.status(400).send({ error: 'Direct messages have a fixed set of participants' });
      }
      const isSelf = userId === request.user.userId;
      const isOwner = membership?.role === 'owner' || membership?.role === 'admin';
      if (!isSelf && request.user.role !== 'admin' && !isOwner) {
        return reply.status(403).send({ error: 'You cannot remove people from this conversation' });
      }

      await conversationService.removeMember(id, userId);
      await unsubscribeUserFromChannel(userId, id);
      broadcastToChannel(id, SocketEvents.CONVERSATION_UPDATED, { channelId: id });
      broadcastToUsers([userId], SocketEvents.CONVERSATION_DELETED, { channelId: id });
      return { success: true };
    } catch (err) {
      return fail(reply, err);
    }
  });
}

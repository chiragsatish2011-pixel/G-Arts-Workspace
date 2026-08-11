import { prisma } from '../lib/prisma.js';
import { messageInclude, ConversationError } from './conversation.js';

const MAX_CONTENT = 8000;

export interface CreateMessageInput {
  channelId: string;
  userId: string;
  content: string;
  type?: 'text' | 'file' | 'voice' | 'system';
  replyToId?: string | null;
  clientNonce?: string | null;
  attachmentIds?: string[];
}

export class MessageService {
  /**
   * Persists a message. `clientNonce` makes the write idempotent: a retry
   * after a dropped response or a socket reconnect resolves to the row that
   * already exists instead of posting the message twice.
   */
  async create(input: CreateMessageInput) {
    const content = input.content.slice(0, MAX_CONTENT);
    const attachmentIds = input.attachmentIds ?? [];

    if (!content.trim() && attachmentIds.length === 0) {
      throw new ConversationError('Message cannot be empty');
    }

    if (input.clientNonce) {
      const existing = await prisma.message.findFirst({
        where: {
          channelId: input.channelId,
          userId: input.userId,
          clientNonce: input.clientNonce
        },
        include: messageInclude
      });
      if (existing) return { message: existing, deduplicated: true };
    }

    if (input.replyToId) {
      const parent = await prisma.message.findFirst({
        where: { id: input.replyToId, channelId: input.channelId },
        select: { id: true }
      });
      // Silently dropping a bad parent would lose the reply context, and
      // letting it through would let someone thread across conversations.
      if (!parent) throw new ConversationError('The message being replied to is not in this conversation');
    }

    // Only bind attachments this member uploaded and has not already attached.
    const owned = attachmentIds.length
      ? await prisma.attachment.findMany({
          where: { id: { in: attachmentIds }, uploadedById: input.userId, messageId: null },
          select: { id: true }
        })
      : [];

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          channelId: input.channelId,
          userId: input.userId,
          content,
          type: input.type ?? (owned.length > 0 ? 'file' : 'text'),
          replyToId: input.replyToId ?? null,
          clientNonce: input.clientNonce ?? null
        }
      });

      if (owned.length > 0) {
        await tx.attachment.updateMany({
          where: { id: { in: owned.map((a) => a.id) } },
          data: { messageId: created.id }
        });
      }

      await tx.channel.update({
        where: { id: input.channelId },
        data: { lastMessageAt: created.createdAt }
      });

      // The author has by definition read their own message.
      await tx.channelMember.updateMany({
        where: { channelId: input.channelId, userId: input.userId },
        data: {
          lastReadAt: created.createdAt,
          lastReadMessageId: created.id,
          lastDeliveredAt: created.createdAt
        }
      });

      return created;
    });

    await this.recordMentions(message.id, input.channelId, input.userId, content);

    const full = await prisma.message.findUniqueOrThrow({
      where: { id: message.id },
      include: messageInclude
    });

    return { message: full, deduplicated: false };
  }

  /**
   * Resolves `@username` and `@everyone` against actual members of the
   * conversation, so a mention can never notify someone who is not in it.
   */
  private async recordMentions(
    messageId: string,
    channelId: string,
    authorId: string,
    content: string
  ) {
    const handles = new Set<string>();
    let everyone = false;

    for (const match of content.matchAll(/(?:^|\s)@([a-z0-9._-]{2,32})/gi)) {
      const handle = match[1].toLowerCase();
      if (handle === 'everyone' || handle === 'channel' || handle === 'here') {
        everyone = true;
      } else {
        handles.add(handle);
      }
    }

    if (!everyone && handles.size === 0) return;

    const members = await prisma.channelMember.findMany({
      where: { channelId, userId: { not: authorId } },
      select: { userId: true, user: { select: { username: true } } }
    });

    const targets = everyone
      ? members.map((m) => m.userId)
      : members.filter((m) => handles.has(m.user.username.toLowerCase())).map((m) => m.userId);

    if (targets.length === 0) return;

    // `targets` is already distinct, and SQLite has no skipDuplicates, so a
    // clash here can only come from a concurrent write — which the unique
    // constraint correctly rejects and which is not worth failing the send for.
    await prisma.mention
      .createMany({
        data: targets.map((userId) => ({
          messageId,
          userId,
          kind: everyone ? 'everyone' : 'user'
        }))
      })
      .catch(() => undefined);
  }

  async edit(messageId: string, userId: string, content: string, isAdmin = false) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, userId: true, channelId: true, deletedAt: true }
    });
    if (!message || message.deletedAt) throw new ConversationError('Message not found', 404);
    // Admins may delete, but never rewrite someone else's words.
    if (message.userId !== userId) throw new ConversationError('You can only edit your own messages', 403);
    if (!content.trim()) throw new ConversationError('Message cannot be empty');

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.slice(0, MAX_CONTENT), editedAt: new Date() },
      include: messageInclude
    });

    await prisma.mention.deleteMany({ where: { messageId } });
    await this.recordMentions(messageId, message.channelId, userId, content);

    return updated;
  }

  async remove(messageId: string, userId: string, isAdmin = false) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, userId: true, channelId: true }
    });
    if (!message) throw new ConversationError('Message not found', 404);
    if (message.userId !== userId && !isAdmin) {
      throw new ConversationError('You can only delete your own messages', 403);
    }

    // Tombstone rather than hard delete, so replies keep their anchor.
    await prisma.$transaction([
      prisma.message.update({
        where: { id: messageId },
        data: { content: '', deletedAt: new Date(), pinnedAt: null, pinnedById: null }
      }),
      prisma.mention.deleteMany({ where: { messageId } }),
      prisma.reaction.deleteMany({ where: { messageId } })
    ]);

    return { messageId, channelId: message.channelId };
  }

  async setPinned(messageId: string, userId: string, pinned: boolean) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, deletedAt: true }
    });
    if (!message || message.deletedAt) throw new ConversationError('Message not found', 404);

    return prisma.message.update({
      where: { id: messageId },
      data: pinned
        ? { pinnedAt: new Date(), pinnedById: userId }
        : { pinnedAt: null, pinnedById: null },
      include: messageInclude
    });
  }

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, deletedAt: true }
    });
    if (!message || message.deletedAt) throw new ConversationError('Message not found', 404);

    const existing = await prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } }
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return { action: 'remove' as const, messageId, channelId: message.channelId, userId, emoji };
    }

    await prisma.reaction.create({ data: { messageId, userId, emoji } });
    return { action: 'add' as const, messageId, channelId: message.channelId, userId, emoji };
  }

  /**
   * Full-text-ish search scoped to conversations the member can actually see.
   *
   * The old implementation passed `mode: 'insensitive'`, which the SQLite
   * connector rejects outright — search threw on every call. SQLite's LIKE is
   * already case-insensitive for ASCII, and Postgres ILIKE via `mode` can be
   * reinstated alongside a provider switch.
   */
  async search(
    userId: string,
    query: string,
    opts: { channelId?: string; fromUserId?: string; limit?: number } = {}
  ) {
    const terms = query
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 6);

    if (terms.length === 0) return [];

    const visible = await prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true }
    });
    const openChannels = await prisma.channel.findMany({
      where: { kind: 'channel', isPrivate: false },
      select: { id: true }
    });

    const allowed = new Set([
      ...visible.map((v) => v.channelId),
      ...openChannels.map((c) => c.id)
    ]);
    if (opts.channelId) {
      if (!allowed.has(opts.channelId)) return [];
      allowed.clear();
      allowed.add(opts.channelId);
    }
    if (allowed.size === 0) return [];

    return prisma.message.findMany({
      where: {
        deletedAt: null,
        channelId: { in: [...allowed] },
        ...(opts.fromUserId ? { userId: opts.fromUserId } : {}),
        // Every term must appear, which makes multi-word queries useful
        // instead of matching the whole string verbatim.
        AND: terms.map((term) => ({ content: { contains: term } }))
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 30, 100),
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, kind: true, slug: true } }
      }
    });
  }

  async byId(messageId: string) {
    return prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  }
}

export const messageService = new MessageService();

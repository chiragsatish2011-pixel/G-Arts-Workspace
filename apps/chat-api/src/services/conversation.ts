import { prisma } from '../lib/prisma.js';
import { slugify } from '@g-arts/chat-shared';
import { publicUserSelect } from './auth.js';

export class ConversationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

/** Sorted pair key, so `open(a, b)` and `open(b, a)` land on the same row. */
export function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  notifyLevel: true,
  mutedUntil: true,
  isFavorite: true,
  lastReadAt: true,
  lastReadMessageId: true,
  lastDeliveredAt: true,
  joinedAt: true,
  user: { select: publicUserSelect }
} as const;

export const messageInclude = {
  user: { select: publicUserSelect },
  reactions: {
    select: { id: true, emoji: true, userId: true, createdAt: true }
  },
  attachments: {
    select: {
      id: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      storageKey: true,
      width: true,
      height: true,
      durationMs: true,
      placeholder: true
    }
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      type: true,
      deletedAt: true,
      createdAt: true,
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } }
    }
  },
  pinnedBy: { select: { id: true, displayName: true } },
  _count: { select: { replies: true } }
} as const;

export class ConversationService {
  // -------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------

  /**
   * Resolves what a member may do in a conversation. Every read and write path
   * goes through this — previously any authenticated member could join any
   * channel room over the socket and receive private traffic.
   */
  async access(channelId: string, userId: string, isAdmin = false, isGuest = false) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { members: { where: { userId }, select: memberSelect } }
    });

    if (!channel) {
      throw new ConversationError('Conversation not found', 404);
    }

    const membership = channel.members[0] ?? null;
    const isOpenChannel = channel.kind === 'channel' && !channel.isPrivate;

    // Admins can moderate private rooms, but they are not silently treated as
    // participants of someone else's DM.
    const canModerate = isAdmin && channel.kind === 'channel';
    const canRead = Boolean(membership) || isOpenChannel || canModerate;

    if (!canRead) {
      // 404 rather than 403: a non-member should not be able to probe which
      // private conversations exist.
      throw new ConversationError('Conversation not found', 404);
    }

    const canPost =
      !channel.isArchived &&
      // Workspace GUEST role maps to read-only access here.
      !isGuest &&
      (channel.type !== 'announcement' || isAdmin) &&
      (Boolean(membership) || isOpenChannel);

    return { channel, membership, canRead, canPost, canModerate, isOpenChannel };
  }

  /** Joins an open channel on first visit so read cursors have somewhere to live. */
  async ensureMembership(channelId: string, userId: string) {
    return prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId },
      update: { hiddenAt: null },
      select: memberSelect
    });
  }

  // -------------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------------

  async listForUser(userId: string) {
    const [memberships, openChannels] = await Promise.all([
      prisma.channelMember.findMany({
        where: { userId, hiddenAt: null, channel: { isArchived: false } },
        select: {
          lastReadAt: true,
          lastReadMessageId: true,
          notifyLevel: true,
          mutedUntil: true,
          isFavorite: true,
          role: true,
          channel: {
            include: {
              members: { select: memberSelect },
              _count: { select: { messages: { where: { deletedAt: null } } } }
            }
          }
        }
      }),
      prisma.channel.findMany({
        where: {
          kind: 'channel',
          isPrivate: false,
          isArchived: false,
          members: { none: { userId } }
        },
        include: {
          members: { select: memberSelect },
          _count: { select: { messages: { where: { deletedAt: null } } } }
        }
      })
    ]);

    const rows = [
      ...memberships.map((m) => ({ channel: m.channel, membership: m })),
      ...openChannels.map((channel) => ({ channel, membership: null }))
    ];

    const unread = await this.unreadCounts(
      userId,
      rows.map((r) => ({
        channelId: r.channel.id,
        lastReadAt: r.membership?.lastReadAt ?? null
      }))
    );

    const previews = await this.lastMessages(rows.map((r) => r.channel.id));

    return rows
      .map(({ channel, membership }) =>
        this.serialize(channel, membership, userId, {
          unreadCount: unread.counts.get(channel.id) ?? 0,
          mentionCount: unread.mentions.get(channel.id) ?? 0,
          lastMessage: previews.get(channel.id) ?? null
        })
      )
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (at !== bt) return bt - at;
        return a.name.localeCompare(b.name);
      });
  }

  private serialize(
    channel: any,
    membership: any,
    viewerId: string,
    extra: { unreadCount: number; mentionCount: number; lastMessage: any }
  ) {
    // A DM has no name of its own — it is named after the other participant.
    const counterpart =
      channel.kind === 'dm'
        ? channel.members.find((m: any) => m.userId !== viewerId)?.user ?? null
        : null;

    return {
      id: channel.id,
      kind: channel.kind as 'channel' | 'dm' | 'group',
      name: counterpart ? counterpart.displayName : channel.name,
      slug: channel.slug,
      description: channel.description,
      topic: channel.topic,
      type: channel.type,
      icon: channel.icon,
      isPrivate: channel.isPrivate,
      isArchived: channel.isArchived,
      position: channel.position,
      parentId: channel.parentId,
      lastMessageAt: channel.lastMessageAt,
      createdAt: channel.createdAt,
      counterpart,
      isMember: Boolean(membership),
      isFavorite: Boolean(membership?.isFavorite),
      notifyLevel: membership?.notifyLevel ?? 'all',
      mutedUntil: membership?.mutedUntil ?? null,
      myRole: membership?.role ?? null,
      lastReadAt: membership?.lastReadAt ?? null,
      lastReadMessageId: membership?.lastReadMessageId ?? null,
      messageCount: channel._count?.messages ?? 0,
      memberCount: channel.members.length,
      members: channel.members.map((m: any) => ({
        userId: m.userId,
        role: m.role,
        lastReadAt: m.lastReadAt,
        lastReadMessageId: m.lastReadMessageId,
        lastDeliveredAt: m.lastDeliveredAt,
        user: m.user
      })),
      ...extra
    };
  }

  /**
   * One grouped query for unread counts and one for mentions, rather than a
   * count query per conversation.
   */
  private async unreadCounts(
    userId: string,
    entries: Array<{ channelId: string; lastReadAt: Date | null }>
  ) {
    const counts = new Map<string, number>();
    const mentions = new Map<string, number>();
    if (entries.length === 0) return { counts, mentions };

    const grouped = await prisma.message.groupBy({
      by: ['channelId'],
      where: {
        deletedAt: null,
        userId: { not: userId },
        OR: entries.map((e) => ({
          channelId: e.channelId,
          ...(e.lastReadAt ? { createdAt: { gt: e.lastReadAt } } : {})
        }))
      },
      _count: { _all: true }
    });
    for (const row of grouped) {
      counts.set(row.channelId, row._count._all);
    }

    const mentionRows = await prisma.mention.findMany({
      where: { userId, readAt: null, message: { deletedAt: null } },
      select: { message: { select: { channelId: true } } }
    });
    for (const row of mentionRows) {
      const id = row.message.channelId;
      mentions.set(id, (mentions.get(id) ?? 0) + 1);
    }

    return { counts, mentions };
  }

  private async lastMessages(channelIds: string[]) {
    const map = new Map<string, any>();
    if (channelIds.length === 0) return map;

    // SQLite has no DISTINCT ON, and Prisma's `distinct` runs in memory after
    // the take, so order first and let `distinct` pick the newest per channel.
    const rows = await prisma.message.findMany({
      where: { channelId: { in: channelIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      distinct: ['channelId'],
      select: {
        id: true,
        channelId: true,
        content: true,
        type: true,
        createdAt: true,
        userId: true,
        user: { select: { id: true, displayName: true, username: true } },
        attachments: { select: { id: true, mimeType: true, fileName: true } }
      }
    });
    for (const row of rows) map.set(row.channelId, row);
    return map;
  }

  // -------------------------------------------------------------------------
  // Creation
  // -------------------------------------------------------------------------

  async createChannel(input: {
    name: string;
    type: 'text' | 'voice' | 'announcement';
    createdById: string;
    description?: string;
    topic?: string;
    isPrivate?: boolean;
    memberIds?: string[];
  }) {
    const slug = slugify(input.name);
    if (!slug) {
      throw new ConversationError('Channel name must contain at least one letter or number');
    }
    if (await prisma.channel.findUnique({ where: { slug } })) {
      throw new ConversationError('A channel with that name already exists', 409);
    }

    const maxPosition = await prisma.channel.aggregate({
      where: { kind: 'channel' },
      _max: { position: true }
    });

    const memberIds = new Set([input.createdById, ...(input.memberIds ?? [])]);

    return prisma.channel.create({
      data: {
        kind: 'channel',
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        topic: input.topic?.trim() || null,
        type: input.type,
        isPrivate: input.isPrivate ?? false,
        position: (maxPosition._max.position ?? 0) + 1,
        createdById: input.createdById,
        members: {
          create: [...memberIds].map((userId) => ({
            userId,
            role: userId === input.createdById ? 'owner' : 'member'
          }))
        }
      },
      include: { members: { select: memberSelect } }
    });
  }

  /**
   * Opens (or reopens) the 1:1 thread between two members. The unique `dmKey`
   * makes this idempotent even if both people click at the same instant.
   */
  async openDirect(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new ConversationError('You cannot start a direct message with yourself');
    }

    const other = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, displayName: true, disabledAt: true }
    });
    if (!other || other.disabledAt) {
      throw new ConversationError('Member not found', 404);
    }

    const dmKey = directKey(userId, otherUserId);
    const existing = await prisma.channel.findUnique({
      where: { dmKey },
      include: { members: { select: memberSelect } }
    });

    if (existing) {
      // Un-hide it for whoever archived the thread.
      await prisma.channelMember.updateMany({
        where: { channelId: existing.id, userId },
        data: { hiddenAt: null }
      });
      return existing;
    }

    try {
      return await prisma.channel.create({
        data: {
          kind: 'dm',
          name: other.displayName,
          slug: null,
          dmKey,
          isPrivate: true,
          createdById: userId,
          members: {
            create: [{ userId, role: 'owner' }, { userId: otherUserId, role: 'owner' }]
          }
        },
        include: { members: { select: memberSelect } }
      });
    } catch {
      // Lost a race against a concurrent open — the row now exists.
      return prisma.channel.findUniqueOrThrow({
        where: { dmKey },
        include: { members: { select: memberSelect } }
      });
    }
  }

  async createGroup(creatorId: string, name: string, memberIds: string[]) {
    const ids = new Set([creatorId, ...memberIds]);
    if (ids.size < 3) {
      throw new ConversationError('A group needs at least three people — use a direct message for two');
    }
    return prisma.channel.create({
      data: {
        kind: 'group',
        name: name.trim(),
        slug: null,
        isPrivate: true,
        createdById: creatorId,
        members: {
          create: [...ids].map((userId) => ({
            userId,
            role: userId === creatorId ? 'owner' : 'member'
          }))
        }
      },
      include: { members: { select: memberSelect } }
    });
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  /**
   * Keyset pagination. The previous implementation combined a `before` cursor
   * with an OFFSET, which silently skipped or repeated messages whenever new
   * ones arrived mid-scroll.
   */
  async getMessages(channelId: string, opts: { before?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

    let cursor: { createdAt: Date; id: string } | undefined;
    if (opts.before) {
      const anchor = await prisma.message.findUnique({
        where: { id: opts.before },
        select: { createdAt: true, id: true }
      });
      if (anchor) cursor = anchor;
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                // Tie-break on id so messages sharing a millisecond are never
                // dropped or served twice.
                { createdAt: cursor.createdAt, id: { lt: cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: messageInclude
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;

    return {
      data: page.reverse(),
      hasMore,
      // Cursor for the next older page.
      nextCursor: hasMore ? page[0]?.id ?? null : null
    };
  }

  async getPinned(channelId: string) {
    return prisma.message.findMany({
      where: { channelId, pinnedAt: { not: null }, deletedAt: null },
      orderBy: { pinnedAt: 'desc' },
      take: 50,
      include: messageInclude
    });
  }

  // -------------------------------------------------------------------------
  // Read state
  // -------------------------------------------------------------------------

  /**
   * Advances the member's read cursor. Monotonic: an out-of-order event from a
   * second device can never move the cursor backwards and resurrect unreads.
   */
  async markRead(channelId: string, userId: string, messageId?: string) {
    const membership = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } }
    });
    if (!membership) return null;

    let readAt = new Date();
    if (messageId) {
      const message = await prisma.message.findFirst({
        where: { id: messageId, channelId },
        select: { createdAt: true }
      });
      if (!message) return null;
      readAt = message.createdAt;
    }

    if (membership.lastReadAt && membership.lastReadAt >= readAt) {
      return {
        channelId,
        userId,
        lastReadAt: membership.lastReadAt,
        lastReadMessageId: membership.lastReadMessageId
      };
    }

    const updated = await prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: {
        lastReadAt: readAt,
        lastReadMessageId: messageId ?? membership.lastReadMessageId,
        lastDeliveredAt:
          !membership.lastDeliveredAt || membership.lastDeliveredAt < readAt
            ? readAt
            : membership.lastDeliveredAt
      }
    });

    await prisma.mention.updateMany({
      where: {
        userId,
        readAt: null,
        message: { channelId, createdAt: { lte: readAt } }
      },
      data: { readAt: new Date() }
    });

    return {
      channelId,
      userId,
      lastReadAt: updated.lastReadAt,
      lastReadMessageId: updated.lastReadMessageId
    };
  }

  /**
   * Marks everything currently visible to a member as delivered. Called when a
   * socket connects, which is exactly WhatsApp's second-tick semantic: the
   * device received it, the human has not necessarily looked.
   */
  async markDelivered(userId: string) {
    const now = new Date();
    const memberships = await prisma.channelMember.findMany({
      where: {
        userId,
        OR: [{ lastDeliveredAt: null }, { lastDeliveredAt: { lt: now } }]
      },
      select: { channelId: true }
    });
    if (memberships.length === 0) return [];

    await prisma.channelMember.updateMany({
      where: { userId, channelId: { in: memberships.map((m) => m.channelId) } },
      data: { lastDeliveredAt: now }
    });

    return memberships.map((m) => ({ channelId: m.channelId, userId, lastDeliveredAt: now }));
  }

  // -------------------------------------------------------------------------
  // Membership & settings
  // -------------------------------------------------------------------------

  async addMembers(channelId: string, userIds: string[]) {
    // Upsert rather than createMany: SQLite has no skipDuplicates, and
    // re-adding someone who is already a member should be a no-op, not a 500.
    for (const userId of userIds) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId },
        update: { hiddenAt: null }
      });
    }
    return prisma.channelMember.findMany({
      where: { channelId },
      select: memberSelect
    });
  }

  async removeMember(channelId: string, userId: string) {
    await prisma.channelMember.deleteMany({ where: { channelId, userId } });
  }

  async updateMemberPrefs(
    channelId: string,
    userId: string,
    data: { notifyLevel?: string; mutedUntil?: Date | null; isFavorite?: boolean; hidden?: boolean }
  ) {
    return prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: {
        ...(data.notifyLevel !== undefined ? { notifyLevel: data.notifyLevel } : {}),
        ...(data.mutedUntil !== undefined ? { mutedUntil: data.mutedUntil } : {}),
        ...(data.isFavorite !== undefined ? { isFavorite: data.isFavorite } : {}),
        ...(data.hidden !== undefined ? { hiddenAt: data.hidden ? new Date() : null } : {})
      },
      select: memberSelect
    });
  }

  async update(
    channelId: string,
    data: { name?: string; description?: string | null; topic?: string | null; position?: number; isArchived?: boolean }
  ) {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      patch.name = data.name.trim();
      const slug = slugify(data.name);
      const clash = await prisma.channel.findFirst({
        where: { slug, id: { not: channelId } },
        select: { id: true }
      });
      if (clash) throw new ConversationError('A channel with that name already exists', 409);
      patch.slug = slug;
    }
    if (data.description !== undefined) patch.description = data.description;
    if (data.topic !== undefined) patch.topic = data.topic;
    if (data.position !== undefined) patch.position = data.position;
    if (data.isArchived !== undefined) patch.isArchived = data.isArchived;

    return prisma.channel.update({ where: { id: channelId }, data: patch });
  }

  async delete(channelId: string) {
    await prisma.channel.delete({ where: { id: channelId } });
  }

  /** Everyone who should receive realtime traffic for a conversation. */
  async recipientIds(channelId: string): Promise<string[]> {
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true }
    });
    return members.map((m) => m.userId);
  }
}

export const conversationService = new ConversationService();

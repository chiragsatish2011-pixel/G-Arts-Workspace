import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { slugify } from '@g-arts/chat-shared';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { isServiceCall, mapWorkspaceRole } from '../services/workspace-identity.js';
import { conversationService } from '../services/conversation.js';
import { messageService } from '../services/message.js';
import { broadcastToChannel, subscribeUserToChannel } from '../socket/broadcaster.js';
import { SocketEvents } from '@g-arts/chat-shared';

/**
 * Service-to-service surface for the G Arts Workspace.
 *
 * The Workspace owns Events and Projects; chat owns conversations. When an
 * Event or Project is created there, it asks here for a channel and stores
 * only the returned id. Messages live in exactly one database — this one —
 * so the two never have to be reconciled.
 *
 * Everything here is authenticated by the shared service token, never by a
 * member's session: these calls are made by the Workspace API, not a browser.
 */

const bindSchema = z.object({
  /** Which Workspace object the channel belongs to. */
  kind: z.enum(['event', 'project']),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  /** Workspace user ids; they are mirrored into chat on first sight. */
  memberWorkspaceIds: z.array(z.string().min(1).max(64)).max(200).optional(),
  /** Archiving a Workspace object archives its channel rather than deleting it. */
  isArchived: z.boolean().optional()
});

const memberSchema = z.object({
  members: z
    .array(
      z.object({
        workspaceUserId: z.string().min(1).max(64),
        username: z.string().min(1).max(40),
        displayName: z.string().min(1).max(80),
        role: z.string().min(1).max(24),
        title: z.string().max(80).nullable().optional(),
        accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
      })
    )
    .min(1)
    .max(200)
});

const noticeSchema = z.object({ message: z.string().trim().min(3).max(280) });

/** These are part of the workspace itself, not disposable project rooms.
 * Keep them public and make every active Workspace account a member so their
 * messages, unread state and socket delivery are consistent from day one. */
async function ensureSharedChannels() {
  const owner = await prisma.user.findFirst({
    where: { disabledAt: null }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], select: { id: true }
  });
  if (!owner) throw new Error('No active Chat account is available for shared channels');
  const definitions = [
    { slug: 'general', name: 'General', description: 'The shared conversation for everyone in the Workspace', type: 'text' },
    { slug: 'announcements', name: 'Announcements', description: 'Important updates from Workspace administrators', type: 'announcement' }
  ];
  const members = await prisma.user.findMany({ where: { disabledAt: null }, select: { id: true } });
  const channels = [];
  for (const definition of definitions) {
    const channel = await prisma.channel.upsert({
      where: { slug: definition.slug },
      create: { kind: 'channel', ...definition, isPrivate: false, isArchived: false, createdById: owner.id },
      update: { name: definition.name, description: definition.description, type: definition.type, isPrivate: false, isArchived: false },
      select: { id: true, name: true, createdById: true }
    });
    for (const member of members) {
      await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId: member.id } },
        create: { channelId: channel.id, userId: member.id, role: member.id === channel.createdById ? 'owner' : 'member' }, update: {}
      });
      await subscribeUserToChannel(member.id, channel.id);
    }
    channels.push(channel);
  }
  return channels;
}

/** A small, permanent public channel for changes that affect the whole
 * Workspace. It is created only when the first real status notice is needed. */
async function workspaceUpdatesChannel() {
  let channel = await prisma.channel.findUnique({ where: { slug: 'workspace-updates' }, select: { id: true, createdById: true } });
  if (!channel) {
    const owner = await prisma.user.findFirst({
      where: { disabledAt: null },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true }
    });
    if (!owner) throw new Error('No active Chat account is available for Workspace updates');
    channel = await prisma.channel.create({
      data: { kind: 'channel', name: 'Workspace updates', slug: 'workspace-updates', description: 'Account and workspace changes', type: 'announcement', isPrivate: false, createdById: owner.id },
      select: { id: true, createdById: true }
    });
  }
  const members = await prisma.user.findMany({ where: { disabledAt: null }, select: { id: true } });
  for (const member of members) {
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: channel.id, userId: member.id } },
      create: { channelId: channel.id, userId: member.id, role: member.id === channel.createdById ? 'owner' : 'member' },
      update: {}
    });
    await subscribeUserToChannel(member.id, channel.id);
  }
  return channel;
}

async function publishWorkspaceNotice(content: string) {
  const channel = await workspaceUpdatesChannel();
  const author = await prisma.user.findFirst({ where: { id: channel.createdById, disabledAt: null }, select: { id: true } })
    ?? await prisma.user.findFirst({ where: { disabledAt: null }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
  if (!author) throw new Error('No active Chat account is available for Workspace updates');
  const created = await messageService.create({ channelId: channel.id, userId: author.id, content, type: 'system' });
  broadcastToChannel(channel.id, SocketEvents.MESSAGE_NEW, { channelId: channel.id, message: created.message });
  return { channelId: channel.id, messageId: created.message.id };
}

export async function integrationRoutes(fastify: FastifyInstance) {
  // Refuse the whole surface unless the Workspace link is configured, so a
  // standalone deployment does not expose it at all.
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.workspace.enabled || !config.workspace.serviceToken) {
      return reply.status(404).send({ error: 'Not found' });
    }
    if (!isServiceCall(request.headers.authorization)) {
      return reply.status(401).send({ error: 'Service authentication required' });
    }
  });

  fastify.get('/health', async () => ({ ok: true, service: 'garts-chat' }));

  /**
   * Creates or refreshes Chat's local identity records for Workspace accounts.
   * This has no channel side effect: it only makes real team members available
   * to the direct-message and new-channel pickers before their first chat visit.
   */
  fastify.put('/members', async (request, reply) => {
    const parsed = memberSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid member list' });
    const users = [];
    for (const member of parsed.data.members) {
      users.push(await mirrorWorkspaceMember(member));
    }
    const sharedChannels = await ensureSharedChannels();
    return { mirrored: users.length, users, sharedChannels: sharedChannels.map(({ id, name }) => ({ id, name })) };
  });

  /** Idempotent recovery endpoint for the two permanent team-wide channels. */
  fastify.post('/shared-channels', async () => {
    const channels = await ensureSharedChannels();
    return { channels: channels.map(({ id, name }) => ({ id, name })) };
  });

  /** Posts a permanent, visible Workspace status note to every active chat
   * member. The Workspace is the only caller that can create these messages. */
  fastify.post('/notices', async (request, reply) => {
    const parsed = noticeSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid Workspace notice' });
    return publishWorkspaceNotice(parsed.data.message);
  });

  /** Suspension is an access decision in the Workspace, so Chat mirrors it
   * immediately and revokes its own sessions. Restoration makes the account
   * visible again without inventing a new identity. */
  fastify.patch('/members/:workspaceUserId', async (request, reply) => {
    const params = z.object({ workspaceUserId: z.string().min(1).max(64) }).safeParse(request.params);
    const body = z.object({ disabled: z.boolean() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid member access update' });
    const member = await prisma.user.findUnique({ where: { workspaceUserId: params.data.workspaceUserId }, select: { id: true } });
    if (!member) return reply.status(404).send({ error: 'Member not found in Chat' });
    if (body.data.disabled) await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.user.update({ where: { id: member.id }, data: { disabledAt: body.data.disabled ? new Date() : null, status: body.data.disabled ? 'offline' : 'online' } });
    return { updated: true, disabled: body.data.disabled };
  });

  /**
   * Idempotent: called every time an Event or Project is saved, and always
   * returns the same channel for the same Workspace object.
   */
  fastify.post('/channels', async (request, reply) => {
    const parsed = bindSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { kind, id, name, description, memberWorkspaceIds, isArchived } = parsed.data;

    const existing = await prisma.channel.findFirst({
      where: { workspaceKind: kind, workspaceId: id },
      select: { id: true }
    });

    if (existing) {
      const channel = await prisma.channel.update({
        where: { id: existing.id },
        data: {
          name,
          ...(description !== undefined ? { description } : {}),
          ...(isArchived !== undefined ? { isArchived } : {})
        },
        select: { id: true, name: true, isArchived: true }
      });
      if (memberWorkspaceIds?.length) await syncMembers(channel.id, memberWorkspaceIds);
      return { channel, created: false };
    }

    // Needs an owner row; the first Workspace admin mirrored into chat will do,
    // falling back to any existing chat administrator.
    const owner = await prisma.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
      orderBy: { createdAt: 'asc' }
    });
    if (!owner) {
      return reply
        .status(409)
        .send({ error: 'Chat has no administrator yet; seed one before binding channels' });
    }

    const created = await prisma.channel.create({
      data: {
        kind: 'channel',
        name,
        // Workspace-bound channels are private to their participants and are
        // named after the object, so slugs would collide across events.
        slug: `${kind}-${slugify(name).slice(0, 40)}-${id.slice(-6)}`,
        description: description ?? null,
        isPrivate: true,
        isArchived: isArchived ?? false,
        workspaceKind: kind,
        workspaceId: id,
        createdById: owner.id,
        members: { create: [{ userId: owner.id, role: 'owner' }] }
      },
      select: { id: true, name: true, isArchived: true }
    });

    if (memberWorkspaceIds?.length) await syncMembers(created.id, memberWorkspaceIds);

    logger.info({ channelId: created.id, kind, workspaceId: id }, 'Provisioned a Workspace channel');
    return reply.status(201).send({ channel: created, created: true });
  });

  /** Looks a channel up without creating one. */
  fastify.get('/channels/:kind/:id', async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const channel = await prisma.channel.findFirst({
      where: { workspaceKind: kind, workspaceId: id },
      select: { id: true, name: true, isArchived: true }
    });
    if (!channel) return reply.status(404).send({ error: 'No channel bound to that object' });
    return { channel };
  });

  /**
   * Mirrors Workspace members into chat and puts them in the channel. Called
   * when an Event or Project's crew changes.
   */
  fastify.put('/channels/:kind/:id/members', async (request, reply) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const parsed = memberSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid member list' });

    const channel = await prisma.channel.findFirst({
      where: { workspaceKind: kind, workspaceId: id },
      select: { id: true }
    });
    if (!channel) return reply.status(404).send({ error: 'No channel bound to that object' });

    const userIds: string[] = [];
    for (const member of parsed.data.members) userIds.push((await mirrorWorkspaceMember(member)).id);

    await conversationService.addMembers(channel.id, userIds);
    for (const userId of userIds) await subscribeUserToChannel(userId, channel.id);

    return { channelId: channel.id, memberCount: userIds.length };
  });

  /**
   * Removes a member from chat when their Workspace account is deleted.
   *
   * The Workspace is the identity authority: an account deleted there must not
   * survive here, or someone with an old chat session would still be inside
   * the conversations.
   *
   * Two ways to do it, because they are not the same decision:
   *
   *   erase = false (default) — the person goes, their words stay. Sessions
   *     end, private chats are deleted, memberships are dropped, and the name
   *     becomes "Removed member". What they posted in shared channels remains,
   *     so nobody else's conversation develops holes where a reply used to be.
   *
   *   erase = true — the row itself is deleted. Every message, reaction and
   *     attachment they ever posted cascades away with it, in every channel,
   *     including replies other people were answering.
   */
  fastify.delete('/members/:workspaceUserId', async (request, reply) => {
    const { workspaceUserId } = request.params as { workspaceUserId: string };
    const erase = (request.query as { erase?: string }).erase === 'true';
    const notice = z.object({ message: z.string().trim().min(3).max(280).optional() }).safeParse(request.body);
    if (!notice.success) return reply.status(400).send({ error: 'Invalid Workspace notice' });

    const member = await prisma.user.findUnique({
      where: { workspaceUserId },
      select: { id: true, username: true }
    });
    // Already gone is a success: the Workspace asked for this member to be
    // absent, and they are.
    if (!member) return { removed: false, erased: false, reason: 'not present in chat' };

    // This happens before removal, while the account is still part of the
    // shared space. If it cannot be published, the deletion is aborted.
    if (notice.data.message) await publishWorkspaceNotice(notice.data.message);

    // Private chats go either way. They belong to exactly two people, and one
    // of them no longer has an account.
    const directIds = (
      await prisma.channel.findMany({
        where: { kind: { in: ['dm', 'group'] }, members: { some: { userId: member.id } } },
        select: { id: true }
      })
    ).map((channel) => channel.id);

    for (const channelId of directIds) {
      await prisma.reaction.deleteMany({ where: { message: { channelId } } });
      await prisma.mention.deleteMany({ where: { message: { channelId } } });
      await prisma.attachment.deleteMany({ where: { message: { channelId } } });
      await prisma.message.deleteMany({ where: { channelId } });
      await prisma.channelMember.deleteMany({ where: { channelId } });
      await prisma.channel.delete({ where: { id: channelId } });
    }

    await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.channelMember.deleteMany({ where: { userId: member.id } });

    if (erase) {
      // Three relations to User carry no `onDelete: Cascade` — Message.user,
      // Message.pinnedBy and Channel.createdBy — so the row cannot simply be
      // deleted. Each is cleared deliberately, which is the safer shape
      // anyway: nothing is destroyed as a side effect of a schema setting.

      // A channel the whole team uses must not disappear because the person
      // who happened to open it has left. Ownership moves to the longest-
      // standing account that remains.
      const heir = await prisma.user.findFirst({
        where: { id: { not: member.id }, disabledAt: null },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { id: true }
      });
      const theirChannels = await prisma.channel.count({ where: { createdById: member.id } });
      if (theirChannels > 0) {
        if (!heir) {
          return reply.status(409).send({
            error: 'This member created channels and is the only account left to own them.'
          });
        }
        await prisma.channel.updateMany({ where: { createdById: member.id }, data: { createdById: heir.id } });
      }

      // A pin is somebody else's message that they pinned; the message stays.
      await prisma.message.updateMany({ where: { pinnedById: member.id }, data: { pinnedById: null, pinnedAt: null } });

      // Reactions, mentions and attachments hang off the message and do
      // cascade, so removing the messages takes them along.
      await prisma.message.deleteMany({ where: { userId: member.id } });

      await prisma.user.delete({ where: { id: member.id } });
    } else {
      await prisma.user.update({
        where: { id: member.id },
        data: {
          // The username is unique and must not block a future account, but it
          // still has to be stable and readable in old threads.
          username: `removed-${member.id.slice(-8)}`,
          displayName: 'Removed member',
          avatarUrl: null,
          statusText: null,
          bio: null,
          workspaceUserId: null,
          passwordHash: 'account-removed',
          disabledAt: new Date(),
          status: 'offline'
        }
      });
    }

    logger.info(
      { workspaceUserId, erase, directChannels: directIds.length },
      'Removed a member at the Workspace’s request'
    );
    return { removed: true, erased: erase, privateChatsDeleted: directIds.length };
  });
}

async function mirrorWorkspaceMember(member: z.infer<typeof memberSchema>['members'][number]) {
  return prisma.user.upsert({
    where: { workspaceUserId: member.workspaceUserId },
    create: {
      workspaceUserId: member.workspaceUserId,
      username: member.username.toLowerCase(),
      displayName: member.displayName,
      ...(member.title !== undefined ? { title: member.title } : {}),
      ...(member.accentColor !== undefined ? { accentColor: member.accentColor } : {}),
      role: mapWorkspaceRole(member.role),
      passwordHash: 'workspace-managed',
      status: 'online'
    },
    update: {
      username: member.username.toLowerCase(), displayName: member.displayName, role: mapWorkspaceRole(member.role), disabledAt: null,
      ...(member.title !== undefined ? { title: member.title } : {}),
      ...(member.accentColor !== undefined ? { accentColor: member.accentColor } : {}),
    },
    select: { id: true, username: true, displayName: true, role: true }
  });
}

/** Adds already-mirrored Workspace members to a channel, ignoring unknown ids. */
async function syncMembers(channelId: string, workspaceUserIds: string[]) {
  const users = await prisma.user.findMany({
    where: { workspaceUserId: { in: workspaceUserIds } },
    select: { id: true }
  });
  if (users.length === 0) return;
  await conversationService.addMembers(
    channelId,
    users.map((u) => u.id)
  );
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authService, publicUserSelect } from '../services/auth.js';
import { fileService } from '../services/file.js';
import { ConversationError } from '../services/conversation.js';
import { limits } from '../plugins/rate-limit.js';
import { broadcastToChannel } from '../socket/broadcaster.js';
import { SocketEvents } from '@g-arts/chat-shared';

const profileSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  title: z.string().max(80).nullable().optional(),
  bio: z.string().max(400).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, 'Accent must be a hex colour')
    .nullable()
    .optional(),
  status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
  statusText: z.string().max(120).nullable().optional()
});

const adminUpdateSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  title: z.string().max(80).nullable().optional(),
  role: z.enum(['admin', 'member']).optional(),
  disabled: z.boolean().optional()
});

/** Pushes a profile change to everyone who shares a conversation with them. */
async function broadcastProfile(user: {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  title: string | null;
  status: string;
  statusText: string | null;
}) {
  const memberships = await prisma.channelMember.findMany({
    where: { userId: user.id },
    select: { channelId: true }
  });
  for (const m of memberships) {
    broadcastToChannel(m.channelId, SocketEvents.PRESENCE_CHANGED, {
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      accentColor: user.accentColor,
      title: user.title,
      status: user.status,
      statusText: user.statusText
    });
  }
}

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request) => {
    const { q, includeDisabled } = request.query as { q?: string; includeDisabled?: string };
    // Suspended members are hidden from the roster, but an administrator has
    // to be able to see them — otherwise suspending someone is irreversible.
    const showDisabled = includeDisabled === 'true' && request.user.role === 'admin';

    const users = await prisma.user.findMany({
      where: {
        ...(showDisabled ? {} : { disabledAt: null }),
        ...(q && q.length >= 1
          ? {
              OR: [{ username: { contains: q } }, { displayName: { contains: q } }]
            }
          : {})
      },
      select: { ...publicUserSelect, bio: true, disabledAt: true },
      orderBy: [{ isConnected: 'desc' }, { displayName: 'asc' }]
    });
    return { users };
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      select: { ...publicUserSelect, bio: true }
    });
    if (!user) return reply.status(404).send({ error: 'Member not found' });
    return { user };
  });

  fastify.patch('/me', async (request, reply) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: parsed.data,
      select: { ...publicUserSelect, bio: true }
    });

    await broadcastProfile(user);
    return { user };
  });

  /**
   * Replaces the member's profile picture. `avatarUrl` stores the attachment
   * id; the client resolves it through the authenticated file endpoint, so a
   * photo is never served from a guessable public path.
   */
  fastify.post('/me/avatar', { config: limits.upload }, async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.status(400).send({ error: 'No image provided' });

    const current = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.userId },
      select: { avatarUrl: true }
    });

    try {
      const attachment = await fileService.store(part, request.user.userId, { purpose: 'avatar' });

      const user = await prisma.user.update({
        where: { id: request.user.userId },
        data: { avatarUrl: attachment.id },
        select: { ...publicUserSelect, bio: true }
      });

      // Drop the old file rather than accumulating every photo a member has
      // ever had.
      if (current.avatarUrl && current.avatarUrl !== attachment.id) {
        await fileService.deleteAttachment(current.avatarUrl).catch(() => undefined);
      }

      await broadcastProfile(user);
      return reply.status(201).send({ user });
    } catch (err) {
      if (err instanceof ConversationError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete('/me/avatar', async (request) => {
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.userId },
      select: { avatarUrl: true }
    });

    const user = await prisma.user.update({
      where: { id: request.user.userId },
      data: { avatarUrl: null },
      select: { ...publicUserSelect, bio: true }
    });

    if (current.avatarUrl) {
      await fileService.deleteAttachment(current.avatarUrl).catch(() => undefined);
    }

    await broadcastProfile(user);
    return { user };
  });

  fastify.post('/me/password', async (request, reply) => {
    const parsed = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(10).max(200)
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'New password must be at least 10 characters' });
    }

    const { verifyPassword } = await import('../lib/crypto.js');
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.userId },
      select: { passwordHash: true }
    });
    if (!(await verifyPassword(parsed.data.currentPassword, me.passwordHash))) {
      return reply.status(403).send({ error: 'Your current password is not correct' });
    }

    // Revokes every session, including this one, so the client must sign in
    // again on each device.
    await authService.changePassword(request.user.userId, parsed.data.newPassword);
    return { success: true };
  });

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  fastify.put('/:id/password', { onRequest: [fastify.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ password: z.string().min(10).max(200) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Password must be at least 10 characters' });
    }

    const member = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!member) return reply.status(404).send({ error: 'Member not found' });

    await authService.changePassword(id, parsed.data.password);
    return { success: true };
  });

  fastify.patch('/:id', { onRequest: [fastify.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = adminUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input' });

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return reply.status(404).send({ error: 'Member not found' });

    // Never let the last administrator demote or disable themselves out of
    // the building.
    const losingAdmin =
      target.role === 'admin' && (parsed.data.role === 'member' || parsed.data.disabled === true);
    if (losingAdmin) {
      const admins = await prisma.user.count({ where: { role: 'admin', disabledAt: null } });
      if (admins <= 1) {
        return reply.status(400).send({ error: 'There must always be at least one administrator' });
      }
    }

    const { disabled, ...rest } = parsed.data;
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(disabled === undefined ? {} : { disabledAt: disabled ? new Date() : null })
      },
      select: publicUserSelect
    });

    if (disabled || parsed.data.role) {
      // A demotion or a suspension must take effect now, not whenever the
      // member's current tokens happen to run out.
      await authService.revokeAllSessions(id);
    }

    return { user };
  });

  fastify.delete('/:id', { onRequest: [fastify.requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user.userId) {
      return reply.status(400).send({ error: 'You cannot remove your own administrator account' });
    }

    const member = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!member) return reply.status(404).send({ error: 'Member not found' });

    if (member.role === 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin', disabledAt: null } });
      if (admins <= 1) {
        return reply.status(400).send({ error: 'Cannot remove the last administrator' });
      }
    }

    await authService.revokeAllSessions(id);
    await prisma.user.delete({ where: { id } });
    return { success: true };
  });
}

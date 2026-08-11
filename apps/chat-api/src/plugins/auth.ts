import fp from 'fastify-plugin';
import type { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { sessionKey } from '../services/session-keys.js';
import {
  verifyWorkspaceToken,
  resolveWorkspaceMember
} from '../services/workspace-identity.js';

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export default fp(async (fastify) => {
  /**
   * Verifies the access token, that the session behind it is still live, and
   * that the account still exists and is enabled. The role is re-read from the
   * database on every request so a demotion takes effect immediately instead
   * of waiting for the current access token to expire.
   */
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearer(request);
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // The G Arts Workspace is the identity authority when it is configured,
    // so its access token is accepted directly — one sign-in for the whole
    // product. Chat's own tokens keep working for standalone use.
    const workspace = verifyWorkspaceToken(token);
    if (workspace) {
      const member = await resolveWorkspaceMember(workspace);
      request.user = {
        userId: member.id,
        username: member.username,
        displayName: member.displayName,
        role: member.role,
        // The Workspace owns the session; there is no chat-side session to key.
        sid: `workspace:${workspace.sub}`
      };
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const live = await redis.exists(sessionKey(payload.sid));
    if (!live) {
      return reply.status(401).send({ error: 'Session expired' });
    }

    const member = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, disabledAt: true, username: true, displayName: true }
    });

    if (!member || member.disabledAt) {
      await redis.del(sessionKey(payload.sid));
      return reply.status(401).send({ error: 'Member access has been revoked' });
    }

    request.user = {
      userId: member.id,
      username: member.username,
      displayName: member.displayName,
      role: member.role,
      sid: payload.sid
    };
  });

  fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
    // `authenticate` already sent a 401; don't overwrite it with a 403.
    if (reply.sent) return;
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required' });
    }
  });

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      logger.error({ err: error, url: request.url, method: request.method }, 'Request failed');
      return reply.status(status).send({ error: 'Internal server error' });
    }
    logger.debug({ err: error, url: request.url }, 'Request rejected');
    return reply.status(status).send({ error: error.message });
  });
});

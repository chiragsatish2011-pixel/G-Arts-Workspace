import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService, AuthError, publicUserSelect } from '../services/auth.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { limits } from '../plugins/rate-limit.js';

const REFRESH_COOKIE = 'garts_rt';

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200)
});

const registerSchema = z.object({
  // Normalised rather than rejected. The charset is what @mentions resolve
  // against, so it is enforced here too — silently.
  username: z
    .string()
    .min(3)
    .max(30)
    .transform((v) => v.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
    .refine((v) => v.length >= 3, 'Please choose a longer username'),
  // Matches the minimum enforced everywhere else. Registration previously
  // allowed four characters while admin resets demanded eight.
  password: z.string().min(10).max(200),
  displayName: z.string().min(1).max(60),
  title: z.string().max(80).optional(),
  role: z.enum(['admin', 'member']).optional()
});

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * With the Workspace linked, it is the only place anyone signs in. Chat's
   * own password login and account creation are closed off so there is one
   * set of credentials, not two that can drift apart.
   */
  const workspaceOwnsAccounts = async (
    _request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply
  ) => {
    if (config.workspace.enabled) {
      return reply.status(403).send({
        error: 'Sign in through G Arts Workspace',
        workspaceUrl: config.workspace.url ?? null
      });
    }
  };

  const setRefreshCookie = (reply: import('fastify').FastifyReply, value: string, maxAge: number) => {
    reply.setCookie(REFRESH_COOKIE, value, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.isProduction,
      path: '/api/auth',
      maxAge,
      signed: false
    });
  };

  fastify.post(
    '/login',
    { config: limits.login, onRequest: [workspaceOwnsAccounts] },
    async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    try {
      const result = await authService.login(parsed.data.username, parsed.data.password, {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      setRefreshCookie(reply, result.refreshToken, config.jwt.refreshTtlSeconds);
      return { user: result.user, accessToken: result.accessToken };
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.retryAfterSeconds) reply.header('Retry-After', String(err.retryAfterSeconds));
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
    }
  );

  fastify.post('/refresh', { config: limits.refresh }, async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    try {
      const result = await authService.rotate(token, {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });
      setRefreshCookie(reply, result.refreshToken, config.jwt.refreshTtlSeconds);
      return { user: result.user, accessToken: result.accessToken };
    } catch (err) {
      // Clear the cookie so the client stops retrying with a dead token.
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.post('/logout', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    await authService.logout(request.user.sid, request.user.userId);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  });

  fastify.post('/logout-all', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    await authService.revokeAllSessions(request.user.userId);
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  });

  fastify.get('/sessions', { onRequest: [fastify.authenticate] }, async (request) => ({
    sessions: await authService.listSessions(request.user.userId, request.user.sid)
  }));

  fastify.delete('/sessions/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.session.findFirst({
      where: { id, userId: request.user.userId },
      select: { id: true }
    });
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    await authService.logout(id, request.user.userId);
    return { success: true };
  });

  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: publicUserSelect
    });
    if (!user) return reply.status(404).send({ error: 'Member not found' });
    return { user };
  });

  fastify.post(
    '/register',
    { onRequest: [workspaceOwnsAccounts, fastify.requireAdmin] },
    async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }

    try {
      const user = await authService.createUser(parsed.data);
      return reply.status(201).send({ user });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
    }
  );
}

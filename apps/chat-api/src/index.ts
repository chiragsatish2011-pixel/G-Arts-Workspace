import Fastify from 'fastify';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { connectPrisma, disconnectPrisma } from './lib/prisma.js';
import { fileService } from './services/file.js';
import { authService } from './services/auth.js';
import { presenceService } from './services/presence.js';
import { initializeSocketIO } from './socket/index.js';

import securityPlugin from './plugins/security.js';
import authPlugin from './plugins/auth.js';
import multipartPlugin from './plugins/multipart.js';
import rateLimitPlugin from './plugins/rate-limit.js';

import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { userRoutes } from './routes/users.js';
import { fileRoutes } from './routes/files.js';
import { integrationRoutes } from './routes/integration.js';

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

async function bootstrap() {
  const fastify = Fastify({
    logger: false,
    trustProxy: config.trustProxy,
    // Chat payloads are small; anything larger is either a bug or an attack.
    bodyLimit: 1024 * 1024
  });

  // Fastify's built-in JSON parser rejects an empty body outright, so any
  // POST/DELETE without one — sign out, token refresh, leave a channel —
  // came back as 400. Treat "no body" as an absent body rather than an error.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, payload, done) => {
      const raw = typeof payload === 'string' ? payload.trim() : '';
      if (raw.length === 0) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch {
        const err = new Error('Request body is not valid JSON') as Error & { statusCode?: number };
        err.statusCode = 400;
        done(err);
      }
    }
  );

  await connectRedis();
  await connectPrisma();
  await fileService.initialize();
  await presenceService.reconcileOnBoot();

  await fastify.register(securityPlugin);
  await fastify.register(authPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(multipartPlugin);

  fastify.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  }));

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(conversationRoutes, { prefix: '/api/conversations' });
  await fastify.register(userRoutes, { prefix: '/api/users' });
  await fastify.register(fileRoutes, { prefix: '/api/files' });
  // Service-to-service surface for the G Arts Workspace. Returns 404 unless
  // the Workspace link is configured.
  await fastify.register(integrationRoutes, { prefix: '/api/integration' });

  const io = await initializeSocketIO(fastify.server);

  // Expired sessions and abandoned uploads would otherwise accumulate forever.
  const housekeeping = setInterval(() => {
    void (async () => {
      try {
        const sessions = await authService.pruneSessions();
        const files = await fileService.sweepOrphans();
        if (sessions || files) logger.info({ sessions, files }, 'Housekeeping complete');
      } catch (err) {
        logger.error({ err }, 'Housekeeping failed');
      }
    })();
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down…`);

    // Force-exit guard: never hang a deploy on a stuck connection.
    const hardExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, exiting');
      process.exit(1);
    }, 15_000);
    hardExit.unref();

    try {
      clearInterval(housekeeping);
      presenceService.stop();
      // Mark this instance's members offline before the sockets vanish.
      await presenceService.drain();
      await io.close();
      // Previously neither of these was awaited before process.exit, so
      // in-flight requests were cut off mid-response.
      await fastify.close();
      await disconnectPrisma();
      await disconnectRedis();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });

  await fastify.listen({ port: config.port, host: config.host });
  logger.info(
    {
      env: config.env,
      origins: config.corsOrigins,
      workspace: config.workspace.enabled ? 'linked' : 'standalone'
    },
    `Gurukul Chat API listening on http://${config.host}:${config.port}`
  );
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Bootstrap failed');
  process.exit(1);
});

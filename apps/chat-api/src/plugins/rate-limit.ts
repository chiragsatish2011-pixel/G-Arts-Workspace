import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config.js';

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Authenticated members get their own bucket; everyone else shares one per
    // IP. Falling back to IP alone would let one member behind a shared NAT
    // rate-limit the whole office.
    keyGenerator: (request) => request.user?.userId ?? request.ip,
    // Health checks shouldn't be able to exhaust a bucket.
    allowList: (request) => request.url === '/health',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry in ${context.after}.`,
      retryAfter: context.after
    })
  });
});

/**
 * Per-route override for expensive or abuse-prone endpoints. Applied as route
 * config rather than globally so normal chat traffic stays unthrottled.
 */
export const strictLimit = (max: number, timeWindow: string) => ({
  rateLimit: { max, timeWindow }
});

export const limits = {
  login: strictLimit(config.isProduction ? 10 : 100, '5 minutes'),
  refresh: strictLimit(60, '5 minutes'),
  upload: strictLimit(60, '1 minute'),
  search: strictLimit(60, '1 minute'),
  write: strictLimit(240, '1 minute')
};

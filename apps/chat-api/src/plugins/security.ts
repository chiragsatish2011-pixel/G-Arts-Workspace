import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { config } from '../config.js';

export default fp(async (fastify) => {
  await fastify.register(helmet, {
    // The API only ever serves JSON and user uploads; the SPA is served by the
    // web container, which has its own CSP.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:']
      }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false
  });

  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Refusing by returning `false` omits the CORS headers, which the browser
      // then blocks — the correct outcome. Throwing here instead surfaced as a
      // 500 and logged every probe as a server fault.
      callback(null, config.isOriginAllowed(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400
  });

  await fastify.register(cookie, {});
});

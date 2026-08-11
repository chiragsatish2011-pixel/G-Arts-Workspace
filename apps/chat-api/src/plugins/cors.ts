import fp from 'fastify-plugin';
import cors from '@fastify/cors';

export default fp(async (fastify) => {
  await fastify.register(cors, {
    origin: (origin, callback) => {
      const configured = process.env.CORS_ORIGIN;
      const localOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
      if (!origin || origin === configured || (!configured && localOrigins.has(origin))) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

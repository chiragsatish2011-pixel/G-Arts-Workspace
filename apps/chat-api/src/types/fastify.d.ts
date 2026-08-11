import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      userId: string;
      username: string;
      displayName: string;
      role: string;
      /** Session id the access token was minted from. */
      sid: string;
    };
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

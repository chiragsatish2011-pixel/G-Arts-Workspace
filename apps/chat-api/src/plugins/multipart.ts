import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import { config } from '../config.js';

export default fp(async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      // Enforced by busboy while streaming, so an oversized upload is aborted
      // mid-flight instead of being buffered and then rejected.
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 8,
      fieldSize: 1024
    }
  });
});

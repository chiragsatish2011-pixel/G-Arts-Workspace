import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { fileService } from '../services/file.js';
import { ConversationError } from '../services/conversation.js';
import { resolveKey } from '../lib/storage.js';
import { limits } from '../plugins/rate-limit.js';

/** Types safe to render inline; everything else is forced to download. */
const INLINE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'application/pdf'
]);

export async function fileRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/upload', { config: limits.upload }, async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.status(400).send({ error: 'No file provided' });

    // Voice notes carry their length as a field alongside the file, because
    // the server has no cheap way to probe an audio container for duration.
    const durationField = (part.fields as Record<string, { value?: unknown } | undefined>)
      ?.durationMs;
    const durationMs = Number.parseInt(String(durationField?.value ?? ''), 10);

    try {
      const attachment = await fileService.store(part, request.user.userId, {
        purpose: 'message',
        durationMs: Number.isFinite(durationMs) ? durationMs : undefined
      });
      return reply.status(201).send({ attachment });
    } catch (err) {
      if (err instanceof ConversationError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  /**
   * Streams an attachment, but only to someone who can see the conversation it
   * belongs to. Uploads are never exposed as a plain static directory — the
   * old handler redirected to `/uploads/<key>`, which nothing served and which
   * would have been unauthenticated if it had.
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { download } = request.query as { download?: string };

    try {
      const attachment = await fileService.getForDownload(
        id,
        request.user.userId,
        request.user.role === 'admin'
      );

      const disposition =
        download === '1' || !INLINE.has(attachment.mimeType) ? 'attachment' : 'inline';

      return reply
        .header('Content-Type', attachment.mimeType)
        .header('Content-Length', attachment.fileSize)
        .header(
          'Content-Disposition',
          `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`
        )
        // Attachments are immutable; the id changes when the file does.
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .header('X-Content-Type-Options', 'nosniff')
        .send(createReadStream(resolveKey(attachment.storageKey)));
    } catch (err) {
      if (err instanceof ConversationError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      return reply.status(404).send({ error: 'File not found' });
    }
  });
}

import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import type { MultipartFile } from '@fastify/multipart';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { buildKey, ensureKeyDir, ensureStorage, deleteFile } from '../lib/storage.js';
import { ConversationError } from './conversation.js';

/**
 * Uploads are allow-everything with a short deny-list, rather than the other
 * way round — a staff room needs to pass around whatever a lesson happens to
 * be in (.psd, .ai, .sib, .gsheet exports, zips of scans), and an allow-list
 * turns every new format into a support request.
 *
 * This is safe because of what happens on the way *out*: the server never
 * executes an upload, anything not known-renderable is served as an
 * attachment, and `X-Content-Type-Options: nosniff` stops a browser deciding
 * for itself. The deny-list exists only so the server is not a convenient
 * courier for things that run when double-clicked.
 */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'drv',
  'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'reg',
  'jar', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'appimage',
  'sh', 'bash', 'zsh', 'csh', 'run', 'bin', 'gadget', 'lnk', 'scpt'
]);

const BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-executable',
  'application/vnd.microsoft.portable-executable',
  'application/x-sh',
  'application/x-shellscript',
  'application/x-bat',
  'application/java-archive',
  'application/vnd.android.package-archive',
  'application/x-apple-diskimage'
]);

/** Extensions we map to a canonical one for tidy storage keys. */
const CANONICAL_EXTENSION: Record<string, string> = {
  jpeg: 'jpg',
  htm: 'html',
  yml: 'yaml',
  tif: 'tiff'
};

/**
 * Content that claims to be renderable media gets its magic bytes checked, so
 * an executable cannot masquerade as a picture and be served inline. Anything
 * else is stored as-is and only ever handed back as a download.
 */
const VERIFIED_PREFIXES = ['image/', 'video/', 'audio/'];

/** Sniffed types that are close enough to the declared one to accept. */
const EQUIVALENT: Record<string, string[]> = {
  'audio/webm': ['video/webm'],
  'video/webm': ['audio/webm'],
  'audio/mp4': ['video/mp4', 'application/mp4'],
  'audio/ogg': ['video/ogg'],
  'image/heic': ['image/heif'],
  'image/heif': ['image/heic'],
  'image/jpeg': ['image/jpg'],
  'audio/mpeg': ['audio/mp3']
};

function extensionOf(filename: string, mimeType: string): string {
  const fromName = filename.includes('.')
    ? filename.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
  if (fromName) return CANONICAL_EXTENSION[fromName] ?? fromName.slice(0, 12);
  const fromMime = mimeType.split('/')[1]?.split('+')[0]?.replace(/[^a-z0-9]/g, '') ?? '';
  return CANONICAL_EXTENSION[fromMime] ?? (fromMime.slice(0, 12) || 'bin');
}

export class FileService {
  async initialize(): Promise<void> {
    await ensureStorage();
  }

  /**
   * Streams an upload to disk while counting the bytes that actually arrive.
   *
   * The previous version trusted a `fileSize` form field supplied by the
   * client (defaulting to 0), so the size limit was decorative and every
   * attachment recorded the wrong size.
   */
  async store(
    part: MultipartFile,
    uploadedById: string,
    opts: { purpose?: 'message' | 'avatar'; durationMs?: number } = {}
  ) {
    const purpose = opts.purpose ?? 'message';
    const declared = part.mimetype.split(';')[0].trim().toLowerCase() || 'application/octet-stream';
    const extension = extensionOf(part.filename ?? '', declared);

    if (BLOCKED_EXTENSIONS.has(extension) || BLOCKED_MIME.has(declared)) {
      throw new ConversationError(
        'Programs and installers cannot be shared here. Zip it first if you need to send one.',
        415
      );
    }

    // A profile picture is a picture. Nothing else gets through this door.
    if (purpose === 'avatar' && !declared.startsWith('image/')) {
      throw new ConversationError('A profile picture must be an image', 415);
    }

    const key = buildKey(extension);
    const target = await ensureKeyDir(key);

    let bytes = 0;
    let head: Buffer = Buffer.alloc(0);

    const meter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        if (head.length < 4100) {
          head = Buffer.concat([head, chunk]).subarray(0, 4100);
        }
        cb(null, chunk);
      }
    });

    try {
      await pipeline(part.file, meter, createWriteStream(target));
    } catch (err) {
      await deleteFile(key);
      throw err;
    }

    // busboy sets this once it aborts a stream past `limits.fileSize`.
    if (part.file.truncated || bytes > config.maxUploadBytes) {
      await deleteFile(key);
      throw new ConversationError('That file is larger than the upload limit', 413);
    }

    if (bytes === 0) {
      await deleteFile(key);
      throw new ConversationError('That file is empty');
    }

    // Only media is verified, because only media is ever rendered inline. A
    // spreadsheet or a design file is stored as-is and always downloaded, so
    // its bytes cannot be coerced into running in someone's browser.
    if (VERIFIED_PREFIXES.some((prefix) => declared.startsWith(prefix))) {
      const sniffed = await fileTypeFromBuffer(head);
      const actual = sniffed?.mime;
      const acceptable =
        !actual || actual === declared || (EQUIVALENT[declared] ?? []).includes(actual);

      if (!acceptable) {
        await deleteFile(key);
        logger.warn(
          { uploadedById, declared, actual },
          'Rejected upload whose contents did not match its declared media type'
        );
        throw new ConversationError(
          'That file’s contents do not match its type and was rejected',
          415
        );
      }
    }

    const attachment = await prisma.attachment.create({
      data: {
        purpose,
        uploadedById,
        fileName: sanitizeName(part.filename),
        fileSize: bytes,
        mimeType: declared,
        storageKey: key,
        durationMs: opts.durationMs && opts.durationMs > 0 ? Math.round(opts.durationMs) : null
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        storageKey: true,
        durationMs: true,
        createdAt: true
      }
    });

    return attachment;
  }

  async getForDownload(attachmentId: string, viewerId: string, isAdmin: boolean) {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { channelId: true } } }
    });
    if (!attachment) throw new ConversationError('File not found', 404);

    // Profile pictures are visible to every signed-in member.
    if (attachment.purpose === 'avatar') return attachment;

    // An unattached upload is only visible to whoever uploaded it.
    if (!attachment.message) {
      if (attachment.uploadedById !== viewerId) {
        throw new ConversationError('File not found', 404);
      }
      return attachment;
    }

    // Otherwise the viewer must be able to see the conversation it lives in.
    const { conversationService } = await import('./conversation.js');
    await conversationService.access(attachment.message.channelId, viewerId, isAdmin);
    return attachment;
  }

  /** Removes a member's previous avatar file once a new one is in place. */
  async deleteAttachment(attachmentId: string): Promise<void> {
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, storageKey: true }
    });
    if (!attachment) return;
    await deleteFile(attachment.storageKey);
    await prisma.attachment.delete({ where: { id: attachment.id } }).catch(() => undefined);
  }

  /**
   * Deletes uploads that were never attached to a message — a compose window
   * that was closed, or a failed send. Without this, disk grows forever.
   */
  async sweepOrphans(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const orphans = await prisma.attachment.findMany({
      where: { purpose: 'message', messageId: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true }
    });
    if (orphans.length === 0) return 0;

    for (const orphan of orphans) {
      await deleteFile(orphan.storageKey);
    }
    await prisma.attachment.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } }
    });

    logger.info({ count: orphans.length }, 'Swept orphaned uploads');
    return orphans.length;
  }
}

function sanitizeName(name: string): string {
  return (
    name
      .replace(/[/\\]/g, '_')
      .replace(/[\x00-\x1f]/g, '')
      .trim()
      .slice(0, 200) || 'file'
  );
}

export const fileService = new FileService();

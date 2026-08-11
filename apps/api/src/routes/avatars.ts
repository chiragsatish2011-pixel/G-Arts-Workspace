import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyPluginAsync } from "fastify";
import { fileTypeFromBuffer } from "file-type";
import { Transform } from "node:stream";
import { authenticate } from "../auth.js";
import { prisma } from "../lib/prisma.js";

/**
 * Profile pictures. The workspace owns accounts, so it owns their faces too —
 * chat mirrors whatever is set here rather than holding a second copy.
 *
 * Images are never served from a guessable public path: the stored value is an
 * opaque key and the bytes come back only to a signed-in member.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.resolve(here, "..", "..", "uploads", "avatars");
const MAX_BYTES = 8 * 1024 * 1024;
const KEY = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/i;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/**
 * Deletes a stored picture. Used when an account is deleted, so a face does
 * not outlive the person it belonged to. The key is checked against the same
 * pattern as every other path here, so a malformed value cannot reach outside
 * the avatar directory.
 */
export async function deleteAvatarFile(key: string) {
  if (!KEY.test(key)) return;
  await unlink(path.join(AVATAR_DIR, key)).catch(() => undefined);
}

export const avatarRoutes: FastifyPluginAsync = async (app) => {
  await mkdir(AVATAR_DIR, { recursive: true });

  app.post("/me/avatar", { preHandler: authenticate }, async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "No image provided" });

    const declared = part.mimetype.split(";")[0].trim().toLowerCase();
    const extension = EXTENSION[declared];
    if (!extension) return reply.code(415).send({ error: "A profile picture must be a JPEG, PNG, WebP, GIF or AVIF" });

    const key = `${randomUUID()}.${extension}`;
    const target = path.join(AVATAR_DIR, key);

    let bytes = 0;
    let head = Buffer.alloc(0);
    const meter = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        if (head.length < 4100) head = Buffer.concat([head, chunk]).subarray(0, 4100);
        cb(null, chunk);
      },
    });

    try {
      await pipeline(part.file, meter, createWriteStream(target));
    } catch {
      await unlink(target).catch(() => undefined);
      return reply.code(500).send({ error: "Could not store that image" });
    }

    if (part.file.truncated || bytes > MAX_BYTES) {
      await unlink(target).catch(() => undefined);
      return reply.code(413).send({ error: "That image is larger than 8 MB" });
    }

    // A declared content type is a hint, not evidence.
    const sniffed = await fileTypeFromBuffer(head);
    if (!sniffed?.mime.startsWith("image/")) {
      await unlink(target).catch(() => undefined);
      return reply.code(415).send({ error: "That file is not an image" });
    }

    const previous = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { avatarUrl: true },
    });

    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: { avatarUrl: key },
      select: { id: true, username: true, displayName: true, avatarUrl: true, accentColor: true, title: true, role: true },
    });

    // Keep one face per person rather than every photo they have ever had.
    if (previous.avatarUrl && previous.avatarUrl !== key && KEY.test(previous.avatarUrl)) {
      await unlink(path.join(AVATAR_DIR, previous.avatarUrl)).catch(() => undefined);
    }

    return reply.code(201).send(user);
  });

  app.delete("/me/avatar", { preHandler: authenticate }, async (request) => {
    const previous = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { avatarUrl: true },
    });
    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: { avatarUrl: null },
      select: { id: true, username: true, displayName: true, avatarUrl: true, accentColor: true, title: true, role: true },
    });
    if (previous.avatarUrl && KEY.test(previous.avatarUrl)) {
      await unlink(path.join(AVATAR_DIR, previous.avatarUrl)).catch(() => undefined);
    }
    return user;
  });

  /** Any signed-in member may see another member's face — that is the point. */
  app.get("/avatars/:key", { preHandler: authenticate }, async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!KEY.test(key)) return reply.code(404).send({ error: "Not found" });

    return reply
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .type(`image/${key.split(".").pop() === "jpg" ? "jpeg" : key.split(".").pop()}`)
      .send(createReadStream(path.join(AVATAR_DIR, key)));
  });
};

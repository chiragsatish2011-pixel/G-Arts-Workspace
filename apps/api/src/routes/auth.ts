import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { authenticate } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { syncMembersToChat } from "../services/chat-link.js";

const username = z
  .string()
  .min(3)
  .max(30)
  .transform((value) => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, ""))
  .refine((value) => value.length >= 3, "Username must contain at least 3 valid characters");

/** Used where a password is set: bootstrap and member creation. */
const newCredentials = z.object({
  username,
  password: z.string().min(12).max(128),
});

/**
 * Used at sign-in. Deliberately no minimum: the length rule belongs where a
 * password is chosen. Applying it here would lock out any account set before
 * the rule existed, and would leak the policy to anyone probing the endpoint.
 */
const credentials = z.object({
  username,
  password: z.string().min(1).max(128),
});

/** The browser's live identity. Keep this consistent across sign-in, refresh
 * and profile edits so a saved setting is not lost until the next reload. */
const sessionUser = {
  id: true, username: true, displayName: true, avatarUrl: true, accentColor: true,
  title: true, role: true, team: true,
} as const;

/** Accounts created before chat was connected must be mirrored too. This is
 * intentionally a refresh, not a user-controlled picker, so every real
 * active Workspace account is available for direct messages and channels. */
async function refreshChatRoster() {
  const members = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, displayName: true, title: true, accentColor: true, role: true },
  });
  await syncMembersToChat(members);
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Confirms a stored token still belongs to a live account. The browser calls
   * this on load so a refresh resumes the session instead of dropping the
   * member back at the sign-in screen.
   */
  app.get("/me", { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findFirst({
      where: { id: request.user.sub, deletedAt: null },
      select: sessionUser,
    });
    if (!user) return reply.code(401).send({ error: "Account is no longer active" });
    // Never make resuming the Workspace depend on Chat being online, but do
    // repair its member projection whenever a real person returns.
    void refreshChatRoster().catch((cause) => app.log.warn({ cause }, "Chat roster refresh is pending"));
    return { user };
  });

  app.post("/bootstrap", async (request, reply) => {
    const body = newCredentials.extend({ displayName: z.string().min(2).max(100), bootstrapSecret: z.string() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid bootstrap request" });
    if (body.data.bootstrapSecret !== env.BOOTSTRAP_SECRET) return reply.code(403).send({ error: "Invalid bootstrap secret" });

    const existing = await prisma.user.count({ where: { deletedAt: null } });
    if (existing > 0) return reply.code(409).send({ error: "Workspace has already been initialized" });

    const user = await prisma.user.create({
      data: { username: body.data.username, displayName: body.data.displayName, passwordHash: await bcrypt.hash(body.data.password, 12), role: "SUPER_ADMIN" },
    });
    const token = await reply.jwtSign({ sub: user.id, username: user.username, displayName: user.displayName, role: user.role });
    return reply.code(201).send({ token, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: sessionUser }) });
  });

  app.post("/login", async (request, reply) => {
    const body = credentials.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Enter a valid username and password" });

    // No attempt limit. A lockout on a private, invite-only workspace shut out
    // the team over ordinary mistyping, which costs more than it protects
    // against here. Every password is bcrypt-hashed, so guesses stay slow.
    const user = await prisma.user.findFirst({ where: { username: body.data.username, deletedAt: null } });
    if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid username or password" });
    }

    void refreshChatRoster().catch((cause) => app.log.warn({ cause }, "Chat roster refresh is pending"));

    const token = await reply.jwtSign({ sub: user.id, username: user.username, displayName: user.displayName, role: user.role });
    return { token, user: await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: sessionUser }) };
  });
};

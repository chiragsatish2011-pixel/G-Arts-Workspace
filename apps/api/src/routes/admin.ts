import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireMinimumRole } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { ChatLinkError, syncMembersToChat } from "../services/chat-link.js";

/** Security actions only — this is deliberately not a member-activity feed. */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.post("/sync-chat-members", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (_request, reply) => {
    const members = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, username: true, displayName: true, role: true } });
    try {
      return await syncMembersToChat(members);
    } catch (cause) {
      if (cause instanceof ChatLinkError) return reply.code(502).send({ error: cause.message });
      throw cause;
    }
  });
  app.get("/audit-log", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
    const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: query.limit });

    // The rows store ids. On their own they say "user_created" and nothing
    // else, which is not a log anybody can read. Resolve the two people
    // involved in one query so each line names who did what, to whom.
    const ids = [...new Set(entries.flatMap((entry) => [entry.actorId, entry.targetId]))];
    const people = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, username: true },
    });
    const byId = new Map(people.map((person) => [person.id, person]));
    const name = (id: string) => {
      const person = byId.get(id);
      // A deleted account should still read as something, not a bare cuid.
      return person ? { displayName: person.displayName, username: person.username } : null;
    };

    return entries.map((entry) => ({
      ...entry,
      actor: name(entry.actorId),
      target: entry.targetType === "User" ? name(entry.targetId) : null,
    }));
  });
};

import type { Role, Team } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { hasMinimumRole } from "./permissions.js";

export type SessionUser = { sub: string; username: string; displayName: string; role: Role };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Authentication required" });
  }
}

export function requireMinimumRole(minimumRole: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!hasMinimumRole(request.user.role, minimumRole)) {
      return reply.code(403).send({ error: "You do not have permission for this action" });
    }
  };
}

/** Team membership governs which workspace a person can enter. It is
 * intentionally independent of their security role. */
export function requireTeam(team: Team) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const { prisma } = await import("./lib/prisma.js");
    const user = await prisma.user.findFirst({ where: { id: request.user.sub, deletedAt: null }, select: { team: true } });
    if (!user || user.team !== team) return reply.code(403).send({ error: "This area is not part of your workspace" });
  };
}

/** A shared area can be available to named workspaces without accidentally
 * admitting a chat-only account merely because it has a valid session. */
export function requireOneOfTeams(teams: readonly Team[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    const { prisma } = await import("./lib/prisma.js");
    const user = await prisma.user.findFirst({ where: { id: request.user.sub, deletedAt: null }, select: { team: true } });
    if (!user || !teams.includes(user.team)) return reply.code(403).send({ error: "This area is not part of your workspace" });
  };
}

export function requireTeamRole(team: Team, minimumRole: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireTeam(team)(request, reply);
    if (reply.sent) return;
    if (!hasMinimumRole(request.user.role, minimumRole)) return reply.code(403).send({ error: "You do not have permission for this action" });
  };
}

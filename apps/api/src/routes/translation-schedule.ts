import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { hasMinimumRole } from "../permissions.js";

const itemInput = z.object({
  title: z.string().trim().min(2, "Give the schedule item a name").max(160),
  startsAt: z.string().datetime({ offset: true }),
});
const statusInput = z.object({ status: z.enum(["not_done", "done"]) });

async function activeUser(id: string) {
  return prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, team: true } });
}

/** Translation members own their own simple schedule. An administrator may
 * review it, but cannot silently create or alter a translator's commitments. */
export const translationScheduleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: authenticate }, async (request, reply) => {
    const me = await activeUser(request.user.sub);
    const canReview = hasMinimumRole(request.user.role, "ADMIN");
    if (!me || (!canReview && me.team !== "TRANSLATION")) return reply.code(403).send({ error: "This schedule is not part of your workspace" });
    return prisma.translationScheduleItem.findMany({
      where: canReview ? {} : { ownerId: me.id },
      include: { owner: { select: { id: true, displayName: true, username: true } } },
      orderBy: { startsAt: "asc" },
    });
  });

  app.post("/", { preHandler: authenticate }, async (request, reply) => {
    const me = await activeUser(request.user.sub);
    if (!me || me.team !== "TRANSLATION") return reply.code(403).send({ error: "Only Translation members can create their schedule" });
    const body = itemInput.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Enter a valid schedule item" });
    return reply.code(201).send(await prisma.translationScheduleItem.create({ data: { ...body.data, startsAt: new Date(body.data.startsAt), ownerId: me.id } }));
  });

  app.patch("/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = statusInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Choose a valid completion state" });
    const me = await activeUser(request.user.sub);
    const item = params.success ? await prisma.translationScheduleItem.findUnique({ where: { id: params.data.id } }) : null;
    if (!me || me.team !== "TRANSLATION" || !item || item.ownerId !== me.id) return reply.code(403).send({ error: "Only the schedule owner can change this item" });
    return prisma.translationScheduleItem.update({ where: { id: item.id }, data: { status: body.data.status, doneAt: body.data.status === "done" ? new Date() : null } });
  });

  app.delete("/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Deletion must be confirmed" });
    const me = await activeUser(request.user.sub);
    const item = await prisma.translationScheduleItem.findUnique({ where: { id: params.data.id } });
    if (!me || me.team !== "TRANSLATION" || !item || item.ownerId !== me.id) return reply.code(403).send({ error: "Only the schedule owner can remove this item" });
    await prisma.translationScheduleItem.delete({ where: { id: item.id } });
    return { deleted: true };
  });
};

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireTeam } from "../auth.js";
import { prisma } from "../lib/prisma.js";

const todoId = z.string().cuid();

/** G-News work is personal and direct: write it down, tick it when done. */
export const gNewsTodoRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requireTeam("G_NEWS") }, async (request) =>
    prisma.gNewsTodo.findMany({ where: { ownerId: request.user.sub }, orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }] }),
  );

  app.post("/", { preHandler: requireTeam("G_NEWS") }, async (request, reply) => {
    const body = z.object({ title: z.string().trim().min(2, "Give the to-do a name").max(160, "That to-do is too long") }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Check the to-do" });
    return reply.code(201).send(await prisma.gNewsTodo.create({ data: { ...body.data, ownerId: request.user.sub } }));
  });

  app.patch("/:id", { preHandler: requireTeam("G_NEWS") }, async (request, reply) => {
    const params = z.object({ id: todoId }).safeParse(request.params);
    const body = z.object({ done: z.boolean() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Choose whether the to-do is done" });
    const todo = await prisma.gNewsTodo.findFirst({ where: { id: params.data.id, ownerId: request.user.sub } });
    if (!todo) return reply.code(404).send({ error: "To-do not found" });
    return prisma.gNewsTodo.update({ where: { id: todo.id }, data: { completedAt: body.data.done ? new Date() : null } });
  });

  app.delete("/:id", { preHandler: requireTeam("G_NEWS") }, async (request, reply) => {
    const params = z.object({ id: todoId }).safeParse(request.params);
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Deleting a to-do must be confirmed" });
    const todo = await prisma.gNewsTodo.findFirst({ where: { id: params.data.id, ownerId: request.user.sub } });
    if (!todo) return reply.code(404).send({ error: "To-do not found" });
    await prisma.gNewsTodo.delete({ where: { id: todo.id } });
    return { deleted: true };
  });
};

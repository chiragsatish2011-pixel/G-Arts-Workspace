import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate, requireMinimumRole } from "../auth.js";
import { prisma } from "../lib/prisma.js";

const kinds = ["MUSIC", "VIDEO", "LIVE"] as const;
const link = z.string().url().refine((value) => /^https:\/\//i.test(value), "Use a secure https link");

/** A deliberately small, admin-curated link shelf. It keeps Gurukul material
 * discoverable without storing, copying, or publishing any media. */
export const libraryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: authenticate }, async () =>
    prisma.libraryItem.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "desc" }] }),
  );

  app.post("/", { preHandler: requireMinimumRole("ADMIN") }, async (request, reply) => {
    const body = z.object({ title: z.string().trim().min(2).max(120), url: link, kind: z.enum(kinds) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Enter a valid library link" });
    return reply.code(201).send(await prisma.libraryItem.create({ data: { ...body.data, createdById: request.user.sub } }));
  });

  app.delete("/:id", { preHandler: requireMinimumRole("ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Deletion must be confirmed" });
    const item = await prisma.libraryItem.findUnique({ where: { id: params.data.id } });
    if (!item) return reply.code(404).send({ error: "Library item not found" });
    await prisma.libraryItem.delete({ where: { id: item.id } });
    return { deleted: true, title: item.title };
  });
};

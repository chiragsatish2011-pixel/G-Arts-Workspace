import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireOneOfTeams } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { latestBengaluruPosts } from "../services/youtube-library.js";

const link = z.string().url().refine((value) => /^https:\/\//i.test(value), "Use a secure https link");

/** A deliberately small, admin-curated link shelf. It keeps Gurukul material
 * discoverable without storing, copying, or publishing any media. */
export const libraryRoutes: FastifyPluginAsync = async (app) => {
  const canUseLibrary = requireOneOfTeams(["G_ARTS", "TRANSLATION", "G_NEWS"]);
  app.get("/", { preHandler: canUseLibrary }, async () =>
    prisma.libraryItem.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "desc" }] }),
  );

  app.get("/latest", { preHandler: canUseLibrary }, async () => latestBengaluruPosts());

  app.post("/", { preHandler: canUseLibrary }, async (request, reply) => {
    const body = z.object({ title: z.string().trim().min(2).max(120), url: link, kind: z.literal("MUSIC") }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Enter a valid library link" });
    return reply.code(201).send(await prisma.libraryItem.create({ data: { ...body.data, createdById: request.user.sub } }));
  });

  app.delete("/:id", { preHandler: canUseLibrary }, async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN"].includes(request.user.role)) return reply.code(403).send({ error: "Only an administrator can remove library links" });
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Deletion must be confirmed" });
    const item = await prisma.libraryItem.findUnique({ where: { id: params.data.id } });
    if (!item) return reply.code(404).send({ error: "Library item not found" });
    await prisma.libraryItem.delete({ where: { id: item.id } });
    return { deleted: true, title: item.title };
  });
};

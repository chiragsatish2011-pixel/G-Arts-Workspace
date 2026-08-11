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

};

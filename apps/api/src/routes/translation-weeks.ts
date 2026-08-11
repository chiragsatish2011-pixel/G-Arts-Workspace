import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { translationViewer } from "../services/translation-access.js";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the Monday this week begins");
const weekUpdate = z.object({
  topic: z.string().trim().max(200).nullable().optional(),
  readingList: z.array(z.string().trim().min(1).max(160)).max(4).optional(),
  openingDone: z.boolean().optional(), bodyOneTwoDone: z.boolean().optional(), bodyThreeDone: z.boolean().optional(),
  closingDone: z.boolean().optional(), readAloudDone: z.boolean().optional(), finalRevisionDone: z.boolean().optional(), submittedArchived: z.boolean().optional(),
});
const dayUpdate = z.object({
  whatDid: z.string().trim().max(2000).nullable().optional(), whatsNext: z.string().trim().max(1200).nullable().optional(),
  readingProgress: z.string().trim().max(1200).nullable().optional(), writingProgress: z.string().trim().max(1200).nullable().optional(),
  listenedDone: z.boolean().optional(), notesCaptured: z.boolean().optional(), readingDone: z.boolean().optional(), writingDone: z.boolean().optional(),
  deepReadingDone: z.boolean().optional(), articleFinalised: z.boolean().optional(), submitted: z.boolean().optional(),
});

const includeWeek = { days: { orderBy: { weekday: "asc" as const } }, owner: { select: { id: true, displayName: true, username: true } } };

export const translationWeeksRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: authenticate }, async (request, reply) => {
    const me = await translationViewer(request.user.sub, request.user.role);
    const reviewer = me?.canReview ?? false;
    if (!me || (!reviewer && !me.isTranslator)) return reply.code(403).send({ error: "This tracker is not part of your workspace" });
    return prisma.translationArticleWeek.findMany({ where: reviewer ? {} : { ownerId: me.id }, include: includeWeek, orderBy: { weekStart: "desc" }, take: 30 });
  });

  app.post("/", { preHandler: authenticate }, async (request, reply) => {
    const me = await translationViewer(request.user.sub, request.user.role);
    if (!me?.isTranslator) return reply.code(403).send({ error: "Only Translation members can begin an article week" });
    const body = z.object({ weekStart: dateOnly, topic: z.string().trim().max(200).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Check the article week" });
    const start = new Date(`${body.data.weekStart}T12:00:00.000Z`);
    if (start.getUTCDay() !== 1) return reply.code(400).send({ error: "Choose a Monday to begin the weekly tracker" });
    try {
      return reply.code(201).send(await prisma.translationArticleWeek.create({ data: { ownerId: me.id, weekStart: start, topic: body.data.topic || null, days: { create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday })) } }, include: includeWeek }));
    } catch { return reply.code(409).send({ error: "You already have an article tracker for that week" }); }
  });

  app.patch("/:id", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params); const body = weekUpdate.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Check the weekly tracker update" });
    const week = await prisma.translationArticleWeek.findUnique({ where: { id: params.data.id } }); const me = await translationViewer(request.user.sub, request.user.role);
    if (!week || !me?.isTranslator || week.ownerId !== me.id) return reply.code(403).send({ error: "Only the translator who owns this week can update it" });
    const { readingList, ...changes } = body.data;
    return prisma.translationArticleWeek.update({ where: { id: week.id }, data: { ...changes, ...(readingList ? { readingList: JSON.stringify(readingList) } : {}) }, include: includeWeek });
  });

  app.patch("/:weekId/days/:dayId", { preHandler: authenticate }, async (request, reply) => {
    const params = z.object({ weekId: z.string().cuid(), dayId: z.string().cuid() }).safeParse(request.params); const body = dayUpdate.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Check the daily tracker update" });
    const day = await prisma.translationArticleDay.findFirst({ where: { id: params.data.dayId, weekId: params.data.weekId }, include: { week: { select: { ownerId: true } } } }); const me = await translationViewer(request.user.sub, request.user.role);
    if (!day || !me?.isTranslator || day.week.ownerId !== me.id) return reply.code(403).send({ error: "Only the translator who owns this week can update it" });
    return prisma.translationArticleDay.update({ where: { id: day.id }, data: body.data });
  });
};

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireTeam, requireTeamRole } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { CATEGORIES, isCategory } from "../services/events.js";
import { CalendarError, fetchSchoolCalendar } from "../services/gurukul-calendar.js";

const coverage = z.array(z.string().trim().min(2).max(60)).max(20);
const httpsUrl = z.string().url().refine((value) => /^https:\/\//i.test(value), "Use a secure https link");

const eventBody = z.object({
  name: z.string().min(2, "Give the event a name").max(140, "That name is too long"),
  category: z.string().refine(isCategory, "Pick one of the listed categories"),
  seriesKey: z.string().trim().min(2).max(140).nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  allDay: z.boolean().default(true),
  venue: z.string().max(120).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  coverage,
  sourceNote: z.string().trim().min(2, "Explain how this event was confirmed").max(500),
  sourceUrl: httpsUrl.nullable().optional(),
});

const deliveryBody = z.object({
  websiteUrl: httpsUrl.nullable().optional(), websiteEventCreated: z.boolean().optional(), websiteApproved: z.boolean().optional(),
  parentsShareUrl: httpsUrl.nullable().optional(), parentsLinkShared: z.boolean().optional(), parentsShareApproved: z.boolean().optional(),
  shortsUrl: httpsUrl.nullable().optional(), shortsUploaded: z.boolean().optional(), shortsApproved: z.boolean().optional(),
  videoUrl: httpsUrl.nullable().optional(), videoUploaded: z.boolean().optional(), videoApproved: z.boolean().optional(),
  videoThumbnailDone: z.boolean().optional(), videoThumbnailApproved: z.boolean().optional(),
  videoShareUrl: httpsUrl.nullable().optional(), videoSharedToParents: z.boolean().optional(), videoShareApproved: z.boolean().optional(),
});

const STATUSES = ["planned", "confirmed", "covered", "completed", "archived"] as const;
const WORK_STATUSES = ["not_done", "submitted", "approved"] as const;
// Existing, human-verified G Arts records pre-date this app and use stable
// `garts_…` ids. New records use CUIDs. Both are safe to look up by this
// bounded opaque-id validator; authorization is still enforced by the route.
const recordId = z.string().trim().min(1).max(100);

const problem = (error: z.ZodError, fallback: string) => error.issues[0]?.message ?? fallback;

export const eventRoutes: FastifyPluginAsync = async (app) => {
  /** Category labels; none of them implies a work plan. */
  app.get("/categories", { preHandler: requireTeam("G_ARTS") }, async () => ({
    categories: CATEGORIES.map(({ key, label }) => ({ key, label })),
  }));

  app.get("/", { preHandler: requireTeam("G_ARTS") }, async (request) => {
    const query = z
      .object({
        scope: z.enum(["upcoming", "past", "completed", "all"]).default("upcoming"),
        category: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(60),
      })
      .parse(request.query);

    // Whole-day events should stay "upcoming" for the whole of their day, not
    // drop off at the first minute after midnight.
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    return prisma.event.findMany({
      where: {
        ...(query.category && isCategory(query.category) ? { category: query.category } : {}),
        ...(query.scope === "upcoming" ? { startsAt: { gte: since }, status: { not: "completed" } } : {}),
        ...(query.scope === "past" ? { startsAt: { lt: since }, status: { not: "completed" } } : {}),
        ...(query.scope === "completed" ? { status: "completed", completedAt: { gte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) } } : {}),
      },
      orderBy: query.scope === "completed" ? { completedAt: "desc" } : { startsAt: query.scope === "past" ? "desc" : "asc" },
      include: { tasks: { orderBy: { position: "asc" } }, delivery: true },
      take: query.limit,
    });
  });

  app.post("/", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const body = eventBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the event details") });
    const { sourceNote, ...rest } = body.data;
    const past = rest.seriesKey
      ? await prisma.event.findMany({
        where: { seriesKey: rest.seriesKey, startsAt: { lt: rest.startsAt } },
        orderBy: { startsAt: "desc" },
        include: { tasks: { where: { eventId: { not: null } }, orderBy: { position: "asc" } } },
      })
      : [];
    // Exact series key only: no category or title guessing. Items directly
    // named for this event take precedence over copied historical items.
    const work = new Map<string, { title: string; copiedFromEventId: string | null }>();
    for (const event of past) for (const task of event.tasks) {
      const key = task.title.trim().toLowerCase();
      if (!work.has(key)) work.set(key, { title: task.title, copiedFromEventId: event.id });
    }
    for (const title of rest.coverage) work.set(title.trim().toLowerCase(), { title, copiedFromEventId: null });

    return reply.code(201).send(
      await prisma.event.create({
        data: {
          ...rest,
          coverage: JSON.stringify(rest.coverage),
          sourceKind: "g-arts-confirmed",
          sourceNote,
          verifiedAt: new Date(),
          verifiedById: request.user.sub,
          createdById: request.user.sub,
          tasks: work.size
            ? { create: [...work.values()].map((item, position) => ({ title: item.title, position, copiedFromEventId: item.copiedFromEventId })) }
            : undefined,
        },
      }),
    );
  });

  app.patch("/:id", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = eventBody.partial().extend({ status: z.enum(STATUSES).optional() }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Event not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the event details") });

    const existing = await prisma.event.findUnique({ where: { id: params.data.id } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    const { coverage: chosen, ...rest } = body.data;
    return prisma.event.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(chosen ? { coverage: JSON.stringify(chosen) } : {}),
        ...(rest.status === "archived" ? { archivedAt: new Date() } : {}),
      },
    });
  });

  /** Completion is a final, explicit action after every direct work-item has
   * been approved or deliberately marked not required. */
  app.post("/:id/complete", { preHandler: requireTeamRole("G_ARTS", "MEMBER") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: "Event not found" });
    const event = await prisma.event.findUnique({ where: { id: params.data.id }, include: { tasks: true } });
    if (!event) return reply.code(404).send({ error: "Event not found" });
    if (event.status === "completed") return reply.code(400).send({ error: "This event is already completed" });
    if (event.tasks.length === 0 || event.tasks.some((task) => task.status !== "approved")) {
      return reply.code(400).send({ error: "Every work-item must be approved before completing this event" });
    }
    return prisma.event.update({ where: { id: event.id }, data: { statusBeforeCompletion: event.status, status: "completed", completedAt: new Date() } });
  });

  /** The 15-day completed window is deliberately recoverable, never a delete. */
  app.post("/:id/recover", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: "Event not found" });
    const event = await prisma.event.findUnique({ where: { id: params.data.id } });
    if (!event || event.status !== "completed" || !event.completedAt) return reply.code(404).send({ error: "Completed event not found" });
    if (event.completedAt < new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)) return reply.code(400).send({ error: "The 15-day recovery window has ended; this event is retained in History" });
    return prisma.event.update({ where: { id: event.id }, data: { status: event.statusBeforeCompletion ?? "covered", completedAt: null, statusBeforeCompletion: null } });
  });

  /** The real delivery tracker: evidence links plus direct done/not-done
   * checks. A public result cannot be recorded as complete without its link. */
  app.patch("/:id/delivery", { preHandler: requireTeamRole("G_ARTS", "MEMBER") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = deliveryBody.safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Event not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the delivery record") });
    const event = await prisma.event.findUnique({ where: { id: params.data.id }, include: { delivery: true } });
    if (!event) return reply.code(404).send({ error: "Event not found" });
    const approvalFields = ["websiteApproved", "parentsShareApproved", "shortsApproved", "videoApproved", "videoThumbnailApproved", "videoShareApproved"] as const;
    const admin = ["SUPER_ADMIN", "ADMIN"].includes(request.user.role);
    if (!admin && approvalFields.some((field) => field in body.data)) return reply.code(403).send({ error: "Only an administrator can approve a delivery link" });
    // A changed public link must be reviewed again, even if the old one was
    // approved. This prevents an approval badge from following a replacement.
    const resetApproval = (urlField: keyof typeof body.data, approvalField: keyof typeof body.data) => {
      if (urlField in body.data && body.data[urlField] !== event.delivery?.[urlField as never]) (body.data as Record<string, unknown>)[approvalField] = false;
    };
    resetApproval("websiteUrl", "websiteApproved"); resetApproval("parentsShareUrl", "parentsShareApproved");
    resetApproval("shortsUrl", "shortsApproved"); resetApproval("videoUrl", "videoApproved"); resetApproval("videoShareUrl", "videoShareApproved");
    const next = { ...event.delivery, ...body.data };
    const domainIs = (url: string | null | undefined, domain: string) => {
      try { return !!url && new URL(url).hostname === domain || !!url && new URL(url).hostname.endsWith(`.${domain}`); } catch { return false; }
    };
    if (next.websiteEventCreated && !domainIs(next.websiteUrl, "gurukul.org")) return reply.code(400).send({ error: "A completed website event needs its gurukul.org link" });
    if (next.shortsUploaded && !domainIs(next.shortsUrl, "youtube.com") && !domainIs(next.shortsUrl, "youtu.be")) return reply.code(400).send({ error: "A completed Short needs its YouTube link" });
    if (next.videoUploaded && !domainIs(next.videoUrl, "youtube.com") && !domainIs(next.videoUrl, "youtu.be")) return reply.code(400).send({ error: "A completed video needs its YouTube link" });
    if (next.parentsLinkShared && !next.parentsShareUrl) return reply.code(400).send({ error: "Record the parent-share proof link before marking it done" });
    if (next.videoSharedToParents && !next.videoShareUrl) return reply.code(400).send({ error: "Record the video-share proof link before marking it done" });
    if (next.websiteApproved && (!next.websiteEventCreated || !next.websiteUrl)) return reply.code(400).send({ error: "Submit the website link before it can be approved" });
    if (next.parentsShareApproved && (!next.parentsLinkShared || !next.parentsShareUrl)) return reply.code(400).send({ error: "Submit the parent-share link before it can be approved" });
    if (next.shortsApproved && (!next.shortsUploaded || !next.shortsUrl)) return reply.code(400).send({ error: "Submit the Short link before it can be approved" });
    if (next.videoApproved && (!next.videoUploaded || !next.videoUrl)) return reply.code(400).send({ error: "Submit the video link before it can be approved" });
    if (next.videoThumbnailApproved && !next.videoThumbnailDone) return reply.code(400).send({ error: "Submit the thumbnail before it can be approved" });
    if (next.videoShareApproved && (!next.videoSharedToParents || !next.videoShareUrl)) return reply.code(400).send({ error: "Submit the video-share link before it can be approved" });
    return prisma.eventDelivery.upsert({ where: { eventId: event.id }, create: { eventId: event.id, ...body.data }, update: body.data });
  });

  app.delete("/:id", { preHandler: requireTeamRole("G_ARTS", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body ?? {});
    if (!params.success) return reply.code(404).send({ error: "Event not found" });
    if (!body.success) return reply.code(400).send({ error: "Deleting an event has to be confirmed" });

    const existing = await prisma.event.findUnique({ where: { id: params.data.id } });
    if (!existing) return reply.code(404).send({ error: "Event not found" });

    await prisma.event.delete({ where: { id: existing.id } });
    await prisma.auditLog.create({
      data: {
        actorId: request.user.sub,
        action: "event_deleted",
        targetType: "Event",
        targetId: existing.id,
        metadata: { name: existing.name },
      },
    });
    return { deleted: true, name: existing.name };
  });

  /** Add one named work-item that G Arts has explicitly decided belongs here. */
  app.post("/:id/tasks", { preHandler: requireTeamRole("G_ARTS", "MEMBER") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = z.object({ title: z.string().trim().min(2, "Give the work-item a name").max(200) }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Event not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the work-item") });
    const event = await prisma.event.findUnique({ where: { id: params.data.id } });
    if (!event) return reply.code(404).send({ error: "Event not found" });
    const last = await prisma.task.findFirst({ where: { eventId: event.id }, orderBy: { position: "desc" } });
    return reply.code(201).send(await prisma.task.create({
      data: { eventId: event.id, title: body.data.title, position: (last?.position ?? -1) + 1 },
    }));
  });

  /** Team submits finished work. Administrators choose the outcome and then
   * approve it; Not required never skips that final approval. */
  app.patch("/tasks/:taskId", { preHandler: requireTeamRole("G_ARTS", "MEMBER") }, async (request, reply) => {
    const params = z.object({ taskId: recordId }).safeParse(request.params);
    const body = z.object({ status: z.enum(WORK_STATUSES), completionKind: z.enum(["finished", "not_required"]).nullable().optional() }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Work-item not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Choose a status") });
    const task = await prisma.task.findFirst({ where: { id: params.data.taskId, eventId: { not: null } }, include: { event: { select: { status: true } } } });
    if (!task) return reply.code(404).send({ error: "Work-item not found" });
    if (task.event?.status === "completed") return reply.code(400).send({ error: "Recover the completed event before changing its work-items" });
    const admin = ["SUPER_ADMIN", "ADMIN"].includes(request.user.role);
    const next = body.data.status;
    const kind = next === "not_done" ? null : body.data.completionKind === undefined ? (task.completionKind ?? "finished") : body.data.completionKind;
    if (next === "approved" && (!admin || task.status !== "submitted")) return reply.code(403).send({ error: "An administrator can approve a submitted item after review" });
    if (task.completionKind === "not_required" && !admin) return reply.code(403).send({ error: "Only an administrator can change a not-required decision" });
    if (kind === "not_required" && !admin) return reply.code(403).send({ error: "Only an administrator can mark work not required" });
    if (next === "submitted" && task.status === "approved" && !admin) return reply.code(403).send({ error: "Only an administrator can reopen an approved item" });
    if (next === "not_done" && task.status === "approved" && !admin) return reply.code(403).send({ error: "Only an administrator can reopen an approved item" });
    const now = new Date();
    return prisma.task.update({
      where: { id: task.id },
      data: {
        status: next,
        completionKind: kind,
        doneAt: next === "approved" ? now : null,
        submittedAt: next === "submitted" ? now : next === "not_done" ? null : task.submittedAt,
        submittedById: next === "submitted" ? request.user.sub : next === "not_done" ? null : task.submittedById,
        approvedAt: next === "approved" ? now : null,
        approvedById: next === "approved" ? request.user.sub : null,
        notRequiredAt: kind === "not_required" ? now : null,
        notRequiredById: kind === "not_required" ? request.user.sub : null,
      },
    });
  });

  /**
   * What the school has published that G Arts has not looked at yet.
   *
   * Read-only. It suggests a category from the title and shows why, but
   * nothing is created until someone picks entries and confirms — an
   * automatically created event nobody asked for is worse than no event.
   */
  app.get("/calendar/available", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(40) }).parse(request.query);

    let entries;
    try {
      entries = await fetchSchoolCalendar();
    } catch (cause) {
      if (cause instanceof CalendarError) return reply.code(502).send({ error: cause.message });
      throw cause;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = entries.filter((entry) => entry.startsAt >= today);

    const alreadyHere = new Set(
      (
        await prisma.event.findMany({
          where: { sourceUid: { in: upcoming.map((entry) => entry.uid) } },
          select: { sourceUid: true },
        })
      ).map((event) => event.sourceUid),
    );

    return {
      total: upcoming.length,
      imported: upcoming.length - upcoming.filter((entry) => !alreadyHere.has(entry.uid)).length,
      entries: upcoming
        .filter((entry) => !alreadyHere.has(entry.uid))
        .slice(0, query.limit)
        .map((entry) => ({
            uid: entry.uid,
            title: entry.title,
            startsAt: entry.startsAt,
            endsAt: entry.endsAt,
            allDay: entry.allDay,
            venue: entry.location,
          })),
    };
  });

  /** Creates events from chosen calendar entries. Nothing else is touched. */
  app.post("/calendar/import", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const body = z
      .object({
        entries: z
          .array(
            z.object({
              uid: z.string().min(1).max(300),
              category: z.string().refine(isCategory, "Pick one of the listed categories"),
            }),
          )
          .min(1, "Choose at least one entry")
          .max(60, "Import up to 60 at a time"),
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Nothing was selected") });

    let entries;
    try {
      entries = await fetchSchoolCalendar();
    } catch (cause) {
      if (cause instanceof CalendarError) return reply.code(502).send({ error: cause.message });
      throw cause;
    }
    const byUid = new Map(entries.map((entry) => [entry.uid, entry]));

    const created: string[] = [];
    const skipped: string[] = [];
    for (const wanted of body.data.entries) {
      const entry = byUid.get(wanted.uid);
      if (!entry) {
        skipped.push(wanted.uid);
        continue;
      }
      try {
        const event = await prisma.event.create({
          data: {
            name: entry.title,
            category: wanted.category,
            startsAt: entry.startsAt,
            endsAt: entry.endsAt,
            allDay: entry.allDay,
            venue: entry.location,
            coverage: JSON.stringify([]),
            status: "planned",
            sourceKind: "gurukul-calendar",
            sourceUid: entry.uid,
            sourceNote: "Selected and confirmed from Gurukul’s published academic calendar",
            verifiedAt: new Date(),
            verifiedById: request.user.sub,
            createdById: request.user.sub,
          },
        });
        created.push(event.name);
      } catch {
        // sourceUid is unique: someone else imported it a moment ago.
        skipped.push(entry.title);
      }
    }
    return { created: created.length, skipped: skipped.length, names: created };
  });
};

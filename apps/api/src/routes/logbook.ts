import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireTeam } from "../auth.js";
import { prisma } from "../lib/prisma.js";

/**
 * The logbook is a derived production memory. It reads meaningful records that
 * already exist—events and completed work-items. It never
 * records page views, opening a file, time at a computer or any other personal
 * activity.
 */

type Entry = { id: string; at: Date; kind: "event" | "task"; title: string; detail: string; eventId?: string | null };
const recordId = z.string().trim().min(1).max(100);

export const logbookRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requireTeam("G_ARTS") }, async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(80), eventId: recordId.optional() }).parse(request.query);
    const [events, tasks] = await Promise.all([
      prisma.event.findMany({ where: { ...(query.eventId ? { id: query.eventId } : {}) }, select: { id: true, name: true, createdAt: true, completedAt: true, archivedAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.task.findMany({
        where: {
          doneAt: { not: null },
          ...(query.eventId ? { eventId: query.eventId } : {}),
        },
        select: { id: true, title: true, doneAt: true, eventId: true, event: { select: { name: true } } },
        orderBy: { doneAt: "desc" }, take: 200,
      }),
    ]);

    const entries: Entry[] = [
      ...events.flatMap((event) => [
        { id: `event-created-${event.id}`, at: event.createdAt, kind: "event" as const, title: "Event created", detail: event.name, eventId: event.id },
        ...(event.completedAt ? [{ id: `event-completed-${event.id}`, at: event.completedAt, kind: "event" as const, title: "Event completed", detail: event.name, eventId: event.id }] : []),
        ...(event.archivedAt ? [{ id: `event-archived-${event.id}`, at: event.archivedAt, kind: "event" as const, title: "Event archived", detail: event.name, eventId: event.id }] : []),
      ]),
      ...tasks.map((task) => ({
        id: `task-approved-${task.id}`,
        at: task.doneAt!,
        kind: "task" as const,
        title: "Work-item approved",
        detail: `${task.event?.name ?? "G-Arts"} — ${task.title}`,
        eventId: task.eventId,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, query.limit);
    return entries;
  });
};

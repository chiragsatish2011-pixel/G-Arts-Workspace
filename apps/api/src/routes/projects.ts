import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireTeam, requireTeamRole } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { PROJECT_TYPES, STAGES, TASK_STATUSES } from "../services/templates.js";

const problem = (error: z.ZodError, fallback: string) => error.issues[0]?.message ?? fallback;
const recordId = z.string().trim().min(1).max(100);

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta", { preHandler: requireTeam("G_ARTS") }, async () => ({
    types: PROJECT_TYPES,
    stages: STAGES,
    taskStatuses: TASK_STATUSES,
  }));

  app.get("/", { preHandler: requireTeam("G_ARTS") }, async (request) => {
    const query = z
      .object({
        eventId: recordId.optional(),
        stage: z.enum(STAGES).optional(),
        includeArchived: z.coerce.boolean().default(false),
      })
      .parse(request.query);

    return prisma.project.findMany({
      where: {
        ...(query.eventId ? { eventId: query.eventId } : {}),
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.includeArchived ? {} : { archivedAt: null }),
      },
      include: { tasks: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  app.post("/", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2, "Give the project a name").max(160, "That name is too long"),
        type: z.enum(PROJECT_TYPES).default("photo"),
        eventId: recordId.nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        tasks: z.array(z.string().min(1).max(200)).max(60).optional(),
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the project details") });

    const { tasks, ...rest } = body.data;
    return reply.code(201).send(
      await prisma.project.create({
        data: {
          ...rest,
          createdById: request.user.sub,
          tasks: tasks?.length
            ? { create: tasks.map((title, position) => ({ title, position })) }
            : undefined,
        },
        include: { tasks: { orderBy: { position: "asc" } } },
      }),
    );
  });

  app.patch("/:id", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = z
      .object({
        name: z.string().min(2).max(160).optional(),
        stage: z.enum(STAGES).optional(),
        type: z.enum(PROJECT_TYPES).optional(),
        dueAt: z.coerce.date().nullable().optional(),
      })
      .safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Project not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the project details") });

    const existing = await prisma.project.findUnique({ where: { id: params.data.id } });
    if (!existing) return reply.code(404).send({ error: "Project not found" });

    return prisma.project.update({
      where: { id: existing.id },
      data: { ...body.data, ...(body.data.stage === "archived" ? { archivedAt: new Date() } : {}) },
      include: { tasks: { orderBy: { position: "asc" } } },
    });
  });

  app.delete("/:id", { preHandler: requireTeamRole("G_ARTS", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = z.object({ confirm: z.literal(true) }).safeParse(request.body ?? {});
    if (!params.success) return reply.code(404).send({ error: "Project not found" });
    if (!body.success) return reply.code(400).send({ error: "Deleting a project has to be confirmed" });

    const existing = await prisma.project.findUnique({ where: { id: params.data.id } });
    if (!existing) return reply.code(404).send({ error: "Project not found" });

    // Tasks cascade with the project.
    await prisma.project.delete({ where: { id: existing.id } });
    await prisma.auditLog.create({
      data: {
        actorId: request.user.sub,
        action: "project_deleted",
        targetType: "Project",
        targetId: existing.id,
        metadata: { name: existing.name },
      },
    });
    return { deleted: true, name: existing.name };
  });

  // --- tasks --------------------------------------------------------------

  app.post("/:id/tasks", { preHandler: requireTeamRole("G_ARTS", "MEMBER") }, async (request, reply) => {
    const params = z.object({ id: recordId }).safeParse(request.params);
    const body = z.object({ title: z.string().min(1, "Give the task a name").max(200) }).safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Project not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Give the task a name") });

    const project = await prisma.project.findUnique({ where: { id: params.data.id } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const last = await prisma.task.findFirst({ where: { projectId: project.id }, orderBy: { position: "desc" } });
    return reply.code(201).send(
      await prisma.task.create({
        data: { projectId: project.id, title: body.data.title, position: (last?.position ?? -1) + 1 },
      }),
    );
  });

  app.patch("/tasks/:taskId", { preHandler: requireTeamRole("G_ARTS", "MEMBER") }, async (request, reply) => {
    const params = z.object({ taskId: recordId }).safeParse(request.params);
    const body = z
      .object({
        status: z.enum(TASK_STATUSES).optional(),
        title: z.string().min(1).max(200).optional(),
        assigneeId: z.string().cuid().nullable().optional(),
        dueAt: z.coerce.date().nullable().optional(),
      })
      .safeParse(request.body);
    if (!params.success) return reply.code(404).send({ error: "Task not found" });
    if (!body.success) return reply.code(400).send({ error: problem(body.error, "Check the task") });

    const task = await prisma.task.findUnique({ where: { id: params.data.taskId } });
    if (!task) return reply.code(404).send({ error: "Task not found" });

    // An assignee has to be a real, active member.
    if (body.data.assigneeId) {
      const person = await prisma.user.findFirst({ where: { id: body.data.assigneeId, deletedAt: null } });
      if (!person) return reply.code(400).send({ error: "That member is not available to assign" });
    }

    return prisma.task.update({
      where: { id: task.id },
      data: {
        ...body.data,
        ...(body.data.status ? { doneAt: body.data.status === "approved" ? new Date() : null } : {}),
      },
    });
  });

  app.delete("/tasks/:taskId", { preHandler: requireTeamRole("G_ARTS", "TEAM_LEAD") }, async (request, reply) => {
    const params = z.object({ taskId: recordId }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: "Task not found" });
    const task = await prisma.task.findUnique({ where: { id: params.data.taskId } });
    if (!task) return reply.code(404).send({ error: "Task not found" });
    await prisma.task.delete({ where: { id: task.id } });
    return { deleted: true };
  });
};

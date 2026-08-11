import bcrypt from "bcryptjs";
import type { Role, Team } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate, requireMinimumRole } from "../auth.js";
import { prisma } from "../lib/prisma.js";
import { canManageRole } from "../permissions.js";
import { ChatLinkError, removeMemberFromChat, syncMembersToChat } from "../services/chat-link.js";
import { deleteAvatarFile } from "./avatars.js";

const roles = ["SUPER_ADMIN", "ADMIN", "TEAM_LEAD", "MEMBER", "TRAINEE", "GUEST"] as const;
const teams = ["G_ARTS", "TRANSLATION"] as const;

const username = z
  .string()
  .min(3, "Username needs at least 3 characters")
  .max(30, "Username cannot be longer than 30 characters")
  .transform((value) => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, ""))
  .refine((value) => value.length >= 3, "Username needs at least 3 letters or numbers");

/**
 * Short on purpose. A 12-character rule meant an administrator could type a
 * temporary password, watch the form fail, and hand out an account that had
 * never been created. On a private workspace that nobody can reach without an
 * invitation, an account that works matters more than a long password.
 */
const password = z
  .string()
  .min(4, "Password needs at least 4 characters")
  .max(128, "Password cannot be longer than 128 characters");

const newUser = z.object({
  username,
  displayName: z.string().min(2, "Enter the member's name").max(100, "That name is too long"),
  title: z.string().max(80, "Team title is too long").optional(),
  password,
  role: z.enum(roles).default("MEMBER"),
  team: z.enum(teams).default("G_ARTS"),
});

const publicUser = {
  id: true, username: true, displayName: true, avatarUrl: true, accentColor: true,
  title: true, role: true, team: true, skills: true, availability: true, createdAt: true, deletedAt: true,
} as const;

/**
 * Says which field is wrong and why, instead of one flat sentence. An
 * administrator seeing "Invalid member details" has no way to tell whether it
 * was the username, the password or the role.
 */
function firstProblem(error: z.ZodError, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: requireMinimumRole("ADMIN") }, async () => {
    return prisma.user.findMany({ select: publicUser, orderBy: { createdAt: "asc" } });
  });

  app.post("/", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request, reply) => {
    const body = newUser.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: firstProblem(body.error, "Invalid member details") });
    if (!canManageRole(request.user.role, body.data.role)) {
      return reply.code(403).send({ error: "Only a super-admin can assign this role" });
    }

    // A username already in use used to surface as an unhandled Prisma error,
    // which reached the administrator as a bare 500.
    const taken = await prisma.user.findUnique({ where: { username: body.data.username } });
    if (taken) return reply.code(409).send({ error: `The username @${body.data.username} is already taken` });

    const { password: chosen, ...member } = body.data;
    const user = await prisma.user.create({
      data: { ...member, passwordHash: await bcrypt.hash(chosen, 12) },
      select: publicUser,
    });
    try {
      await syncMembersToChat([user]);
    } catch (cause) {
      // A new Workspace account that cannot be found in Chat is misleading.
      // Delete this just-created, unused row and make the administrator retry
      // once the linked service is healthy.
      await prisma.user.delete({ where: { id: user.id } });
      if (cause instanceof ChatLinkError) return reply.code(502).send({ error: `${cause.message} The account was not created.` });
      throw cause;
    }
    // The name is copied in, not just referenced. Once an account is deleted
    // the id resolves to nothing, and an entry reading "added a removed
    // account" is no use to anyone reviewing what happened.
    await prisma.auditLog.create({
      data: {
        actorId: request.user.sub,
        action: "user_created",
        targetType: "User",
        targetId: user.id,
        metadata: { assignedRole: user.role, assignedTeam: user.team, username: user.username, displayName: user.displayName },
      },
    });
    return reply.code(201).send(user);
  });

  app.patch("/:id/team", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ team: z.enum(teams), confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "A workspace type and confirm: true are required" });
    const target = await prisma.user.findFirst({ where: { id: params.data.id, deletedAt: null } });
    if (!target) return reply.code(404).send({ error: "Member not found" });
    if (target.role === "SUPER_ADMIN") return reply.code(403).send({ error: "Super-admin workspace type cannot be changed here" });
    const user = await prisma.user.update({ where: { id: target.id }, data: { team: body.data.team as Team }, select: publicUser });
    await prisma.auditLog.create({
      data: { actorId: request.user.sub, action: "team_changed", targetType: "User", targetId: user.id, metadata: { previousTeam: target.team, nextTeam: user.team, displayName: user.displayName } },
    });
    return user;
  });

  app.patch("/:id/role", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ role: z.enum(roles), confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "A target role and confirm: true are required" });
    const target = await prisma.user.findFirst({ where: { id: params.data.id, deletedAt: null } });
    if (!target) return reply.code(404).send({ error: "Member not found" });
    if (!canManageRole(request.user.role, target.role) || !canManageRole(request.user.role, body.data.role as Role)) {
      return reply.code(403).send({ error: "Super-admin accounts cannot be changed here" });
    }
    const user = await prisma.user.update({ where: { id: target.id }, data: { role: body.data.role }, select: publicUser });
    await prisma.auditLog.create({
      data: { actorId: request.user.sub, action: "role_changed", targetType: "User", targetId: user.id, metadata: { previousRole: target.role, nextRole: user.role } },
    });
    return user;
  });

  app.patch("/:id/access", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ disabled: z.boolean(), confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "An access state and confirm: true are required" });
    const target = await prisma.user.findUnique({ where: { id: params.data.id } });
    if (!target) return reply.code(404).send({ error: "Member not found" });
    if (!canManageRole(request.user.role, target.role)) return reply.code(403).send({ error: "Super-admin accounts cannot be changed here" });
    if (target.id === request.user.sub) return reply.code(400).send({ error: "You cannot suspend your own account" });
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { deletedAt: body.data.disabled ? new Date() : null },
      select: publicUser,
    });
    await prisma.auditLog.create({
      data: { actorId: request.user.sub, action: body.data.disabled ? "member_access_suspended" : "member_access_restored", targetType: "User", targetId: user.id },
    });
    return user;
  });

  /**
   * Deletes an account outright, here and in chat.
   *
   * Suspending keeps the row and can be undone; this cannot. The chat side is
   * done first and on purpose: if it fails, nothing here is touched, so the
   * two databases never disagree about who exists.
   */
  app.delete("/:id", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z
      .object({
        confirm: z.literal(true),
        /** Also erase everything they posted in chat. See `chat-link.ts`. */
        erase: z.boolean().default(false),
      })
      .safeParse(request.body ?? {});
    if (!params.success) return reply.code(404).send({ error: "Member not found" });
    if (!body.success) return reply.code(400).send({ error: "Deleting an account has to be confirmed" });

    const target = await prisma.user.findUnique({ where: { id: params.data.id } });
    if (!target) return reply.code(404).send({ error: "Member not found" });
    if (target.id === request.user.sub) {
      return reply.code(400).send({ error: "You cannot delete the account you are signed in with" });
    }
    if (!canManageRole(request.user.role, target.role)) {
      return reply.code(403).send({ error: "A super-admin account cannot be deleted here" });
    }

    let chat: Awaited<ReturnType<typeof removeMemberFromChat>>;
    try {
      chat = await removeMemberFromChat(target.id, body.data.erase);
    } catch (cause) {
      if (cause instanceof ChatLinkError) return reply.code(502).send({ error: cause.message });
      throw cause;
    }

    if (target.avatarUrl) await deleteAvatarFile(target.avatarUrl);
    await prisma.user.delete({ where: { id: target.id } });

    // Written after the delete, and never removed with it: the record that an
    // account was deleted is exactly what an administrator needs to keep.
    await prisma.auditLog.create({
      data: {
        actorId: request.user.sub,
        action: "member_deleted",
        targetType: "User",
        targetId: target.id,
        metadata: {
          username: target.username,
          displayName: target.displayName,
          erasedChatHistory: body.data.erase,
        },
      },
    });

    return {
      deleted: true,
      username: target.username,
      chat: { erased: chat.erased, privateChatsDeleted: chat.privateChatsDeleted ?? 0 },
    };
  });

  /**
   * Self-service profile. The workspace owns every account, so this is the one
   * place a person edits their own name, title and colour — chat mirrors it.
   */
  app.patch("/me", { preHandler: authenticate }, async (request, reply) => {
    const body = z
      .object({
        displayName: z.string().min(2, "Your name needs at least 2 characters").max(100, "That name is too long").optional(),
        title: z.string().max(80, "Your title is too long").nullable().optional(),
        bio: z.string().max(400, "That is longer than the space allows").nullable().optional(),
        accentColor: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick one of the offered colours").nullable().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: firstProblem(body.error, "Invalid profile details") });

    // avatarUrl is selected even though it is never edited here. The client
    // merges this response into the stored session; leaving it out dropped the
    // member's picture from the masthead the moment they saved their name.
    const user = await prisma.user.update({
      where: { id: request.user.sub },
      data: body.data,
      select: { id: true, username: true, displayName: true, avatarUrl: true, title: true, bio: true, accentColor: true, role: true, team: true },
    });
    // Chat holds a projection of workspace identities for member lists and
    // message attribution. Refresh it at the authoritative write, rather
    // than waiting for a later sign-in to make a profile look inconsistent.
    try {
      await syncMembersToChat([user]);
    } catch (cause) {
      app.log.warn({ cause, userId: user.id }, "Profile saved but chat identity refresh is pending");
    }
    const token = await reply.jwtSign({ sub: user.id, username: user.username, displayName: user.displayName, role: user.role });
    return { token, user };
  });

  app.post("/me/password", { preHandler: authenticate }, async (request, reply) => {
    const body = z.object({ currentPassword: z.string().min(1, "Enter your current password"), newPassword: password }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: firstProblem(body.error, "Check both passwords and try again") });

    const me = await prisma.user.findUniqueOrThrow({ where: { id: request.user.sub } });
    if (!(await bcrypt.compare(body.data.currentPassword, me.passwordHash))) {
      return reply.code(403).send({ error: "Your current password is not correct" });
    }
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(body.data.newPassword, 12) } });
    return { success: true };
  });

  app.post("/:id/password", { preHandler: requireMinimumRole("SUPER_ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().cuid() }).safeParse(request.params);
    const body = z.object({ newPassword: password, confirm: z.literal(true) }).safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "Member not found" });
    if (!body.success) return reply.code(400).send({ error: firstProblem(body.error, "Enter a new password") });
    const target = await prisma.user.findUnique({ where: { id: params.data.id } });
    if (!target) return reply.code(404).send({ error: "Member not found" });
    if (!canManageRole(request.user.role, target.role)) return reply.code(403).send({ error: "Super-admin accounts cannot be changed here" });
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(body.data.newPassword, 12) } });
    await prisma.auditLog.create({
      data: { actorId: request.user.sub, action: "member_password_reset", targetType: "User", targetId: target.id },
    });
    return { success: true };
  });
};

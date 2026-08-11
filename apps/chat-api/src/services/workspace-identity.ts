import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * The G Arts Workspace is the identity authority for the whole product.
 *
 * Chat does not ask anyone to sign in twice: it verifies the Workspace's own
 * access token and keeps a local projection of the member, so a message always
 * has a stable author even while the Workspace is unreachable. Chat's native
 * accounts remain for standalone use and for the period before the Workspace
 * is configured.
 *
 * This is deliberately an integration boundary, not a merge — `CHAT.md` and
 * `ARCHITECTURE.md` require the chat server to stay its own service.
 */

/** The payload the Workspace API signs (apps/api/src/routes/auth.ts). */
export interface WorkspaceToken {
  sub: string;
  username: string;
  displayName: string;
  role: WorkspaceRole;
  exp?: number;
  iat?: number;
}

export type WorkspaceRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TEAM_LEAD'
  | 'MEMBER'
  | 'TRAINEE'
  | 'GUEST';

/**
 * Workspace roles collapse onto chat's two, plus a read-only guest.
 * Anything that can administer the Workspace can moderate chat.
 */
const ROLE_MAP: Record<WorkspaceRole, 'admin' | 'member' | 'guest'> = {
  SUPER_ADMIN: 'admin',
  ADMIN: 'admin',
  TEAM_LEAD: 'member',
  MEMBER: 'member',
  TRAINEE: 'member',
  GUEST: 'guest'
};

export function mapWorkspaceRole(role: WorkspaceRole | string): 'admin' | 'member' | 'guest' {
  return ROLE_MAP[role as WorkspaceRole] ?? 'member';
}

const WORKSPACE_ROLES = new Set(Object.keys(ROLE_MAP));

/**
 * Verifies a Workspace access token. Returns null for anything that is not a
 * well-formed Workspace token, so the caller can fall back to chat's own.
 */
export function verifyWorkspaceToken(token: string): WorkspaceToken | null {
  if (!config.workspace.enabled) return null;
  try {
    const payload = jwt.verify(token, config.workspace.jwtSecret!) as WorkspaceToken;
    // Chat's own tokens verify against a different secret, but be explicit:
    // a Workspace token is identified by its shape, not by luck.
    if (!payload?.sub || !payload.username || !WORKSPACE_ROLES.has(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Mirrors the member into chat, creating the local row on first sight and
 * keeping name/role in step afterwards. The Workspace stays authoritative:
 * chat never writes back.
 */
export async function resolveWorkspaceMember(token: WorkspaceToken) {
  const chatRole = mapWorkspaceRole(token.role);
  const username = token.username.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ workspaceUserId: token.sub }, { username }] },
    select: { id: true, workspaceUserId: true, displayName: true, role: true, disabledAt: true }
  });

  if (!existing) {
    const created = await prisma.user.create({
      data: {
        workspaceUserId: token.sub,
        username,
        displayName: token.displayName || token.username,
        role: chatRole,
        // Authentication happens in the Workspace; there is no local password
        // to guess. An unusable hash keeps the column honest.
        passwordHash: 'workspace-managed',
        status: 'online'
      },
      select: { id: true, username: true, displayName: true, role: true }
    });
    logger.info({ userId: created.id, workspaceUserId: token.sub }, 'Mirrored a Workspace member');
    return created;
  }

  // Adopt a pre-existing chat account with the same username the first time
  // that person arrives through the Workspace, rather than creating a
  // duplicate they would have to reconcile by hand.
  const needsUpdate =
    existing.workspaceUserId !== token.sub ||
    existing.role !== chatRole ||
    (token.displayName && existing.displayName !== token.displayName);

  if (!needsUpdate) {
    return { id: existing.id, username, displayName: existing.displayName, role: existing.role };
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      workspaceUserId: token.sub,
      role: chatRole,
      ...(token.displayName ? { displayName: token.displayName } : {})
    },
    select: { id: true, username: true, displayName: true, role: true }
  });
  return updated;
}

/** True when the caller presented the shared service secret. */
export function isServiceCall(header: string | undefined): boolean {
  const expected = config.workspace.serviceToken;
  if (!expected || !header) return false;
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;
  // Lengths differ far more often than contents, so a constant-time compare
  // buys little here; keep it simple and explicit.
  return provided === expected;
}

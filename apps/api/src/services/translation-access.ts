import { prisma } from "../lib/prisma.js";
import { hasMinimumRole } from "../permissions.js";
import type { Role } from "@prisma/client";

/**
 * Who may look at a translator's own weekly work.
 *
 * A translator's article plan is work product, so a Translation lead reviewing
 * it is legitimate. A G Arts administrator reading it is not — they have no
 * part in that team's work, and `DO_NOT_BUILD.md` rules out an administrator
 * who can browse everything simply because of their role.
 *
 * Checking the role alone let any ADMIN on any team read every translator's
 * plan. Review now requires being on the Translation team as well. A
 * super-admin keeps access: they own the whole workspace and can already move
 * anyone between teams, so denying them would be a formality rather than a
 * protection.
 */
export interface Viewer {
  id: string;
  team: string;
  /** On the Translation team, so they own work of their own here. */
  isTranslator: boolean;
  /** May read other people's work in this team. */
  canReview: boolean;
}

export async function translationViewer(userId: string, role: Role): Promise<Viewer | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, team: true },
  });
  if (!user) return null;

  const isTranslator = user.team === "TRANSLATION";
  const canReview = role === "SUPER_ADMIN" || (isTranslator && hasMinimumRole(role, "ADMIN"));
  return { id: user.id, team: user.team, isTranslator, canReview };
}

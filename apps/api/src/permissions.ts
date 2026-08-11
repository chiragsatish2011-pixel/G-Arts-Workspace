import type { Role } from "@prisma/client";

export const roleRank: Record<Role, number> = {
  GUEST: 0,
  TRAINEE: 1,
  MEMBER: 2,
  TEAM_LEAD: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

export function hasMinimumRole(role: Role, minimumRole: Role): boolean {
  return roleRank[role] >= roleRank[minimumRole];
}

export function canManageRole(actor: Role, target: Role): boolean {
  if (actor !== "SUPER_ADMIN") return false;
  return target !== "SUPER_ADMIN";
}

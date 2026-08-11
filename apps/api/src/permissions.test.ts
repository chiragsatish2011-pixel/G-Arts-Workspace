import { describe, expect, it } from "vitest";
import { canManageRole, hasMinimumRole } from "./permissions.js";

describe("role permissions", () => {
  it("allows a higher role through a minimum-role route guard", () => {
    expect(hasMinimumRole("TEAM_LEAD", "MEMBER")).toBe(true);
    expect(hasMinimumRole("GUEST", "MEMBER")).toBe(false);
  });

  it("reserves member role management for a super-admin", () => {
    expect(canManageRole("SUPER_ADMIN", "MEMBER")).toBe(true);
    expect(canManageRole("ADMIN", "MEMBER")).toBe(false);
    expect(canManageRole("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
  });
});

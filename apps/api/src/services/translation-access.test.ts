import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: { user: { findFirst: state.findFirst } } }));

import { translationViewer } from "./translation-access.js";

describe("Translation review boundary", () => {
  beforeEach(() => state.findFirst.mockReset());

  it("does not give a G-Arts administrator access to translators' plans", async () => {
    state.findFirst.mockResolvedValue({ id: "admin", team: "G_ARTS" });
    await expect(translationViewer("admin", "ADMIN")).resolves.toMatchObject({ isTranslator: false, canReview: false });
  });

  it("allows a Translation administrator to review their own team's plans", async () => {
    state.findFirst.mockResolvedValue({ id: "translation-admin", team: "TRANSLATION" });
    await expect(translationViewer("translation-admin", "ADMIN")).resolves.toMatchObject({ isTranslator: true, canReview: true });
  });

  it("retains the super-admin recovery path", async () => {
    state.findFirst.mockResolvedValue({ id: "super", team: "G_ARTS" });
    await expect(translationViewer("super", "SUPER_ADMIN")).resolves.toMatchObject({ canReview: true });
  });
});

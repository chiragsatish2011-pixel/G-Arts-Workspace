import { describe, expect, it } from "vitest";
import { taskTransitionProblem } from "./task-workflow.js";

describe("event work-item review rules", () => {
  it("allows a member to submit finished work but not approve it", () => {
    expect(taskTransitionProblem({ currentStatus: "not_done", currentKind: null, nextStatus: "submitted", nextKind: "finished", isAdmin: false })).toBeNull();
    expect(taskTransitionProblem({ currentStatus: "submitted", currentKind: "finished", nextStatus: "approved", nextKind: "finished", isAdmin: false })).toMatch(/administrator/i);
  });

  it("requires a submitted item before an administrator may approve it", () => {
    expect(taskTransitionProblem({ currentStatus: "not_done", currentKind: null, nextStatus: "approved", nextKind: "finished", isAdmin: true })).toMatch(/submitted/i);
    expect(taskTransitionProblem({ currentStatus: "submitted", currentKind: "finished", nextStatus: "approved", nextKind: "finished", isAdmin: true })).toBeNull();
  });

  it("reserves not-required and reopening decisions for administrators", () => {
    expect(taskTransitionProblem({ currentStatus: "not_done", currentKind: null, nextStatus: "submitted", nextKind: "not_required", isAdmin: false })).toMatch(/administrator/i);
    expect(taskTransitionProblem({ currentStatus: "approved", currentKind: "finished", nextStatus: "not_done", nextKind: null, isAdmin: false })).toMatch(/reopen/i);
  });
});

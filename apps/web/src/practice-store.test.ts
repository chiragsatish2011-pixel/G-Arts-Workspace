import { beforeEach, expect, test, vi } from "vitest";
import { beginPractice, endPractice, isPracticeToken, practiceRequest } from "./practice-store";
import { listEvents, rememberSession, storedSession } from "./api";
import type { Session } from "./api";

const realSession: Session = {
  token: "real-token-never-used-by-practice",
  user: {
    id: "real-admin", username: "admin", displayName: "G-Arts Administrator", avatarUrl: null, accentColor: null, title: null,
    role: "SUPER_ADMIN", team: "G_ARTS", onboardingDismissedAt: null, onboardingCompletedAt: null, onboardingRequiredAt: null,
  },
};

beforeEach(() => {
  // The store only uses this to announce a completed practice action.
  Object.assign(globalThis, { window: { dispatchEvent: () => true } });
  endPractice();
});

test("practice uses a fresh local token and keeps a submitted admin review", async () => {
  const practice = beginPractice(realSession);
  expect(isPracticeToken(practice.token)).toBe(true);
  expect(practice.token).not.toBe(realSession.token);

  const events = await practiceRequest<any[]>("/events?scope=upcoming");
  expect(events).toHaveLength(1);
  expect(events[0].tasks[0]).toMatchObject({ title: "Photography", status: "submitted", completionKind: "finished" });

  const approved = await practiceRequest<any>(`/events/tasks/${events[0].tasks[0].id}`, {
    method: "PATCH", body: JSON.stringify({ status: "approved", completionKind: "finished" }),
  });
  expect(approved.status).toBe("approved");
  expect(realSession.user.displayName).toBe("G-Arts Administrator");
});

test("leaving a practice session destroys its sample records", async () => {
  beginPractice(realSession);
  await practiceRequest("/g-news-todos", { method: "POST", body: JSON.stringify({ title: "Temporary practice task" }) });
  expect(await practiceRequest<any[]>("/g-news-todos")).toHaveLength(1);
  endPractice();
  await expect(practiceRequest("/g-news-todos")).rejects.toThrow("Practice session has ended");
});

test("a practice identity can never become the saved login session", () => {
  const memory = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  const practice = beginPractice(realSession);
  rememberSession(practice);
  expect(storedSession()).toBeNull();
});

test("practice reads never contact the Workspace server", async () => {
  const fetchSpy = vi.fn();
  Object.assign(globalThis, { fetch: fetchSpy });
  const practice = beginPractice(realSession);
  await listEvents(practice.token);
  expect(fetchSpy).not.toHaveBeenCalled();
});

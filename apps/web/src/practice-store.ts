import type {
  CompletionKind, EventCategory, EventDelivery, GEvent, GNewsTodo, GTask,
  LatestLibraryFeed, LibraryItem, Member, Session, TaskStatus, TranslationArticleDay, TranslationArticleWeek,
} from "./api";

/**
 * A deliberately separate, in-memory workspace used only by the Guide.  It
 * never receives the user's bearer token and never makes a network request.
 * Closing, skipping, or restarting the Guide drops the entire store.
 */
const PREFIX = "practice:";
const categories: EventCategory[] = [
  { key: "cultural", label: "Cultural" },
  { key: "spiritual", label: "Spiritual" },
  { key: "academic", label: "Academic" },
];

type State = {
  session: Session;
  events: GEvent[];
  music: LibraryItem[];
  todos: GNewsTodo[];
  weeks: TranslationArticleWeek[];
};

let state: State | null = null;
let sequence = 0;
const id = (kind: string) => `practice-${kind}-${++sequence}`;
const clone = <T,>(value: T): T => structuredClone(value);

export const isPracticeToken = (token?: string) => Boolean(token?.startsWith(PREFIX));

function signal(action: string) {
  window.dispatchEvent(new CustomEvent("garts:practice-action", { detail: { action } }));
}

const emptyDelivery = (): EventDelivery => ({
  websiteUrl: null, websiteEventCreated: false, websiteApproved: false,
  parentsShareUrl: null, parentsLinkShared: false, parentsShareApproved: false,
  shortsUrl: null, shortsUploaded: false, shortsApproved: false,
  videoUrl: null, videoUploaded: false, videoApproved: false,
  videoThumbnailDone: false, videoThumbnailApproved: false,
  videoShareUrl: null, videoSharedToParents: false, videoShareApproved: false,
});

function task(title: string, status: TaskStatus, completionKind: CompletionKind | null): GTask {
  return { id: id("task"), title, status, completionKind, assigneeId: null, dueAt: null, position: sequence };
}

function makeWeek(owner: Session["user"]): TranslationArticleWeek {
  const days: TranslationArticleDay[] = Array.from({ length: 7 }, (_, index) => ({
    id: id("day"), weekday: index + 1, whatDid: null, whatsNext: null, readingProgress: null, writingProgress: null,
    listenedDone: false, notesCaptured: false, readingDone: false, writingDone: false, deepReadingDone: false, articleFinalised: false, submitted: false,
  }));
  return {
    id: id("week"), ownerId: owner.id, weekStart: new Date().toISOString().slice(0, 10), topic: "Practice: one teaching to reflect on", readingList: "[]",
    openingDone: false, bodyOneTwoDone: false, bodyThreeDone: false, closingDone: false, readAloudDone: false, finalRevisionDone: false, submittedArchived: false,
    owner: { id: owner.id, displayName: owner.displayName, username: owner.username }, days,
  };
}

/** Start a clean, role-aware practice session. */
export function beginPractice(real: Session): Session {
  sequence = 0;
  const role = real.user.role;
  const eventTask = ["ADMIN", "SUPER_ADMIN"].includes(role)
    ? task("Photography", "submitted", "finished")
    : task("Photography", "not_done", null);
  const practiceUser = {
    ...real.user,
    id: `practice-user-${real.user.id}`,
    // Keep the account identity exactly as it appears in the real workspace.
    // Practice is an environment, not a renamed account; the guide itself
    // carries the temporary-practice label.
    displayName: real.user.displayName,
    onboardingDismissedAt: real.user.onboardingDismissedAt,
    onboardingCompletedAt: real.user.onboardingCompletedAt,
    onboardingRequiredAt: real.user.onboardingRequiredAt,
  };
  const session: Session = { token: `${PREFIX}${crypto.randomUUID()}`, user: practiceUser };
  state = {
    session,
    events: [{
      id: id("event"), name: "Practice Independence Day", category: "cultural", seriesKey: null,
      startsAt: new Date(Date.now() + 86_400_000 * 3).toISOString(), endsAt: null, allDay: true,
      venue: "Practice workspace", description: "A sample record which disappears when the guide ends.", status: "confirmed", coverage: "Photography",
      sourceKind: "practice", sourceUrl: null, sourceNote: "Practice record — not a real event", verifiedAt: null,
      tasks: [eventTask], delivery: emptyDelivery(), completedAt: null, chatChannelId: null,
    }],
    music: [], todos: [], weeks: [],
  };
  signal("started");
  return clone(session);
}

export function endPractice() { state = null; signal("reset"); }

function current() {
  if (!state) throw new Error("Practice session has ended. Start the Guide again for a fresh session.");
  return state;
}

function eventFor(idValue: string) {
  const event = current().events.find((item) => item.id === idValue);
  if (!event) throw new Error("Practice event not found");
  return event;
}

function eventScope(scope: string) {
  const events = current().events;
  if (scope === "completed") return events.filter((event) => event.status === "completed");
  if (scope === "past") return events.filter((event) => event.status !== "completed" && new Date(event.startsAt) < new Date());
  return events.filter((event) => event.status !== "completed" && new Date(event.startsAt) >= new Date());
}

function asBody(options: RequestInit) {
  return options.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
}

function latest(): LatestLibraryFeed {
  return {
    status: "ready", windowDays: 15, sourceUrl: "https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf",
    refreshedAt: new Date().toISOString(),
    video: [{ id: "practice-video", title: "Practice video — opens the official playlist", url: "https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf", publishedAt: new Date().toISOString() }],
    live: [],
  };
}

/** Handles the same client API surface as the real backend, entirely locally. */
export async function practiceRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const data = asBody(options);
  const method = options.method ?? "GET";
  const s = current();
  const done = (value: unknown, action?: string) => { if (action) signal(action); return clone(value) as T; };

  if (path === "/auth/me") return done({ user: s.session.user });
  if (path === "/events/categories") return done({ categories });
  if (path.startsWith("/events?")) return done(eventScope(new URLSearchParams(path.split("?")[1]).get("scope") ?? "upcoming"));
  if (path === "/events" && method === "POST") {
    const coverage = Array.isArray(data.coverage) ? data.coverage.filter((value): value is string => typeof value === "string") : [];
    const event: GEvent = {
      id: id("event"), name: String(data.name ?? "Practice event"), category: String(data.category ?? "cultural"), seriesKey: typeof data.seriesKey === "string" ? data.seriesKey : null,
      startsAt: String(data.startsAt ?? new Date().toISOString()), endsAt: null, allDay: true, venue: typeof data.venue === "string" ? data.venue : null,
      description: null, status: "confirmed", coverage: coverage.join(", "), sourceKind: "practice", sourceUrl: null,
      sourceNote: String(data.sourceNote ?? "Practice confirmation"), verifiedAt: null,
      tasks: coverage.map((title) => task(title, "not_done", null)), delivery: emptyDelivery(), completedAt: null, chatChannelId: null,
    };
    s.events.unshift(event); return done(event, "event-created");
  }
  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  if (eventMatch && method === "PATCH") { const event = eventFor(eventMatch[1]); Object.assign(event, data); return done(event, "event-updated"); }
  const taskMatch = path.match(/^\/events\/tasks\/([^/]+)$/);
  if (taskMatch && method === "PATCH") {
    for (const event of s.events) {
      const found = event.tasks.find((item) => item.id === taskMatch[1]);
      if (found) { found.status = data.status as TaskStatus; found.completionKind = (data.completionKind ?? null) as CompletionKind | null; return done(found, found.status === "approved" ? "task-approved" : "task-submitted"); }
    }
    throw new Error("Practice work-item not found");
  }
  const addTaskMatch = path.match(/^\/events\/([^/]+)\/tasks$/);
  if (addTaskMatch && method === "POST") { const found = task(String(data.title ?? "Practice work"), "not_done", null); eventFor(addTaskMatch[1]).tasks.push(found); return done(found, "task-added"); }
  const deliveryMatch = path.match(/^\/events\/([^/]+)\/delivery$/);
  if (deliveryMatch && method === "PATCH") { const event = eventFor(deliveryMatch[1]); event.delivery = { ...(event.delivery ?? emptyDelivery()), ...data }; return done(event.delivery, "delivery-updated"); }
  const completeMatch = path.match(/^\/events\/([^/]+)\/complete$/);
  if (completeMatch && method === "POST") { const event = eventFor(completeMatch[1]); event.status = "completed"; event.completedAt = new Date().toISOString(); return done(event, "event-completed"); }
  const recoverMatch = path.match(/^\/events\/([^/]+)\/recover$/);
  if (recoverMatch && method === "POST") { const event = eventFor(recoverMatch[1]); event.status = "confirmed"; event.completedAt = null; return done(event, "event-recovered"); }
  if (path === "/logbook") return done([]);

  if (path === "/library") {
    if (method === "GET") return done(s.music);
    if (method === "POST") { const item: LibraryItem = { id: id("music"), title: String(data.title), url: String(data.url), kind: "MUSIC", createdById: s.session.user.id, createdAt: new Date().toISOString() }; s.music.push(item); return done(item, "music-added"); }
  }
  const libraryMatch = path.match(/^\/library\/([^/]+)$/);
  if (libraryMatch && method === "DELETE") { const at = s.music.findIndex((item) => item.id === libraryMatch[1]); if (at >= 0) s.music.splice(at, 1); return done({ deleted: true, title: "Practice link" }, "music-removed"); }
  if (path === "/library/latest") return done(latest());

  if (path === "/g-news-todos") {
    if (method === "GET") return done(s.todos);
    if (method === "POST") { const todo: GNewsTodo = { id: id("todo"), title: String(data.title), completedAt: null, createdAt: new Date().toISOString() }; s.todos.unshift(todo); return done(todo, "todo-added"); }
  }
  const todoMatch = path.match(/^\/g-news-todos\/([^/]+)$/);
  if (todoMatch && method === "PATCH") { const todo = s.todos.find((item) => item.id === todoMatch[1]); if (!todo) throw new Error("Practice to-do not found"); todo.completedAt = data.done ? new Date().toISOString() : null; return done(todo, data.done ? "todo-completed" : "todo-reopened"); }
  if (todoMatch && method === "DELETE") { s.todos = s.todos.filter((item) => item.id !== todoMatch[1]); return done({ deleted: true }, "todo-removed"); }

  if (path === "/translation-weeks") {
    if (method === "GET") return done(s.weeks);
    if (method === "POST") { const week = makeWeek(s.session.user); week.weekStart = String(data.weekStart ?? week.weekStart); week.topic = typeof data.topic === "string" ? data.topic : null; s.weeks = [week]; return done(week, "week-started"); }
  }
  const weekMatch = path.match(/^\/translation-weeks\/([^/]+)$/);
  if (weekMatch && method === "PATCH") { const week = s.weeks.find((item) => item.id === weekMatch[1]); if (!week) throw new Error("Practice week not found"); Object.assign(week, data); return done(week, "week-updated"); }
  const dayMatch = path.match(/^\/translation-weeks\/([^/]+)\/days\/([^/]+)$/);
  if (dayMatch && method === "PATCH") { const day = s.weeks.find((item) => item.id === dayMatch[1])?.days.find((item) => item.id === dayMatch[2]); if (!day) throw new Error("Practice day not found"); Object.assign(day, data); return done(day, "day-updated"); }

  if (path === "/users/me" && method === "PATCH") { Object.assign(s.session.user, data); return done(s.session, "profile-updated"); }
  if (path === "/users/me/onboarding") return done(s.session, "onboarding-updated");
  if (path === "/users/me/password") return done({ success: true }, "password-changed");
  if (path === "/users") {
    const member: Member = { ...s.session.user, id: s.session.user.id, skills: "", availability: "", createdAt: new Date().toISOString(), deletedAt: null };
    return done([member]);
  }
  if (path === "/admin/audit-log") return done([]);
  throw new Error(`That feature is not included in this practice session yet (${path}).`);
}

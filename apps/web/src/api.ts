const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export type Role = "SUPER_ADMIN" | "ADMIN" | "TEAM_LEAD" | "MEMBER" | "TRAINEE" | "GUEST";
export type Team = "G_ARTS" | "TRANSLATION" | "G_NEWS";
export type Member = { id: string; username: string; displayName: string; avatarUrl: string | null; accentColor: string | null; title: string | null; role: Role; team: Team; skills: string; availability: string; createdAt: string; deletedAt: string | null; onboardingDismissedAt: string | null; onboardingCompletedAt: string | null };
export type Session = { token: string; user: Pick<Member, "id" | "username" | "displayName" | "avatarUrl" | "accentColor" | "title" | "role" | "team" | "onboardingDismissedAt" | "onboardingCompletedAt"> };
type Named = { displayName: string; username: string };
/** `actor` and `target` are null when the account behind the id is gone. */
export type AuditEntry = {
  id: string; actorId: string; action: string; targetType: string; targetId: string; createdAt: string;
  actor: Named | null; target: Named | null; metadata?: Record<string, unknown> | null;
};

export async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch {
    throw new Error("Cannot reach the workspace service. Check the local services are running, then try again.");
  }
  const data = await response.json().catch(() => ({ error: "The server returned an invalid response" }));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const login = (username: string, password: string) => request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
export const listMembers = (token: string) => request<Member[]>("/users", {}, token);
export const addMember = (token: string, data: { username: string; displayName: string; title?: string; role: Role; team: Team }) => request<Member>("/users", { method: "POST", body: JSON.stringify(data) }, token);
export const updateRole = (token: string, id: string, role: Role) => request<Member>(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role, confirm: true }) }, token);
export const updateMemberTeam = (token: string, id: string, team: Team) => request<Member>(`/users/${id}/team`, { method: "PATCH", body: JSON.stringify({ team, confirm: true }) }, token);
export const setMemberAccess = (token: string, id: string, disabled: boolean) => request<Member>(`/users/${id}/access`, { method: "PATCH", body: JSON.stringify({ disabled, confirm: true }) }, token);
export const resetMemberPassword = (token: string, id: string) => request<void>(`/users/${id}/password`, { method: "POST", body: JSON.stringify({ confirm: true }) }, token);
export const listAudit = (token: string) => request<AuditEntry[]>("/admin/audit-log", {}, token);

/**
 * Deletes an account here and in chat. `erase` also removes everything the
 * member posted in shared channels; without it their posts stay so other
 * people's conversations are not left with gaps.
 */
export const deleteMember = (token: string, id: string, erase: boolean) =>
  request<{ deleted: true; username: string; chat: { erased: boolean; privateChatsDeleted: number } }>(
    `/users/${id}`,
    { method: "DELETE", body: JSON.stringify({ confirm: true, erase }) },
    token,
  );

export const updateMyProfile = (
  token: string,
  data: { displayName?: string; title?: string | null; accentColor?: string | null },
) => request<Session>("/users/me", { method: "PATCH", body: JSON.stringify(data) }, token);

export const changeMyPassword = (token: string, currentPassword: string, newPassword: string) =>
  request<{ success: boolean }>("/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }, token);
export const updateOnboarding = (token: string, status: "skipped" | "completed") =>
  request<Session>("/users/me/onboarding", { method: "PATCH", body: JSON.stringify({ status }) }, token);

export const uploadMyAvatar = async (token: string, file: File) => {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`${API_URL}/users/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Upload failed");
  return (await response.json()) as Member;
};

export const removeMyAvatar = (token: string) =>
  request<Member>("/users/me/avatar", { method: "DELETE" }, token);

/** Avatars are behind auth, so they are fetched once and held as a blob URL. */
const avatarCache = new Map<string, Promise<string>>();
export function avatarSrc(token: string, key: string): Promise<string> {
  let promise = avatarCache.get(key);
  if (!promise) {
    promise = fetch(`${API_URL}/users/avatars/${key}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error("no avatar"); return r.blob(); })
      .then((b) => URL.createObjectURL(b));
    avatarCache.set(key, promise);
  }
  return promise;
}
export const forgetAvatar = (key: string) => avatarCache.delete(key);

/**
 * The session survives a refresh.
 *
 * The token is held in localStorage and re-validated against the API on load,
 * so reloading resumes where you were instead of dropping you at sign-in. It
 * is cleared the moment the server says it is no longer good.
 */
const SESSION_KEY = "g-arts.session";

export function rememberSession(session: Session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private mode */ }
}

export function forgetSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
}

export function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/** Confirms a stored token is still good. Null means sign in again. */
export async function resumeSession(): Promise<Session | null> {
  const stored = storedSession();
  if (!stored?.token) return null;
  try {
    const { user } = await request<{ user: Session["user"] }>("/auth/me", {}, stored.token);
    const session = { ...stored, user };
    rememberSession(session);
    return session;
  } catch (cause) {
    // Only give up on a real rejection. A server that is briefly down should
    // not sign anybody out.
    const message = cause instanceof Error ? cause.message : "";
    if (/401|403|no longer active|Authentication required/i.test(message)) {
      forgetSession();
      return null;
    }
    return stored;
  }
}

// --- Events ----------------------------------------------------------------

export type EventStatus = "planned" | "confirmed" | "covered" | "completed" | "archived";
export type GEvent = {
  id: string; name: string; category: string; seriesKey: string | null;
  startsAt: string; endsAt: string | null; allDay: boolean;
  venue: string | null; description: string | null;
  status: EventStatus; coverage: string;
  sourceKind: string | null; sourceUrl: string | null; sourceNote: string | null; verifiedAt: string | null; tasks: GTask[];
  delivery: EventDelivery | null;
  completedAt: string | null;
  chatChannelId: string | null;
};
export type EventCategory = { key: string; label: string };
export type CalendarEntry = {
  uid: string; title: string; startsAt: string; endsAt: string | null;
  allDay: boolean; venue: string | null;
};

export const listEventCategories = (token: string) =>
  request<{ categories: EventCategory[] }>("/events/categories", {}, token);

export const listEvents = (token: string, scope: "upcoming" | "past" | "completed" | "all" = "upcoming") =>
  request<GEvent[]>(`/events?scope=${scope}`, {}, token);

export const createEvent = (
  token: string,
  data: { name: string; category: string; seriesKey?: string | null; startsAt: string; venue?: string | null; description?: string | null; coverage: string[]; sourceNote: string },
) => request<GEvent>("/events", { method: "POST", body: JSON.stringify(data) }, token);

export const updateEvent = (token: string, id: string, data: Partial<{ status: EventStatus; category: string; coverage: string[]; name: string; venue: string | null }>) =>
  request<GEvent>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);

export type EventDelivery = {
  websiteUrl: string | null; websiteEventCreated: boolean; websiteApproved: boolean; parentsShareUrl: string | null; parentsLinkShared: boolean; parentsShareApproved: boolean;
  shortsUrl: string | null; shortsUploaded: boolean; shortsApproved: boolean; videoUrl: string | null; videoUploaded: boolean; videoApproved: boolean;
  videoThumbnailDone: boolean; videoThumbnailApproved: boolean; videoShareUrl: string | null; videoSharedToParents: boolean; videoShareApproved: boolean;
};
export const updateEventDelivery = (token: string, eventId: string, data: Partial<EventDelivery>) =>
  request<EventDelivery>(`/events/${eventId}/delivery`, { method: "PATCH", body: JSON.stringify(data) }, token);

export const deleteEvent = (token: string, id: string) =>
  request<{ deleted: true; name: string }>(`/events/${id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) }, token);

export const addEventTask = (token: string, eventId: string, title: string) =>
  request<GTask>(`/events/${eventId}/tasks`, { method: "POST", body: JSON.stringify({ title }) }, token);

export const updateEventTask = (token: string, taskId: string, status: TaskStatus, completionKind?: CompletionKind | null) =>
  request<GTask>(`/events/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status, ...(completionKind === undefined ? {} : { completionKind }) }) }, token);
export const completeEvent = (token: string, eventId: string) =>
  request<GEvent>(`/events/${eventId}/complete`, { method: "POST" }, token);
export const recoverEvent = (token: string, eventId: string) =>
  request<GEvent>(`/events/${eventId}/recover`, { method: "POST" }, token);

/** What the school has published that has not been brought in yet. */
export const availableFromCalendar = (token: string) =>
  request<{ total: number; imported: number; entries: CalendarEntry[] }>("/events/calendar/available", {}, token);

export const importFromCalendar = (token: string, entries: { uid: string; category: string }[]) =>
  request<{ created: number; skipped: number; names: string[] }>(
    "/events/calendar/import",
    { method: "POST", body: JSON.stringify({ entries }) },
    token,
  );

export type TaskStatus = "not_done" | "submitted" | "approved";
export type CompletionKind = "finished" | "not_required";
export type GTask = { id: string; eventId?: string | null; copiedFromEventId?: string | null; title: string; status: TaskStatus; completionKind?: CompletionKind | null; assigneeId: string | null; dueAt: string | null; position: number; submittedAt?: string | null; approvedAt?: string | null; notRequiredAt?: string | null };

// --- Logbook ---------------------------------------------------------------

export type LogbookEntry = { id: string; at: string; kind: "event" | "task"; title: string; detail: string; eventId?: string | null };
export const listLogbook = (token: string, eventId?: string) =>
  request<LogbookEntry[]>(`/logbook${eventId ? `?eventId=${eventId}` : ""}`, {}, token);

// --- Shared library and Translation article tracker ------------------------

export type LibraryKind = "MUSIC" | "VIDEO" | "LIVE";
export type LibraryItem = { id: string; title: string; url: string; kind: LibraryKind; createdById: string; createdAt: string };
export const listLibrary = (token: string) => request<LibraryItem[]>("/library", {}, token);
export const addLibraryItem = (token: string, data: { title: string; url: string; kind: LibraryKind }) =>
  request<LibraryItem>("/library", { method: "POST", body: JSON.stringify(data) }, token);
export const deleteLibraryItem = (token: string, id: string) =>
  request<{ deleted: true; title: string }>(`/library/${id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) }, token);
export type LatestLibraryItem = { id: string; title: string; url: string; publishedAt: string };
export type LatestLibraryFeed = { status: "ready" | "unconfigured" | "unavailable"; windowDays: 15; sourceUrl: string; refreshedAt: string; video: LatestLibraryItem[]; live: LatestLibraryItem[]; message?: string };
export const latestLibrary = (token: string) => request<LatestLibraryFeed>("/library/latest", {}, token);

export type GNewsTodo = { id: string; title: string; completedAt: string | null; createdAt: string };
export const listGNewsTodos = (token: string) => request<GNewsTodo[]>("/g-news-todos", {}, token);
export const addGNewsTodo = (token: string, title: string) => request<GNewsTodo>("/g-news-todos", { method: "POST", body: JSON.stringify({ title }) }, token);
export const setGNewsTodoDone = (token: string, id: string, done: boolean) => request<GNewsTodo>(`/g-news-todos/${id}`, { method: "PATCH", body: JSON.stringify({ done }) }, token);
export const deleteGNewsTodo = (token: string, id: string) => request<{ deleted: true }>(`/g-news-todos/${id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) }, token);


export type TranslationArticleDay = {
  id: string; weekday: number; whatDid: string | null; whatsNext: string | null; readingProgress: string | null; writingProgress: string | null;
  listenedDone: boolean; notesCaptured: boolean; readingDone: boolean; writingDone: boolean; deepReadingDone: boolean; articleFinalised: boolean; submitted: boolean;
};
export type TranslationArticleWeek = {
  id: string; ownerId: string; weekStart: string; topic: string | null; readingList: string;
  openingDone: boolean; bodyOneTwoDone: boolean; bodyThreeDone: boolean; closingDone: boolean; readAloudDone: boolean; finalRevisionDone: boolean; submittedArchived: boolean;
  owner: { id: string; displayName: string; username: string }; days: TranslationArticleDay[];
};
export const listTranslationWeeks = (token: string) => request<TranslationArticleWeek[]>("/translation-weeks", {}, token);
export const createTranslationWeek = (token: string, data: { weekStart: string; topic?: string }) => request<TranslationArticleWeek>("/translation-weeks", { method: "POST", body: JSON.stringify(data) }, token);
export const updateTranslationWeek = (token: string, id: string, data: Partial<Omit<TranslationArticleWeek, "id" | "ownerId" | "weekStart" | "owner" | "days" | "readingList">> & { readingList?: string[] }) => request<TranslationArticleWeek>(`/translation-weeks/${id}`, { method: "PATCH", body: JSON.stringify(data) }, token);
export const updateTranslationDay = (token: string, weekId: string, dayId: string, data: Partial<Omit<TranslationArticleDay, "id" | "weekday">>) => request<TranslationArticleDay>(`/translation-weeks/${weekId}/days/${dayId}`, { method: "PATCH", body: JSON.stringify(data) }, token);

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addEventTask, availableFromCalendar, completeEvent, createEvent, deleteEvent, importFromCalendar, listEventCategories, listEvents, recoverEvent,
  updateEvent,
  updateEventDelivery, updateEventTask, type CalendarEntry, type EventCategory, type EventDelivery, type EventStatus, type GEvent, type Session, type TaskStatus,
} from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";

/**
 * Events — the object the rest of G-Arts hangs from.
 *
 * Two ways in: type one, or bring one across from the school's published
 * academic calendar. The calendar side suggests a category from the title and
 * says which word it matched, but it never creates anything on its own — an
 * event nobody asked for is worse than no event.
 */

const STATUSES: EventStatus[] = ["planned", "confirmed", "covered", "archived"];
const workStatusLabel = (status: TaskStatus, kind?: string | null) =>
  status === "not_done" ? "Not started" : status === "submitted" ? (kind === "not_required" ? "Not required — awaiting admin" : "Finished — awaiting admin") : kind === "not_required" ? "Not required — approved" : "Finished — approved";
const resolved = (status: TaskStatus) => status === "approved";

const day = (iso: string, allDay: boolean) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  });

export function EventsPanel({ session }: { session: Session }) {
  const [events, setEvents] = useState<GEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [scope, setScope] = useState<"upcoming" | "past" | "completed">("upcoming");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const canPlan = ["SUPER_ADMIN", "ADMIN", "TEAM_LEAD"].includes(session.user.role);
  const canApprove = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);
  const canRecordDelivery = ["SUPER_ADMIN", "ADMIN", "TEAM_LEAD", "MEMBER"].includes(session.user.role);
  const canDelete = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);

  const byKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);

  const reload = async (which = scope) => {
    setLoading(true);
    try { setEvents(await listEvents(session.token, which)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load events"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    listEventCategories(session.token).then((d) => setCategories(d.categories)).catch(() => setCategories([]));
  }, [session.token]);
  useEffect(() => { void reload(scope); }, [session.token, scope]);

  const act = async (work: () => Promise<unknown>, message: string) => {
    setSaving(true); setError(""); setNotice("");
    try {
      await work();
      // An empty message means the work set its own — do not overwrite it.
      if (message) setNotice(message);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be done");
    } finally { setSaving(false); }
  };

  const changeWorkStatus = async (eventId: string, taskId: string, previous: TaskStatus, previousKind: "finished" | "not_required" | null | undefined, status: TaskStatus, title: string, completionKind?: "finished" | "not_required" | null) => {
    if (previous === status || savingTaskIds.has(taskId)) return;
    setSavingTaskIds((current) => new Set(current).add(taskId));
    setError(""); setNotice("");
    // Make the checklist respond at once. If saving fails, immediately restore
    // the saved state and show the reason instead of leaving a misleading tick.
    setEvents((current) => current.map((event) => event.id === eventId
      ? { ...event, tasks: event.tasks.map((task) => task.id === taskId ? { ...task, status, ...(completionKind === undefined ? {} : { completionKind }) } : task) }
      : event));
    try {
      await updateEventTask(session.token, taskId, status, completionKind);
      setNotice(`${title}: ${workStatusLabel(status, completionKind)}.`);
      await reload();
    } catch (cause) {
      setEvents((current) => current.map((event) => event.id === eventId
      ? { ...event, tasks: event.tasks.map((task) => task.id === taskId ? { ...task, status: previous, completionKind: previousKind } : task) }
        : event));
      setError(cause instanceof Error ? cause.message : "That work-item could not be updated");
    } finally {
      setSavingTaskIds((current) => { const next = new Set(current); next.delete(taskId); return next; });
    }
  };

  return (
    <div className="band band-paper">
      <div className="band-inner events-page">
        <div className="admin-title">
          <div>
            <span className="eyebrow">YOUR WORK</span>
            <h1>Event checklist</h1>
            <p>Upcoming and past G-Arts events.</p>
          </div>
          <div className="admin-summary">
            <strong>{events.length}</strong>
            <span>{scope === "upcoming" ? "coming up" : "past events"}</span>
          </div>
        </div>

        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {saving && <p className="panel-saving" role="status"><span className="loading-spinner" aria-hidden />Saving changes…</p>}

        {canPlan && <details className="simple-disclosure"><summary>Add a confirmed event</summary><NewEvent session={session} categories={categories} onDone={act} /></details>}
        {canPlan && <details className="simple-disclosure"><summary>Check the Bangalore school calendar</summary><FromCalendar session={session} categories={categories} onDone={act} /></details>}

        <div className="admin-section">
          <div className="admin-section-heading">
            <h2>{scope === "upcoming" ? "Upcoming events" : scope === "past" ? "Past events" : "Completed — recoverable for 15 days"}</h2>
            <div className="scope-switch">
              {(["upcoming", "past", "completed"] as const).map((s) => (
                <button key={s} className={scope === s ? "is-on" : ""} onClick={() => setScope(s)}>
                  {s === "upcoming" ? "Coming up" : s === "past" ? "Past" : "Completed"}
                </button>
              ))}
            </div>
          </div>

          {loading && events.length === 0 ? (
            <div className="events-loading" role="status"><span className="loading-spinner" aria-hidden />Loading event checklist…</div>
          ) : events.length === 0 ? (
            <p className="empty">
              {scope === "upcoming"
                ? "No scheduled events yet. A team lead can add one above after it is confirmed."
                : scope === "past" ? "No past events have been recorded yet." : "No recently completed events are recoverable."}
            </p>
          ) : (
            <div className="event-list">
              {events.map((event) => {
                const completed = event.tasks.filter((task) => resolved(task.status)).length;
                const notRequired = event.tasks.filter((task) => task.status === "approved" && task.completionKind === "not_required").length;
                const workSummary = event.tasks.length === 0 ? "No work-items" : `${completed} of ${event.tasks.length} resolved${notRequired ? ` · ${notRequired} not required` : ""}`;
                const canComplete = event.status !== "completed" && event.tasks.length > 0 && completed === event.tasks.length;
                return (
                  <article key={event.id} className={`event-row is-${event.status}`}>
                    <div className="event-when" aria-label={day(event.startsAt, true)}>
                      <strong>{new Date(event.startsAt).getDate()}</strong>
                      <small>{new Date(event.startsAt).toLocaleDateString(undefined, { month: "short" })}</small>
                    </div>

                    <div className="event-what">
                      <div className="event-heading">
                        <div>
                          <span className="event-status">{event.status}</span>
                          <strong>{event.name}</strong>
                          <span>{event.venue || byKey.get(event.category)?.label || "Details still to be confirmed"}</span>
                        </div>
                        <span className={completed === event.tasks.length && event.tasks.length > 0 ? "event-progress is-complete" : "event-progress"}>{workSummary}</span>
                      </div>
                      {event.sourceNote && <small className="event-source">Verified · {event.sourceNote}</small>}
                      <DeliveryLedger
                        event={event}
                        editable={canRecordDelivery}
                        admin={canApprove}
                        onSave={(data) => act(() => updateEventDelivery(session.token, event.id, data), "Delivery record updated.")}
                      />
                      <div className="event-work" aria-label={`Work-items for ${event.name}`}>
                        <div className="event-work-heading">
                          <strong>Checklist</strong>
                          {event.tasks.length > 0 && <span>{event.tasks.length} items</span>}
                        </div>
                        {event.tasks.length === 0 && <em>No work-items have been confirmed yet.</em>}
                        {event.tasks.map((task) => (
                        <div key={task.id} className={`event-work-item is-${task.status}${task.completionKind === "not_required" ? " is-not-required" : ""}${savingTaskIds.has(task.id) ? " is-saving" : ""}`} aria-busy={savingTaskIds.has(task.id)}>
                            <span className="event-work-mark" aria-hidden="true">{task.status === "approved" ? "✓" : task.completionKind === "not_required" ? "–" : task.status === "submitted" ? "•" : ""}</span>
                            <span className="event-work-name">{task.title}{task.copiedFromEventId ? <small>From a past occurrence</small> : null}</span>
                            <div className="task-review-controls">
                              <label title="Mark this item finished" className={task.completionKind === "finished" && task.status !== "not_done" ? "is-finished" : ""}><input data-practice="task-finish" type="checkbox" checked={task.completionKind === "finished" && (task.status === "submitted" || task.status === "approved")} disabled={savingTaskIds.has(task.id) || task.status === "approved" || (!canApprove && task.completionKind === "not_required")} onChange={(e) => void changeWorkStatus(event.id, task.id, task.status, task.completionKind, e.target.checked ? "submitted" : "not_done", task.title, e.target.checked ? "finished" : null)} />Finished</label>
                              {canApprove && <><label title="Administrator: this work is genuinely not required" className={task.completionKind === "not_required" ? "is-not-required" : ""}><input type="checkbox" checked={task.completionKind === "not_required" && (task.status === "submitted" || task.status === "approved")} disabled={savingTaskIds.has(task.id) || task.status === "approved"} onChange={(e) => void changeWorkStatus(event.id, task.id, task.status, task.completionKind, e.target.checked ? "submitted" : "not_done", task.title, e.target.checked ? "not_required" : null)} />Not required</label><label title="Administrator approval after review" className={task.status === "approved" ? "is-approved" : ""}><input data-practice="task-approve" type="checkbox" checked={task.status === "approved"} disabled={savingTaskIds.has(task.id) || (task.status !== "submitted" && task.status !== "approved")} onChange={(e) => void changeWorkStatus(event.id, task.id, task.status, task.completionKind, e.target.checked ? "approved" : "submitted", task.title, task.completionKind)} />Approved</label></>}
                            </div>
                            {savingTaskIds.has(task.id) && <span className="event-work-saving" role="status"><span className="loading-spinner" aria-hidden />Saving</span>}
                          </div>
                        ))}
                        {canPlan && <AddWorkItem eventId={event.id} session={session} onDone={act} />}
                      </div>
                    </div>

                    <div className="event-actions">
                      {event.status === "completed" ? canPlan ? (
                        <button type="button" onClick={() => setConfirm({ title: `Recover “${event.name}”?`, confirmLabel: "Recover event", body: <p>This returns the event to active work. The completed record is kept.</p>, onConfirm: () => act(() => recoverEvent(session.token, event.id), `${event.name} was recovered.`) })}>Recover</button>
                      ) : <span className="role">Completed</span> : canPlan ? (
                        <select
                          aria-label={`Status of ${event.name}`}
                          value={event.status}
                          onChange={(e) => act(
                            () => updateEvent(session.token, event.id, { status: e.target.value as EventStatus }),
                            `${event.name} is now ${e.target.value}.`,
                          )}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className="role">{event.status}</span>
                      )}
                      {canComplete && <button type="button" className="complete-event" onClick={() => setConfirm({ title: `Complete “${event.name}”?`, confirmLabel: "Complete event", body: <p>All work-items are approved or not required. The event will leave active lists and stay recoverable for 15 days.</p>, onConfirm: () => act(() => completeEvent(session.token, event.id), `${event.name} is completed and recoverable for 15 days.`) })}>Complete event</button>}
                      {canDelete && (
                        <button
                          type="button"
                          className="remove"
                          onClick={() => setConfirm({
                            title: `Delete “${event.name}”?`,
                            destructive: true,
                            confirmLabel: "Delete event",
                            body: <p>The event and its work-items are removed. This cannot be undone.</p>,
                            onConfirm: () => act(() => deleteEvent(session.token, event.id), `${event.name} was deleted.`),
                          })}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      </div>
    </div>
  );
}

const deliveryRows = [
  { url: "websiteUrl", submitted: "websiteEventCreated", approved: "websiteApproved", label: "Website event", placeholder: "gurukul.org event link" },
  { url: "parentsShareUrl", submitted: "parentsLinkShared", approved: "parentsShareApproved", label: "Link shared to parents", placeholder: "Share-proof link" },
  { url: "shortsUrl", submitted: "shortsUploaded", approved: "shortsApproved", label: "Shorts uploaded", placeholder: "YouTube Short link" },
  { url: "videoUrl", submitted: "videoUploaded", approved: "videoApproved", label: "Video uploaded", placeholder: "YouTube video link" },
  { url: "videoShareUrl", submitted: "videoSharedToParents", approved: "videoShareApproved", label: "Video shared to parents", placeholder: "Share-proof link" },
] as const;

function DeliveryLedger({ event, editable, admin, onSave }: { event: GEvent; editable: boolean; admin: boolean; onSave: (data: Partial<EventDelivery>) => Promise<void> }) {
  const delivery = event.delivery;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => setDrafts(Object.fromEntries(deliveryRows.map((row) => [row.url, (delivery?.[row.url] as string | null | undefined) ?? ""]))), [delivery]);
  return <details className="delivery-ledger">
    <summary>Delivery record <span>{delivery ? "Put links, then submit for approval" : "Add verified links"}</span></summary>
    <div className="delivery-table" aria-label={`Delivery record for ${event.name}`}>
      <div className="delivery-head"><span>Item</span><span>Verified link</span><span>Submitted</span><span>Approved</span></div>
      {deliveryRows.map((row) => {
        const link = delivery?.[row.url] as string | null | undefined;
        const submitted = Boolean(delivery?.[row.submitted]); const approved = Boolean(delivery?.[row.approved]);
        return <div className="delivery-line" key={row.url}>
          <strong>{row.label}</strong>
          {editable ? <span className="delivery-link-edit"><input type="url" value={drafts[row.url] ?? ""} onChange={(e) => setDrafts({ ...drafts, [row.url]: e.target.value })} placeholder={row.placeholder} aria-label={`${row.label} link`} /><button type="button" onClick={() => void onSave({ [row.url]: (drafts[row.url] ?? "").trim() || null, [row.submitted]: true } as Partial<EventDelivery>)}>Put link</button>{link && <a href={link} target="_blank" rel="noreferrer">Open ↗</a>}</span> : link ? <a href={link} target="_blank" rel="noreferrer">Open ↗</a> : <span className="delivery-none">No link recorded</span>}
          {editable ? <label className={submitted ? "delivery-check is-done" : "delivery-check"}><input type="checkbox" checked={submitted} onChange={(e) => void onSave({ [row.submitted]: e.target.checked } as Partial<EventDelivery>)} /><span>{submitted ? "Submitted" : "Submit"}</span></label> : <span className={submitted ? "delivery-read is-done" : "delivery-read"}>{submitted ? "Submitted" : "Not submitted"}</span>}
          {admin ? <label className={approved ? "delivery-check is-done" : "delivery-check"}><input type="checkbox" checked={approved} disabled={!submitted} onChange={(e) => void onSave({ [row.approved]: e.target.checked } as Partial<EventDelivery>)} /><span>{approved ? "Approved" : "Approve"}</span></label> : <span className={approved ? "delivery-read is-done" : "delivery-read"}>{approved ? "Approved" : "Awaiting admin"}</span>}
        </div>;
      })}
      <div className="delivery-line delivery-thumbnail"><strong>Video thumbnail</strong><span className="delivery-none">Checked directly — no file stored</span>{editable ? <label className={delivery?.videoThumbnailDone ? "delivery-check is-done" : "delivery-check"}><input type="checkbox" checked={Boolean(delivery?.videoThumbnailDone)} onChange={(e) => void onSave({ videoThumbnailDone: e.target.checked })} /><span>{delivery?.videoThumbnailDone ? "Submitted" : "Submit"}</span></label> : <span className={delivery?.videoThumbnailDone ? "delivery-read is-done" : "delivery-read"}>{delivery?.videoThumbnailDone ? "Submitted" : "Not submitted"}</span>}{admin ? <label className={delivery?.videoThumbnailApproved ? "delivery-check is-done" : "delivery-check"}><input type="checkbox" disabled={!delivery?.videoThumbnailDone} checked={Boolean(delivery?.videoThumbnailApproved)} onChange={(e) => void onSave({ videoThumbnailApproved: e.target.checked })} /><span>{delivery?.videoThumbnailApproved ? "Approved" : "Approve"}</span></label> : <span className={delivery?.videoThumbnailApproved ? "delivery-read is-done" : "delivery-read"}>{delivery?.videoThumbnailApproved ? "Approved" : "Awaiting admin"}</span>}</div>
    </div>
  </details>;
}

function AddWorkItem({ eventId, session, onDone }: { eventId: string; session: Session; onDone: (work: () => Promise<unknown>, message: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  return <form className="event-work-add" onSubmit={(e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const value = title.trim();
    void onDone(async () => { await addEventTask(session.token, eventId, value); setTitle(""); }, `${value} added.`);
  }}>
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add another real work-item" maxLength={200} />
    <button disabled={!title.trim()}>Add</button>
  </form>;
}

function NewEvent({
  session, categories, onDone,
}: {
  session: Session;
  categories: EventCategory[];
  onDone: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", category: "", seriesKey: "", startsAt: "", venue: "", work: "", sourceNote: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = form.name;
    void onDone(
      async () => {
        await createEvent(session.token, {
          name: form.name,
          category: form.category,
          seriesKey: form.seriesKey.trim() || null,
          startsAt: new Date(form.startsAt).toISOString(),
          venue: form.venue || null,
          coverage: form.work.split(",").map((item) => item.trim()).filter(Boolean),
          sourceNote: form.sourceNote,
        });
        setForm({ name: "", category: "", seriesKey: "", startsAt: "", venue: "", work: "", sourceNote: "" });
      },
      `${name} was added from the recorded confirmation.`,
    );
  };

  return (
    <form className="admin-create" onSubmit={submit}>
      <div>
        <label>Event
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Event name" required minLength={2} />
        </label>
        <label>Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
            <option value="" disabled>Choose a category</option>
            {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label>Recurring event name
          <input value={form.seriesKey} onChange={(e) => setForm({ ...form, seriesKey: e.target.value })} placeholder="Only if this has earlier G-Arts occurrences" />
        </label>
        <label>Date
          <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
        </label>
        <label>Venue
          <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Leave blank if not confirmed" />
        </label>
        <label>Work required
          <input value={form.work} onChange={(e) => setForm({ ...form, work: e.target.value })} placeholder="Photography, videography, editing" />
        </label>
        <label>Verification note
          <input value={form.sourceNote} onChange={(e) => setForm({ ...form, sourceNote: e.target.value })} placeholder="Official source or person who confirmed this" required minLength={2} />
        </label>
      </div>
      <button>Add event</button>
    </form>
  );
}

/** The school's published calendar, as a list to choose from. */
function FromCalendar({
  session, categories, onDone,
}: {
  session: Session;
  categories: EventCategory[];
  onDone: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [problem, setProblem] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const load = async () => {
    setState("loading"); setProblem("");
    try {
      const data = await availableFromCalendar(session.token);
      setEntries(data.entries); setTotal(data.total); setState("ready");
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "The school calendar could not be read");
      setState("failed");
    }
  };

  const toggle = (entry: CalendarEntry) =>
    setChosen((current) => {
      const next = { ...current };
      if (next[entry.uid]) delete next[entry.uid];
      else next[entry.uid] = "";
      return next;
    });

  const count = Object.keys(chosen).length;

  return (
    <div className="admin-section calendar-import">
      <div className="admin-section-heading">
        <div>
          <h2>From the school calendar</h2>
          <p>
            The academic calendar published on gurukul.org. Nothing is added until you choose it.
          </p>
        </div>
        <button
          type="button"
          className="audit-toggle"
          onClick={() => { setOpen(!open); if (!open && state === "idle") void load(); }}
        >
          {open ? "Hide" : "Look"}
        </button>
      </div>

      {open && (
        <>
          {state === "loading" && <p className="empty">Reading the school calendar…</p>}
          {state === "failed" && (
            <p className="error" role="alert">{problem} <button type="button" className="text-button" onClick={() => void load()}>Try again</button></p>
          )}
          {state === "ready" && entries.length === 0 && (
            <p className="empty">Everything the school has listed is already here.</p>
          )}

          {state === "ready" && entries.length > 0 && (
            <>
              <p className="hint calendar-count">
                {total} upcoming in the school calendar · {entries.length} not yet brought across
              </p>

              <div className="calendar-list">
                {entries.map((entry) => {
                  const picked = entry.uid in chosen;
                  return (
                    <label key={entry.uid} className={picked ? "calendar-row is-picked" : "calendar-row"}>
                      <input type="checkbox" checked={picked} onChange={() => toggle(entry)} />
                      <span className="calendar-when">{day(entry.startsAt, entry.allDay)}</span>
                      <span className="calendar-title">{entry.title}</span>
                      <span className="calendar-guess">
                        <select
                          value={chosen[entry.uid] ?? ""}
                          onClick={(e) => e.preventDefault()}
                          onChange={(e) => setChosen((c) => ({ ...c, [entry.uid]: e.target.value }))}
                          aria-label={`Category for ${entry.title}`}
                        >
                          <option value="" disabled>Choose a category</option>
                          {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <small>Category must be selected by G-Arts.</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="calendar-foot">
                <span>{count === 0 ? "Nothing selected" : `${count} selected`}</span>
                <button
                  type="button"
                  disabled={count === 0 || Object.values(chosen).some((category) => !category)}
                  onClick={() =>
                    void onDone(
                      async () => {
                        await importFromCalendar(
                          session.token,
                          Object.entries(chosen).map(([uid, category]) => ({ uid, category })),
                        );
                        setChosen({});
                        await load();
                      },
                      `${count} event${count === 1 ? "" : "s"} added from the school calendar.`,
                    )
                  }
                >
                  Add {count > 0 ? count : ""} to G-Arts
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

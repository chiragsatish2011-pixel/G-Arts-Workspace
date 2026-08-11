import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  addTask, createProject, deleteProject, deleteTask, listEvents, listMembers, listProjects,
  updateProject, updateTask,
  type GEvent, type GProject, type Member, type Session, type Stage, type TaskStatus,
} from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";

/**
 * Projects and the work inside them.
 *
 * Projects and tasks are entered by G Arts. The workspace does not infer a
 * deliverable, call one "main", or generate a checklist from an event.
 */

const STAGES: Stage[] = ["planned", "capture", "ready_for_edit", "editing", "review", "approved", "published", "archived"];
const stageLabel = (s: string) => s.replace("_", " ");

const TYPE_LABEL: Record<string, string> = {
  photo: "Photo", video: "Video", shorts: "Shorts", graphics: "Graphics",
  website: "Website", live: "Live", archive: "Archive",
};

export function WorkPanel({ session }: { session: Session }) {
  const [projects, setProjects] = useState<GProject[]>([]);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const canPlan = ["SUPER_ADMIN", "ADMIN", "TEAM_LEAD"].includes(session.user.role);
  const canDelete = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);

  const reload = async () => {
    try { setProjects(await listProjects(session.token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load projects"); }
  };

  useEffect(() => {
    void reload();
    listEvents(session.token, "all").then(setEvents).catch(() => setEvents([]));
    // Assigning work needs the member list; a plain member cannot read it, so
    // the picker simply does not appear for them.
    listMembers(session.token).then(setMembers).catch(() => setMembers([]));
  }, [session.token]);

  const act = async (work: () => Promise<unknown>, message: string) => {
    setError(""); setNotice("");
    try { await work(); setNotice(message); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That could not be done"); }
  };

  const shown = useMemo(
    () => (filter === "active" ? projects.filter((p) => p.stage !== "archived" && p.stage !== "published") : projects),
    [projects, filter],
  );

  const totals = useMemo(() => {
    const tasks = projects.flatMap((p) => p.tasks);
    return { projects: projects.length, done: tasks.filter((t) => t.status === "approved").length, tasks: tasks.length };
  }, [projects]);

  return (
    <div className="band band-paper">
      <div className="band-inner">
        <div className="admin-title">
          <div>
            <span className="eyebrow">PRODUCTION</span>
            <h1>Projects</h1>
            <p>What each event has to produce, and what is left to do on it.</p>
          </div>
          <div className="admin-summary">
            <strong>{totals.tasks === 0 ? 0 : Math.round((totals.done / totals.tasks) * 100)}%</strong>
            <span>{totals.done} of {totals.tasks} done</span>
          </div>
        </div>

        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {canPlan && <NewProject session={session} events={events} onDone={act} />}

        <div className="admin-section">
          <div className="admin-section-heading">
            <h2>{filter === "active" ? "In progress" : "Everything"}</h2>
            <div className="scope-switch">
              {(["active", "all"] as const).map((f) => (
                <button key={f} className={filter === f ? "is-on" : ""} onClick={() => setFilter(f)}>
                  {f === "active" ? "In progress" : "All"}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="empty">
              {projects.length === 0
                ? "No projects yet. Add a confirmed deliverable above when G-Arts decides it."
                : "Nothing in progress — everything is published or archived."}
            </p>
          ) : (
            <div className="project-list">
              {shown.map((project) => {
                const done = project.tasks.filter((t) => t.status === "approved").length;
                const expanded = open === project.id;
                return (
                  <article key={project.id} className="project-card">
                    <button className="project-head" onClick={() => setOpen(expanded ? null : project.id)}>
                      <span className="project-type">{TYPE_LABEL[project.type] ?? project.type}</span>
                      <span className="project-name">
                        <strong>{project.name}</strong>
                        <small>{done} of {project.tasks.length} done</small>
                      </span>
                      <span className="project-bar" aria-hidden>
                        <span style={{ width: `${project.tasks.length ? (done / project.tasks.length) * 100 : 0}%` }} />
                      </span>
                      <span className="project-chevron">{expanded ? "▴" : "▾"}</span>
                    </button>

                    {expanded && (
                      <div className="project-body">
                        <div className="project-controls">
                          {canPlan ? (
                            <label>
                              Stage
                              <select
                                value={project.stage}
                                onChange={(e) => act(
                                  () => updateProject(session.token, project.id, { stage: e.target.value as Stage }),
                                  `${project.name} moved to ${stageLabel(e.target.value)}.`,
                                )}
                              >
                                {STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
                              </select>
                            </label>
                          ) : (
                            <span className="role">{stageLabel(project.stage)}</span>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="remove"
                              onClick={() => setConfirm({
                                title: `Delete “${project.name}”?`,
                                destructive: true,
                                confirmLabel: "Delete project",
                                body: <p>The project and its {project.tasks.length} tasks are removed. This cannot be undone.</p>,
                                onConfirm: () => act(() => deleteProject(session.token, project.id), `${project.name} was deleted.`),
                              })}
                            >
                              Delete project
                            </button>
                          )}
                        </div>

                        <ul className="task-list">
                          {project.tasks.map((task) => (
                            <li key={task.id} className={`task is-${task.status}`}>
                              <button
                                className="task-tick"
                                aria-label={task.status === "approved" ? `Mark ${task.title} not done` : `Mark ${task.title} approved`}
                                onClick={() => act(
                                  () => updateTask(session.token, task.id, { status: task.status === "approved" ? "not_done" : "approved" }),
                                  task.status === "approved" ? `${task.title} reopened.` : `${task.title} approved.`,
                                )}
                              >
                                {task.status === "approved" ? "✓" : ""}
                              </button>
                              <span className="task-title">{task.title}</span>

                              {members.length > 0 && (
                                <select
                                  className="task-who"
                                  aria-label={`Assign ${task.title}`}
                                  value={task.assigneeId ?? ""}
                                  onChange={(e) => act(
                                    () => updateTask(session.token, task.id, { assigneeId: e.target.value || null }),
                                    e.target.value ? `${task.title} assigned.` : `${task.title} unassigned.`,
                                  )}
                                >
                                  <option value="">Unassigned</option>
                                  {members.filter((m) => !m.deletedAt).map((m) => (
                                    <option key={m.id} value={m.id}>{m.displayName}</option>
                                  ))}
                                </select>
                              )}

                              {canPlan && (
                                <button
                                  className="task-drop"
                                  aria-label={`Remove ${task.title}`}
                                  onClick={() => act(() => deleteTask(session.token, task.id), `${task.title} removed.`)}
                                >
                                  ×
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>

                        <AddTask session={session} projectId={project.id} onDone={act} />
                      </div>
                    )}
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

function NewProject({
  session, events, onDone,
}: {
  session: Session;
  events: GEvent[];
  onDone: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", type: "photo", eventId: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = form.name;
    void onDone(
      async () => {
        await createProject(session.token, { name: form.name, type: form.type, eventId: form.eventId || null });
        setForm({ name: "", type: "photo", eventId: "" });
      },
      `${name} was created.`,
    );
  };

  return (
    <form className="admin-create" onSubmit={submit}>
      <div>
        <label>Project
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Confirmed deliverable name" required minLength={2} />
        </label>
        <label>Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Event
          <select value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
            <option value="">Not tied to an event</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </label>
      </div>
      <button>Create project</button>
    </form>
  );
}

function AddTask({
  session, projectId, onDone,
}: {
  session: Session;
  projectId: string;
  onDone: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      className="task-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const what = title;
        void onDone(async () => { await addTask(session.token, projectId, what); setTitle(""); }, `${what} added.`);
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a step…" maxLength={200} />
      <button disabled={!title.trim()}>Add</button>
    </form>
  );
}

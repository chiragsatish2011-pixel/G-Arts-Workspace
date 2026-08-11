import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addTranslationScheduleItem, deleteTranslationScheduleItem, listTranslationSchedule, updateTranslationScheduleItem, type Session, type TranslationScheduleItem } from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";

const dateInputValue = () => {
  const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16);
};

export function TranslationSchedulePanel({ session }: { session: Session }) {
  const [items, setItems] = useState<TranslationScheduleItem[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(dateInputValue);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const reviewer = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role) && session.user.team !== "TRANSLATION";
  const reload = () => listTranslationSchedule(session.token).then(setItems).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not load the schedule"));
  useEffect(() => { void reload(); }, [session.token]);
  async function submit(event: FormEvent) { event.preventDefault(); try { await addTranslationScheduleItem(session.token, { title, startsAt: new Date(startsAt).toISOString() }); setTitle(""); setStartsAt(dateInputValue()); setNotice("Schedule item added."); reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not add schedule item"); } }
  return <section className="translation-page"><div className="translation-heading"><div><span className="eyebrow">TRANSLATION WORKSPACE</span><h1>{reviewer ? "Translation schedule" : "My schedule"}</h1><p>{reviewer ? "Review-only: translators keep ownership of their own commitments." : "Add what you need to do, then mark it done when it is complete."}</p></div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {!reviewer && <form className="schedule-add" onSubmit={submit}><label>What needs to happen?<input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Translate Satsang title" /></label><label>When<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></label><button>Add to schedule</button></form>}
    <div className="schedule-list">{items.length === 0 ? <p className="empty">{reviewer ? "No Translation schedules have been added." : "Your schedule is clear."}</p> : items.map((item) => { const own = item.ownerId === session.user.id; return <article className={item.status === "done" ? "is-done" : ""} key={item.id}><button className="schedule-check" disabled={!own} aria-label={item.status === "done" ? `Mark ${item.title} not done` : `Mark ${item.title} done`} onClick={async () => { try { await updateTranslationScheduleItem(session.token, item.id, item.status === "done" ? "not_done" : "done"); reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not update schedule item"); } }}>{item.status === "done" ? "✓" : ""}</button><div><strong>{item.title}</strong><span>{new Date(item.startsAt).toLocaleString()}{reviewer && item.owner ? ` · ${item.owner.displayName}` : ""}</span></div>{own && <button className="schedule-remove" onClick={() => setConfirm({ title: "Remove schedule item?", body: <p><strong>{item.title}</strong> will be removed from your schedule.</p>, confirmLabel: "Remove", destructive: true, onConfirm: async () => { try { await deleteTranslationScheduleItem(session.token, item.id); reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not remove schedule item"); } } })}>Remove</button>}</article>; })}</div>
    <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
  </section>;
}

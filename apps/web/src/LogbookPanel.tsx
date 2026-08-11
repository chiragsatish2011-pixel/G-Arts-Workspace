import { useEffect, useMemo, useState } from "react";
import { listEvents, listLogbook, type GEvent, type LogbookEntry, type Session } from "./api";

const icon: Record<LogbookEntry["kind"], string> = { event: "◆", task: "✓" };
const kindLabel: Record<LogbookEntry["kind"], string> = { event: "Event", task: "Done" };
const time = (date: string) => new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** A human-readable memory of G-Arts production work, built only from actual
 * records. It deliberately contains no view/open/time-at-computer events. */
export function LogbookPanel({ session }: { session: Session }) {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = async (selected = eventId) => {
    setLoading(true);
    try { setError(""); setEntries(await listLogbook(session.token, selected || undefined)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the logbook"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(""); listEvents(session.token, "all").then(setEvents).catch(() => setEvents([])); }, [session.token]);
  const grouped = useMemo(() => {
    const groups = new Map<string, LogbookEntry[]>();
    for (const entry of entries) {
      const key = new Date(entry.at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  return <div className="band band-paper"><div className="band-inner logbook-page">
    <div className="admin-title"><div><span className="eyebrow">HISTORY</span><h1>Logbook</h1><p>Events and completed work.</p></div><div className="admin-summary"><strong>{entries.length}</strong><span>records</span></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="logbook-filter"><label>Show <select value={eventId} onChange={(e) => { setEventId(e.target.value); void reload(e.target.value); }}><option value="">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label></div>
    {loading && entries.length === 0 ? <div className="events-loading" role="status"><span className="loading-spinner" aria-hidden />Loading history…</div> : grouped.length === 0 ? <p className="empty">No records yet.</p> : <div className="logbook-list">{grouped.map(([day, records]) => <section key={day}><h2>{day}</h2><div className="logbook-timeline">{records.map((entry) => <article key={entry.id} className={`logbook-row is-${entry.kind}`}><span className="logbook-mark">{icon[entry.kind]}</span><div className="logbook-entry"><div><span className="logbook-kind">{kindLabel[entry.kind]}</span><time>{time(entry.at)}</time></div><strong>{entry.title}</strong><p>{entry.detail}</p></div></article>)}</div></section>)}</div>}
  </div></div>;
}

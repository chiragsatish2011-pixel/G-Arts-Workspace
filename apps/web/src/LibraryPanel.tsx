import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addLibraryItem, deleteLibraryItem, listLibrary, type LibraryItem, type LibraryKind, type Session } from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";

const groups: { kind: LibraryKind; title: string; note: string }[] = [
  { kind: "MUSIC", title: "Music", note: "Gurukul music and bhajans" },
  { kind: "VIDEO", title: "Videos", note: "Published programmes and shows" },
  { kind: "LIVE", title: "Live", note: "Live satsangs and broadcasts" },
];

export function LibraryPanel({ session }: { session: Session }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ title: "", url: "", kind: "VIDEO" as LibraryKind });
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const canEdit = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);
  const reload = () => listLibrary(session.token).then(setItems).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not load the library"));
  useEffect(() => { void reload(); }, [session.token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    try { await addLibraryItem(session.token, form); setForm({ title: "", url: "", kind: "VIDEO" }); setNotice("Link added to the shared library."); reload(); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Could not add the link"); }
  }

  return <section className="library-page">
    <div className="library-heading"><div><span className="eyebrow">SHARED WITH G-ARTS & TRANSLATION</span><h1>Gurukul library</h1><p>Verified links only. Nothing is uploaded or stored here.</p></div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {canEdit && <form className="library-add" onSubmit={submit}>
      <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Name exactly as published" /></label>
      <label>Link<input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
      <label>Section<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LibraryKind })}>{groups.map((group) => <option key={group.kind} value={group.kind}>{group.title}</option>)}</select></label>
      <button>Add verified link</button>
    </form>}
    <div className="library-groups">{groups.map((group) => {
      const list = items.filter((item) => item.kind === group.kind);
      return <section className="library-group" key={group.kind}><header><h2>{group.title}</h2><p>{group.note}</p></header>
        {list.length === 0 ? <p className="empty">No verified links added yet.</p> : <div className="library-items">{list.map((item) => <article key={item.id}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><span>Open link ↗</span></a>{canEdit && <button type="button" className="library-remove" onClick={() => setConfirm({ title: "Remove library link?", body: <p><strong>{item.title}</strong> will be removed from the shared library. The original link is not changed.</p>, confirmLabel: "Remove", destructive: true, onConfirm: async () => { try { await deleteLibraryItem(session.token, item.id); setNotice("Link removed."); reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not remove link"); } } })}>Remove</button>}</article>)}</div>}
      </section>;
    })}</div>
    <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
  </section>;
}

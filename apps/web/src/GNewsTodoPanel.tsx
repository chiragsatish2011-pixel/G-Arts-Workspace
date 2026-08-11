import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addGNewsTodo, deleteGNewsTodo, listGNewsTodos, setGNewsTodoDone, type GNewsTodo, type Session } from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";

export function GNewsTodoPanel({ session }: { session: Session }) {
  const [todos, setTodos] = useState<GNewsTodo[]>([]);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const reload = () => listGNewsTodos(session.token).then(setTodos).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not load your to-dos"));
  useEffect(() => { void reload(); }, [session.token]);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    try { await addGNewsTodo(session.token, title); setTitle(""); reload(); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not add the to-do"); }
  };
  const active = todos.filter((todo) => !todo.completedAt);
  const done = todos.filter((todo) => todo.completedAt);
  return <section className="library-page">
    <div className="library-heading"><div><span className="eyebrow">G-NEWS</span><h1>My to-do list</h1><p>Add only what you need to remember. Tick it when finished; you can reopen or remove it at any time.</p></div></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <form className="library-add" data-practice="gnews-todo-form" onSubmit={add}><label>New to-do<input value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={160} required placeholder="For example, prepare the evening announcement" /></label><button>Add to-do</button></form>
    <section className="library-group"><header><h2>To do</h2><p>Your current G-News work.</p></header>{active.length === 0 ? <p className="empty">Nothing to do right now.</p> : <div className="library-items">{active.map((todo) => <article key={todo.id}><label><input data-practice="gnews-todo-item" type="checkbox" checked={false} onChange={() => { void setGNewsTodoDone(session.token, todo.id, true).then(reload).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not update the to-do")); }} /><strong>{todo.title}</strong></label><button type="button" className="library-remove" onClick={() => setConfirm({ title: "Remove to-do?", body: <p><strong>{todo.title}</strong> will be permanently removed.</p>, confirmLabel: "Remove", destructive: true, onConfirm: async () => { await deleteGNewsTodo(session.token, todo.id); reload(); } })}>Remove</button></article>)}</div>}</section>
    {done.length > 0 && <section className="library-group"><header><h2>Finished</h2><p>Recently completed; reopen if it needs more work.</p></header><div className="library-items">{done.map((todo) => <article key={todo.id}><label><input type="checkbox" checked onChange={() => { void setGNewsTodoDone(session.token, todo.id, false).then(reload).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not update the to-do")); }} /><strong>{todo.title}</strong></label></article>)}</div></section>}
    <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
  </section>;
}

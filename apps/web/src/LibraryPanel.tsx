import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addLibraryItem, latestLibrary, listLibrary, type LatestLibraryFeed, type LatestLibraryItem, type LibraryItem, type Session } from "./api";

function PostList({ items, empty }: { items: LatestLibraryItem[]; empty: string }) {
  return items.length === 0 ? <p className="library-empty">{empty}</p> : <div className="library-posts">{items.map((item) => (
    <a className="library-post" key={item.id} href={item.url} target="_blank" rel="noreferrer">
      <span className="library-post-mark" aria-hidden>▶</span>
      <span><strong>{item.title}</strong><small>Open on YouTube</small></span>
      <span className="library-post-arrow" aria-hidden>↗</span>
    </a>
  ))}</div>;
}

function FeedState({ feed, kind }: { feed: LatestLibraryFeed | null; kind: "video" | "live" }) {
  if (!feed) return <p className="library-empty">Checking the official playlist…</p>;
  if (feed.status === "ready") return <PostList items={feed[kind]} empty={`No ${kind === "video" ? "videos" : "live shows"} were posted in the last 15 days.`} />;
  return <p className="library-empty">This automatic feed is not connected yet. You can still open the official playlist below.</p>;
}

export function LibraryPanel({ session }: { session: Session }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [latest, setLatest] = useState<LatestLibraryFeed | null>(null);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ title: "", url: "" });
  const source = latest?.sourceUrl ?? "https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf";
  const reload = () => {
    void listLibrary(session.token).then(setItems).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not load music links"));
    void latestLibrary(session.token).then(setLatest).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Could not load recent posts"));
  };
  useEffect(() => { reload(); }, [session.token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    try {
      await addLibraryItem(session.token, { ...form, kind: "MUSIC" });
      setForm({ title: "", url: "" });
      setNotice("Music link added.");
      reload();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not add the music link"); }
  }

  const music = items.filter((item) => item.kind === "MUSIC");
  return <section className="library-page">
    <header className="library-heading">
      <span className="eyebrow">SHARED LIBRARY</span>
      <h1>Watch and listen</h1>
      <p>Recent Bengaluru videos and live shows are shown here. Add a music link when the team should be able to find it again.</p>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}

    <div className="library-watch-grid">
      <section className="library-watch-card">
        <div className="library-card-top"><span className="library-icon" aria-hidden>▶</span><span>VIDEO</span></div>
        <h2>Latest videos</h2><p>Posts from the official Bengaluru playlist in the last 15 days.</p>
        <FeedState feed={latest} kind="video" />
        <a className="library-open" href={source} target="_blank" rel="noreferrer">Open playlist <span aria-hidden>↗</span></a>
      </section>
      <section className="library-watch-card">
        <div className="library-card-top"><span className="library-icon live" aria-hidden>●</span><span>LIVE</span></div>
        <h2>Latest live shows</h2><p>Recent live broadcasts and completed live shows from the same source.</p>
        <FeedState feed={latest} kind="live" />
        <a className="library-open" href={source} target="_blank" rel="noreferrer">Open playlist <span aria-hidden>↗</span></a>
      </section>
    </div>

    <section className="library-music">
      <header><div><span className="eyebrow">MUSIC</span><h2>Shared music links</h2><p>Paste an existing secure link. Music is stored as a permanent shared link; it does not refresh or disappear with the Video and Live feed.</p></div></header>
      <form className="library-add" data-practice="music-form" onSubmit={submit}>
        <label>Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="For example, Prarthana" /></label>
        <label>Link<input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></label>
        <button>Add link</button>
      </form>
      <div className="library-music-list">
        {music.length === 0 ? <p className="library-empty">No music links yet. Add the first one above.</p> : music.map((item) => <article key={item.id}><a href={item.url} target="_blank" rel="noreferrer"><span className="library-music-note" aria-hidden>♫</span><strong>{item.title}</strong><small>Open link ↗</small></a></article>)}
      </div>
    </section>
  </section>;
}

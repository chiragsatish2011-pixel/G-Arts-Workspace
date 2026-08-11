import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { avatarSrc, forgetSession, listEvents, listMembers, login, rememberSession, resumeSession, updateOnboarding, type GEvent, type Session } from "./api";
import { AdminPanel } from "./AdminPanel";
import { ChatSpace } from "./ChatSpace";
import { EventsPanel } from "./EventsPanel";
import { LogbookPanel } from "./LogbookPanel";
import { ConfirmDialog, type ConfirmRequest } from "./Modal";
import { ProfilePanel } from "./ProfilePanel";
import { LibraryPanel } from "./LibraryPanel";
import { TranslationArticleTracker } from "./TranslationArticleTracker";
import { GNewsTodoPanel } from "./GNewsTodoPanel";
import { GuideHub } from "./GuideHub";
import { TrainingWorkspace } from "./TrainingWorkspace";

/** A single short word is a first name; anything else reads better in full. */
function firstName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "there";
  return parts[0].length >= 3 ? parts[0] : displayName;
}

function today() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The school's own marks, served from /public rather than redrawn. */
const Monogram = ({ size = 34 }: { size?: number }) => (
  <img src="/gurukul-monogram.svg" alt="" width={size} height={size} />
);
const Wordmark = ({ height = 22 }: { height?: number }) => (
  <img src="/gurukul-wordmark.svg" alt="Shree Swaminarayan Gurukul" style={{ height }} />
);

/** Line-art marks, drawn in the same idiom as the icons on gurukul.org. */
const Icon = ({ d, filled = false }: { d: string; filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} fill={filled ? "currentColor" : "none"} />
  </svg>
);
const icons = {
  people: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 4.1a3.5 3.5 0 0 1 0 6.8",
  spaces: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3H6.5A2.5 2.5 0 0 1 4 14.5z",
  shield: "M12 3.5 19 6v5.5c0 4-2.9 7.4-7 8.5-4.1-1.1-7-4.5-7-8.5V6z",
  route:  "M6.5 20V9.5a3.5 3.5 0 0 1 3.5-3.5h4M14 3l3 3-3 3",
  key:    "M14.5 4a5.5 5.5 0 1 0-4.2 9.1L4 19.4V21h3v-2h2v-2h2l1.2-1.2A5.5 5.5 0 0 0 14.5 4m1.2 4.3h.01",
  work:   "M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM9 6V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V6",
  logbook: "M6 4.5h12v15H6zM9 8h6M9 11.5h6M9 15h4",
  person: "M19 20v-1.6a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4V20M12 11a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4",
};

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      onSession(await login(username, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-intro">
        <div className="brand-lockup">
          <span className="logo-card"><Monogram size={64} /></span>
        </div>
        <span className="eyebrow">SHREE SWAMINARAYAN GURUKUL BANGALORE</span>
        <h1>G-Arts<br />Workspace</h1>
        <p>The private production home for events and the work that connects them.</p>
      </section>

      <section className="login-panel">
        <div>
          <span className="eyebrow">PRIVATE ACCESS</span>
          <h2>Welcome back</h2>
          <p>Use the G-Arts username issued by your administrator.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
        <button disabled={submitting}>{submitting ? <><span className="loading-spinner" aria-hidden /> Signing in…</> : "Sign in"}</button>
        </form>
        <p className="hint">Invite only. Accounts are created by a G-Arts administrator.</p>
      </section>
    </main>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The masthead is a live reflection of the saved account, including a new
 * avatar or accent immediately after Profile saves it. */
function AccountAvatar({ session }: { session: Session }) {
  const [face, setFace] = useState<string | null>(null);
  useEffect(() => {
    if (!session.user.avatarUrl) { setFace(null); return; }
    let live = true;
    avatarSrc(session.token, session.user.avatarUrl).then((src) => { if (live) setFace(src); }).catch(() => { if (live) setFace(null); });
    return () => { live = false; };
  }, [session.token, session.user.avatarUrl]);
  return <span className="avatar" style={!face && session.user.accentColor ? { background: session.user.accentColor } : undefined}>{face ? <img src={face} alt="" /> : initials(session.user.displayName)}</span>;
}

type View = "overview" | "events" | "logbook" | "chat" | "admin" | "profile" | "library" | "translation" | "g-news-todos" | "tutorial";

const VIEWS: View[] = ["overview", "events", "logbook", "chat", "admin", "profile", "library", "translation", "g-news-todos", "tutorial"];

/** Keeps the open space in the address bar so a refresh returns to it. */
function viewFromHash(): View {
  const hash = window.location.hash.replace("#", "") as View;
  return VIEWS.includes(hash) ? hash : "overview";
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [resuming, setResuming] = useState(true);
  const [view, setViewState] = useState<View>(viewFromHash);
  const [logoutConfirm, setLogoutConfirm] = useState<ConfirmRequest | null>(null);
  const [showFirstGuide, setShowFirstGuide] = useState(false);
  const [trainingRunning, setTrainingRunning] = useState(false);
  const [trainingRun, setTrainingRun] = useState(0);

  const setView = (next: View) => {
    setViewState(next);
    window.location.hash = next === "overview" ? "" : next;
  };

  // Resume on load rather than dropping straight to the sign-in screen.
  useEffect(() => {
    let live = true;
    resumeSession()
      .then((restored) => { if (live && restored) setSession(restored); })
      .finally(() => { if (live) setResuming(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (session?.user.team === "TRANSLATION" && view === "overview") setView("translation");
    if (session?.user.team === "G_NEWS" && view !== "chat" && view !== "profile" && view !== "library" && view !== "g-news-todos") setView("chat");
  }, [session?.user.team, view]);

  useEffect(() => {
    if (session && !session.user.onboardingDismissedAt && !session.user.onboardingCompletedAt) {
      setShowFirstGuide(true);
      setView("tutorial");
    }
  }, [session]);

  useEffect(() => {
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [chatUnread, setChatUnread] = useState(0);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<GEvent[]>([]);

  // Re-read whenever the overview is shown, so adding someone updates the
  // figure instead of leaving a stale number on screen.
  useEffect(() => {
    if (!session || view !== "overview") return;
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) return;
    listMembers(session.token).then((m) => setMemberCount(m.length)).catch(() => setMemberCount(null));
  }, [session, view]);

  useEffect(() => {
    if (!session || view !== "overview") return;
    if (session.user.team === "G_ARTS") listEvents(session.token, "upcoming").then(setUpcomingEvents).catch(() => setUpcomingEvents([]));
  }, [session, view]);

  if (resuming) {
    return (
      <main className="resuming">
        <img src="/gurukul-wordmark.svg" alt="Shree Swaminarayan Gurukul" />
        <span><span className="loading-spinner" aria-hidden /> Signing you in…</span>
      </main>
    );
  }

  if (!session) {
    return (
      <Login
        onSession={(next) => {
          rememberSession(next);
          setSession(next);
        }}
      />
    );
  }

  const canAdminister = ["SUPER_ADMIN", "ADMIN"].includes(session.user.role);
  const translationWorkspace = session.user.team === "TRANSLATION";
  const chatOnlyWorkspace = session.user.team === "G_NEWS";
  const todoItems = upcomingEvents.flatMap((event) => event.tasks.filter((task) => task.status === "not_done").map((task) => ({ event, task })));

  return (
    <div className="workspace">
      {/* The site's masthead: a white logo card overhanging a solid red bar. */}
      <header className="masthead">
        <div className="masthead-strip">
          {/* The school's full lockup, as it appears on gurukul.org. */}
          <div className="masthead-card">
            <Wordmark height={76} />
          </div>

          <div className="profile">
            <button className="profile-link" onClick={() => setView("profile")} title="Your profile">
              <span>
                <span>{session.user.displayName}</span>
                <small>@{session.user.username} · {session.user.role.replace("_", " ")}</small>
              </span>
              <AccountAvatar session={session} />
            </button>
            <button className="text-button" onClick={() => setLogoutConfirm({
              title: "Sign out of G-Arts Workspace?",
              confirmLabel: "Sign out",
              body: <p>You can sign in again with your G-Arts account whenever you need to return.</p>,
              onConfirm: () => { forgetSession(); setSession(null); setView("overview"); },
            })}>Sign out</button>
          </div>
        </div>

        <div className="masthead-bar">
          <nav>
            {!translationWorkspace && !chatOnlyWorkspace && <button data-tour="home" className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Home</button>}
            {!translationWorkspace && !chatOnlyWorkspace && <button data-tour="events" className={view === "events" ? "active" : ""} onClick={() => setView("events")}>Event checklist</button>}
            {!translationWorkspace && !chatOnlyWorkspace && <button data-tour="history" className={view === "logbook" ? "active" : ""} onClick={() => setView("logbook")}>History</button>}
            {(translationWorkspace || canAdminister) && <button data-tour="translation" className={view === "translation" ? "active" : ""} onClick={() => setView("translation")}>{translationWorkspace ? "My schedule" : "Translation"}</button>}
            <button data-tour="library" className={view === "library" ? "active" : ""} onClick={() => setView("library")}>Library</button>
            {chatOnlyWorkspace && <button data-tour="g-news-todos" className={view === "g-news-todos" ? "active" : ""} onClick={() => setView("g-news-todos")}>My to-dos</button>}
            <button data-tour="guide" className={view === "tutorial" ? "active" : ""} onClick={() => setView("tutorial")}>Guide</button>
            <button data-tour="chat" className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>
              Chat
              {chatUnread > 0 && <span className="nav-badge">{chatUnread > 99 ? "99+" : chatUnread}</span>}
            </button>
            {canAdminister && !chatOnlyWorkspace && (
              <button data-tour="members" className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Members</button>
            )}
            <button data-tour="account" className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}>Account</button>
          </nav>


        </div>
      </header>

      <div className="layout">

        <section className={view === "chat" ? "content content-flush" : ["overview", "profile", "events", "logbook", "library", "translation"].includes(view) ? "content banded" : "content"}>
          {view === "events" ? (
            <EventsPanel session={session} />
          ) : view === "logbook" ? (
            <LogbookPanel session={session} />
          ) : view === "chat" ? (
            <ChatSpace session={session} onUnreadChange={setChatUnread} />
          ) : view === "profile" ? (
            <ProfilePanel session={session} onUpdated={(next) => { rememberSession(next); setSession(next); }} />
          ) : view === "admin" ? (
            <AdminPanel session={session} />
          ) : view === "library" ? (
            <LibraryPanel session={session} />
          ) : view === "g-news-todos" ? (
            <GNewsTodoPanel session={session} />
          ) : view === "tutorial" ? (
            trainingRunning ? <TrainingWorkspace key={trainingRun} session={session} onRestart={() => setTrainingRun((run) => run + 1)} onLeave={() => setTrainingRunning(false)} onFinished={() => { void updateOnboarding(session.token, "completed").then((next) => { rememberSession(next); setSession(next); }).catch(() => undefined); setTrainingRunning(false); setShowFirstGuide(false); setView("overview"); }} /> :
              <GuideHub session={session} firstVisit={showFirstGuide} onStart={() => { setTrainingRun((run) => run + 1); setTrainingRunning(true); }} onSkip={() => { void updateOnboarding(session.token, "skipped").then((next) => { rememberSession(next); setSession(next); }).catch(() => undefined); setShowFirstGuide(false); setView("overview"); }} />
          ) : view === "translation" ? (
            <TranslationArticleTracker session={session} />
          ) : (
            <>
              <div className="band band-maroon">
                <div className="band-inner home">
                  <div className="home-head">
                    <span className="eyebrow">{today()}</span>
                    <h1>{greeting()}, {firstName(session.user.displayName)}.</h1>
                    <p>
                      <span className="role-word">{session.user.role.replace("_", " ").toLowerCase()}</span>
                      {" · @"}{session.user.username}
                    </p>
                  </div>

                </div>
              </div>

              {/* Where you can go from here. Managing members lives on the
                  Members page and nowhere else — it used to be duplicated
                  here, which put the same controls in two places. */}
              <div className="band band-paper">
                <div className="band-inner">
                  <section className="home-todos" aria-labelledby="todo-title">
                    <div className="home-section-heading">
                      <h2 id="todo-title">To do</h2>
                      <button className="home-primary" onClick={() => setView("events")}>Events</button>
                    </div>
                    {todoItems.length === 0 ? <p className="empty">Nothing to do.</p> : <div className="todo-list">{todoItems.map(({ event, task }) => <button key={task.id} className="todo-row" onClick={() => setView("events")}><span className="todo-box" aria-hidden /><span><strong>{task.title}</strong><small>{event.name} · {new Date(event.startsAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small></span><span aria-hidden>→</span></button>)}</div>}
                  </section>

                  <div className="home-grid home-secondary">
                    <button className="home-card" onClick={() => setView("logbook")}><span className="home-card-icon"><Icon d={icons.logbook} /></span><strong>History</strong></button>
                    <button className="home-card" onClick={() => setView("chat")}><span className="home-card-icon"><Icon d={icons.spaces} /></span><strong>Chat</strong><small>{chatUnread > 0 ? `${chatUnread} unread` : ""}</small></button>
                    <button className="home-card" onClick={() => setView("library")}><span className="home-card-icon"><Icon d={icons.work} /></span><strong>Library</strong></button>
                    {canAdminister && <button className="home-card" onClick={() => setView("admin")}><span className="home-card-icon"><Icon d={icons.people} /></span><strong>Members</strong><small>{memberCount === null ? "" : `${memberCount} people`}</small></button>}
                  </div>

                  <section className="home-references" aria-labelledby="trusted-references">
                    <div>
                      <span className="eyebrow">BANGALORE</span>
                      <h2 id="trusted-references">References</h2>
                    </div>
                    <div className="home-reference-links">
                      <a href="https://gurukul.org/events/?gurukul_category%5B%5D=bangalore" target="_blank" rel="noreferrer">Bangalore events website <span aria-hidden>↗</span></a>
                      <a href="https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf" target="_blank" rel="noreferrer">Bangalore YouTube playlist <span aria-hidden>↗</span></a>
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      <ConfirmDialog request={logoutConfirm} onClose={() => setLogoutConfirm(null)} />
    </div>
  );
}

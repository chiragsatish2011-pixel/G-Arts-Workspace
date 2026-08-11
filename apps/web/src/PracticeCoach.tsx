import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { Role, Session, Team } from "./api";

type View = "overview" | "events" | "logbook" | "chat" | "admin" | "profile" | "library" | "translation" | "g-news-todos" | "tutorial";
type Step = { id: string; view: View; selector: string; title: string; prompt: string; action?: string };
type Box = { top: number; left: number; width: number; height: number };

function stepsFor(team: Team, role: Role): Step[] {
  const shared: Step[] = [
    { id: "library", view: "library", selector: '[data-tour="library"]', title: "A shared place to watch and listen", prompt: "Open Library. The latest videos and live shows come from the official Bengaluru playlist; music is a link, never an uploaded file." },
    { id: "music", view: "library", selector: '[data-practice="music-form"]', action: "music-added", title: "Add a safe music link", prompt: "Try a title and an https:// link, then choose Add link. This is temporary practice data." },
    { id: "chat", view: "chat", selector: '[data-tour="chat"]', title: "Now talk in Chat", prompt: "Open Chat. You will use a private practice channel, not General or Announcements." },
    { id: "message", view: "chat", selector: '[data-practice="chat-composer"]', action: "chat-message", title: "Send a practice update", prompt: "Write a short update and send it. It disappears with this guide." },
    { id: "attachment", view: "chat", selector: '[data-practice="chat-file"]', action: "chat-file", title: "Try an attachment", prompt: "Choose the practice attachment button. This demonstrates where a shared file would be posted without uploading anything." },
    { id: "voice", view: "chat", selector: '[data-practice="chat-voice"]', action: "chat-voice", title: "Try a voice message", prompt: "Record a short practice voice message. It is local to this guide." },
    { id: "group", view: "chat", selector: '[data-practice="chat-create-group"]', action: "chat-group", title: "Start a focused conversation", prompt: "Try starting a practice group. Real groups are for a specific purpose, not a replacement for General or Announcements." },
    { id: "account", view: "profile", selector: '[data-tour="account"]', title: "Your account stays yours", prompt: "Open Account. Only you can choose your own password; an administrator can only reset it to the default." },
    { id: "profile", view: "profile", selector: '[data-practice="profile-form"]', action: "profile-updated", title: "Save a practice profile change", prompt: "Change a profile detail and save it. This change is deliberately temporary." },
  ];
  if (team === "TRANSLATION") return [
    { id: "schedule", view: "translation", selector: '[data-tour="translation"]', title: "Your weekly article rhythm", prompt: "Open My schedule. This is personal to Translation; G‑Arts team members cannot see it." },
    { id: "week", view: "translation", selector: '[data-practice="translation-start"]', action: "week-started", title: "Start a practice week", prompt: "Choose Start this week. The schedule gives you the exact daily rhythm, while you record your own progress." },
    { id: "day", view: "translation", selector: '[data-practice="translation-day"]', action: "day-updated", title: "Record one real thought", prompt: "Open Monday, write a brief practice note or tick one check. The guide unlocks after the normal schedule saves it." },
    ...shared,
  ];
  if (team === "G_NEWS") return [
    { id: "todos", view: "g-news-todos", selector: '[data-tour="g-news-todos"]', title: "Your own G-News to-dos", prompt: "Open My to-dos. This is your simple personal work list." },
    { id: "todo-add", view: "g-news-todos", selector: '[data-practice="gnews-todo-form"]', action: "todo-added", title: "Make a practice to-do", prompt: "Add one short task. This list is intentionally simple — it is not an event checklist." },
    { id: "todo-done", view: "g-news-todos", selector: '[data-practice="gnews-todo-item"]', action: "todo-completed", title: "Mark the practice task done", prompt: "Tick the task you just made. You can reopen it later when work changes." },
    ...shared,
  ];
  const admin = role === "ADMIN" || role === "SUPER_ADMIN";
  return [
    { id: "home", view: "overview", selector: '[data-tour="home"]', title: "Start from Home", prompt: "Open Home. It answers one question: what needs attention now?" },
    { id: "events", view: "events", selector: '[data-tour="events"]', title: "Open the event checklist", prompt: "This is where confirmed events and their named work-items live." },
    admin
      ? { id: "approve", view: "events", selector: '[data-practice="task-approve"]', action: "task-approved", title: "Review before marking done", prompt: "This teammate has submitted Photography. Review it, then tick Approved. Approval is what completes the work." }
      : { id: "finish", view: "events", selector: '[data-practice="task-finish"]', action: "task-submitted", title: "Submit your finished work", prompt: "Tick Finished. This sends your result for an administrator to review — it is not marked done yet." },
    { id: "history", view: "logbook", selector: '[data-tour="history"]', title: "Find the record later", prompt: "Open History. Completed event work remains recoverable there for 15 days." },
    ...(admin ? [{ id: "members", view: "admin" as View, selector: '[data-tour="members"]', title: "Administrators manage access", prompt: "Open Members. Team and role set what a person can access; they do not expose another team’s private work." }] : []),
    ...shared,
  ];
}

function rectFor(selector: string): Box | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return null;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  const rect = element.getBoundingClientRect();
  return { top: Math.max(8, rect.top - 7), left: Math.max(8, rect.left - 7), width: Math.min(window.innerWidth - 16, rect.width + 14), height: Math.min(window.innerHeight - 16, rect.height + 14) };
}

export function PracticeCoach({ session, view, onLeave, onComplete }: { session: Session; view: View; onLeave: () => void; onComplete: () => void }) {
  const steps = useMemo(() => stepsFor(session.user.team, session.user.role), [session.user.role, session.user.team]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const step = steps[index];

  const advance = () => {
    if (index + 1 >= steps.length) { onComplete(); return; }
    setMissing(false); setIndex((current) => current + 1);
  };

  useEffect(() => {
    const listener = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action && action === step.action) advance();
    };
    window.addEventListener("garts:practice-action", listener);
    return () => window.removeEventListener("garts:practice-action", listener);
  }, [step.action, index]);

  useEffect(() => {
    // Navigation itself is the action in the first step of each screen. This
    // must listen even when the target is the current screen (for example,
    // Home at the start of the G-Arts route).
    if (step.action) return;
    const nav = document.querySelector(step.selector);
    const onClick = () => window.setTimeout(() => {
      const hash = window.location.hash.replace("#", "");
      if (hash === step.view || (step.view === "overview" && !hash)) advance();
    }, 0);
    nav?.addEventListener("click", onClick, { once: true });
    return () => nav?.removeEventListener("click", onClick);
  }, [step, index]);

  useLayoutEffect(() => {
    const refresh = () => {
      const next = rectFor(step.selector);
      setBox((current) => current && next && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next);
    };
    const frame = window.requestAnimationFrame(refresh);
    const retry = window.setTimeout(refresh, 100);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(retry); window.removeEventListener("resize", refresh); window.removeEventListener("scroll", refresh, true); };
  }, [step.id, view]);

  useEffect(() => {
    const miss = () => setMissing(true);
    window.addEventListener("garts:practice-wrong-turn", miss);
    return () => window.removeEventListener("garts:practice-wrong-turn", miss);
  }, []);

  if (!box) return null;
  const below = box.top < window.innerHeight * .45;
  const bubbleStyle = below ? { top: Math.min(window.innerHeight - 210, box.top + box.height + 18), left: Math.max(18, Math.min(window.innerWidth - 350, box.left)) } : { top: Math.max(16, box.top - 188), left: Math.max(18, Math.min(window.innerWidth - 350, box.left)) };
  return <div className="practice-guide" aria-live="polite">
    <div className="practice-shade top" style={{ height: box.top }} />
    <div className="practice-shade left" style={{ top: box.top, width: box.left, height: box.height }} />
    <div className="practice-shade right" style={{ top: box.top, left: box.left + box.width, height: box.height }} />
    <div className="practice-shade bottom" style={{ top: box.top + box.height }} />
    <span className="practice-spotlight" style={box} aria-hidden />
    <section className="practice-bubble" style={bubbleStyle}>
      <span className="practice-helper" aria-hidden>✨</span><span className="eyebrow">PRACTICE MODE · {index + 1} OF {steps.length}</span>
      <h2>{step.title}</h2><p>{missing ? "Almost — the glowing area is the only control for this step. Try that action first." : step.prompt}</p>
      <div><button type="button" className="practice-exit" onClick={onLeave}>Exit practice</button><span>Sample data only</span></div>
    </section>
  </div>;
}

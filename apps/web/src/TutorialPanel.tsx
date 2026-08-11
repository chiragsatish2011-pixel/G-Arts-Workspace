import { useEffect, useState } from "react";
import { updateOnboarding, type Session } from "./api";

type Practice = "observe" | "event" | "history" | "schedule" | "library" | "chat" | "todos" | "members" | "account";
type TourStep = { target: string; title: string; text: string; action: string; practice: Practice };
type Rect = { top: number; left: number; width: number; height: number };

function stepsFor(session: Session): TourStep[] {
  const shared: TourStep[] = [
    { target: '[data-tour="library"]', title: "Library", text: "This is shared across the teams. Videos and Live shows are verified from the Bengaluru playlist; Music stays as secure external links.", action: "Open Library", practice: "library" },
    { target: '[data-tour="chat"]', title: "Chat", text: "Use General for the shared conversation, Announcements for administrator notices, and event channels for event-specific discussion.", action: "Open Chat", practice: "chat" },
    { target: '[data-tour="account"]', title: "Account", text: "Your details and password are yours. Only you choose a new password; an administrator can only reset it to the default.", action: "Open Account", practice: "account" },
  ];
  if (session.user.team === "TRANSLATION") return [{ target: '[data-tour="translation"]', title: "My schedule", text: "This is your personal Satvidya article rhythm. Start a real week only when you are ready to record real work.", action: "Open My schedule", practice: "schedule" }, ...shared];
  if (session.user.team === "G_NEWS") return [{ target: '[data-tour="g-news-todos"]', title: "My to-dos", text: "Keep only your G-News work here. This list belongs to you; it is not a G-Arts event checklist.", action: "Open My to-dos", practice: "todos" }, ...shared];
  const arts: TourStep[] = [
    { target: '[data-tour="home"]', title: "Home", text: "Home answers one question: what needs G-Arts attention now? It never invents work; it reflects real upcoming event work.", action: "Open Home", practice: "observe" },
    { target: '[data-tour="events"]', title: "Event checklist", text: "Each named work-item belongs to a verified event. Members submit Finished or Not required; an administrator reviews before it is truly done.", action: "Open Event checklist", practice: "event" },
    { target: '[data-tour="history"]', title: "History", text: "Completed work leaves the active view and is kept here for a short recovery window, with a clear record of what happened.", action: "Open History", practice: "history" },
  ];
  if (["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) arts.push(
    { target: '[data-tour="translation"]', title: "Translation", text: "Translation has its own private schedules. Administrators can review its work without mixing it into G-Arts event work.", action: "Open Translation", practice: "schedule" },
    { target: '[data-tour="members"]', title: "Members", text: "This is where administrators manage accounts, roles and team access. Give only the access a person genuinely needs.", action: "Open Members", practice: "members" },
  );
  return [...arts, ...shared];
}

function rectFor(selector: string): Rect | null { const e = document.querySelector<HTMLElement>(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; }
function bubbleStyle(rect: Rect | null) {
  if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  const width = Math.min(390, window.innerWidth - 32); const left = Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 16));
  const below = rect.top + rect.height + 25; return { top: below + 300 < window.innerHeight ? below : Math.max(16, rect.top - 316), left, width };
}

function PracticeCard({ kind, onDone }: { kind: Practice; onDone: () => void }) {
  const [choice, setChoice] = useState<string | null>(null); const [text, setText] = useState(""); const [sent, setSent] = useState(false); const [chatStage, setChatStage] = useState(0);
  if (kind === "event") return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY · NOT SAVED</small><p>A photographer says their work is finished. What happens next?</p><div className="tour-choice-row"><button onClick={() => setChoice("submitted")}>Mark Finished</button><button disabled={choice !== "submitted"} onClick={() => setChoice("reviewed")}>Admin reviews</button></div>{choice === "reviewed" && <button className="tour-complete" onClick={onDone}>Continue mission</button>}</div>;
  if (kind === "library") return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY · NOT SAVED</small><p>Try a secure music link. The real workspace accepts only <b>https</b> links.</p><div className="tour-input"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…" /><button disabled={!text.startsWith("https://")} onClick={onDone}>Check link</button></div></div>;
  if (kind === "chat") return <div className="tour-practice tour-chat-practice" data-tour-practice>
    <small>PRACTICE ONLY · NOTHING IS SENT OR UPLOADED</small>
    {chatStage === 0 && <><p><b>1. Send a message.</b> Start with a clear, short message in the right channel.</p><div className="tour-input"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a practice message" /><button disabled={!text.trim()} onClick={() => { setSent(true); setChatStage(1); }}>Send</button></div>{sent && <span className="tour-sent">✓ Practice message ready</span>}</>}
    {chatStage === 1 && <><p><b>2. Attach a file.</b> Use the attachment control only for chat-relevant files. Event media does not belong here.</p><button className="tour-complete" onClick={() => setChatStage(2)}>Attach sample.pdf</button></>}
    {chatStage === 2 && <><p><b>3. Record a voice note.</b> Use it for a short update when text would lose important context.</p><button className="tour-complete" onClick={() => setChatStage(3)}>Record 0:04 practice note</button></>}
    {chatStage === 3 && <><p><b>4. Bring in the right people.</b> Start a direct message for one person, or a group for a small working conversation. General remains for everyone.</p><div className="tour-choice-row"><button onClick={() => setChoice("dm")}>Start direct message</button><button onClick={() => setChoice("group")}>Start small group</button></div>{choice && <button className="tour-complete" onClick={onDone}>Chat mission complete</button>}</>}
  </div>;
  if (kind === "todos") return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY · NOT SAVED</small><p>Add one small reminder. A real G-News to-do is manual and personal.</p><div className="tour-input"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Example: review today’s update" /><button disabled={!text.trim()} onClick={onDone}>Add practice to-do</button></div></div>;
  if (kind === "schedule") return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY · NOT SAVED</small><p>Weekly progress is recorded as it happens. Mark the first safe practice milestone.</p><label className="tour-check"><input type="checkbox" checked={choice === "done"} onChange={(e) => setChoice(e.target.checked ? "done" : null)} /> Listening / notes captured</label>{choice === "done" && <button className="tour-complete" onClick={onDone}>Continue mission</button>}</div>;
  if (kind === "members") return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY · NO ACCOUNT CREATED</small><p>Before adding someone, choose their team first. That determines which workspace they can access.</p><div className="tour-choice-row"><button onClick={() => setChoice("team")}>Choose a team</button><button disabled={choice !== "team"} onClick={onDone}>Access checked</button></div></div>;
  if (kind === "account") return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY · NO PROFILE CHANGE</small><p>Your password is private. Save a new one only when you have entered your current password.</p><button className="tour-complete" onClick={onDone}>I understand</button></div>;
  return <div className="tour-practice" data-tour-practice><small>PRACTICE ONLY</small><p>Notice how this area shows real information only. Nothing is created just for demonstration.</p><button className="tour-complete" onClick={onDone}>Continue mission</button></div>;
}

/** Locked practice route: actual areas are opened, while all exercises stay local to the guide. */
export function TutorialPanel({ session, onFinished }: { session: Session; onFinished: (next: Session) => void }) {
  const steps = stepsFor(session); const [index, setIndex] = useState(0); const [phase, setPhase] = useState<"point" | "practice">("point"); const [rect, setRect] = useState<Rect | null>(() => rectFor(steps[0].target)); const step = steps[index];
  const finish = async (status: "skipped" | "completed") => { try { onFinished(await updateOnboarding(session.token, status)); } catch { onFinished(session); } };
  const advance = () => { if (index === steps.length - 1) void finish("completed"); else { setIndex((value) => value + 1); setPhase("point"); } };
  useEffect(() => { let live = true; const refresh = () => live && setRect(rectFor(step.target)); refresh(); window.addEventListener("resize", refresh); window.addEventListener("scroll", refresh, true); const timer = window.setInterval(refresh, 200); return () => { live = false; window.removeEventListener("resize", refresh); window.removeEventListener("scroll", refresh, true); window.clearInterval(timer); }; }, [step.target]);
  useEffect(() => { const target = document.querySelector<HTMLElement>(step.target); target?.classList.add("tour-target"); document.body.classList.add("tour-active"); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { target?.classList.remove("tour-target"); document.body.classList.remove("tour-active"); document.body.style.overflow = overflow; }; }, [step.target]);
  useEffect(() => { let moving = false; const lock = (event: MouseEvent) => { const clicked = event.target as Element | null; if (clicked?.closest("[data-tour-skip], [data-tour-practice]")) return; const target = document.querySelector(step.target); if (phase === "point" && target?.contains(clicked)) { if (moving) return; moving = true; window.setTimeout(() => setPhase("practice"), 100); return; } event.preventDefault(); event.stopImmediatePropagation(); }; const keys = (event: KeyboardEvent) => { if (["Escape", "Tab", "Enter"].includes(event.key)) event.preventDefault(); }; document.addEventListener("click", lock, true); document.addEventListener("keydown", keys, true); return () => { document.removeEventListener("click", lock, true); document.removeEventListener("keydown", keys, true); }; }, [step.target, phase]);
  const mask = rect ? { top: rect.top - 7, left: rect.left - 7, width: rect.width + 14, height: rect.height + 14 } : undefined;
  return <div className="game-tour" aria-live="polite" aria-label="G-Arts guided practice"><div className="game-tour-dim" />{mask && <div className="game-tour-spotlight" style={mask} />}<section className="game-tour-bubble" style={bubbleStyle(rect)}><header><span className="game-tour-avatar" aria-hidden="true">G</span><div><strong>G-ARTS GUIDE</strong><small>Mission {index + 1} of {steps.length}</small></div><button type="button" data-tour-skip onClick={() => void finish("skipped")}>Skip tour</button></header><div className="game-tour-message"><span className="game-tour-kicker">{phase === "point" ? "Your next move" : "Practice safely"}</span><h1>{step.title}</h1><p>{step.text}</p></div>{phase === "point" ? <footer><span className="game-tour-pointer" aria-hidden="true">↑</span><b>Click <em>{step.action}</em> to enter this mission</b></footer> : <PracticeCard key={step.target} kind={step.practice} onDone={advance} />}<div className="game-tour-progress" aria-label={`Mission ${index + 1} of ${steps.length}`}>{steps.map((item, value) => <i key={item.target} className={value === index ? "is-current" : value < index ? "is-done" : ""} />)}</div></section></div>;
}

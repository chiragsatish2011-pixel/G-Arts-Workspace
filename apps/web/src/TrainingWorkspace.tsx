import { useMemo, useState } from "react";
import type { Session } from "./api";

type TaskState = "not_done" | "finished" | "not_required";
type Task = { name: string; state: TaskState; approved: boolean };
type Tab = "home" | "events" | "schedule" | "todos" | "library" | "chat" | "account";

const blankTasks = (): Task[] => [
  { name: "Photography", state: "not_done", approved: false },
  { name: "Videography", state: "not_done", approved: false },
  { name: "Shorts", state: "not_done", approved: false },
  { name: "YouTube upload", state: "not_done", approved: false },
];

export function TrainingWorkspace({ session, onFinished, onLeave, onRestart }: { session: Session; onFinished: () => void; onLeave: () => void; onRestart: () => void }) {
  const isArts = session.user.team === "G_ARTS";
  const isTranslation = session.user.team === "TRANSLATION";
  const [tab, setTab] = useState<Tab>("home");
  const [eventName, setEventName] = useState("");
  const [eventCreated, setEventCreated] = useState(false);
  const [tasks, setTasks] = useState(blankTasks);
  const [link, setLink] = useState("");
  const [chat, setChat] = useState<string[]>(["Welcome to General — this is a training conversation only."]);
  const [message, setMessage] = useState("");
  const [attached, setAttached] = useState(false);
  const [voice, setVoice] = useState(false);
  const [groupStarted, setGroupStarted] = useState(false);
  const [listened, setListened] = useState(false);
  const [note, setNote] = useState("");
  const [todo, setTodo] = useState("");
  const [todos, setTodos] = useState<string[]>([]);
  const [profileName, setProfileName] = useState(session.user.displayName);
  const [savedProfile, setSavedProfile] = useState(false);

  const artsDone = eventCreated && tasks.every((task) => task.state !== "not_done" && task.approved) && link.startsWith("https://");
  const roleDone = isTranslation ? listened && note.trim().length > 0 : isArts ? artsDone : todos.length > 0;
  const chatDone = chat.length > 1 && attached && voice && groupStarted;
  const accountDone = savedProfile;
  const completed = [roleDone, chatDone, accountDone].filter(Boolean).length;
  const total = 3;
  const allDone = completed === total;
  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Home" },
    ...(isArts ? [{ id: "events" as Tab, label: "Event checklist" }] : []),
    ...(isTranslation ? [{ id: "schedule" as Tab, label: "My schedule" }] : []),
    ...(!isArts && !isTranslation ? [{ id: "todos" as Tab, label: "My to-dos" }] : []),
    { id: "library", label: "Library" }, { id: "chat", label: "Chat" }, { id: "account", label: "Account" },
  ];
  const setTask = (index: number, change: Partial<Task>) => setTasks((current) => current.map((task, item) => item === index ? { ...task, ...change } : task));
  const currentMission = useMemo(() => !roleDone ? (isArts ? "1. Run an event safely" : isTranslation ? "1. Record one article session" : "1. Add a private reminder") : !chatDone ? "2. Practise chat" : "3. Practise account settings", [chatDone, isArts, isTranslation, roleDone]);

  return <main className="training-shell">
    <header className="training-topbar"><div><span className="training-badge">TRAINING WORKSPACE</span><strong>Practice mode</strong><small>Separate sample data · resets when you leave</small></div><div className="training-actions"><span>{completed}/{total} missions complete</span><button type="button" onClick={onRestart}>Reset training</button><button type="button" onClick={onLeave}>Leave training</button></div></header>
    <nav className="training-nav" aria-label="Training workspace navigation">{tabs.map((item) => <button type="button" className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    <div className="training-layout"><aside className="training-coach"><span className="training-coach-mark">G</span><span className="eyebrow">GUIDED PRACTICE</span><h1>{allDone ? "Training complete" : currentMission}</h1><p>{allDone ? "You have used every important workflow safely. These practice records are ready to be wiped." : "Everything in this area is a sample. Do the action yourself; nothing here can change the real workspace."}</p><div className="training-progress">{[0, 1, 2].map((item) => <i key={item} className={item < completed ? "done" : item === completed ? "current" : ""} />)}</div>{allDone ? <button className="training-primary" type="button" onClick={onFinished}>Finish and open real workspace</button> : <small>Use the workspace beside this guide. The guide updates when you complete each practice action.</small>}</aside>
      <section className="training-area">
        {tab === "home" && <section className="training-page"><span className="eyebrow">PRACTICE HOME</span><h2>Good afternoon, {session.user.displayName}.</h2><p>This training home reflects only your sample progress. Real events, schedules and chats are never loaded here.</p><div className="training-cards"><article><strong>{roleDone ? "Complete" : "Practice needed"}</strong><span>{isArts ? "Event workflow" : isTranslation ? "Article schedule" : "My to-dos"}</span></article><article><strong>{chatDone ? "Complete" : "Practice needed"}</strong><span>Chat safely</span></article><article><strong>{accountDone ? "Complete" : "Practice needed"}</strong><span>Account controls</span></article></div></section>}
        {tab === "events" && <section className="training-page"><span className="eyebrow">PRACTICE EVENT · NEVER SAVED</span><h2>Event checklist</h2>{!eventCreated ? <div className="training-card"><p>Create one harmless sample event to unlock the task workflow.</p><div className="training-form"><input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Example: Practice assembly" /><button disabled={!eventName.trim()} onClick={() => setEventCreated(true)}>Create sample event</button></div></div> : <><p><b>{eventName}</b> is a practice record. First submit a result, then review it as the administrator.</p><div className="training-task-list">{tasks.map((task, index) => <article key={task.name}><div><strong>{task.name}</strong><small>{task.approved ? task.state === "not_required" ? "Not required — approved" : "Finished — approved" : task.state === "not_done" ? "Waiting for work" : task.state === "not_required" ? "Not required — awaiting admin review" : "Finished — awaiting admin review"}</small></div><div>{task.state === "not_done" ? <><button onClick={() => setTask(index, { state: "finished" })}>Finished</button><button onClick={() => setTask(index, { state: "not_required" })}>Not required</button></> : !task.approved ? <button className="training-review" onClick={() => setTask(index, { approved: true })}>Review & approve</button> : <span className="training-ok">✓ Approved</span>}</div></article>)}</div><div className="training-card"><strong>Practice delivery link</strong><p>Paste a secure sample link to experience the link review step.</p><div className="training-form"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://youtube.com/example" /><span className={link.startsWith("https://") ? "training-ok" : "training-muted"}>{link.startsWith("https://") ? "✓ Secure link ready for review" : "HTTPS links only"}</span></div></div>{artsDone && <div className="training-success">✓ The sample event can now be completed. In the real workspace, this happens only after the team submits and an administrator approves.</div>}</>}</section>}
        {tab === "schedule" && <section className="training-page"><span className="eyebrow">PRACTICE WEEK · NEVER SAVED</span><h2>My weekly article schedule</h2><p>Try one small, real-style check-in. Your actual weekly article record is not opened or edited in training.</p><div className="training-card"><strong>Monday · 6:15–7:15 AM</strong><p>Listen to the video, then capture ideas in your own words.</p><label className="training-check"><input type="checkbox" checked={listened} onChange={(e) => setListened(e.target.checked)} /> Listening / notes captured</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Practice note: one idea from the session" /></div>{roleDone && <div className="training-success">✓ Sample check-in complete. In the real schedule, start a week only when you are ready for a real record.</div>}</section>}
        {tab === "todos" && <section className="training-page"><span className="eyebrow">PRACTICE TO-DOS · NEVER SAVED</span><h2>My to-do list</h2><p>G-News work stays simple: add only a reminder you personally need, then mark it complete later.</p><div className="training-form"><input value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="Example: check today’s G-News update" /><button disabled={!todo.trim()} onClick={() => { setTodos((items) => [...items, todo.trim()]); setTodo(""); }}>Add sample to-do</button></div><div className="training-samples">{todos.map((item) => <div key={item}>□ {item}</div>)}</div>{roleDone && <div className="training-success">✓ Sample to-do added. It will disappear when training resets.</div>}</section>}
        {tab === "library" && <section className="training-page"><span className="eyebrow">SHARED LIBRARY</span><h2>Watch and listen</h2><p>In the real library, recent Videos and Live shows are verified from the Bengaluru playlist. Music is a list of links; no media files are stored by this workspace.</p><div className="training-cards"><article><strong>Latest videos</strong><span>Verified playlist posts</span></article><article><strong>Latest live</strong><span>Verified live broadcasts</span></article><article><strong>Music links</strong><span>Secure external links</span></article></div></section>}
        {tab === "chat" && <section className="training-page"><span className="eyebrow">PRACTICE CHAT · NEVER SENT</span><h2># General</h2><p>Practise the same controls safely. These messages, files and voice notes exist only in this training screen.</p><div className="training-chat">{chat.map((item, index) => <p key={`${item}-${index}`}><b>{index ? session.user.displayName : "Guide"}</b>{item}</p>)}{attached && <p className="training-file">📎 sample-brief.pdf <small>Practice attachment</small></p>}{voice && <p className="training-file">◉ 0:04 voice note <small>Practice recording</small></p>}{groupStarted && <p className="training-system">✓ Practice group created — choose people only when they need the conversation.</p>}</div><div className="training-form"><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a practice message" /><button disabled={!message.trim()} onClick={() => { setChat((items) => [...items, message.trim()]); setMessage(""); }}>Send</button></div><div className="training-chat-actions"><button onClick={() => setAttached(true)}>Attach sample file</button><button onClick={() => setVoice(true)}>Record sample voice note</button><button onClick={() => setGroupStarted(true)}>Start practice group</button></div>{chatDone && <div className="training-success">✓ Chat practice complete. General is for everyone; Announcements are administrator-only; use direct/group chat only for the right people.</div>}</section>}
        {tab === "account" && <section className="training-page"><span className="eyebrow">PRACTICE ACCOUNT · NEVER SAVED</span><h2>Account</h2><p>Try changing a display name safely. This preview cannot change your real profile. In the real Account area, only you choose a new password.</p><div className="training-form"><input value={profileName} onChange={(e) => setProfileName(e.target.value)} /><button disabled={!profileName.trim()} onClick={() => setSavedProfile(true)}>Save practice change</button></div>{savedProfile && <div className="training-success">✓ Preview saved for {profileName}. It will reset when you leave training.</div>}</section>}
      </section></div></main>;
}

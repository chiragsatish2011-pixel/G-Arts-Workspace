import { useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { Session } from "./api";

type Props = { session: Session; onFinished: () => void; onLeave: () => void; onRestart: () => void };
type Stage = 0 | 1 | 2 | 3 | 4 | 5;

const scenario = (team: Session["user"]["team"]) => team === "TRANSLATION"
  ? { object: "article week", source: "Weekly plan", task: "Wednesday writing session", result: "article progress" }
  : team === "G_NEWS"
    ? { object: "G-News update", source: "Personal reminder", task: "Review today’s update", result: "news work" }
    : { object: "practice event", source: "Verified event", task: "Photography", result: "event work" };

export function TrainingWorkspace({ session, onFinished, onLeave, onRestart }: Props) {
  const words = scenario(session.user.team);
  const [stage, setStage] = useState<Stage>(0);
  const [triedStart, setTriedStart] = useState(false);
  const [connected, setConnected] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [link, setLink] = useState("");
  const [linkTried, setLinkTried] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatSent, setChatSent] = useState(false);
  const [attachment, setAttachment] = useState(false);
  const [voice, setVoice] = useState(false);
  const [group, setGroup] = useState(false);
  const [popup, setPopup] = useState<"missing" | "connect" | "review" | "link" | "chat" | null>(null);
  const secure = link.startsWith("https://");
  const taskReady = connected && reviewed;
  const chatReady = chatSent && attachment && voice && group;
  const stageTitle = useMemo(() => ["What is missing?", "Connect the workflow", "Who makes it final?", "Make the delivery safe", "Use chat with purpose", "Practice complete"][stage], [stage]);
  const advance = (next: Stage) => { setStage(next); setPopup(null); };
  const dropConnection = (event: DragEvent<HTMLButtonElement>) => { event.preventDefault(); if (event.dataTransfer.getData("training-piece") === "source") { setConnected(true); advance(2); } };

  return <main className="mission-shell">
    <header className="mission-topbar"><div><span>TRAINING WORKSPACE</span><strong>Practice mission · {stage + 1} / 6</strong><small>Sample data only — this wipes when you leave</small></div><div><button onClick={onRestart}>Reset mission</button><button onClick={onLeave}>Leave</button></div></header>
    <section className="mission-head"><span className="eyebrow">GUIDED WORKFLOW LAB</span><h1>{stageTitle}</h1><p>Explore the practice workspace. When something does not work, find the missing piece and make it work yourself.</p><div className="mission-meter">{[0, 1, 2, 3, 4, 5].map((item) => <i key={item} className={item < stage ? "done" : item === stage ? "current" : ""} />)}</div></section>

    <section className="mission-canvas" aria-label="Interactive practice workspace">
      <div className={`mission-station source ${connected ? "is-live" : "is-frozen"}`}><span className="station-number">01</span><span className="station-kicker">SOURCE</span><strong>{words.source}</strong><p>{connected ? `${words.object} is ready` : "No work is connected yet"}</p><div className="station-orb">{connected ? "✓" : "?"}</div></div>
      <div className={`mission-wire ${connected ? "is-live" : ""}`}><i /></div>
      <div className={`mission-station checklist ${connected ? "is-live" : "is-frozen"}`}><span className="station-number">02</span><span className="station-kicker">WORK</span><strong>{words.task}</strong><p>{!connected ? "Waiting for a source" : reviewed ? "Reviewed and approved" : submitted ? "Waiting for administrator review" : "Ready for a team result"}</p><button className="station-action" onClick={() => { if (!connected) { setTriedStart(true); setPopup("missing"); } else if (!submitted) { setSubmitted(true); setPopup("review"); } }}>{!connected ? "Start work" : !submitted ? "Mark Finished" : reviewed ? "Approved ✓" : "Submitted"}</button></div>
      <div className={`mission-wire ${reviewed ? "is-live" : ""}`}><i /></div>
      <div className={`mission-station delivery ${secure ? "is-live" : "is-frozen"}`}><span className="station-number">03</span><span className="station-kicker">DELIVERY</span><strong>Review link</strong><p>{secure ? "Secure delivery ready" : "No approved link"}</p><button className="station-action" onClick={() => { if (!reviewed) setPopup("review"); else setPopup("link"); }}>{secure ? "Link checked ✓" : "Add delivery"}</button></div>
      <div className={`mission-wire ${chatReady ? "is-live" : ""}`}><i /></div>
      <div className={`mission-station chat ${chatReady ? "is-live" : "is-frozen"}`}><span className="station-number">04</span><span className="station-kicker">CONVERSATION</span><strong>Team chat</strong><p>{chatReady ? "Practice conversation complete" : "Use the right chat tools"}</p><button className="station-action" onClick={() => { if (!secure) setPopup("link"); else setPopup("chat"); }}>{chatReady ? "Chat ready ✓" : "Open practice chat"}</button></div>
    </section>

    <section className="mission-controls">
      {stage === 0 && <article className="mission-dialog"><span className="dialog-icon">!</span><div><span className="eyebrow">TRY IT FIRST</span><h2>Why can’t the work start?</h2><p>Click <b>Start work</b> on the frozen middle card. This is only a practice action.</p></div>{triedStart && <button className="mission-next" onClick={() => { setPopup("connect"); advance(1); }}>I found the problem →</button>}</article>}
      {stage === 1 && <article className="mission-dialog"><span className="dialog-icon">↔</span><div><span className="eyebrow">CONNECT THE PIECES</span><h2>Work needs a verified source.</h2><p>Drag the red <b>{words.source}</b> piece into the empty connection slot. On touch screens, tap the piece, then tap the slot.</p><button draggable className="mission-piece" onDragStart={(event) => event.dataTransfer.setData("training-piece", "source")} onClick={() => setConnected(true)}>{words.source}</button></div><button className={`mission-slot ${connected ? "filled" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={dropConnection} onClick={() => { if (connected) advance(2); }}>{connected ? "Connected ✓" : "Drop source here"}</button></article>}
      {stage === 2 && <article className="mission-dialog"><span className="dialog-icon">✓</span><div><span className="eyebrow">REVIEW GATE</span><h2>Is “finished” really finished?</h2><p>A team member can submit a result. The administrator must review it before the practice record is truly done.</p></div><button className="mission-next" disabled={!submitted} onClick={() => { setReviewed(true); advance(3); }}>Review and approve</button></article>}
      {stage === 3 && <article className="mission-dialog"><span className="dialog-icon">↗</span><div><span className="eyebrow">SAFE DELIVERY</span><h2>Would you trust this link?</h2><p>Try a link. The workspace only accepts a secure <b>https://</b> address before it can be reviewed.</p><div className="mission-input"><input value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://youtube.com/practice" /><button onClick={() => setLinkTried(true)}>Check</button></div>{linkTried && !secure && <small className="mission-error">Use a link beginning with https://</small>}</div><button className="mission-next" disabled={!secure} onClick={() => advance(4)}>Secure link accepted</button></article>}
      {stage === 4 && <article className="mission-dialog mission-chat-dialog"><span className="dialog-icon">#</span><div><span className="eyebrow">PRACTICE CHAT · NEVER SENT</span><h2>Put the right thing in the right conversation.</h2><p>Try each tool below. Nothing is stored or sent outside this training canvas.</p><div className="mission-input"><input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Write a practice update" /><button disabled={!chatText.trim()} onClick={() => setChatSent(true)}>{chatSent ? "Sent ✓" : "Send"}</button></div><div className="mission-chat-tools"><button onClick={() => setAttachment(true)} className={attachment ? "done" : ""}>📎 Attach sample file</button><button onClick={() => setVoice(true)} className={voice ? "done" : ""}>◉ Record sample voice</button><button onClick={() => setGroup(true)} className={group ? "done" : ""}>+ Start practice group</button></div></div><button className="mission-next" disabled={!chatReady} onClick={() => advance(5)}>Complete chat practice</button></article>}
      {stage === 5 && <article className="mission-dialog mission-finish"><span className="dialog-icon">★</span><div><span className="eyebrow">YOU FIXED THE FLOW</span><h2>Ready for the real workspace.</h2><p>You connected work to a real source, used the approval gate, checked a secure delivery link, and practised chat. All sample data will now disappear.</p></div><button className="mission-next" onClick={onFinished}>Wipe samples and continue</button></article>}
    </section>
  </main>;
}

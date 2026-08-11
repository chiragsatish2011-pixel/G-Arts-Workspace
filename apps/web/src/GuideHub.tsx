import type { Session } from "./api";

type Props = { session: Session; firstVisit: boolean; onStart: () => void; onSkip: () => void };

function missions(session: Session) {
  const shared = ["Library: watch verified Bengaluru posts and understand music links", "Chat: know where conversations belong", "Account: keep your profile and password private"];
  if (session.user.team === "TRANSLATION") return ["My schedule: plan and record one article week", ...shared];
  if (session.user.team === "G_NEWS") return ["My to-dos: keep a simple private work list", ...shared];
  const arts = ["Home: understand today’s G-Arts work", "Event checklist: follow the submit → review → complete workflow", "History: find completed and recoverable work"];
  if (["ADMIN", "SUPER_ADMIN"].includes(session.user.role)) arts.push("Translation and Members: understand team boundaries and administration");
  return [...arts, ...shared];
}

export function GuideHub({ session, firstVisit, onStart, onSkip }: Props) {
  const route = missions(session);
  return <main className="guide-hub">
    <section className="guide-hero">
      <div className="guide-orb" aria-hidden="true">G</div>
      <span className="eyebrow">G-ARTS GUIDED PRACTICE</span>
      <h1>{firstVisit ? "Welcome. Let’s learn the workspace by using it." : "Guided practice"}</h1>
      <p>This is a five-minute, hands-on route inside the normal workspace screens. Practice mode replaces live data with a separate temporary workspace, so every event, chat message, schedule note and profile change can be tried safely.</p>
      <div className="guide-actions">
        <button className="primary" type="button" onClick={onStart}>Start guided practice <span>→</span></button>
        <button className="guide-skip" type="button" onClick={onSkip}>{firstVisit ? "Skip for now" : "Back to workspace"}</button>
      </div>
      {firstVisit && <small>You can skip now and restart this from Guide whenever you want.</small>}
    </section>
    <section className="guide-route" aria-label="Guide route">
      <header><span>YOUR FIVE-MINUTE ROUTE</span><strong>{route.length} missions</strong></header>
      <ol>{route.map((mission, index) => <li key={mission}><i>{index + 1}</i><div><strong>{mission.split(":")[0]}</strong><p>{mission.includes(":") ? mission.slice(mission.indexOf(":") + 1).trim() : mission}</p></div><span>Practice</span></li>)}</ol>
    </section>
    <p className="guide-assurance"><b>Practice mode is separate.</b> It uses temporary records and wipes them whenever you exit, finish, or start again.</p>
  </main>;
}

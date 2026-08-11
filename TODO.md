# G-Arts Bangalore — next decisions

This is a requirements list, not a promise that the workspace will create any
of these records automatically.

## Sources in use

- [Bangalore events archive](https://gurukul.org/events/?gurukul_category%5B%5D=bangalore)
- [Gurukul Bangalore YouTube playlist](https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf)
- Gurukul Bangalore academic calendar feed, shown only as a reviewable event
  proposal list.

## Built and deliberately limited

- A confirmed event creates only the named work-items supplied by G Arts.
- Work-items have only **Not done** and **Done**.
- The Home **To do** list shows only work-items that are still **Not done**;
  completed work remains in History rather than cluttering the active list.
- A scheduled recurring event may copy work-items only from real earlier events
  with the exact same G-Arts-supplied recurring-event name.
- Each event has a **Delivery record** for the real operational tracker:
  website event, parent shares, Shorts, video, thumbnail and video share.
  A public item cannot be marked done without its required link.
- Chat mirrors every real Workspace account when it is created, so members are
  available in Chat before their first chat visit.
- Event work follows a reviewable completion flow: a team member submits it;
  an administrator can choose **Finished** or **Not required**, then approves
  that outcome. Completed events leave active lists and are recoverable for 15 days; no
  automatic deletion occurs.
- Delivery links are editable by G-Arts members. A member presses **Put link**
  to store an openable verified link and submits it; only an administrator can
  give the separate final approval. Replacing a link clears that approval.
- Translation has the supplied Satvidya one-article-per-week tracker: daily
  schedule blocks, notes, reading list, article stages and admin read-only
  oversight. No reminder notifications are sent until their channel/rules are
  explicitly chosen.
- Guide is a role-aware, hands-on practice route. G-Arts, G-Arts admin,
  Translation and G-News each receive only the route and permissions that
  match their workspace. It runs through the real screens with an isolated,
  temporary practice store; leaving, completing or restarting wipes every
  sample event, link, to-do, schedule entry and chat action.
- The practice route covers the role’s own work, Library, Chat (message,
  attachment, voice and focused group), and Account without using real data.
- The workspace opens with a short branded loading screen on refresh. It is
  visual only: it does not send any extra requests or change live data.
- Shared Music links are saved permanently. Video and Live are the only
  automatically refreshed library sections.
- Vercel frontend deployment is explicitly configured in `apps/web/vercel.json`:
  Vite build output is `dist`; unknown client paths return the app shell.

## Requirements G Arts needs to supply before the next build slice

1. The event-review rule: who may approve a Bangalore website/calendar item as
   a G-Arts event, and which source details must be recorded.
2. The actual project model: whether Projects are still used alongside direct
   event work-items, and what a project means to the Bangalore team.
3. The YouTube workflow: which work-item makes a video ready, who approves a
   title/thumbnail/description, and whether the workspace should prepare a
   draft or only link the published playlist entry.
4. Equipment, multi-computer sync, Media handling, conversion and backup only
   after their real Bangalore workflows are documented.
5. The Google Sheet decision: either provide a read-only source/export for a
   one-time review, or approve a read-only Google Sheets OAuth connection and
   name the exact tab/range. The Workspace will not scrape or infer tracker
   rows from a screenshot.
6. Translation schedule and reminder rules: the triggering time, audience,
   delivery channel and who may change each rule.
7. Decide whether the guided practice needs a server-persisted sandbox for
   analytics or multi-device continuation. It is currently intentionally
   disposable and local so it cannot affect the live workspace.

## Non-negotiable guardrails

- No invented events, people, dates, schedules, assignments, tasks or file
  associations.
- No automatic creation from website/calendar content.
- No people monitoring or activity scoring.
- No auto-publish, delete, permission change, backup verification or file
  conversion without explicit approved rules and human confirmation.

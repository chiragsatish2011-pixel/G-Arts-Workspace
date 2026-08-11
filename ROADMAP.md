# Roadmap

Status is what has been built **and verified running**, not what has been started.

| Phase | Area | Status |
| --- | --- | --- |
| 0 | Product and safety specifications | ✅ done |
| 1 | Auth, users, roles, permissions, API, base UI | ✅ done |
| 2 | Verified events, direct work-items, school calendar review | ✅ done |
| 5 | Chat — channels, DMs, files, voice, single sign-on | ✅ done |
| 3 | Projects, types, pipeline | ▢ dormant until G Arts defines its real project model |
| 4 | Direct event work-items and simple checklist history | ✅ built |
| 6 | Workspace Media, uploads, storage, backups and connector | 🚫 not in the current scope |
| 7 | Derived logbook | ▢ |
| 8 | Equipment, checkout, maintenance | ▢ |
| 9 | Storage nodes, backup verification | ▢ requires real storage process |
| 10 | Desktop connector | ▢ requires real multi-computer workflow |
| 11 | Automation engine | ▢ |
| 12 | Assistant (see `AI.md` — deliberately last, and optional) | ▢ |
| 13 | Website / YouTube publishing | ▢ |
| 14 | Archive and year in review | ▢ |

## Phase 5 — Chat ✅

> **Scope refinement — 11 August 2026:** There is no Workspace Media or file
> storage. Event work-items are direct named tasks with only Not done and Done.
> A new scheduled recurring event may copy only real items from earlier events
> with the same explicitly supplied recurring-event name.
>
> The retained legacy notes below are historical context only; they do not
> describe the active workspace behaviour or authorise templates, projects,
> Media, or other removed complexity.

The chat service is complete and part of the Workspace, not a separate product.

- **One sign-in.** The Workspace issues every account and session; chat verifies
  the token and mirrors the member. There is no second password.
- **Channels and direct messages.** "New chat" opens a one-to-one thread, a
  group, or a channel. A DM is keyed on the pair, so two people can never end
  up in two parallel threads.
- **Private means private.** An administrator has no way to read, list or even
  detect a conversation they are not part of — verified: a non-member gets
  `404`, not `403`, so private conversations cannot be probed for.
- **Every file type** except programs and installers. HEIC, MOV, CR3, PSD,
  Premiere and DaVinci projects, LUTs, fonts, archives and unknown extensions
  all upload. 100 MB per file.
- **Everything is downloadable** — images, video, voice notes and files.
- **Voice notes** record, send, show their length, and can be saved.
- **Deleting an account** in the Workspace removes it from chat too, in the
  same action. If chat cannot be reached, nothing is deleted anywhere.

## Phase 2 — Events ✅

The object the rest of G Arts hangs from.

- Seven Gurukul-shaped categories: spiritual, sports, cultural, academic,
  leadership, trip, campus life.
- Each category carries the coverage that kind of event usually needs, applied
  as a starting selection a person can change.
- **The school's academic calendar is connected.** See `AUTOMATION.md`.
- Status runs planned → confirmed → covered → archived.

Phases 3 and 4 are next: projects hang off an event, tasks hang off a project,
and both are generated from the same templates rather than typed out again.

## Phases 3 and 4 — Projects and Tasks ✅

An event's coverage becomes the work it implies. Ticking "videography" is a
statement that a main video has to exist, so the video and the nine steps to
produce it appear together.

Pressing **Plan the work** on an event expands its coverage through the
templates in `services/templates.ts`:

```
GTL Season 3  (cultural)
  coverage: photography, videography, thumbnail, shorts, website
        ↓
  6 projects, 34 tasks
      GTL Season 3 — Photo gallery   7 tasks
      GTL Season 3 — Main video      9 tasks
      GTL Season 3 — Thumbnail       4 tasks
      GTL Season 3 — Shorts          6 tasks
      GTL Season 3 — Website story   4 tasks
      GTL Season 3 — Archive         4 tasks
```

- **Deterministic.** The same event always produces the same plan. No model is
  involved, so it cannot rate-limit, stall halfway, or answer differently
  tomorrow.
- **Safe to repeat.** Anything already generated is left alone.
- **Every event gets an Archive project**, because that is the step most easily
  forgotten once the interesting work is finished.
- Tasks can be ticked, added, removed and assigned to a member. A project moves
  planned → capture → media ready → editing → review → approved → published →
  archived.
- Changing what an event kind needs is an edit to one table — not a change to
  the application. That is the point the plan makes in §110.

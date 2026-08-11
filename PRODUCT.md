# Product

G Arts Workspace is a private, source-aware planning workspace for the G Arts team
at Shree Swaminarayan Gurukul Bangalore. Its operational model is:

`Verified source → Scheduled event → Work-items → History`

## V1 outcomes

- Role-aware private access for the G Arts team.
- A reliable event-to-work-item workflow.
- No fabricated events, work-items, assignments, schedules or claims:
  records must be supplied by G Arts, linked to a trusted source, or explicitly
  confirmed by an authorised member.
- Event communication preserved beside the work.

## Product principles

1. Events are the root object.
2. Deterministic automation must work with AI completely disabled.
3. The workspace tracks work, not personal activity.
4. Every consequential action requires API-level confirmation.
5. People need working screens in every phase, not only endpoints.

## What exists today

Five simple spaces, one sign-in, one visual language.

| Space | What it is for |
| --- | --- |
| Home | What is waiting for you, and the way into everything else |
| Event checklist | Scheduled events and the real work-items to finish |
| Chat | Channels and private conversations, files, voice notes |
| Members | Accounts, roles and access (administrators) |
| Profile | Your name, picture and password |

The chain that holds it together:

```
school calendar / Bangalore source  →  Scheduled event  →  work-items
                                                         ↓
                                                    chat channel
```

Everything on that chain is deterministic. The calendar is read from a
published feed, but a person chooses the category and confirms the event.
Recurring checklists copy only recorded work-items from earlier events with the
same explicitly supplied recurring-event name. Nothing on it depends on a
model, so nothing can half-finish.

## Current scope — 11 August 2026

Media handling is deliberately outside this workspace: no uploads, stored
files, conversion, matching, media library or archive. Event work remains
deliberately simple: each explicitly named work-item has the agreed team/admin
review flow, with no generic templates or title/category guessing. The trusted Bangalore references are the
[Bangalore events archive](https://gurukul.org/events/?gurukul_category%5B%5D=bangalore)
and [Gurukul Bangalore YouTube playlist](https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf).

# Automation

## The rule that shapes everything here

**Automation is deterministic. The assistant is not. They are separate, and
automation never depends on the assistant.**

This is the most important decision in the project, and it comes from a real
constraint: a language model has rate limits, costs money per call, and gives a
different answer on different days. Anything built on top of one inherits all
three. A system that stops halfway through organising a shoot because a quota
ran out is worse than one that never tried.

So every rule the Workspace *relies* on is ordinary code:

| Job | How it is done | Why not a model |
| --- | --- | --- |
| Category from an event title | keyword list in `services/events.ts` | instant, free, same answer every time, editable in one line |
| Coverage for a category | template table | the team changes it; a model would have to be re-asked |
| Task generation | template expansion | must produce the same checklist every time |
| Duplicate media | SHA-256 of the bytes | exact, not approximate |
| Backup verification | hash compared to hash | "probably backed up" is worthless |
| Format conversion | ffmpeg / ImageMagick | deterministic, offline, no quota |
| Calendar import | iCalendar feed | the school's own words, parsed |

A model is only ever allowed to **suggest to a person who then decides** — draft
a description, propose which photos are strongest. If it is unavailable,
nothing breaks; a field is simply left for someone to fill in. See `AI.md`.

## The school's academic calendar — connected

`gurukul.org/bangalore/academics/academic-calendar/` renders a Google Calendar
embed. That calendar is public, which means it also publishes an iCalendar
feed. So the Workspace reads the feed directly:

```
https://calendar.google.com/calendar/ical/<calendar-id>/public/basic.ics
```

**No page scraping, no API key, no OAuth, no model.** Verified: 371 entries
returned, running from May 2024 to April 2027, parsed exactly as the school
wrote them.

What the Workspace does with them:

1. Fetches the feed and drops entries already imported (matched on the feed's
   own `UID`, so the same entry can never be imported twice).
2. Suggests a category from the title **and shows which word it matched** —
   `Varalaxmi Vrath → Spiritual (matched "vrath")`. A suggestion you can see
   the reasoning for is one you can judge; a confidence score is not.
3. Waits. **Nothing is created until a person selects entries and confirms.**

An event nobody asked for is worse than no event, so the calendar never writes
on its own. This is `PLAN.md`'s "imported calendar information should not
automatically create production work without confirmation", implemented.

### Where the suggestion is weak, on purpose

`80th Independence Day` matches no keyword and falls back to campus life. That
is the correct behaviour — the list says "no keyword — pick one" rather than
inventing a category. Adding `independence` to the cultural hints is a
one-line change, and that is the point: the rules are yours to shape.

## Planned automations

Each is deterministic and each states its failure mode, because an automation
without a defined failure is a source of silent corruption.

| Trigger | Action | If it fails |
| --- | --- | --- |
| Event confirmed | expand its template into projects and tasks | nothing written; event stays confirmed |
| Event archived | archive its chat channel | channel stays open; retried on next archive |
| Media imported | hash, deduplicate, index | file left unindexed and listed for retry |
| Backup run | compare hashes, mark verified | marked unverified, never "probably fine" |
| Format conversion | ffmpeg into the requested format | original untouched, job marked failed |

Conversion and the event uploader are queued jobs, not request handlers: they
run long, and they must survive a page being closed.

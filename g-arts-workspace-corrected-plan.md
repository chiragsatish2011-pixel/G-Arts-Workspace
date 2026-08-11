# G Arts Workspace — Corrected Master Plan

*This replaces the original 145-point draft. Same vision, load-bearing parts kept, fantasy parts removed, integration claims checked against reality, and the "AI everywhere" failure mode you flagged is now closed structurally instead of hoped away.*

---

## 0. One-line definition (for Codex, verbatim)

> G Arts Workspace is a private, automation-first production and archive platform for the G Arts media team at Shree Swaminarayan Gurukul Bangalore. It organizes work around Events → Projects → Tasks → Media → Archive. Deterministic automation handles anything rule-based. AI only assists with genuinely ambiguous or creative work, never writes final data without a human confirming, and is never load-bearing for the pipeline to function. The system tracks work, never people.

---

## 1. What was right in the original draft — keep this

- **Event as the root object.** Correct. Everything else (coverage, projects, tasks, media) hangs off it.
- **Template-driven task generation.** Correct pattern, used by every real production-pipeline tool.
- **The surveillance boundary (§46, §125, §144).** Correct and non-negotiable — keep `DO_NOT_BUILD.md` as a first-class spec doc, not an appendix.
- **Confidence-gated automation instead of blind automation.** Correct instinct. The mechanism underneath it was wrong (see §3 below) — fixed here.
- **V1 scope (original §128).** Right-sized. Do not expand it.
- **Your own closing note** — "AI everywhere will leave things half-done because of rate limits" — this is the single most important correction in the whole document, and it wasn't wrong, it just wasn't enforced with a hard rule. §3 below is that rule.

---

## 2. What was wrong, and the fix

### 2.1 The Gurukul academic calendar is not an integratable feed

I checked `gurukul.org/bangalore/academics/academic-calendar/`. It's a **"Pretty Google Calendar" embed** — a display widget, not a structured API or exportable feed with categories. Building Phase 13 auto-detection (original §73–75) against it will break the first time the school changes their site theme, and there's no category data to parse anyway.

**Fix:** Don't integrate against the public site. Set up **one Google Calendar that G Arts itself owns and maintains**, synced via the standard Google Calendar API (you already have Google Drive/Calendar connectors — this is a known-good integration path). G Arts staff add events to *that* calendar; the Workspace polls it. If someone wants Gurukul's official calendar as a secondary read-only reference, fetch it as plain text/screenshot occasionally — never build automation logic on top of it.

### 2.2 "AI confidence: 96%" for event-matching was theater, not AI

Real DAM platforms (Adobe AEM Smart Tags, Canto, ImageKit) do confidence-scored auto-tagging — that part of your instinct was right. But what they're scoring is **visual content analysis** (faces, scenes, objects), not "which event does this SD card belong to." Your SD-card-to-event matching problem doesn't need AI at all:

**Fix — replace with deterministic logic:**
```
Event has: date, start_time, end_time
Imported media has: EXIF timestamp
IF media.timestamp falls within event.date ± event.time_range → auto-associate, log it, done.
IF two events overlap in that window → ask human (dropdown, not AI chat).
IF media has no matching event → ask human.
```
This is a database query, not a model call. It will be **more reliable, instant, and free** compared to routing it through an LLM. Reserve actual AI for the parts that need judgment — see 2.4.

### 2.3 File-hash dedup ≠ near-duplicate detection — you conflated two different problems

SHA-256 (original §35) only catches byte-identical files (accidental double-copy). It will **not** catch burst-shot near-duplicates or re-exports, which is what your §39 "smart grouping" and §40 actually need.

**Fix — two separate, clearly named systems in `MEDIA.md`:**
- **Exact-dup detection**: SHA-256 hash on import. Cheap, deterministic, prevents wasted storage. Build this in V1.
- **Near-dup / burst grouping**: perceptual hashing (pHash) or embedding similarity. Different pipeline, meaningfully more expensive, genuinely needs a model. Push this to V3 — it's a nice-to-have, not core.

### 2.4 The desktop connector timeline was right, the scope estimate wasn't

A background agent that watches folders, hashes files, and syncs across Mac *and* Windows reliably is a multi-month systems-engineering effort on its own (this is roughly the scope of what Dropbox's sync engine does). Your instinct to put it in Phase 10 (late) was correct — keep it there, but be explicit with Codex that this phase alone is not a "few days" task.

**Fix for V1:** Skip the background connector completely. Do **manual import**: G Arts member drags the SD card folder into the web app, browser-side JS does the hashing and upload, same downstream pipeline (associate → backup → index) runs identically. Ships in the first few weeks instead of blocking V1 on connector engineering. The connector becomes a V2/V3 convenience layer on top of a pipeline that already works.

### 2.5 The hard rule your instinct was reaching for

You already said it yourself: AI has rate limits, so if it's threaded through everything, things get left half-done and the data gets messy. Correct. Here's the rule that actually enforces it, put directly into `AI.md`:

> **AI never writes anything to the database as final.** AI proposes; a human click commits. Every deterministic step (task creation from a template, exact-dup detection, backup verification, event/media timestamp matching) runs with **zero AI calls** — plain code, always available, never rate-limited, never inconsistent. AI is reserved only for: content drafting (captions/descriptions), photo-quality/near-dup suggestions, and natural-language search — all genuinely ambiguous, all human-reviewed, all optional to the pipeline working.

If the AI API is down or rate-limited, **the entire production pipeline still functions** — events get created, tasks get generated, media gets imported and backed up, projects move through their pipeline. AI being unavailable degrades convenience features only, never core operation. This single rule is what turns your closing worry into an actual architectural guarantee instead of a hope.

---

## 3. Revised system architecture

```
                         G ARTS WORKSPACE
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
     PEOPLE                    WORK                     MEDIA
    Members/Roles         Events/Projects/Tasks      Photos/Video/Audio
       │                        │                        │
       └────────────────────────┼────────────────────────┘
                                │
                    DETERMINISTIC AUTOMATION  ←── always available, zero AI
                    (templates, matching, hashing, backup verify)
                                │
                    AI ASSIST LAYER  ←── optional, human-confirmed, never load-bearing
                    (captions, near-dup suggestions, NL search)
                                │
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
   EQUIPMENT                KNOWLEDGE                STORAGE
                                │
                          COLLABORATION (chat)
```

---

## 4. Corrected roadmap

**Phase 0 — Spec docs** (unchanged from original, keep the full doc set: `PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `AUTH.md`, `PERMISSIONS.md`, `MEDIA.md`, `AUTOMATION.md`, `AI.md`, `CHAT.md`, `EQUIPMENT.md`, `BACKUP.md`, `SECURITY.md`, `DO_NOT_BUILD.md`, `ROADMAP.md`)

**Phase 1 — Foundation:** auth, users, roles, permissions, API, base UI.

**Phase 2 — Events:** events, categories, templates, calendar (synced from a **G Arts-owned Google Calendar**, not the public school site), coverage.

**Phase 3 — Projects:** project types, pipeline stages, deliverables.

**Phase 4 — Tasks:** deterministic template-based task generation (no AI call).

**Phase 5 — Chat:** channels, project/event threads, mentions, realtime.

**Phase 6 — Media (manual import only):** upload, EXIF-based deterministic event matching, exact-dup hash check, metadata, search, permissions/visibility states.

**Phase 7 — Logbook:** auto-generated from the objects above — no separate system.

**Phase 8 — Equipment:** items, QR checkout/return, maintenance reminders.

**Phase 9 — Storage & backup:** nodes, hash-verified backup jobs, alerts.

**Phase 10 — Desktop connector (V2+, scoped honestly as a major sub-project):** folder-watch import, multi-node sync — build only after V1 is running and proven manually.

**Phase 11 — Automation engine:** trigger/condition/action rules, all deterministic.

**Phase 12 — AI assist layer (V2):** content drafting, natural-language search, near-dup/photo-quality suggestions — all confirm-gated, all optional.

**Phase 13 — Publishing integrations (V2/V3):** website/YouTube publishing packages, human-approved.

**Phase 14 — Archive & year-in-review (V3):** built from data already collected, mostly deterministic aggregation with an optional AI-drafted summary.

---

## 5. V1 — ship this, nothing more

```
✓ Login, members, roles, permissions
✓ Events, categories, templates, G Arts-owned calendar
✓ Projects, tasks (deterministic template generation)
✓ Chat (event/project threads)
✓ Media: manual upload, EXIF-based event matching, exact-dup hash check, metadata, search
✓ Logbook (auto-derived, no separate build)
✓ Equipment tracking + QR checkout
✓ Storage dashboard + hash-verified backup
```
No AI calls anywhere in V1. If this works well on its own, you already have a system better than what most teams your size run — and you've proven the deterministic core before adding anything that can fail on rate limits.

---

## 6. `DO_NOT_BUILD.md` — unchanged, still non-negotiable

No app/screen/keystroke/idle-time monitoring. No HR/payroll/attendance/ERP features. No social feed mechanics (likes, follower counts, popularity scores). AI never auto-publishes, auto-deletes, changes permissions, or bypasses human approval — and per §3 above, AI is never required for the system to function at all.

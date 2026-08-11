# G Arts Workspace — Feasibility & Architecture Decisions

Reviewed: 11 August 2026

## Decision

The G Arts Workspace is feasible, but it must be delivered as a production
system in layers. The existing Events → Projects → Tasks foundation is the
right first layer. Media ingestion, conversion, backups and the desktop
connector are separate operational systems; they must not be treated as a few
extra API routes.

The governing rule remains:

> Deterministic operations create and protect the record. AI may only create a
> reviewable suggestion and is never required for a workflow to finish.

This directly addresses rate limits, partial output and inconsistent model
answers. A conversion, upload, backup verification or template expansion must
finish identically with AI disabled.

## Findings verified against the live system

| Area | Evidence | Decision |
| --- | --- | --- |
| Official academic calendar | The official page exposes a Google Calendar entry point. Its configured public iCalendar feed returned HTTP 200, `text/calendar`, 111,148 bytes and 371 events on 11 August 2026. | Keep the feed as a read-only source of suggestions. Never auto-create an Event. |
| Calendar feed shape | The current `basic.ics` feed contained no `RRULE` or `VTIMEZONE` records. | The current parser works for this feed, but the source must be treated as external and revalidated if Google changes its output. Store source UID and a snapshot hash on import. |
| Large media transfer | The current chat uploader has a 100 MB limit, which is unsuitable for camera footage. The tus protocol supports resumable, offset-checked HTTP uploads; its reference server supports local disk and S3-compatible backends. | Build a dedicated media upload service in Phase 6, using tus or equivalent resumable multipart uploads. Do not adapt chat attachments into the media library. |
| Conversion | FFmpeg supports the required media formats and deterministic operations. Its optional components can change its license from LGPL to GPL. | Run a pinned, inventoried FFmpeg binary in an isolated worker. Use named conversion presets only; never accept user-provided FFmpeg arguments. Preserve the original. |
| Reliable asynchronous work | Background jobs can fail or be retried; BullMQ recommends idempotent, small jobs for safe retry. | Use a database job record as the source of truth plus a queue for execution. Every job has an idempotency key, bounded retries, visible failure, and a human Retry action. |
| Object integrity | S3-compatible object stores can validate and retain upload checksums, including multipart checksums. | Store an application SHA-256 for the full original file and compare a newly calculated full hash for backup verification. Provider checksums are an additional transport check, not the definition of “backup verified.” |

Sources: [official Gurukul calendar page](https://gurukul.org/bangalore/academics/academic-calendar/),
[Google Calendar iCalendar export guidance](https://support.google.com/calendar/answer/37111),
[tus resumable-upload protocol](https://tus.io/protocols/resumable-upload),
[tusd reference server](https://github.com/tus/tusd),
[FFmpeg formats documentation](https://ffmpeg.org/ffmpeg-formats.html),
[FFmpeg licensing](https://ffmpeg.org/legal.html),
[BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), and
[S3 object-integrity guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html).

## Corrected target architecture

```text
Workspace UI ───── Workspace API ───── PostgreSQL (system of record)
                          │
                          ├── Media upload service ── object storage / media volume
                          ├── Worker queue ────────── Redis
                          ├── Conversion worker ───── pinned FFmpeg
                          └── Connector API ───────── approved media folders only
```

Chat remains a separate application with single sign-on. Its attachment store
is not the media archive and must not become the source of record for raw
photos or video.

### Production data stores

- **PostgreSQL:** all durable business records, job records, audit security
  events, import sessions, media metadata and relationships.
- **Object storage or a mounted media volume:** immutable originals,
  generated previews and conversions. All objects use opaque keys; filenames
  are metadata, not paths.
- **Redis:** queue transport and short-lived coordination only. Losing Redis
  must not lose a job because the database can re-enqueue incomplete work.
- **No SQLite in production:** the current SQLite development databases are
  acceptable for local work, but they cannot be the production multi-user
  system of record.

## Phase 6 — media ingestion, the next implementation slice

### Required records

Add these records before adding a screen:

- `MediaAsset`: original metadata, full SHA-256, size as `BigInt`, MIME/type,
  capture time, visibility, event/project links and lifecycle state.
- `MediaObject`: one physical rendition or copy of an asset: `ORIGINAL`,
  `PREVIEW`, `PROXY`, `CONVERSION`, `BACKUP`; key, storage node, full hash and
  verification status.
- `ImportSession`: actor, source node/folder label, requested event, state and
  totals. It records an approved G Arts import—not PC activity.
- `Upload`: resumable transfer state, expected bytes, received bytes, expiry,
  checksum and final asset link.
- `Job`: `kind`, payload version, idempotency key, status, attempts,
  last-error-safe-for-display and timestamps.
- `MediaAssociation`: provenance for event/project links: `MANUAL`,
  `TIMESTAMP_SINGLE_MATCH`, or future `AI_SUGGESTION`. A non-manual link must
  be explainable and reversible.

### Ingestion state machine

```text
selected → uploading → received → hash_pending → indexed
                                      │
                                      ├── duplicate (link existing asset; do not copy)
                                      └── association_pending → assigned | unassigned
```

No state may skip `received` or `indexed`. The original object is never
altered. A conversion is a new `MediaObject`, never an overwrite.

### Event matching

1. A user chooses an event before importing whenever possible.
2. Otherwise compare an extracted capture timestamp to confirmed event windows.
3. Exactly one valid time-window match may be linked automatically and must
   show `TIMESTAMP_SINGLE_MATCH` as its reason.
4. Zero or multiple matches stay unassigned for a person to decide.

Do not use confidence scores in V1. They hide the decision rule. Do not run
AI analysis during import.

### Media permissions

Visibility and ability are separate:

| Ability | Minimum requirement |
| --- | --- |
| View private original | uploader, explicitly assigned project member, or authorised administrator |
| Download raw original | explicit `media.raw.download` permission |
| Change visibility or event/project association | team lead or authorised media editor |
| Delete media | administrator plus typed/explicit confirmation; retain recoverable record |
| Publish/share publicly | approved visibility plus a permitted approver and explicit confirmation |

Every media read endpoint must apply this policy. A storage key is never a
permission.

## Conversion automation

The converter is feasible and should be intentionally narrow at launch.

### V1 conversion presets

- Video review proxy: H.264/AAC MP4 at a documented resolution and bitrate.
- Web video export: H.264/AAC MP4 with a documented preset.
- Image review preview: JPEG/WebP preserving original separately.
- Audio review copy: AAC MP4/M4A or MP3 only where an approved preset requires it.

Each request selects a preset, input asset and destination project. The worker
builds its command from those controlled values, runs with CPU/time/disk limits,
captures only safe diagnostics, validates the output with `ffprobe`, hashes it,
and saves it as a derived object. Failure leaves the original and all existing
objects untouched.

Do not launch arbitrary format/codec settings, arbitrary shell commands,
automatic replacement of originals, or batch conversion with no job dashboard.
Before distribution, inventory the selected FFmpeg build and obtain a licensing
review for the codecs and optional GPL components actually enabled.

## Auto event uploader — repair path

The earlier uploader should be recovered only after it can satisfy this
contract, regardless of its current implementation:

1. It runs only after a user selects an approved event and source scope.
2. It uploads through the same resumable media API as the browser.
3. Each file has a stable idempotency key based on node ID, path relative to the
   approved root, byte size, modification time and final SHA-256.
4. The server returns the existing asset for a known hash rather than storing a
   second original.
5. It records import progress, errors and retry choices in the workspace; it
   never silently retries forever.
6. It can resume after a restart and can be paused without corrupting data.
7. It observes only configured G Arts media roots; it has no screen, browser,
   keyboard, microphone, webcam or general filesystem permissions.

The old implementation has not yet been located in this repository, so it is a
discovery item—not an assumed reusable dependency.

## Calendar operating model

The public school calendar is suitable as a secondary, read-only suggestion
source because it is already published and currently offers iCalendar. It is
not sufficient as the sole operational calendar because its schema, availability
and editorial timing are controlled outside G Arts.

Use two sources:

1. **Official Gurukul feed:** fetch on demand and on a small scheduled interval;
   show entries as suggestions only.
2. **G Arts operations calendar:** a G Arts-owned Google Calendar or internal
   event records; this is where coverage-specific timing and changes belong.

The UI must say which source supplied each suggestion, show its last successful
fetch, and offer retry. If the official feed is unavailable, existing events
and the whole workspace still work.

## Automation safety contract

Every automation is a versioned, idempotent job. It has:

- a named trigger and schema version;
- a stored idempotency key;
- an input snapshot and output references;
- `queued`, `running`, `succeeded`, `failed`, or `needs_review` state;
- capped retries with backoff;
- a visible error and manual Retry / Dismiss / Resolve option;
- tests for duplicate delivery and interrupted execution.

The database transaction that changes a record must write an outbox/job row in
the same transaction. A worker later executes it. This prevents an event from
being saved but its required job from being silently lost.

## AI boundary

AI is optional after the deterministic media and job flows are stable in real
use. It may make a draft description, a search suggestion or a review label.
It cannot change a final record without a user review action; it cannot publish,
delete, convert, classify definitively, start a backup, change access, or serve
as the fallback for failed automation. All AI calls require a budget and timeout
but no workflow waits for them.

## Gates before production media

1. Move the workspace API from SQLite to PostgreSQL with reviewed migrations.
2. Implement and test the Phase 6 upload/hash/index/permission flow using a
   non-production sample media set.
3. Run an interruption test: cut an upload halfway, restart, resume, and verify
   one final hash and one asset record.
4. Run a duplicate test: upload identical bytes twice and prove one logical
   original remains.
5. Run a backup corruption test and prove it becomes `FAILED`, not verified.
6. Restore a database and media backup into an isolated environment and record
   the result.
7. Enable an AI-off integration test over every V1 workflow.

Only after these gates pass should the repaired auto uploader be connected to
real G Arts folders.

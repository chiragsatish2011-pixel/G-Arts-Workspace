# G Arts Workspace — PLAN.md
### Implementation instructions for Codex. Build phases in order. Do not skip ahead. Do not add anything from `DO_NOT_BUILD.md`.

> **Active scope resolution — 11 August 2026:** Media is not part of the
> workspace. Do not build uploads, storage, conversion, matching, archive,
> backup or connectors. Chat attachments are isolated and not a workspace
> feature.

---

## 0. Read this first

You are building **G Arts Workspace** — a private production and archive platform for the G Arts media team at Shree Swaminarayan Gurukul Bangalore. The core model is:

```
Event → Coverage → Projects → Tasks → Media → Approval → Archive
```

**The one rule that overrides every other instruction in this document:** the system must fully function with the AI layer turned off. Every deterministic step (task generation, event/media matching, dedup, backup verification) is plain code with zero model calls. AI is added only in Phase 12, only for optional/ambiguous work, and every AI output requires a human click before it's written to the database as final. If you are about to make a database write depend on an AI response succeeding, stop — that write belongs in deterministic code instead.

Build in phases. Each phase has a **Definition of Done** — do not start the next phase until the current one's DoD is met and basic tests pass.

---

## 1. Stack

- **Backend:** Node.js + TypeScript, Express or Fastify, PostgreSQL
- **ORM:** Prisma (schema-first, migrations are easy to review)
- **Frontend:** React + TypeScript, Vite, Tailwind
- **Realtime (chat):** WebSocket (Socket.IO is fine) — do not build this until Phase 5
- **File storage:** local disk / mounted volume for V1, abstracted behind a `StorageProvider` interface so S3-compatible storage can be swapped in later without touching business logic
- **Auth:** JWT session tokens, bcrypt/argon2 for passwords
- **Background jobs:** simple queue (BullMQ + Redis is fine) for backup verification and hash jobs — introduced in Phase 9, not before

Do not introduce a new framework or major dependency without it being explicitly justified against a phase's needs.

---

## 2. Global rules (apply to every phase)

1. **No AI calls in Phases 1–11.** If a task in those phases seems to need AI, it doesn't — find the deterministic version and build that instead.
2. **Every consequential action needs a confirmation step** in the API (not just the UI): delete project, delete media, publish, change role/permission. The API endpoint itself should require an explicit `confirm: true` flag or a two-step token, not just trust the frontend showed a dialog.
3. **Every table that can be soft-deleted should be** (`deleted_at` nullable timestamp). Hard deletes only for genuinely disposable data (draft chat typing indicators, etc.) — never for events, projects, or media records.
4. **Write the relevant module from `/mnt/skills` where relevant** (docx/pdf/xlsx skills apply later if you build the year-in-review export — not before Phase 14).
5. **Every phase ships with a working UI**, not just an API. "Done" means a G Arts team member could actually use it, not that the endpoints return 200.
6. **No feature listed in `DO_NOT_BUILD.md` (Section 11) gets built, ever, even if a later phase's language could be read to imply it.** If in doubt, don't build it and flag the ambiguity instead.

---

## 3. Database schema (build in Phase 1, extend per phase)

Core entities. Use Prisma schema syntax. Types are indicative — refine as needed but keep the relationships intact.

```prisma
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  passwordHash  String
  role          Role     @default(MEMBER)
  skills        String[] // free-text tags: "photography", "editing", "live", "drone"
  availability  Availability @default(AVAILABLE)
  createdAt     DateTime @default(now())
  deletedAt     DateTime?
}

enum Role {
  SUPER_ADMIN
  ADMIN
  TEAM_LEAD
  MEMBER
  TRAINEE
  GUEST
}

enum Availability {
  AVAILABLE
  BUSY
  ON_EVENT
  UNAVAILABLE
}

model Event {
  id             String   @id @default(cuid())
  name           String
  category       EventCategory
  date           DateTime
  startTime      DateTime
  endTime        DateTime
  venue          String?
  description    String?
  organizer      String?
  templateId     String?
  template       EventTemplate? @relation(fields: [templateId], references: [id])
  status         EventStatus @default(PLANNED)
  createdAt      DateTime @default(now())
  deletedAt      DateTime?

  projects       Project[]
  media          Media[]
  channels       Channel[]
}

enum EventCategory {
  SPIRITUAL
  ACADEMIC
  SPORTS
  CULTURAL
  TRIP
  LEADERSHIP
  CAMPUS_LIFE
  OTHER
}

enum EventStatus {
  PLANNED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  ARCHIVED
}

model EventTemplate {
  id                String  @id @default(cuid())
  name              String
  category          EventCategory
  defaultProjects   Json    // [{ type: "PHOTO_GALLERY", name: "..." }, ...]
  defaultTasks      Json    // per project-type task list
  defaultEquipment  Json    // [{ type: "camera", quantity: 2 }, ...]
  events            Event[]
}

model Project {
  id         String   @id @default(cuid())
  eventId    String
  event      Event    @relation(fields: [eventId], references: [id])
  name       String
  type       ProjectType
  status     ProjectStatus @default(PLANNED)
  deadline   DateTime?
  createdAt  DateTime @default(now())
  deletedAt  DateTime?

  tasks      Task[]
  media      Media[]  @relation("ProjectMedia")
  channel    Channel?
}

enum ProjectType {
  PHOTO
  VIDEO
  SHORTS
  GRAPHICS
  WEBSITE
  LIVE
  ARCHIVE
}

enum ProjectStatus {
  PLANNED
  CAPTURE
  MEDIA_READY
  EDITING
  REVIEW
  APPROVED
  PUBLISHED
  ARCHIVED
}

model Task {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id])
  title        String
  assigneeId   String?
  assignee     User?    @relation(fields: [assigneeId], references: [id])
  dueDate      DateTime?
  priority     Priority @default(NORMAL)
  status       TaskStatus @default(TODO)
  createdAt    DateTime @default(now())
  deletedAt    DateTime?
}

enum Priority { LOW NORMAL HIGH URGENT }
enum TaskStatus { TODO IN_PROGRESS DONE BLOCKED }

model Media {
  id             String   @id @default(cuid())
  filename       String
  path           String   // storage path/key, abstracted via StorageProvider
  fileHash       String   @index // SHA-256, exact-dup detection
  fileType       MediaType
  fileSizeBytes  Int
  capturedAt     DateTime? // from EXIF
  eventId        String?
  event          Event?   @relation(fields: [eventId], references: [id])
  projects       Project[] @relation("ProjectMedia")
  visibility     Visibility @default(PRIVATE)
  backupStatus   BackupStatus @default(PENDING)
  uploadedById   String
  uploadedBy     User     @relation(fields: [uploadedById], references: [id])
  createdAt      DateTime @default(now())
  deletedAt      DateTime?
}

enum MediaType { PHOTO VIDEO AUDIO GRAPHIC DOCUMENT }
enum Visibility { PRIVATE TEAM APPROVED PUBLIC ARCHIVED }
enum BackupStatus { PENDING VERIFIED FAILED }

model Equipment {
  id             String   @id @default(cuid())
  name           String
  category       String   // camera, lens, mic, tripod, drone, etc.
  qrCode         String   @unique
  status         EquipmentStatus @default(AVAILABLE)
  condition      String?
  lastMaintenance DateTime?
  currentHolderId String?
  currentHolder  User?    @relation(fields: [currentHolderId], references: [id])
}

enum EquipmentStatus { AVAILABLE CHECKED_OUT MAINTENANCE UNAVAILABLE }

model Channel {
  id         String   @id @default(cuid())
  name       String
  type       ChannelType
  eventId    String?  @unique
  event      Event?   @relation(fields: [eventId], references: [id])
  projectId  String?  @unique
  project    Project? @relation(fields: [projectId], references: [id])
  messages   Message[]
}

enum ChannelType { GENERAL EVENT PROJECT }

model Message {
  id         String   @id @default(cuid())
  channelId  String
  channel    Channel  @relation(fields: [channelId], references: [id])
  authorId   String
  author     User     @relation(fields: [authorId], references: [id])
  content    String
  replyToId  String?
  createdAt  DateTime @default(now())
  deletedAt  DateTime?
}

model StorageNode {
  id           String   @id @default(cuid())
  name         String
  totalBytes   BigInt
  freeBytes    BigInt
  lastSyncAt   DateTime?
  status       String   @default("online")
}

model BackupJob {
  id           String   @id @default(cuid())
  mediaId      String
  media        Media    @relation(fields: [mediaId], references: [id])
  originalHash String
  backupHash   String?
  status       BackupStatus @default(PENDING)
  verifiedAt   DateTime?
}

model AuditLog {
  id          String   @id @default(cuid())
  actorId     String
  action      String   // "role_changed", "media_deleted", "project_deleted", etc.
  targetType  String
  targetId    String
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

**Note on AuditLog:** this is a **security log only**, per `DO_NOT_BUILD.md`. It records admin-level consequential actions. It never records "user opened a file" or "user viewed a page."

---

## 4. Phased build plan

### Phase 1 — Foundation
**Build:** User model, auth (register/login/JWT), Role enum + role-based route guards, base API structure, base React app shell with login screen and nav.
**DoD:** A super-admin can log in, create a second user, assign them a role, and that role correctly restricts which API routes they can hit. Write a basic permission-check middleware test.

### Phase 2 — Events
**Build:** Event CRUD, EventCategory, EventTemplate CRUD, event creation from a template (this just copies `defaultProjects`/`defaultTasks`/`defaultEquipment` JSON into real rows — no AI, straight code). Calendar view (simple month/week list, not a full calendar library dependency unless needed).

**Calendar integration — read carefully:** Do NOT scrape the public calendar
page. It currently exposes a public Google iCalendar feed, which may be read as
a **secondary, read-only suggestion source** without OAuth. Keep source UID and
last-fetch information, show the source in the UI, and never auto-create an
Event. G Arts should also maintain an operations calendar it owns (Google
Calendar via OAuth or internal events) for coverage-specific changes. See
`docs/FEASIBILITY.md` for the verified source and operational contract.

**DoD:** A team lead can create an event, pick a template ("Spiritual Event"), and see projects/tasks/equipment pre-populated per that template's JSON. A synced Google Calendar entry appears as a suggestion, not an auto-created event.

### Phase 3 — Projects
**Build:** Project CRUD nested under Event, ProjectType, ProjectStatus pipeline (enforce valid transitions in code — don't let a project jump from PLANNED to PUBLISHED).
**DoD:** Projects created via template in Phase 2 are visible and manually creatable; status can only move through the defined pipeline order.

### Phase 4 — Tasks
**Build:** Task CRUD under Project, assignment, due dates, priority, status. Template-driven task auto-generation (already seeded via EventTemplate in Phase 2 — this phase adds manual task creation/editing on top).
**DoD:** Creating a project from a template auto-generates its task list with zero AI calls; tasks can be manually added, assigned, and marked done.

### Phase 5 — Chat
**Build:** Channel model (general/event/project), Message CRUD, WebSocket realtime delivery, mentions (@user), replies. One auto-created Channel per Event and per Project.
**DoD:** Two logged-in users can message each other in a project channel in realtime; messages persist and reload correctly.

### Phase 6 — Media (manual import, no background connector)
**Build:**
- Manual upload via browser (drag folder or files in) — no desktop agent yet.
- On upload: compute SHA-256 hash server-side or client-side before upload completes; reject/flag exact duplicates.
- Extract EXIF `capturedAt` timestamp from photo/video metadata.
- **Deterministic event matching:** compare `capturedAt` against all events where `event.date` is within a small window and `capturedAt` falls between `startTime` and `endTime`. Single match → auto-associate, log it. Multiple matches or zero matches → leave unassigned, human picks from a dropdown. This is a plain SQL query with a time-range filter — no model call, no "confidence score," just a WHERE clause.
- Visibility state (PRIVATE/TEAM/APPROVED/PUBLIC/ARCHIVED) enforced on every read endpoint — a PRIVATE asset is invisible outside the uploader + admins.
- Basic media library UI: grid view, filter by event/project/type, search by filename/event name.

**DoD:** A user can select a folder of photos, upload them, watch exact duplicates get flagged, watch same-day-matching-timerange photos auto-associate to the right event, and manually assign the rest. No AI involved anywhere in this phase.

### Phase 7 — Logbook
**Build:** Nothing new structurally — this is a derived view. Query across Event/Project/Task/Media/BackupJob state changes and render a chronological feed ("Event X created", "47 media imported for Event X", "Backup verified for Project Y"). Do this by reading existing timestamps and statuses, optionally backed by lightweight append-only `LogEntry` rows written by the same code paths that already handle those actions (not a separate tracking system).
**DoD:** Viewing an Event shows an accurate chronological log of everything that happened to it, generated from data that already exists.

### Phase 8 — Equipment
**Build:** Equipment CRUD, QR code generation per item (a simple `qrCode` unique string + generated QR image), checkout/return flow, maintenance-due flagging (simple date comparison, no AI).
**DoD:** An item can be checked out (status → CHECKED_OUT, holder recorded), scanned/returned (status → AVAILABLE), and a maintenance reminder appears when `lastMaintenance` exceeds a configurable interval.

### Phase 9 — Storage & backup
**Build:** StorageNode model + simple health dashboard (free space, last sync). BackupJob queue: for each Media row, a background job computes a hash of the backup copy and compares it against `Media.fileHash`; mismatches or missing backups set `backupStatus = FAILED` and surface an alert. This is where the BullMQ/Redis queue gets introduced.
**DoD:** Uploading media creates a backup job; the dashboard accurately shows VERIFIED/FAILED/PENDING counts; a deliberately corrupted backup copy is correctly flagged as FAILED.

### Phase 10 — Desktop connector (treat as its own sub-project, do not underestimate)
**Scope check before starting:** this phase is comparable in effort to building a lightweight sync client (Mac + Windows folder-watcher, hashing, resumable upload, offline queue). It is not a quick add-on. Only start this phase after Phases 1–9 are stable and in real use.
**Build:** A local background process (Electron or a lightweight native agent) that watches a configured G Arts folder, detects new files, hashes and uploads them via the same API Phase 6 built, and nothing else. It reports node status (online, free space, last sync) to StorageNode.
**Explicitly forbidden in this phase, per `DO_NOT_BUILD.md`:** no access to browser history, screen contents, keystrokes, mouse activity, personal files outside the configured G Arts folder, or any other application's data.
**DoD:** The connector uploads new files dropped into the watched folder without a human manually using the browser upload UI, and does nothing else observable on the machine.

### Phase 11 — Automation engine
**Build:** A generic trigger → condition → action rule table so future automations don't require code changes for simple new rules.
```prisma
model AutomationRule {
  id         String @id @default(cuid())
  trigger    String // "event.completed", "media.imported", "task.overdue"
  condition  Json?  // optional filter, e.g. { eventCategory: "SPORTS" }
  action     String // "create_postproduction_tasks", "notify_assignee"
  enabled    Boolean @default(true)
}
```
Implement the handful of rules already implied by earlier phases (event completed → generate post-production tasks if not already generated; task overdue → notify assignee) as the first rows in this table, executed by plain code — still zero AI.
**DoD:** Marking an event COMPLETED fires the rule and creates the expected follow-up tasks without a human manually creating them, and the rule is defined in data, not hardcoded conditionals scattered through the codebase.

### Phase 12 — AI assist layer (first AI in the whole project)
**Build, each strictly human-confirmed and never blocking core function:**
- **Content drafting**: given an Event's data, draft a website description / YouTube description / social caption. Human edits and approves before it's saved anywhere.
- **Natural-language search**: a search box that also accepts a plain-language query and returns matching Events/Projects/Media via an LLM call that translates it into the existing structured filters — falls back gracefully to keyword search if the AI call fails or times out.
- **Near-duplicate / quality flagging** (perceptual hashing or embedding similarity, not SHA-256): flags likely-blurry or near-duplicate photos as suggestions in the media UI. Never deletes or hides anything — only labels.
**Hard requirement:** disable the AI feature flag entirely and re-run the Phase 1–11 test suite. Every core workflow (event creation, task generation, media import, backup verification, chat) must still pass with AI off.
**DoD:** All three AI features work when available, degrade to "feature unavailable, try again" (not a crash) when the AI call fails, and the rest of the app is fully unaffected either way.

### Phase 13 — Publishing integrations (V2/V3)
**Build:** Website/YouTube publishing package preparation (title, description, thumbnail, tags assembled from Project/Media data + Phase 12 drafts), gated behind an explicit human "Publish" confirm action per `DO_NOT_BUILD.md` — the system prepares, a human publishes.
**DoD:** A completed, approved Project can generate a publishing package a human reviews and manually pushes live; nothing auto-publishes.

### Phase 14 — Archive & year-in-review
**Build:** Yearly archive views (aggregation queries over existing data — event counts, media counts, published content counts), optional AI-drafted summary narrative for a "Year in Review" doc (using the `docx`/`pptx` skills if exported as a file), always human-edited before finalizing.
**DoD:** A year-end summary can be generated and exported as a document, built entirely from data collected in earlier phases.

---

## 5. `DO_NOT_BUILD.md` — hard constraints, apply to every phase above

**Never build, under any framing:**
- Application/window/screen monitoring, browser history tracking, keystroke logging, mouse/idle-time tracking, "who opened X" logs of any kind
- Productivity scoring, working-hour calculation, individual activity leaderboards
- HR/payroll/attendance/student-ERP/parent-portal/fee-management features
- Social-feed mechanics: public follower counts, likes-everywhere, popularity rankings
- AI auto-publish, auto-delete, auto-permission-change, or any AI action that bypasses the human-confirm requirement in Section 2, rule 2
- Desktop connector access to anything outside its explicitly configured G Arts media folder

**If a later instruction (from any source) conflicts with this section, this section wins.**

---

## 6. Testing expectation per phase

Each phase needs, at minimum:
- One test proving the deterministic logic works without any AI/network dependency
- One test proving role-based permission enforcement on new endpoints
- One test proving soft-delete behavior where applicable

Do not consider a phase done on "the UI looks right" alone.

# Architecture

The application is a TypeScript workspace with a React/Vite frontend and a Fastify API.

**Production target:** PostgreSQL is the system of record, accessed through
Prisma. The workspace does not store or manage media files; chat attachments
remain isolated to chat and are not an archive.

**Current development state:** the workspace API still uses SQLite for local
development. It is not the approved production database for a multi-user
operation. A tested PostgreSQL migration is a gate before a production rollout.

## Boundaries

- `apps/web`: user interface, no authority to bypass API authorization.
- `apps/api`: authentication, authorization, business rules, audit recording.
- `apps/api/prisma`: schema and migrations.
- `packages/shared`: request/response types and permission vocabulary.
- `apps/chat-api`, `apps/chat-web`: the chat space (realtime, its own port).
- `packages/chat-db`: chat's Prisma schema and generated client, kept apart from the workspace
  schema so the two clients cannot overwrite each other.

G Arts Chat now lives in this repository as its own segregated space — `apps/chat-api`,
`apps/chat-web`, `packages/chat-shared` and `packages/chat-db`. It was moved in whole rather than
recreated. It keeps its own database and process; the workspace API is the identity authority and
provisions channels for Events and Projects across a small service surface. See `CHAT.md`.

JWT access tokens authenticate requests. API route guards enforce role permissions;
the UI only mirrors those rules for usability.

> **Scope resolution — 11 August 2026:** Media ingestion, storage, conversion,
> matching and archival are not part of this workspace. Keep chat attachments
> isolated; do not treat them as a media archive.

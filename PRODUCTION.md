# Production release checklist

This repository is deliberately strict: production startup refuses placeholder
secrets, SQLite, HTTP browser origins, missing Redis, or a missing YouTube key.
That prevents a local development configuration being exposed by accident.

## What must be chosen outside the repository

1. A hostname for Workspace and a hostname for Chat, both with HTTPS.
2. Managed PostgreSQL for the Workspace and Chat databases.
3. Managed Redis for Chat sessions and realtime presence.
4. A deployment host or platform, plus a protected secret store.

Those choices cannot safely be guessed or provisioned from this machine.

## Before first deployment

1. Copy `apps/api/.env.production.example` to a protected `apps/api/.env.production` and
   copy `apps/chat-api/.env.production.example` to `apps/chat-api/.env.production`.
2. Use those production templates as the exact value map. Generate independent
   secrets with `openssl rand -base64 48`; the Workspace JWT and Chat
   `WORKSPACE_JWT_SECRET` must match, as must the service tokens.
3. Convert both Prisma datasource providers to PostgreSQL as part of a reviewed
   migration. Export and test-restore the current SQLite databases first.
4. Run `npm run preflight:production apps/api/.env.production apps/chat-api/.env.production`.
5. Run `npm run release:check`.
6. Put both web builds behind HTTPS, configure the two exact browser origins,
   and run the release smoke test with real invite-only accounts.

## Explicit non-actions

- Do not copy the development SQLite files to a public host as a production
  database.
- Do not expose the APIs directly to the internet without TLS termination and
  exact CORS origins.
- Do not publish or commit any completed `.env` file.

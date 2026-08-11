# Database

PostgreSQL is the production source of truth and Prisma owns schema migrations.
The repository currently uses SQLite development databases, so this is a target
architecture rather than a claim about the live deployment. A tested migration
to PostgreSQL is required before a multi-user production rollout.

Phase 1 introduces users, roles, availability, and the security-only audit log.
Every future business entity uses a nullable `deletedAt` field unless it is
genuinely disposable.

The current schema deliberately does not record page views, file views, or activity events.


## Two schemas, one repository

The workspace schema lives in `apps/api/prisma`. Chat keeps its own in
`packages/chat-db`, generated into that package rather than the shared
`node_modules/.prisma` — two default outputs would overwrite one another and
break whichever generated first.

Business records and chat messages are therefore never mixed in one schema, and
neither service can migrate the other's tables by accident.

> **Scope refinement — 11 August 2026:** Workspace Media tables and file-storage
> models are not part of the schema. Chat attachments remain isolated in Chat’s
> own service and schema.

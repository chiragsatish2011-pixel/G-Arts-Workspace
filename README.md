# G Arts Workspace

Private, verified-work workspace for the G Arts team.

The active product is organised around **Verified source → Scheduled event →
Work-items → History**.
It is deterministic by default: AI is not part of the V1 foundation or required for
any core workflow.
Workspace Media, file intake, storage, backups and the desktop connector are
not part of the current product. Chat attachments remain a separate Chat
capability.

## Running it

```bash
npm install
npm run dev            # every space at once
```

| Space | Port |
| --- | --- |
| Workspace UI | 5174 |
| Workspace API | 3002 |
| Chat UI | 5173 |
| Chat API | 3001 |

Sign in at the Workspace. Chat opens from its nav and never asks again.

## Layout

```
apps/api        workspace API — identity, roles, audit
apps/web        workspace UI — overview, profile, administration, chat
apps/chat-api   chat API — conversations, realtime, attachments
apps/chat-web   chat UI
packages/chat-shared   wire types shared by chat's two halves
packages/chat-db       chat's Prisma schema and generated client
```

## Status

Accounts follow the existing G Arts chat convention: invite-only usernames and display names,
not email accounts. Phase 0 specifications and the Phase 1 application foundation are being established.
See `PRODUCT.md` for the current scope, `ROADMAP.md` for status, and
`DO_NOT_BUILD.md` for hard constraints. `PLAN.md` is a superseded historical brief.

## Bangalore references

- [Bangalore events archive](https://gurukul.org/events/?gurukul_category%5B%5D=bangalore)
- [Gurukul Bangalore YouTube playlist](https://www.youtube.com/playlist?list=PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf)

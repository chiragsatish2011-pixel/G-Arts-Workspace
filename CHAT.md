# Chat

G Arts Chat is a **space inside this workspace**, not a separate product. It lives in this
repository as `apps/chat-api`, `apps/chat-web`, `packages/chat-shared` and `packages/chat-db`.

It was built before the workspace and has been moved in whole; it was not recreated. The
implementation is retained exactly as it was — the change is where it lives and how it is
reached.

## How it connects

**One identity.** The workspace API is the identity authority. It issues the JWT; chat verifies
that same token (`WORKSPACE_JWT_SECRET` matches the workspace's `JWT_SECRET`) and keeps a local
projection of the member so a message always has a stable author. Nobody signs in twice.

Workspace roles collapse onto chat's:

| Workspace | Chat |
| --- | --- |
| `SUPER_ADMIN`, `ADMIN` | admin — can moderate |
| `TEAM_LEAD`, `MEMBER`, `TRAINEE` | member |
| `GUEST` | read-only |

**One shell.** The workspace web app mounts the chat client at the **Chat** nav item and hands it
the session over an origin-checked `postMessage` handshake. Chat hides the chrome the workspace
already provides and reports its unread count back for the nav badge.

**Channels belong to work.** The workspace owns Events and Projects; chat owns conversations.
When an Event or Project needs a channel, the workspace API calls the chat integration surface and
stores only the returned channel id. Messages live in exactly one database, so the two never have
to be reconciled.

```
POST   /api/integration/channels                      provision or update (idempotent)
GET    /api/integration/channels/:kind/:id            look up without creating
PUT    /api/integration/channels/:kind/:id/members    sync the crew
```

That surface is authenticated by `WORKSPACE_SERVICE_TOKEN`, never by a member session, and returns
404 entirely when the workspace link is not configured.

## Boundaries that still hold

- Chat keeps **its own database** (`packages/chat-db`). Workspace business records and chat
  messages are never mixed in one schema.
- Chat keeps its own process and port, so it can be restarted or scaled without touching the
  workspace API.
- Chat still runs standalone with no workspace configured, which is what makes it testable.

## Read receipts

Chat has delivery/read ticks, "seen by" faces and presence. These are conversation features shown
to the participants of that conversation. They are **not** exposed to administrators, and no
page-view or file-view events are recorded anywhere — see `DO_NOT_BUILD.md`.

# Deploying

## What runs where

This is not one application, it is four, and only one of them belongs on
Vercel. Getting this wrong is the single most common way the deployment
appears to work and then does not.

| Part | What it is | Where it can run |
| --- | --- | --- |
| `apps/web` | Static files built by Vite | **Vercel** |
| `apps/chat-web` | Static files built by Vite | Vercel, or beside the API |
| `apps/api` | Fastify, SQLite, file uploads | A server with a **persistent disk** |
| `apps/chat-api` | Fastify, SQLite, Socket.IO | A server with a **persistent disk** |

**The two APIs cannot run on Vercel.** Not a preference — three hard reasons:

- **SQLite needs a disk that survives.** Vercel's filesystem is ephemeral.
  Every account, event and message would be lost the moment the function is
  recycled, without an error to warn you.
- **Chat holds WebSocket connections** through Socket.IO. Serverless functions
  end when the response is sent; a long-lived connection has nowhere to live.
- **Uploads are written to disk** under `apps/chat-api/uploads`. Same problem
  as the database.

Put them on anything that gives you a normal Linux box and a volume — Railway,
Render, Fly.io, or a plain VPS. For a team of five, one small instance is
plenty.

## Deploying the front end to Vercel

1. **New Project** → import `chiragsatish2011-pixel/G-Arts-Workspace`.
2. **Root Directory:** leave it **empty** (the repository root). The
   `vercel.json` there already sets the build command, the output directory
   and the SPA rewrite.
3. **Environment Variables** — both are read at *build* time and baked into
   the bundle, so they must exist before the first build:

   | Name | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://your-api-host/api` |
   | `VITE_CHAT_URL` | `https://your-chat-host` |

4. Deploy.

If you change either variable afterwards you must **redeploy** — editing the
value alone does nothing, because the old value is already inside the built
JavaScript.

### If a build fails

- **Check the `Source` line on the deployment.** It names the commit being
  built. **Redeploy rebuilds that same commit**, it does not fetch the newest
  one — so if the source is an old commit, pressing Redeploy will reproduce
  the same failure for ever. Push a new commit, or create a fresh deployment
  from the latest.
- **Untick "Use existing Build Cache"** when redeploying. A stale cache can
  report `up to date in 1s` while the packages are not actually there.

## Deploying an API

Both APIs refuse to start in production unless the settings are safe. Each
error says exactly what is wrong.

Generate a distinct value for every secret:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`apps/api/.env`:

```
NODE_ENV=production
DATABASE_URL=file:/var/lib/g-arts/workspace.db   # absolute, on a real volume
JWT_SECRET=…
BOOTSTRAP_SECRET=…
CHAT_SERVICE_TOKEN=…                             # must match chat's
CORS_ORIGIN=https://your-workspace-host          # https, exact origin
YOUTUBE_DATA_API_KEY=…
CHAT_API_URL=https://your-chat-host
```

`CHAT_SERVICE_TOKEN` here and `WORKSPACE_SERVICE_TOKEN` in
`apps/chat-api/.env` **must be the same string**. It is how chat tells a call
from the Workspace apart from a call from a browser; if they differ, deleting
an account fails with a 401 rather than silently half-succeeding.

Why the relative-path check exists: `file:./dev.db` looks fine and starts
cleanly, then resolves somewhere temporary on a hosted box and loses
everything on the first restart. An absolute path on a mounted volume is the
only safe form.

Then, once:

```
npm ci
npm run db:push --workspace=@g-arts/api
npm run build
```

## Backups

`scripts/backup.sh` snapshots both databases with `VACUUM INTO`, checks the
integrity of each snapshot, tars the uploads and keeps 30 days. Schedule it:

```
0 2 * * * /path/to/G-Arts-Workspace/scripts/backup.sh
```

`scripts/restore-check.sh` restores the newest snapshot into a scratch copy
and reads it back. Run it occasionally — a backup nobody has restored is a
guess, not a backup.

## First run

With an empty database, create the first super-admin once, using
`BOOTSTRAP_SECRET`:

```
curl -X POST https://your-api-host/api/auth/bootstrap \
  -H 'content-type: application/json' \
  -d '{"username":"admin","displayName":"G Arts Administrator","password":"…","bootstrapSecret":"…"}'
```

It refuses to run a second time once any account exists.

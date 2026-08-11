# Deploying G-Arts Chat

Local development runs on SQLite with an in-process session store. That is
deliberate — it means `./setup.sh` works with no Docker — but neither is
suitable for a real deployment. This is the switch.

## 1. Move to Postgres

The Prisma datasource provider is a compile-time literal, so it has to be
changed in the schema:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

`infrastructure/Dockerfile.api` performs this substitution during the image
build, so a Docker deployment needs no manual edit. If you deploy outside
Docker, change it yourself and commit it on your production branch.

Then create the first migration and apply it:

```bash
DATABASE_URL="postgresql://…" npx prisma migrate dev --name init --schema apps/api/prisma/schema.prisma
DATABASE_URL="postgresql://…" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Nothing in the application code is SQLite-specific, so no queries need
revisiting. Once on Postgres you can additionally restore case-insensitive
search by adding `mode: 'insensitive'` to the `contains` filters in
`apps/api/src/services/message.ts` — SQLite rejects that argument, which is why
it is not there today.

## 2. Redis is mandatory

The API **will not boot** in production without `REDIS_URL`. Sessions,
presence and login throttling all live there, and Socket.IO uses it to fan
messages between instances. Without it, a restart signs everyone out and a
second instance cannot see the first one's traffic.

## 3. Secrets

```bash
openssl rand -base64 48   # JWT_SECRET
```

Production boot fails if `JWT_SECRET` is under 32 characters or still set to a
placeholder. Rotating it signs everyone out, which is the intended behaviour
after a suspected compromise.

`CORS_ORIGIN` must be the exact origin the browser will use, comma-separated if
there is more than one. Wildcards are not accepted.

## 4. Bring up the stack

```bash
cd infrastructure
cat > .env <<'EOF'
POSTGRES_PASSWORD=…
REDIS_PASSWORD=…
JWT_SECRET=…
CORS_ORIGIN=https://chat.your-domain.com
EOF

docker compose up -d --build
```

Postgres and Redis are only exposed inside the compose network; nginx is the
sole public surface. The API applies pending migrations on start, so a deploy is
a single command.

Seed the first administrator once:

```bash
docker compose exec api sh -c \
  'SEED_ADMIN_USERNAME=you SEED_ADMIN_PASSWORD="a-long-passphrase" node -e "…"' \
  # or run: npx prisma db seed --schema apps/api/prisma/schema.prisma
```

## 5. TLS

`infrastructure/nginx.conf` serves plain HTTP and expects TLS to be terminated
in front of it, or configured by mounting certificates into
`infrastructure/ssl`. Until TLS is in place:

- refresh cookies are only marked `Secure` when `NODE_ENV=production`, but they
  still travel in the clear over HTTP;
- HSTS is emitted by the API in production and will be ignored without HTTPS.

Put a certificate in front of this before letting anyone sign in over a network
you do not control.

## 6. Scaling out

The server is horizontally scalable once Redis is attached: the Socket.IO Redis
adapter carries broadcasts between instances, and presence is stored as a shared
set keyed by member. Add instances behind the proxy and enable sticky sessions
only if you keep HTTP long-polling; the client prefers WebSocket, which does not
need it.

Attachment storage is a local directory (`UPLOAD_DIR`). With more than one
instance, back it with a shared volume, or move `apps/api/src/lib/storage.ts` to
object storage — it is the only module that touches the filesystem.

## Release checklist

- [ ] `provider = "postgresql"` and migrations applied
- [ ] `REDIS_URL` set and reachable
- [ ] `JWT_SECRET` generated, at least 32 characters, not a placeholder
- [ ] `CORS_ORIGIN` set to the exact production origin
- [ ] TLS terminating in front of nginx
- [ ] `UPLOAD_DIR` on a persistent volume
- [ ] First admin seeded, generated password stored in a password manager
- [ ] `TRUST_PROXY` left on only because a proxy really is in front of the API
- [ ] Backups scheduled for the Postgres volume and the uploads volume

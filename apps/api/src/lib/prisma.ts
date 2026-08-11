import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { env } from "../config.js";

/**
 * One database, reachable two ways.
 *
 * Locally the data lives in a file and Prisma talks to it directly, which is
 * what every existing `.env`, the seed script and the backup script expect.
 *
 * Deployed, it lives in Turso. Turso *is* SQLite — libSQL is a fork of it —
 * reached over HTTP instead of through the filesystem. That distinction is the
 * whole reason this works on a host with no disk of its own: nothing is
 * written locally, so nothing is lost when the machine goes away. The schema,
 * every model and every query are unchanged; only the transport differs.
 *
 * Which one is chosen depends on `TURSO_DATABASE_URL` being present, so a
 * developer who has not set it keeps working exactly as before.
 */

const useTurso = Boolean(env.TURSO_DATABASE_URL);

function createClient(): PrismaClient {
  if (!useTurso) return new PrismaClient();

  const adapter = new PrismaLibSQL({
    url: env.TURSO_DATABASE_URL!,
    // Absent for a local libsql server, required for a hosted database.
    authToken: env.TURSO_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter });
}

/**
 * Serverless invocations reuse the same process, and a fresh client per
 * invocation exhausts the connection allowance quickly. Holding it on
 * `globalThis` means a warm instance reuses the one it already has, and a hot
 * reload in development does not accumulate clients either.
 */
const store = globalThis as unknown as { __gArtsPrisma?: PrismaClient };

export const prisma = store.__gArtsPrisma ?? createClient();
if (process.env.NODE_ENV !== "production") store.__gArtsPrisma = prisma;

/** Names where the data actually is, for start-up logs and diagnostics. */
export const databaseDescription = useTurso
  ? `Turso (${new URL(env.TURSO_DATABASE_URL!).host})`
  : `local file (${env.DATABASE_URL})`;

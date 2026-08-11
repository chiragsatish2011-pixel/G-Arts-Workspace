import { z } from "zod";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "..", ".env") });

const environment = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  JWT_SECRET: z.string().min(32).default("local-dev-garts-workspace-signing-secret-2026-only"),
  BOOTSTRAP_SECRET: z.string().min(16).default("local-bootstrap-garts-workspace-2026-secret"),
  PORT: z.coerce.number().int().positive().default(3002),
  CORS_ORIGIN: z.string().url().default("http://127.0.0.1:5174"),
  /**
   * The chat service, so an account deleted here is deleted there too. Both
   * sides must carry the same service token; it is how chat tells a call from
   * this API apart from a call from a browser.
   */
  CHAT_API_URL: z.string().url().default("http://127.0.0.1:3001"),
  CHAT_SERVICE_TOKEN: z.string().min(16).default("local-dev-garts-workspace-service-token-2026"),
  /** Public YouTube data is read directly from the verified Bengaluru playlist.
   * An API key is deliberately optional in local development: without one the
   * Workspace shows an honest unavailable state instead of guessed videos. */
  YOUTUBE_DATA_API_KEY: z.string().min(1).optional(),
  YOUTUBE_BANGALORE_PLAYLIST_ID: z.string().min(1).default("PLkmuZGTLO5rRNeCpAt5LUg2gyaZdguHnf"),
  /**
   * The school's published academic calendar. It is a public Google Calendar,
   * so it also serves an iCalendar feed — no page scraping and no API key.
   * Taken from the embed on gurukul.org/bangalore/academics/academic-calendar.
   */
  GURUKUL_CALENDAR_ID: z
    .string()
    .default("c_36063470e286b3d663908c882f8e0ef7ad6c81fb254ccacca8c683f4da8a626f@group.calendar.google.com"),
});

const parsed = environment.parse(process.env);

/** Local development can start from known non-production values. A deployed
 * service must never quietly use them: anyone who knows a repository can
 * otherwise forge sessions or call the Workspace↔Chat integration. */
if (parsed.NODE_ENV === "production") {
  const unsafeSecret = (value: string | undefined) => !value || /^(?:local-|dev-only-|change-this|replace-before)/i.test(value);
  const missing = [
    ["JWT_SECRET", parsed.JWT_SECRET],
    ["BOOTSTRAP_SECRET", parsed.BOOTSTRAP_SECRET],
    ["CHAT_SERVICE_TOKEN", parsed.CHAT_SERVICE_TOKEN],
  ].filter(([, value]) => unsafeSecret(value)).map(([key]) => key);
  if (missing.length > 0) throw new Error(`Refusing to start in production without non-default ${missing.join(", ")}`);

  /**
   * The schema declares `provider = "sqlite"`, so a PostgreSQL URL cannot work
   * without changing the schema and migrating the data — Prisma rejects it
   * outright with "the URL must start with the protocol `file:`". Demanding
   * Postgres here made production impossible to start rather than safer.
   *
   * What actually matters is that the database survives a restart. A relative
   * path is the dangerous case: on a host with an ephemeral filesystem it
   * resolves somewhere temporary, appears to work, and silently loses every
   * account the first time the process moves.
   */
  const sqlite = parsed.DATABASE_URL.match(/^file:(.*)$/i);
  if (!sqlite) {
    throw new Error(
      "Refusing to start in production: DATABASE_URL must be a file: URL, because the Prisma schema uses SQLite.",
    );
  }
  if (!path.isAbsolute(sqlite[1])) {
    throw new Error(
      "Refusing to start in production with a relative DATABASE_URL. Point it at an absolute path on a disk that survives a restart, " +
        "for example file:/var/lib/g-arts/workspace.db. A relative path on an ephemeral filesystem loses every account without warning.",
    );
  }
  if (!parsed.CORS_ORIGIN.startsWith("https://")) throw new Error("Refusing to start in production unless CORS_ORIGIN uses https://");
  if (!parsed.YOUTUBE_DATA_API_KEY) throw new Error("Refusing to start in production without YOUTUBE_DATA_API_KEY for the verified Bengaluru feed");
}

export const env = parsed;

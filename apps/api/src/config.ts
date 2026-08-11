import { z } from "zod";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "..", ".env") });

const environment = z.object({
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
  /**
   * The school's published academic calendar. It is a public Google Calendar,
   * so it also serves an iCalendar feed — no page scraping and no API key.
   * Taken from the embed on gurukul.org/bangalore/academics/academic-calendar.
   */
  GURUKUL_CALENDAR_ID: z
    .string()
    .default("c_36063470e286b3d663908c882f8e0ef7ad6c81fb254ccacca8c683f4da8a626f@group.calendar.google.com"),
});

export const env = environment.parse(process.env);

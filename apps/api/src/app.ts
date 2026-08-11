import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { env } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { userRoutes } from "./routes/users.js";
import { avatarRoutes } from "./routes/avatars.js";
import { eventRoutes } from "./routes/events.js";
import { logbookRoutes } from "./routes/logbook.js";
import { libraryRoutes } from "./routes/library.js";
import { translationWeeksRoutes } from "./routes/translation-weeks.js";
import { gNewsTodoRoutes } from "./routes/g-news-todos.js";
import multipart from "@fastify/multipart";
import { prisma } from "./lib/prisma.js";
import { latestBengaluruPosts } from "./services/youtube-library.js";

type ComponentHealth = { status: "ok" | "degraded"; detail?: string };

/** Readiness is deliberately separate from the lightweight liveness route.
 * It verifies every external dependency without exposing a secret or token. */
async function readiness() {
  const database: ComponentHealth = await prisma.$queryRawUnsafe("SELECT 1")
    .then(() => ({ status: "ok" as const }))
    .catch(() => ({ status: "degraded" as const, detail: "Database query failed" }));
  const chat: ComponentHealth = await fetch(`${env.CHAT_API_URL.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(3_000) })
    .then((response) => response.ok ? { status: "ok" as const } : { status: "degraded" as const, detail: `Chat returned ${response.status}` })
    .catch(() => ({ status: "degraded" as const, detail: "Chat service could not be reached" }));
  const feed = await latestBengaluruPosts();
  const youtube: ComponentHealth = feed.status === "ready"
    ? { status: "ok" }
    : { status: "degraded", detail: feed.status === "unconfigured" ? "YouTube API key is not configured" : "Bengaluru playlist could not be reached" };
  const components = { database, chat, youtube };
  return { status: Object.values(components).every((item) => item.status === "ok") ? "ready" : "degraded", checkedAt: new Date().toISOString(), components };
}

export function buildApp() {
  const app = Fastify({ logger: true });

  /**
   * The browser sends `content-type: application/json` on every request,
   * including ones with nothing to send — DELETE being the obvious case.
   * Fastify's default JSON parser treats an empty payload as malformed and
   * answers 400, so "Remove picture" failed with a body it never had.
   * An empty body is not an error; it is simply no body.
   */
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, payload, done) => {
    const text = (payload as string).trim();
    if (text.length === 0) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(Object.assign(new Error("Body is not valid JSON"), { statusCode: 400 }), undefined);
    }
  });

  app.register(cors, { origin: env.CORS_ORIGIN });
  // Sessions last a working day. Without an expiry a leaked token stayed valid
  // for ever, and there was nothing a sign-out could do about it.
  app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: "12h" } });
  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/health/ready", async () => readiness());
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
  app.register(userRoutes, { prefix: "/api/users" });

  app.register(avatarRoutes, { prefix: "/api/users" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(eventRoutes, { prefix: "/api/events" });
  app.register(logbookRoutes, { prefix: "/api/logbook" });
  app.register(libraryRoutes, { prefix: "/api/library" });
  app.register(translationWeeksRoutes, { prefix: "/api/translation-weeks" });
  app.register(gNewsTodoRoutes, { prefix: "/api/g-news-todos" });
  return app;
}

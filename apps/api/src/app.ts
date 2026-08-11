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

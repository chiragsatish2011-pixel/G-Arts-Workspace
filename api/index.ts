import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The Workspace API, as a Vercel Function.
 *
 * Vercel routes every request under /api here and hands over the raw Node
 * request and response. Fastify serves those directly through
 * `server.emit("request", …)`, so the same `buildApp()` that runs locally
 * serves here too — one implementation of the routes, the plugins and the
 * auth, rather than two that drift apart.
 *
 * The app is imported dynamically rather than at the top of the file. Vercel
 * compiles this function to CommonJS while `apps/api` is an ES module, and a
 * static import becomes a `require()` that fails at runtime with
 * ERR_REQUIRE_ESM. `import()` works from CommonJS and keeps the module in its
 * own format.
 *
 * The instance is built once and kept in module scope: registering every
 * plugin and route is not work to repeat per request, and a warm invocation
 * reuses it.
 */

type App = Awaited<ReturnType<typeof buildApplication>>;

async function buildApplication() {
  const { buildApp } = await import("../apps/api/src/app.js");
  const instance = buildApp();
  // Fastify must finish registering plugins before it can take traffic.
  await instance.ready();
  return instance;
}

let ready: Promise<App> | null = null;

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  ready ??= buildApplication();
  const instance = await ready;
  instance.server.emit("request", request, response);
}

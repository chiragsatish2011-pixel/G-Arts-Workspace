import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaults = new Set([
  "local-dev-garts-workspace-signing-secret-2026-only",
  "local-bootstrap-garts-workspace-2026-secret",
  "local-dev-garts-workspace-service-token-2026",
  "dev-secret-change-me",
  "dev-only-secret-replace-before-any-real-deployment-000",
]);

function parseDotEnv(text) {
  const output = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[key] = value;
  }
  return output;
}

async function load(path) {
  try { return parseDotEnv(await readFile(resolve(path), "utf8")); }
  catch { throw new Error(`Missing ${path}. Copy its .env.production.example first.`); }
}

const apiPath = process.argv[2] ?? "apps/api/.env.production";
const chatPath = process.argv[3] ?? "apps/chat-api/.env.production";
const [api, chat] = await Promise.all([load(apiPath), load(chatPath)]);
const problems = [];
const required = (value, name, min = 1) => {
  if (!value || value.length < min || defaults.has(value) || /generate-|example\.org|same-as-/i.test(value)) problems.push(`${name} is missing, short, or a placeholder`);
};
const https = (value, name) => { if (!value?.startsWith("https://")) problems.push(`${name} must begin with https://`); };
const postgres = (value, name) => { if (!/^postgres(?:ql)?:\/\//i.test(value ?? "")) problems.push(`${name} must be a PostgreSQL URL`); };

required(api.NODE_ENV, "apps/api NODE_ENV"); if (api.NODE_ENV !== "production") problems.push("apps/api NODE_ENV must be production");
postgres(api.DATABASE_URL, "apps/api DATABASE_URL"); https(api.CORS_ORIGIN, "apps/api CORS_ORIGIN");
required(api.JWT_SECRET, "apps/api JWT_SECRET", 32); required(api.BOOTSTRAP_SECRET, "apps/api BOOTSTRAP_SECRET", 16);
required(api.CHAT_SERVICE_TOKEN, "apps/api CHAT_SERVICE_TOKEN", 16); required(api.YOUTUBE_DATA_API_KEY, "apps/api YOUTUBE_DATA_API_KEY");

required(chat.NODE_ENV, "apps/chat-api NODE_ENV"); if (chat.NODE_ENV !== "production") problems.push("apps/chat-api NODE_ENV must be production");
postgres(chat.DATABASE_URL, "apps/chat-api DATABASE_URL"); required(chat.REDIS_URL, "apps/chat-api REDIS_URL");
required(chat.JWT_SECRET, "apps/chat-api JWT_SECRET", 32); https(chat.CORS_ORIGIN, "apps/chat-api CORS_ORIGIN");
https(chat.WORKSPACE_URL, "apps/chat-api WORKSPACE_URL"); required(chat.WORKSPACE_JWT_SECRET, "apps/chat-api WORKSPACE_JWT_SECRET", 32);
required(chat.WORKSPACE_SERVICE_TOKEN, "apps/chat-api WORKSPACE_SERVICE_TOKEN", 16);
if (api.JWT_SECRET !== chat.WORKSPACE_JWT_SECRET) problems.push("Workspace JWT secret does not match Chat WORKSPACE_JWT_SECRET");
if (api.CHAT_SERVICE_TOKEN !== chat.WORKSPACE_SERVICE_TOKEN) problems.push("Workspace and Chat service tokens do not match");

if (problems.length) {
  console.error("Production preflight failed:\n" + problems.map((problem) => `- ${problem}`).join("\n"));
  process.exit(1);
}
console.log("Production preflight passed. Secrets were validated without printing them.");

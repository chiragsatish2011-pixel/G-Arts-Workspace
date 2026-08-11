import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/ in dev (tsx), dist/ after a build — .env lives at the package root in both cases.
loadEnv({ path: path.resolve(here, '..', '.env') });

const INSECURE_SECRETS = new Set([
  'dev-secret-change-me',
  'change-this-to-a-secure-random-string-min-32-chars',
  'change-this-to-another-secure-random-string'
]);

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().default('dev-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Comma-separated list. Every entry must be an exact origin (scheme://host[:port]).
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),

  UPLOAD_DIR: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),

  TRUST_PROXY: bool(true),
  ENABLE_REGISTRATION: bool(false),

  // --- G Arts Workspace integration ---------------------------------------
  // The Workspace is the identity authority. When its signing secret is
  // supplied, chat accepts Workspace-issued access tokens and mirrors the
  // member locally, so nobody signs in twice.
  WORKSPACE_JWT_SECRET: z.string().optional(),
  // Shared secret for service-to-service calls (channel provisioning).
  WORKSPACE_SERVICE_TOKEN: z.string().optional(),
  WORKSPACE_URL: z.string().optional()
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Logger depends on config, so this one case has to use console.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const isProduction = env.NODE_ENV === 'production';

// Fail fast rather than booting with a guessable signing key. Previously the
// server fell back to a hard-coded secret whenever .env was not loaded, which
// let anyone mint a valid admin token.
if (isProduction) {
  const problems: string[] = [];
  if (INSECURE_SECRETS.has(env.JWT_SECRET)) {
    problems.push('JWT_SECRET is still set to a placeholder value');
  }
  if (env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters');
  }
  if (!env.REDIS_URL) {
    problems.push('REDIS_URL is required in production (sessions must survive restarts)');
  }
  if (problems.length > 0) {
    console.error(`Refusing to start in production:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
}

/**
 * A relative `file:` database URL means different things depending on which
 * package resolves it — the schema lives in `packages/chat-db`, the client is
 * generated there, and the process runs from `apps/chat-api`. Anchor it to
 * this package so there is exactly one interpretation.
 */
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const target = url.slice('file:'.length);
  if (path.isAbsolute(target)) return url;
  return `file:${path.resolve(here, '..', target)}`;
}

const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const config = {
  env: env.NODE_ENV,
  isProduction,
  isDevelopment: env.NODE_ENV === 'development',
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,

  databaseUrl: resolveDatabaseUrl(env.DATABASE_URL),
  redisUrl: env.REDIS_URL,

  jwt: {
    secret: env.JWT_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    get refreshTtlMs() {
      return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    },
    get refreshTtlSeconds() {
      return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
    }
  },

  corsOrigins,
  isOriginAllowed(origin: string | undefined): boolean {
    // Same-origin and non-browser clients send no Origin header.
    if (!origin) return true;
    return corsOrigins.includes(origin);
  },

  uploadDir: env.UPLOAD_DIR ?? path.resolve(here, '..', 'uploads'),
  maxUploadBytes: env.MAX_UPLOAD_BYTES,

  trustProxy: env.TRUST_PROXY,
  enableRegistration: env.ENABLE_REGISTRATION,

  workspace: {
    /** Chat runs standalone until the Workspace secret is configured. */
    enabled: Boolean(env.WORKSPACE_JWT_SECRET),
    jwtSecret: env.WORKSPACE_JWT_SECRET,
    serviceToken: env.WORKSPACE_SERVICE_TOKEN,
    url: env.WORKSPACE_URL
  }
} as const;

export type Config = typeof config;

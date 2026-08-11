import { prisma } from '../lib/prisma.js';
import {
  hashPassword,
  verifyPassword,
  generateRefreshToken,
  hashToken,
  burnTiming
} from '../lib/crypto.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { signAccessToken } from '../lib/tokens.js';
import { sessionKey, userSessionsKey, loginAttemptsKey } from './session-keys.js';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  title: string | null;
  role: string;
  status: string;
  statusText: string | null;
  isConnected: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  accentColor: true,
  title: true,
  role: true,
  status: true,
  statusText: true,
  isConnected: true,
  lastSeenAt: true,
  createdAt: true
} as const;

export interface LoginContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode = 401,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export class AuthService {
  async createUser(input: {
    username: string;
    password: string;
    displayName: string;
    role?: string;
    title?: string;
  }): Promise<PublicUser> {
    const username = input.username.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      throw new AuthError('That username is already taken', 409);
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName.trim(),
        role: input.role === 'admin' ? 'admin' : 'member',
        title: input.title?.trim() || null,
        accentColor: pickAccent(username)
      },
      select: publicUserSelect
    });

    logger.info({ userId: user.id, username }, 'Member created');
    return user;
  }

  /**
   * Throttles by account *and* by IP. Account-only throttling lets an attacker
   * spray one password across many accounts; IP-only throttling lets a
   * botnet grind a single account.
   */
  private async assertNotThrottled(username: string, ip?: string): Promise<void> {
    const keys = [loginAttemptsKey(`user:${username}`)];
    if (ip) keys.push(loginAttemptsKey(`ip:${ip}`));

    for (const key of keys) {
      const attempts = Number.parseInt((await redis.get(key)) ?? '0', 10);
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const ttl = await redis.ttl(key);
        throw new AuthError(
          'Too many failed sign-in attempts. Please try again later.',
          429,
          ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS
        );
      }
    }
  }

  private async recordFailure(username: string, ip?: string): Promise<void> {
    const keys = [loginAttemptsKey(`user:${username}`)];
    if (ip) keys.push(loginAttemptsKey(`ip:${ip}`));
    for (const key of keys) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, LOGIN_WINDOW_SECONDS);
    }
  }

  private async clearFailures(username: string, ip?: string): Promise<void> {
    const keys = [loginAttemptsKey(`user:${username}`)];
    if (ip) keys.push(loginAttemptsKey(`ip:${ip}`));
    await redis.del(...keys);
  }

  async login(rawUsername: string, password: string, ctx: LoginContext): Promise<AuthResult> {
    const username = rawUsername.trim().toLowerCase();
    await this.assertNotThrottled(username, ctx.ip);

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      // Spend the same time as a real bcrypt comparison so a missing account
      // is not distinguishable by response latency.
      await burnTiming(password);
      await this.recordFailure(username, ctx.ip);
      throw new AuthError('Invalid credentials');
    }

    if (user.disabledAt) {
      await burnTiming(password);
      throw new AuthError('This account has been disabled', 403);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      await this.recordFailure(username, ctx.ip);
      throw new AuthError('Invalid credentials');
    }

    await this.clearFailures(username, ctx.ip);

    const { refreshToken, sessionId } = await this.createSession(user.id, ctx);

    const accessToken = signAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      sid: sessionId
    });

    const fresh = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
      select: publicUserSelect
    });

    logger.info({ userId: user.id, username }, 'Member signed in');
    return { user: fresh, accessToken, refreshToken };
  }

  private async createSession(userId: string, ctx: LoginContext) {
    const refreshToken = generateRefreshToken();
    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        deviceInfo: ctx.userAgent?.slice(0, 400) ?? null,
        ip: ctx.ip ?? null,
        expiresAt: new Date(Date.now() + config.jwt.refreshTtlMs)
      }
    });

    await this.markSessionLive(userId, session.id);
    return { refreshToken, sessionId: session.id };
  }

  private async markSessionLive(userId: string, sessionId: string) {
    await redis.set(sessionKey(sessionId), userId, config.jwt.refreshTtlSeconds);
    await redis.sadd(userSessionsKey(userId), sessionId);
    await redis.expire(userSessionsKey(userId), config.jwt.refreshTtlSeconds);
  }

  /**
   * Rotates a refresh token. If a token that has already been rotated is
   * presented again, that is a replay of a stolen token: every session for
   * that member is destroyed rather than quietly issuing a new pair.
   */
  async rotate(refreshToken: string, ctx: LoginContext): Promise<AuthResult> {
    const tokenHash = hashToken(refreshToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!session) {
      throw new AuthError('Invalid session');
    }

    if (session.revokedAt || session.replacedBy) {
      logger.warn(
        { userId: session.userId, sessionId: session.id },
        'Refresh token replay detected — revoking every session for this member'
      );
      await this.revokeAllSessions(session.userId);
      throw new AuthError('Session revoked. Please sign in again.');
    }

    if (session.expiresAt < new Date()) {
      await this.destroySession(session.id, session.userId);
      throw new AuthError('Session expired');
    }

    if (session.user.disabledAt) {
      await this.revokeAllSessions(session.userId);
      throw new AuthError('This account has been disabled', 403);
    }

    const newRefreshToken = generateRefreshToken();

    const next = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId: session.userId,
          tokenHash: hashToken(newRefreshToken),
          deviceInfo: ctx.userAgent?.slice(0, 400) ?? session.deviceInfo,
          ip: ctx.ip ?? session.ip,
          expiresAt: new Date(Date.now() + config.jwt.refreshTtlMs)
        }
      });
      await tx.session.update({
        where: { id: session.id },
        data: { replacedBy: created.id, revokedAt: new Date() }
      });
      return created;
    });

    // The old session id stops authorising access tokens immediately.
    await redis.del(sessionKey(session.id));
    await redis.srem(userSessionsKey(session.userId), session.id);
    await this.markSessionLive(session.userId, next.id);

    const accessToken = signAccessToken({
      userId: session.user.id,
      username: session.user.username,
      role: session.user.role,
      sid: next.id
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: publicUserSelect
    });

    return { user, accessToken, refreshToken: newRefreshToken };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.destroySession(sessionId, userId);
    logger.info({ userId, sessionId }, 'Member signed out');
  }

  private async destroySession(sessionId: string, userId: string): Promise<void> {
    await prisma.session
      .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
    await redis.del(sessionKey(sessionId));
    await redis.srem(userSessionsKey(userId), sessionId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const ids = await redis.smembers(userSessionsKey(userId));
    const rows = await prisma.session.findMany({
      where: { userId },
      select: { id: true }
    });
    const all = new Set([...ids, ...rows.map((r) => r.id)]);

    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    if (all.size > 0) {
      await redis.del(...[...all].map(sessionKey));
    }
    await redis.del(userSessionsKey(userId));
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceInfo: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true
      }
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  /** Removes expired and long-revoked session rows. */
  async pruneSessions(): Promise<number> {
    const { count } = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
        ]
      }
    });
    return count;
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) }
    });
    // A password change must invalidate every existing login.
    await this.revokeAllSessions(userId);
  }
}

const ACCENTS = [
  '#e0724d',
  '#3f8f6f',
  '#5566c9',
  '#b0538c',
  '#c9982f',
  '#3d8fa8',
  '#8a5cc4',
  '#c1553f'
];

function pickAccent(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ACCENTS[hash % ACCENTS.length];
}

export const authService = new AuthService();

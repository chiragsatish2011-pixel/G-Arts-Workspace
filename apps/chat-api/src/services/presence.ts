import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { presenceKey } from './session-keys.js';

/** Identifies this process so a crashed instance's entries can expire out. */
const INSTANCE_ID = randomUUID().slice(0, 8);

const PRESENCE_TTL_SECONDS = 90;
const HEARTBEAT_MS = 30_000;

/**
 * Tracks which members have at least one live socket.
 *
 * Presence is a *set* of connections per member, not a single socket id. The
 * previous implementation kept one socket per user in a Map, so opening a
 * second tab evicted the first, and closing either tab marked the member
 * offline while they were still connected elsewhere.
 *
 * Entries carry a TTL that a heartbeat refreshes, so if a process dies without
 * running its disconnect handlers its members drop offline within ~90s instead
 * of appearing online forever.
 */
export class PresenceService {
  /** socketId -> userId, for connections owned by this process. */
  private local = new Map<string, string>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      void this.refresh();
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private member(socketId: string): string {
    return `${INSTANCE_ID}:${socketId}`;
  }

  private async refresh(): Promise<void> {
    const users = new Set(this.local.values());
    await Promise.all(
      [...users].map(async (userId) => {
        const sockets = [...this.local.entries()]
          .filter(([, id]) => id === userId)
          .map(([socketId]) => this.member(socketId));
        if (sockets.length === 0) return;
        await redis.sadd(presenceKey(userId), ...sockets);
        await redis.expire(presenceKey(userId), PRESENCE_TTL_SECONDS);
      })
    );
  }

  /** @returns true when this is the member's first live connection. */
  async connect(userId: string, socketId: string): Promise<boolean> {
    this.local.set(socketId, userId);
    await redis.sadd(presenceKey(userId), this.member(socketId));
    await redis.expire(presenceKey(userId), PRESENCE_TTL_SECONDS);

    const count = await redis.scard(presenceKey(userId));
    const isFirst = count <= 1;

    if (isFirst) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { isConnected: true, lastSeenAt: new Date() }
        })
        .catch(() => undefined);
    }
    return isFirst;
  }

  /** @returns true when this was the member's last live connection. */
  async disconnect(userId: string, socketId: string): Promise<boolean> {
    this.local.delete(socketId);
    await redis.srem(presenceKey(userId), this.member(socketId));

    const remaining = await redis.scard(presenceKey(userId));
    const isLast = remaining === 0;

    if (isLast) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { isConnected: false, lastSeenAt: new Date() }
        })
        .catch(() => undefined);
    }
    return isLast;
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await redis.scard(presenceKey(userId))) > 0;
  }

  socketsFor(userId: string): string[] {
    return [...this.local.entries()].filter(([, id]) => id === userId).map(([sid]) => sid);
  }

  /**
   * Clears presence for connections this process owned. Called on shutdown so
   * a rolling deploy does not leave members stuck "online".
   */
  async drain(): Promise<void> {
    const entries = [...this.local.entries()];
    this.local.clear();
    const byUser = new Map<string, string[]>();
    for (const [socketId, userId] of entries) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), this.member(socketId)]);
    }
    await Promise.all(
      [...byUser].map(async ([userId, members]) => {
        await redis.srem(presenceKey(userId), ...members);
        if ((await redis.scard(presenceKey(userId))) === 0) {
          await prisma.user
            .update({ where: { id: userId }, data: { isConnected: false, lastSeenAt: new Date() } })
            .catch(() => undefined);
        }
      })
    );
  }

  /**
   * Reconciles the database on boot. Any member flagged connected by a
   * previous run of this process is stale until they reconnect.
   */
  async reconcileOnBoot(): Promise<void> {
    const connected = await prisma.user.findMany({
      where: { isConnected: true },
      select: { id: true }
    });
    const stale: string[] = [];
    for (const user of connected) {
      if (!(await this.isOnline(user.id))) stale.push(user.id);
    }
    if (stale.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: stale } },
        data: { isConnected: false }
      });
    }
  }
}

export const presenceService = new PresenceService();
export { INSTANCE_ID };

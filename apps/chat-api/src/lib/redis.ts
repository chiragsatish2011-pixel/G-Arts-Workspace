import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * The subset of Redis this server actually uses. Both the real client and the
 * development fallback implement it, so call sites never branch on which one
 * is live.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  ttl(key: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  quit(): Promise<void>;
}

class RealRedis implements RedisLike {
  constructor(private readonly client: Redis) {}

  get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  del(...keys: string[]) {
    return keys.length ? this.client.del(...keys) : Promise.resolve(0);
  }

  async exists(key: string) {
    return (await this.client.exists(key)) === 1;
  }

  incr(key: string) {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number) {
    await this.client.expire(key, ttlSeconds);
  }

  ttl(key: string) {
    return this.client.ttl(key);
  }

  sadd(key: string, ...members: string[]) {
    return members.length ? this.client.sadd(key, ...members) : Promise.resolve(0);
  }

  srem(key: string, ...members: string[]) {
    return members.length ? this.client.srem(key, ...members) : Promise.resolve(0);
  }

  smembers(key: string) {
    return this.client.smembers(key);
  }

  scard(key: string) {
    return this.client.scard(key);
  }

  async quit() {
    await this.client.quit();
  }
}

/**
 * Single-process stand-in so `npm run dev` works without Docker. Config refuses
 * to boot production without a real REDIS_URL, because this store loses every
 * session on restart and cannot be shared between instances.
 */
class MemoryRedis implements RedisLike {
  private strings = new Map<string, { value: string; expiresAt?: number }>();
  private sets = new Map<string, { value: Set<string>; expiresAt?: number }>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref?.();
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.strings) {
      if (entry.expiresAt && entry.expiresAt <= now) this.strings.delete(key);
    }
    for (const [key, entry] of this.sets) {
      if (entry.expiresAt && entry.expiresAt <= now) this.sets.delete(key);
    }
  }

  private live<T extends { expiresAt?: number }>(
    map: Map<string, T>,
    key: string
  ): T | undefined {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      map.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(this.strings, key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.strings.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
    });
  }

  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) removed++;
      if (this.sets.delete(key)) removed++;
    }
    return removed;
  }

  async exists(key: string) {
    return Boolean(this.live(this.strings, key) ?? this.live(this.sets, key));
  }

  async incr(key: string) {
    const current = this.live(this.strings, key);
    const next = Number.parseInt(current?.value ?? '0', 10) + 1;
    // INCR preserves the existing TTL, so mirror that.
    this.strings.set(key, { value: String(next), expiresAt: current?.expiresAt });
    return next;
  }

  async expire(key: string, ttlSeconds: number) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const str = this.live(this.strings, key);
    if (str) str.expiresAt = expiresAt;
    const set = this.live(this.sets, key);
    if (set) set.expiresAt = expiresAt;
  }

  async ttl(key: string) {
    const entry = this.live(this.strings, key) ?? this.live(this.sets, key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  async sadd(key: string, ...members: string[]) {
    const entry = this.live(this.sets, key) ?? { value: new Set<string>() };
    let added = 0;
    for (const member of members) {
      if (!entry.value.has(member)) {
        entry.value.add(member);
        added++;
      }
    }
    this.sets.set(key, entry);
    return added;
  }

  async srem(key: string, ...members: string[]) {
    const entry = this.live(this.sets, key);
    if (!entry) return 0;
    let removed = 0;
    for (const member of members) {
      if (entry.value.delete(member)) removed++;
    }
    if (entry.value.size === 0) this.sets.delete(key);
    return removed;
  }

  async smembers(key: string) {
    return [...(this.live(this.sets, key)?.value ?? [])];
  }

  async scard(key: string) {
    return this.live(this.sets, key)?.value.size ?? 0;
  }

  async quit() {
    clearInterval(this.sweeper);
    this.strings.clear();
    this.sets.clear();
  }
}

function createClient(role: string): Redis {
  const client = new Redis(config.redisUrl!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000)
  });
  client.on('error', (err: unknown) => logger.error({ err, role }, 'Redis error'));
  client.on('ready', () => logger.info({ role }, 'Redis connected'));
  return client;
}

let primary: Redis | null = null;
/** Duplicate connections dedicated to the Socket.IO adapter's pub/sub. */
export let pubClient: Redis | null = null;
export let subClient: Redis | null = null;

export const redis: RedisLike = config.redisUrl
  ? new RealRedis((primary = createClient('primary')))
  : new MemoryRedis();

export const usingRealRedis = Boolean(config.redisUrl);

export async function connectRedis(): Promise<void> {
  if (!config.redisUrl) {
    logger.warn(
      'REDIS_URL is not set — using the in-process fallback store. ' +
        'Sessions will not survive a restart and the server cannot be scaled past one instance.'
    );
    return;
  }
  pubClient = createClient('pub');
  subClient = pubClient.duplicate();
  await Promise.all([primary!.ping(), pubClient.ping(), subClient.ping()]);
}

export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([
    redis.quit(),
    pubClient?.quit(),
    subClient?.quit()
  ]);
}

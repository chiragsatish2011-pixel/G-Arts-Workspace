import bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const SALT_ROUNDS = 12;

/**
 * A pre-computed hash of a value nobody can log in with. Verifying against it
 * when a username does not exist keeps the failure path the same cost as a
 * real one, so response timing does not reveal which accounts exist.
 */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), SALT_ROUNDS);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function burnTiming(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function generateInviteCode(): string {
  return randomBytes(8).toString('hex').toUpperCase();
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

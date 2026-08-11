import { randomUUID } from 'node:crypto';
import { mkdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const UPLOAD_DIR = path.resolve(config.uploadDir);

/** Storage keys are `<shard>/<uuid><ext>` — never anything client-supplied. */
const KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f-]{36}(\.[a-z0-9]{1,12})?$/i;

export async function ensureStorage(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function buildKey(extension: string): string {
  const id = randomUUID();
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
  // Two-character shard so a busy server never puts a million entries in one
  // directory.
  return `${id.slice(0, 2)}/${id}${ext ? `.${ext}` : ''}`;
}

/**
 * Resolves a storage key to an absolute path, refusing anything that escapes
 * the upload root. `path.join` alone would happily produce `../../etc/passwd`.
 */
export function resolveKey(key: string): string {
  if (!isValidKey(key)) {
    throw new Error('Invalid storage key');
  }
  const resolved = path.resolve(UPLOAD_DIR, key);
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

export async function ensureKeyDir(key: string): Promise<string> {
  const target = resolveKey(key);
  await mkdir(path.dirname(target), { recursive: true });
  return target;
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await unlink(resolveKey(key));
  } catch {
    // Already gone, or never written — nothing to clean up.
  }
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await stat(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

export { UPLOAD_DIR };

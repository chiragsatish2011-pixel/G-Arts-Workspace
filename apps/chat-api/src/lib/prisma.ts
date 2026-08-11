import { PrismaClient } from '@g-arts/chat-db';
import { config } from '../config.js';
import { logger } from './logger.js';

export const prisma = new PrismaClient({
  log: config.isDevelopment ? ['error', 'warn'] : ['error'],
  datasources: { db: { url: config.databaseUrl } }
});

export async function connectPrisma(): Promise<void> {
  await prisma.$connect();
  if (config.databaseUrl.startsWith('file:')) {
    // SQLite defaults to a single writer with an immediate-fail lock, which
    // shows up as random "database is locked" errors the moment two members
    // send at once. WAL plus a busy timeout makes concurrent use survivable.
    //
    // These go through $queryRawUnsafe because several PRAGMAs return a row,
    // and $executeRawUnsafe rejects any statement that produces results.
    for (const pragma of [
      'PRAGMA journal_mode = WAL;',
      'PRAGMA busy_timeout = 5000;',
      'PRAGMA synchronous = NORMAL;',
      'PRAGMA foreign_keys = ON;'
    ]) {
      await prisma.$queryRawUnsafe(pragma);
    }
    logger.warn(
      'Running on SQLite. Fine for a small team, but set DATABASE_URL to Postgres ' +
        '(and switch the datasource provider) before scaling past one instance.'
    );
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

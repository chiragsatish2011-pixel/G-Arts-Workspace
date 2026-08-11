import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const displayName = process.env.SEED_ADMIN_NAME ?? "G Arts Administrator";
  if (!username || !password) throw new Error("Set SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD before seeding.");
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, displayName, passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" },
  });
}

seed().finally(() => prisma.$disconnect());

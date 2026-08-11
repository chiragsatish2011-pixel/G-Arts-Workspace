import { PrismaClient } from '@g-arts/chat-db';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

/**
 * Only what a Gurukul actually needs on day one: a noticeboard the
 * administrators write to, and one common channel for everyone. Anything
 * beyond that is better created on demand than shipped as clutter.
 */
const DEFAULT_CHANNELS = [
  {
    name: 'announcements',
    type: 'announcement',
    description: 'Notices from the Gurukul. Only administrators post here.',
    topic: 'Please read before asking'
  },
  {
    name: 'general',
    type: 'text',
    description: 'Day-to-day conversation for everyone.',
    topic: null
  }
];

const ACCENTS = ['#a8121a', '#b5651e', '#2f6f4f', '#3d5a8a', '#7a4a2a', '#5a4a7a'];

async function main() {
  const adminUsername = (process.env.SEED_ADMIN_USERNAME ?? 'admin').toLowerCase();

  // Never bake a password into a repository. Without one supplied we generate
  // a strong password and print it exactly once.
  const generated = randomBytes(12).toString('base64url');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? generated;

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      displayName: process.env.SEED_ADMIN_NAME ?? 'Gurukul Administrator',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'admin',
      title: 'Administrator',
      accentColor: ACCENTS[0]
    }
  });

  let created = 0;
  for (const [index, channel] of DEFAULT_CHANNELS.entries()) {
    if (await prisma.channel.findUnique({ where: { slug: channel.name } })) continue;

    await prisma.channel.create({
      data: {
        kind: 'channel',
        name: channel.name,
        slug: channel.name,
        description: channel.description,
        topic: channel.topic,
        type: channel.type,
        position: index,
        createdById: admin.id,
        members: { create: [{ userId: admin.id, role: 'owner' }] }
      }
    });
    created++;
  }

  console.log('\n  Seed complete.');
  console.log(`  Channels created: ${created} (announcements, general)`);
  console.log(`  Administrator:    ${adminUsername}`);
  if (process.env.SEED_ADMIN_PASSWORD) {
    console.log('  Password:         taken from SEED_ADMIN_PASSWORD');
  } else {
    console.log(`  Password:         ${adminPassword}`);
    console.log('  Store it now — it is hashed on save and cannot be recovered.');
  }
  console.log('\n  Add everyone else from Members inside the app.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

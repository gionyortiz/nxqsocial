/**
 * Ensures the Apple App Review demo account exists, is verified, unlocked,
 * not suspended/banned, and has a known password. Idempotent — safe to re-run.
 *
 * Usage (inside backend container):
 *   node scripts/ensure-review-account.js
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const EMAIL = 'appreview@nxqsocial.com';
const USERNAME = 'appreview';
const DISPLAY_NAME = 'App Review';
const PASSWORD = 'NxqAppReview!2026';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

    if (existing) {
      const updated = await prisma.user.update({
        where: { email: EMAIL },
        data: {
          passwordHash,
          emailVerified: true,
          isSuspended: false,
          isBanned: false,
          profile: {
            upsert: {
              create: { displayName: DISPLAY_NAME },
              update: { displayName: DISPLAY_NAME },
            },
          },
        },
        include: { profile: true },
      });
      console.log('UPDATED existing review account:', {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        emailVerified: updated.emailVerified,
        isSuspended: updated.isSuspended,
        isBanned: updated.isBanned,
      });
    } else {
      const created = await prisma.user.create({
        data: {
          email: EMAIL,
          username: USERNAME,
          passwordHash,
          emailVerified: true,
          isSuspended: false,
          isBanned: false,
          profile: { create: { displayName: DISPLAY_NAME } },
        },
        include: { profile: true },
      });
      console.log('CREATED new review account:', {
        id: created.id,
        email: created.email,
        username: created.username,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

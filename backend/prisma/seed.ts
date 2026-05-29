/**
 * Prisma seed script — run once per environment to bootstrap the admin account.
 *
 * Usage:
 *   npx prisma db seed
 *
 * Or with custom credentials via env:
 *   ADMIN_EMAIL=you@example.com ADMIN_USERNAME=myadmin ADMIN_PASSWORD=Secret123! npx prisma db seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@nxqsocial.com';
  const username = process.env.ADMIN_USERNAME ?? 'nexaadmin';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

  if (password === 'ChangeMe123!') {
    console.warn('\n⚠️  WARNING: Using default admin password. Set ADMIN_PASSWORD env var before seeding production!\n');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN' },
    create: {
      email,
      username,
      passwordHash,
      role: 'ADMIN',
      verificationStatus: 'ID_VERIFIED',
      trustScore: 100,
      emailVerified: true,
      profile: { create: { displayName: 'NXQ Social Admin' } },
    },
  });

  console.log(`✅ Admin account ready: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
